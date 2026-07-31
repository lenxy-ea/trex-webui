#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1"
DEFAULT_PROFILE = "udp_1pkt_simple.py"
DEFAULT_MULTIPLIER = "5kpps"
DEFAULT_DURATION_SECONDS = 2.0
DEFAULT_OBSERVE_SECONDS = 1.0
DEFAULT_HTTP_TIMEOUT_SECONDS = 15.0
DEFAULT_STATS_TIMEOUT_SECONDS = 8.0
DEFAULT_POLL_INTERVAL_SECONDS = 0.5
DEFAULT_REPORT_PREFIX = "trex-acceptance"
REPORT_OMITTED_KEYS = {"binary_base64", "content_base64"}
DHCP_MIN_PAYLOAD_BYTES = 300
DNS_DEFAULT_QUERY_NAME = "example.com"


class AcceptanceError(Exception):
    def __init__(self, stage: str, message: str, payload: Any | None = None) -> None:
        super().__init__(f"{stage}: {message}")
        self.stage = stage
        self.message = message
        self.payload = payload

    def to_record(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "message": self.message,
            "payload": self.payload,
        }


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_file_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    compact = parsed.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return compact


def api_url(base_url: str, endpoint: str) -> str:
    parsed = urlparse(base_url)
    base_path = parsed.path.rstrip("/")
    normalized_endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    if base_path.endswith("/api") and normalized_endpoint.startswith("/api/"):
        normalized_endpoint = normalized_endpoint[4:]
    return urljoin(base_url.rstrip("/") + "/", normalized_endpoint.lstrip("/"))


def request_json(base_url: str, method: str, endpoint: str, body: dict[str, Any] | None, timeout: float) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(api_url(base_url, endpoint), data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            content = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AcceptanceError(endpoint, f"HTTP {exc.code}", detail) from exc
    except URLError as exc:
        raise AcceptanceError(endpoint, str(exc.reason)) from exc

    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AcceptanceError(endpoint, "response was not JSON", content[:500]) from exc
    if not isinstance(payload, dict):
        raise AcceptanceError(endpoint, "response JSON was not an object", payload)
    return payload


def require_ok(stage: str, payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("ok") is True:
        return payload
    raise AcceptanceError(stage, payload.get("error") or payload.get("blocker") or "request failed", payload)


def total_counter(payload: dict[str, Any], counter: str) -> float:
    data = payload.get("data")
    if not isinstance(data, dict):
        return 0.0
    total = data.get("total")
    if not isinstance(total, dict):
        return 0.0
    value = total.get(counter)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def read_path(source: Any, path: str) -> Any:
    current = source
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def read_number(source: Any, paths: list[str]) -> float | None:
    for path in paths:
        value = read_path(source, path)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return None


def stats_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def stats_drop_bps(payload: dict[str, Any]) -> float:
    return read_number(stats_data(payload), [
        "global.rx_drop_bps",
        "global.drop_bps",
        "total.rx_drop_bps",
        "total.drop_bps",
        "rx_drop_bps",
        "drop_bps",
        "drop_rate",
    ]) or 0.0


def stats_queue_full(payload: dict[str, Any]) -> float:
    return read_number(stats_data(payload), [
        "global.queue_full",
        "global.queue_full_rate",
        "total.queue_full",
        "queue_full",
        "queue_full_rate",
    ]) or 0.0


def latency_error_total(source: Any) -> float:
    if not isinstance(source, dict):
        return 0.0
    direct_paths = [
        "err.dropped",
        "err.dup",
        "err.out_of_order",
        "err.outOfOrder",
        "err.seq_too_high",
        "err.seq_too_low",
        "err_cntrs.dropped",
        "err_cntrs.dup",
        "err_cntrs.out_of_order",
        "err_cntrs.seq_too_high",
        "err_cntrs.seq_too_low",
        "errors.dropped",
        "errors.dup",
        "errors.out_of_order",
        "errors.seq_too_high",
        "errors.seq_too_low",
    ]
    direct_values = [read_number(source, [path]) for path in direct_paths]
    direct_total = sum(value for value in direct_values if value is not None)
    if direct_total:
        return direct_total
    total = 0.0
    for value in source.values():
        if isinstance(value, dict):
            total += latency_error_total(value)
    return total


def stats_latency_errors(payload: dict[str, Any]) -> float:
    return latency_error_total(stats_data(payload).get("latency"))


def port_error_total(payload: dict[str, Any]) -> float:
    data = stats_data(payload)
    total_errors = total_counter(payload, "oerrors") + total_counter(payload, "ierrors")
    if total_errors:
        return total_errors
    total = 0.0
    for key, value in data.items():
        if key in {"global", "total", "flow_stats", "latency"} or not isinstance(value, dict):
            continue
        total += sum(
            read_number(value, [path]) or 0.0
            for path in ["oerrors", "ierrors", "tx_errors", "rx_errors", "errors"]
        )
    return total


def profile_catalog_contains(payload: dict[str, Any], profile_path: str) -> bool:
    data = payload.get("data")
    if not isinstance(data, dict):
        return False
    profiles = data.get("profiles")
    if not isinstance(profiles, list):
        return False
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        if profile.get("relative_path") == profile_path or profile.get("path") == profile_path:
            return True
    return False


def port_ids(payload: dict[str, Any]) -> set[int]:
    data = payload.get("data")
    if not isinstance(data, dict):
        return set()
    values = data.get("port_ids")
    if not isinstance(values, list):
        return set()
    return {value for value in values if isinstance(value, int)}


def active_port_ids(payload: dict[str, Any]) -> set[int]:
    data = payload.get("data")
    if not isinstance(data, dict):
        return set()
    records = data.get("ports")
    if not isinstance(records, list):
        return set()
    active: set[int] = set()
    for record in records:
        if not isinstance(record, dict):
            continue
        port_id = record.get("id")
        info = record.get("info")
        status = info.get("status") if isinstance(info, dict) else None
        if not isinstance(port_id, int) or not isinstance(status, str):
            continue
        if status.strip().upper() not in {"", "IDLE", "DOWN", "STREAMS"}:
            active.add(port_id)
    return active


def capture_packet_count(payload: dict[str, Any]) -> int:
    data = payload.get("data")
    if not isinstance(data, dict):
        return 0
    value = data.get("packet_count")
    if isinstance(value, int):
        return value
    packets = data.get("packets")
    return len(packets) if isinstance(packets, list) else 0


def capture_packets(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    packets = data.get("packets")
    if not isinstance(packets, list):
        return []
    return [packet for packet in packets if isinstance(packet, dict)]


def capture_packet_layer_chain(packet: dict[str, Any]) -> str:
    layers = packet.get("decoded_layers")
    if not isinstance(layers, list):
        return ""
    names = [
        str(layer.get("name")).strip()
        for layer in layers
        if isinstance(layer, dict) and str(layer.get("name") or "").strip()
    ]
    return " > ".join(names)


def capture_packet_field_map(packet: dict[str, Any]) -> dict[str, list[str]]:
    layers = packet.get("decoded_layers")
    if not isinstance(layers, list):
        return {}
    fields: dict[str, list[str]] = {}
    layer_counts: dict[str, int] = {}

    def add_field_value(key: str, value: str) -> None:
        values = fields.setdefault(key, [])
        if value not in values:
            values.append(value)

    for layer in layers:
        if not isinstance(layer, dict):
            continue
        layer_name = str(layer.get("name") or "").strip()
        layer_fields = layer.get("fields")
        if not layer_name or not isinstance(layer_fields, list):
            continue
        layer_counts[layer_name] = layer_counts.get(layer_name, 0) + 1
        layer_index = layer_counts[layer_name]
        for field in layer_fields:
            if not isinstance(field, dict):
                continue
            field_name = str(field.get("name") or "").strip()
            value = str(field.get("value") or "").strip()
            if not field_name or not value:
                continue
            indexed_key = f"{layer_name}[{layer_index}].{field_name}"
            plain_key = f"{layer_name}.{field_name}"
            add_field_value(indexed_key, value)
            if layer_index == 1:
                add_field_value(plain_key, value)
    return fields


def workbench_packet_type(stream: dict[str, Any]) -> str:
    packet_type = str(stream.get("packet_type") or "-")
    if stream.get("gtpu_enabled") is True:
        inner = "IPv6" if stream.get("gtpu_inner_ip_version") == "IPv6" else "IPv4"
        return f"Ethernet/IPv4/UDP/GTP-U {inner}"
    if stream.get("vxlan_enabled") is True:
        inner = "IPv6" if stream.get("vxlan_inner_ip_version") == "IPv6" else "IPv4"
        return f"Ethernet/IPv4/UDP/VXLAN {inner}"
    return packet_type


def workbench_expected_layer_chain(stream: dict[str, Any]) -> str:
    packet_type = str(stream.get("packet_type") or "")
    if stream.get("gtpu_enabled") is True:
        inner = "IPv6" if stream.get("gtpu_inner_ip_version") == "IPv6" else "IPv4"
        layers = ["Ethernet", "IPv4", "UDP", "GTP-U"]
        if stream.get("gtpu_extension_enabled") is True:
            layers.append("GTP-U Extension")
        layers.extend([inner, "UDP"])
        return " > ".join(layers)
    if stream.get("vxlan_enabled") is True:
        inner = "IPv6" if stream.get("vxlan_inner_ip_version") == "IPv6" else "IPv4"
        return f"Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > {inner} > UDP"
    if packet_type.endswith("/GRE"):
        inner = "IPv6" if stream.get("gre_inner_ip_version") == "IPv6" or str(stream.get("gre_protocol_type") or "").upper() == "86DD" else "IPv4"
        return f"Ethernet > IPv6 > GRE > {inner} > UDP" if packet_type.startswith("Ethernet/IPv6") else f"Ethernet > IPv4 > GRE > {inner} > UDP"
    if stream.get("dns_enabled") is True and packet_type.endswith("/UDP"):
        return f"{' > '.join(part for part in packet_type.split('/') if part)} > DNS"
    if stream.get("dhcp_enabled") is True and packet_type == "Ethernet/IPv4/UDP":
        return "Ethernet > IPv4 > UDP > DHCP"
    return " > ".join(part for part in packet_type.split("/") if part) or "-"


def infer_capture_bpf_filter(expected_layer_chain: str | None, profile_streams: list[dict[str, Any]]) -> str:
    if profile_streams:
        for stream in profile_streams:
            expectations = stream.get("field_expectations")
            if not isinstance(expectations, list):
                continue
            fields = [str(expectation.get("field") or "") for expectation in expectations if isinstance(expectation, dict)]
            if any(field.startswith("MPLS.") or field.startswith("MPLS[") for field in fields):
                return ""
            if any(field.startswith("802.1Q VLAN.") or field.startswith("802.1Q VLAN[") for field in fields):
                return ""

    chains: list[str] = []
    if isinstance(expected_layer_chain, str) and expected_layer_chain.strip():
        chains.append(expected_layer_chain.strip())
    for stream in profile_streams:
        chain = stream.get("expected_layer_chain")
        if isinstance(chain, str) and chain.strip() and chain.strip() not in chains:
            chains.append(chain.strip())

    for chain in chains:
        if "Ethernet > ARP" in chain or chain.endswith("> ARP"):
            return "arp"
        if "IPv6 > GRE" in chain:
            return "ip6 proto 47"
        if "IPv4 > GRE" in chain or "> GRE" in chain:
            return "proto gre"
        if "ICMPv6" in chain:
            return "icmp6"
        if "ICMP" in chain:
            return "icmp"
        if "IPv6 > SCTP" in chain:
            return "ip6 proto 132"
        if "SCTP" in chain:
            return "ip proto 132"
        if "TCP" in chain:
            return "tcp"
        if "UDP" in chain:
            return "udp"
        if "IPv6" in chain:
            return "ip6"
        if "IPv4" in chain:
            return "ip"
    return "udp"


def workbench_field_engines(stream: dict[str, Any]) -> list[str]:
    engines: list[str] = []
    for key, value in sorted(stream.items()):
        if not key.endswith("_mode") or not isinstance(value, str) or value in {"Fixed", "TRex Config"}:
            continue
        base = key.removesuffix("_mode")
        details: list[str] = []
        count = stream.get(f"{base}_count")
        step = stream.get(f"{base}_step")
        if isinstance(count, (int, float)) and count > 0:
            details.append(f"x{int(count)}")
        if isinstance(step, (int, float)):
            details.append(f"step {int(step)}")
        engines.append(f"{base}: {value}{' ' + ' '.join(details) if details else ''}")
    return engines


def text_stream_value(stream: dict[str, Any], key: str, default: str) -> str:
    value = stream.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return default


def int_stream_value(stream: dict[str, Any], key: str, default: int) -> int:
    value = stream.get(key)
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip(), 0)
        except ValueError:
            return default
    return default


def field_mode(stream: dict[str, Any], key: str) -> str:
    value = stream.get(f"{key}_mode")
    return value.strip() if isinstance(value, str) and value.strip() else "Fixed"


def resolve_stream_key(stream: dict[str, Any], primary: str, aliases: tuple[str, ...] = ()) -> str:
    if primary in stream:
        return primary
    for alias in aliases:
        if alias in stream:
            return alias
    return primary


def field_count(stream: dict[str, Any], key: str) -> int:
    value = int_stream_value(stream, f"{key}_count", 1)
    return max(1, min(value, 16))


def field_step(stream: dict[str, Any], key: str) -> int:
    return int_stream_value(stream, f"{key}_step", 1)


def deterministic_int_values(stream: dict[str, Any], key: str, default: int) -> list[str]:
    mode = field_mode(stream, key)
    start = int_stream_value(stream, key, default)
    return deterministic_int_values_from(start, mode, field_count(stream, key), field_step(stream, key))


def deterministic_int_values_for(stream: dict[str, Any], value_key: str, field_key: str, default: int) -> list[str]:
    mode = field_mode(stream, field_key)
    start = int_stream_value(stream, value_key, default)
    return deterministic_int_values_from(start, mode, field_count(stream, field_key), field_step(stream, field_key))


def deterministic_int_values_from(start: int, mode: str, count: int, step: int) -> list[str]:
    if mode == "Fixed":
        return [str(start)]
    if mode == "Increment":
        return [str(start + index * step) for index in range(count)]
    if mode == "Decrement":
        return [str(start - index * step) for index in range(count)]
    return []


def hex_int_text(value: int, width: int = 8) -> str:
    return f"0x{value & 0xFFFFFFFF:0{width}x}"


def deterministic_hex_int_values(stream: dict[str, Any], key: str, default: int, width: int = 8) -> list[str]:
    return [hex_int_text(int(value), width) for value in deterministic_int_values(stream, key, default)]


def is_int_field_customized(stream: dict[str, Any], key: str, default: int) -> bool:
    return field_mode(stream, key) != "Fixed" or int_stream_value(stream, key, default) != default


def deterministic_ip_values(stream: dict[str, Any], key: str, default: str) -> list[str]:
    mode = field_mode(stream, key)
    start_text = text_stream_value(stream, key, default)
    try:
        start = ipaddress.ip_address(start_text)
    except ValueError:
        return [start_text] if mode == "Fixed" else []
    if mode == "Fixed":
        return [str(start)]
    if mode == "Increment Host":
        step = field_step(stream, key)
        return [str(start + index * step) for index in range(field_count(stream, key))]
    if mode == "Decrement Host":
        step = field_step(stream, key)
        return [str(start - index * step) for index in range(field_count(stream, key))]
    return []


def mac_to_int(value: str) -> int | None:
    parts = value.split(":")
    if len(parts) != 6:
        return None
    total = 0
    for part in parts:
        if len(part) != 2:
            return None
        try:
            octet = int(part, 16)
        except ValueError:
            return None
        if octet < 0 or octet > 255:
            return None
        total = (total << 8) + octet
    return total


def int_to_mac(value: int) -> str | None:
    if value < 0 or value > 0xFFFFFFFFFFFF:
        return None
    return ":".join(f"{(value >> shift) & 0xFF:02x}" for shift in (40, 32, 24, 16, 8, 0))


def deterministic_mac_values(stream: dict[str, Any], key: str, default: str) -> list[str]:
    mode = field_mode(stream, key)
    start_text = text_stream_value(stream, key, default)
    start = mac_to_int(start_text)
    if mode == "Fixed":
        return [int_to_mac(start) or start_text.lower()] if start is not None else [start_text.lower()]
    if start is None:
        return []
    if mode == "Increment":
        step = field_step(stream, key)
        return [
            mac
            for index in range(field_count(stream, key))
            if (mac := int_to_mac(start + index * step)) is not None
        ]
    if mode == "Decrement":
        step = field_step(stream, key)
        return [
            mac
            for index in range(field_count(stream, key))
            if (mac := int_to_mac(start - index * step)) is not None
        ]
    return []


def hex_word_value(stream: dict[str, Any], key: str, default: str) -> str:
    raw_value = text_stream_value(stream, key, default).strip().lower()
    if raw_value.startswith("0x"):
        raw_value = raw_value[2:]
    if not raw_value or len(raw_value) > 4:
        raw_value = default.lower().removeprefix("0x")
    try:
        parsed = int(raw_value, 16)
    except ValueError:
        parsed = int(default.lower().removeprefix("0x"), 16)
    return f"0x{parsed & 0xFFFF:04x}"


def hex_dword_value(stream: dict[str, Any], key: str, default: str) -> str:
    raw_value = text_stream_value(stream, key, default).strip().lower()
    if raw_value.startswith("0x"):
        raw_value = raw_value[2:]
    if not raw_value or len(raw_value) > 8:
        raw_value = default.lower().removeprefix("0x")
    try:
        parsed = int(raw_value, 16)
    except ValueError:
        parsed = int(default.lower().removeprefix("0x"), 16)
    return f"0x{parsed & 0xFFFFFFFF:08x}"


def deterministic_hex_word_values(stream: dict[str, Any], key: str, default: str) -> list[str]:
    mode = field_mode(stream, key)
    start = int(hex_word_value(stream, key, default), 16)
    if mode == "Fixed":
        return [hex_word_value(stream, key, default)]
    if mode == "Increment":
        step = field_step(stream, key)
        return [f"0x{(start + index * step) & 0xFFFF:04x}" for index in range(field_count(stream, key))]
    if mode == "Decrement":
        step = field_step(stream, key)
        return [f"0x{(start - index * step) & 0xFFFF:04x}" for index in range(field_count(stream, key))]
    return []


def field_expectation(label: str, field: str, values: list[str], mode: str) -> dict[str, Any] | None:
    cleaned = unique_text(values)
    if not cleaned:
        return None
    return {
        "label": label,
        "field": field,
        "expected_values": cleaned,
        "mode": mode,
    }


def add_ethernet_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    destination_mode = str(stream.get("ether_dst_mode") or "").strip()
    source_mode = str(stream.get("ether_src_mode") or "").strip()
    for expectation in [
        field_expectation(
            "Ethernet Destination",
            "Ethernet.Destination",
            deterministic_mac_values(stream, "ether_dst", "00:00:00:00:00:00"),
            field_mode(stream, "ether_dst"),
        )
        if destination_mode and destination_mode != "TRex Config"
        else None,
        field_expectation(
            "Ethernet Source",
            "Ethernet.Source",
            deterministic_mac_values(stream, "ether_src", "00:00:00:00:00:00"),
            field_mode(stream, "ether_src"),
        )
        if source_mode and source_mode != "TRex Config"
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_ip_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str,
    source_key: str,
    source_default: str,
    destination_key: str,
    destination_default: str,
    ttl_key: str,
    ttl_default: int,
    ttl_label: str,
    source_aliases: tuple[str, ...] = (),
    destination_aliases: tuple[str, ...] = (),
) -> None:
    source_field_key = resolve_stream_key(stream, source_key, source_aliases)
    destination_field_key = resolve_stream_key(stream, destination_key, destination_aliases)
    for expectation in [
        field_expectation(
            f"{layer_prefix} Source",
            f"{layer_prefix}.Source",
            deterministic_ip_values(stream, source_field_key, source_default),
            field_mode(stream, source_field_key),
        ),
        field_expectation(
            f"{layer_prefix} Destination",
            f"{layer_prefix}.Destination",
            deterministic_ip_values(stream, destination_field_key, destination_default),
            field_mode(stream, destination_field_key),
        ),
        field_expectation(
            f"{layer_prefix} {ttl_label}",
            f"{layer_prefix}.{ttl_label}",
            deterministic_int_values(stream, ttl_key, ttl_default),
            field_mode(stream, ttl_key),
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def ipv4_flags_text(stream: dict[str, Any]) -> str:
    enabled: list[str] = []
    if stream.get("ipv4_flag_df") is True:
        enabled.append("DF")
    if stream.get("ipv4_flag_mf") is True:
        enabled.append("MF")
    return ", ".join(enabled) if enabled else "-"


def add_ipv4_header_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str = "IPv4",
) -> None:
    envelope = ipv4_fixed_envelope(stream)
    protocol = ipv4_protocol_name(stream)
    for expectation in [
        field_expectation(
            f"{layer_prefix} Protocol",
            f"{layer_prefix}.Protocol",
            [protocol],
            "Fixed",
        )
        if envelope is not None and protocol is not None
        else None,
        field_expectation(
            f"{layer_prefix} Header Length",
            f"{layer_prefix}.Header Length",
            [str(envelope["header_length"])],
            "Fixed",
        )
        if envelope is not None
        else None,
        field_expectation(
            f"{layer_prefix} Total Length",
            f"{layer_prefix}.Total Length",
            [str(envelope["total_length"])],
            "Fixed",
        )
        if envelope is not None
        else None,
        field_expectation(
            f"{layer_prefix} DSCP",
            f"{layer_prefix}.DSCP",
            deterministic_int_values(stream, "ipv4_dscp", 0),
            field_mode(stream, "ipv4_dscp"),
        )
        if is_int_field_customized(stream, "ipv4_dscp", 0)
        else None,
        field_expectation(
            f"{layer_prefix} ECN",
            f"{layer_prefix}.ECN",
            deterministic_int_values(stream, "ipv4_ecn", 0),
            field_mode(stream, "ipv4_ecn"),
        )
        if is_int_field_customized(stream, "ipv4_ecn", 0)
        else None,
        field_expectation(
            f"{layer_prefix} Identification",
            f"{layer_prefix}.Identification",
            deterministic_int_values(stream, "ipv4_id", 1234),
            field_mode(stream, "ipv4_id"),
        )
        if is_int_field_customized(stream, "ipv4_id", 1234)
        else None,
        field_expectation(
            f"{layer_prefix} Flags",
            f"{layer_prefix}.Flags",
            [ipv4_flags_text(stream)],
            "Fixed",
        )
        if stream.get("ipv4_flag_df") is True or stream.get("ipv4_flag_mf") is True
        else None,
        field_expectation(
            f"{layer_prefix} Fragment Offset",
            f"{layer_prefix}.Fragment Offset",
            deterministic_int_values(stream, "ipv4_fragment_offset", 0),
            field_mode(stream, "ipv4_fragment_offset"),
        )
        if is_int_field_customized(stream, "ipv4_fragment_offset", 0)
        else None,
        field_expectation(
            f"{layer_prefix} Checksum",
            f"{layer_prefix}.Checksum",
            deterministic_hex_word_values(stream, "ipv4_checksum", "0000"),
            "Fixed",
        )
        if can_expect_ipv4_checksum(stream)
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def ipv4_protocol_name(stream: dict[str, Any]) -> str | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.startswith("Ethernet/IPv4"):
        return None
    if packet_type.endswith("/UDP"):
        return "UDP"
    if packet_type.endswith("/TCP"):
        return "TCP"
    if packet_type.endswith("/ICMP"):
        return "ICMP"
    if packet_type.endswith("/GRE"):
        return "GRE"
    if packet_type.endswith("/SCTP"):
        return "SCTP"
    return None


def ipv4_fixed_envelope(stream: dict[str, Any]) -> dict[str, int] | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.startswith("Ethernet/IPv4"):
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    return {
        "header_length": 20,
        "total_length": max(20, packet_length_without_fcs - workbench_l2_header_length(stream)),
    }


def add_ipv6_header_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str = "IPv6",
) -> None:
    next_header = ipv6_next_header_name(stream)
    payload_length = ipv6_fixed_payload_length(stream)
    for expectation in [
        field_expectation(
            f"{layer_prefix} Next Header",
            f"{layer_prefix}.Next Header",
            [next_header],
            "Fixed",
        )
        if next_header is not None
        else None,
        field_expectation(
            f"{layer_prefix} Payload Length",
            f"{layer_prefix}.Payload Length",
            [str(payload_length)],
            "Fixed",
        )
        if payload_length is not None
        else None,
        field_expectation(
            f"{layer_prefix} Traffic Class",
            f"{layer_prefix}.Traffic Class",
            deterministic_int_values(stream, "ipv6_traffic_class", 0),
            field_mode(stream, "ipv6_traffic_class"),
        )
        if is_int_field_customized(stream, "ipv6_traffic_class", 0)
        else None,
        field_expectation(
            f"{layer_prefix} Flow Label",
            f"{layer_prefix}.Flow Label",
            deterministic_int_values(stream, "ipv6_flow_label", 0),
            field_mode(stream, "ipv6_flow_label"),
        )
        if is_int_field_customized(stream, "ipv6_flow_label", 0)
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def ipv6_next_header_name(stream: dict[str, Any]) -> str | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.startswith("Ethernet/IPv6"):
        return None
    if packet_type.endswith("/UDP"):
        return "UDP"
    if packet_type.endswith("/TCP"):
        return "TCP"
    if packet_type.endswith("/ICMPv6"):
        return "ICMPv6"
    if packet_type.endswith("/GRE"):
        return "GRE"
    if packet_type.endswith("/SCTP"):
        return "SCTP"
    return None


def fixed_workbench_packet_length_without_fcs(stream: dict[str, Any]) -> int | None:
    if "frame_length" not in stream or str(stream.get("frame_length_type") or "Fixed") != "Fixed":
        return None
    frame_length = int_stream_value(stream, "frame_length", 0)
    if frame_length <= 0:
        return None
    return max(60, frame_length - 4, workbench_minimum_packet_length_without_fcs(stream))


def workbench_has_dhcp(stream: dict[str, Any]) -> bool:
    return (
        str(stream.get("packet_type") or "") == "Ethernet/IPv4/UDP"
        and stream.get("dhcp_enabled") is True
        and stream.get("vxlan_enabled") is not True
        and stream.get("gtpu_enabled") is not True
    )


def workbench_has_dns(stream: dict[str, Any]) -> bool:
    return (
        str(stream.get("packet_type") or "").endswith("/UDP")
        and stream.get("dns_enabled") is True
        and stream.get("vxlan_enabled") is not True
        and stream.get("gtpu_enabled") is not True
    )


def workbench_has_gre(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type") or "").endswith("/GRE")


def workbench_has_vxlan(stream: dict[str, Any]) -> bool:
    return stream.get("vxlan_enabled") is True


def workbench_has_gtpu(stream: dict[str, Any]) -> bool:
    return stream.get("gtpu_enabled") is True


def workbench_has_sctp(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type") or "").endswith("/SCTP")


def workbench_is_icmpv6_router_solicitation(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type") or "") == "Ethernet/IPv6/ICMPv6" and int_stream_value(stream, "icmp_type", 0) == 133


def workbench_is_icmpv6_router_advertisement(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type") or "") == "Ethernet/IPv6/ICMPv6" and int_stream_value(stream, "icmp_type", 0) == 134


def workbench_is_icmpv6_neighbor_discovery(stream: dict[str, Any]) -> bool:
    icmp_type = int_stream_value(stream, "icmp_type", 0)
    return str(stream.get("packet_type") or "") == "Ethernet/IPv6/ICMPv6" and icmp_type in {135, 136}


def workbench_is_icmpv6_control(stream: dict[str, Any]) -> bool:
    return (
        workbench_is_icmpv6_router_solicitation(stream)
        or workbench_is_icmpv6_router_advertisement(stream)
        or workbench_is_icmpv6_neighbor_discovery(stream)
    )


def icmp_header_length(stream: dict[str, Any]) -> int:
    if workbench_is_icmpv6_router_solicitation(stream):
        return 8 + (8 if stream.get("icmpv6_rs_include_slla") is not False else 0)
    if workbench_is_icmpv6_router_advertisement(stream):
        return (
            16
            + (8 if stream.get("icmpv6_ra_include_slla") is not False else 0)
            + (32 if stream.get("icmpv6_ra_include_prefix") is not False else 0)
        )
    if workbench_is_icmpv6_neighbor_discovery(stream):
        return 24 + (8 if stream.get("icmpv6_nd_include_option") is not False else 0)
    return 8


def workbench_minimum_packet_length_without_fcs(stream: dict[str, Any]) -> int:
    if workbench_has_dhcp(stream):
        return workbench_l2_header_length(stream) + workbench_l3_header_length(stream) + 8 + DHCP_MIN_PAYLOAD_BYTES
    if workbench_has_dns(stream):
        return workbench_l2_header_length(stream) + workbench_l3_header_length(stream) + 8 + dns_query_payload_length(stream)
    if workbench_is_icmpv6_control(stream):
        return workbench_l2_header_length(stream) + 40 + icmp_header_length(stream)
    if workbench_has_gre(stream):
        inner_l3_length = 40 if stream.get("gre_inner_ip_version") == "IPv6" or str(stream.get("gre_protocol_type") or "").upper() == "86DD" else 20
        return workbench_l2_header_length(stream) + workbench_l3_header_length(stream) + gre_header_length(stream) + inner_l3_length + 8
    if workbench_has_sctp(stream):
        return workbench_l2_header_length(stream) + workbench_l3_header_length(stream) + 28
    if workbench_has_gtpu(stream):
        inner_l3_length = 40 if stream.get("gtpu_inner_ip_version") == "IPv6" else 20
        return (
            workbench_l2_header_length(stream)
            + 20
            + 8
            + 8
            + gtpu_optional_header_length(stream)
            + gtpu_extension_header_length(stream)
            + inner_l3_length
            + 8
        )
    if workbench_has_vxlan(stream):
        inner_l3_length = 40 if stream.get("vxlan_inner_ip_version") == "IPv6" else 20
        return workbench_l2_header_length(stream) + 20 + 8 + 8 + 14 + inner_l3_length + 8
    return 60


def dns_query_payload_length(stream: dict[str, Any]) -> int:
    query_name = text_stream_value(stream, "dns_query_name", DNS_DEFAULT_QUERY_NAME).removesuffix(".")
    labels = query_name.split(".") if query_name else [""]
    qname_length = sum(1 + len(label.encode("ascii", errors="ignore")) for label in labels) + 1
    answer_length = 16 if stream.get("dns_answer_enabled") is True else 0
    return 12 + qname_length + 4 + answer_length


def ipv6_fixed_payload_length(stream: dict[str, Any]) -> int | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.startswith("Ethernet/IPv6"):
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    return max(0, packet_length_without_fcs - workbench_l2_header_length(stream) - 40)


def add_l4_port_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str,
    source_key: str,
    destination_key: str,
    source_default: int,
    destination_default: int,
) -> None:
    for expectation in [
        field_expectation(
            f"{layer_prefix} Source Port",
            f"{layer_prefix}.Source Port",
            deterministic_int_values(stream, source_key, source_default),
            field_mode(stream, source_key),
        ),
        field_expectation(
            f"{layer_prefix} Destination Port",
            f"{layer_prefix}.Destination Port",
            deterministic_int_values(stream, destination_key, destination_default),
            field_mode(stream, destination_key),
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_udp_header_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str = "UDP",
    udp_lengths: dict[str, object] | None = None,
    include_checksum: bool = True,
) -> None:
    if udp_lengths is None:
        udp_lengths = deterministic_udp_lengths(stream)
    udp_payload_lengths = deterministic_udp_payload_lengths(udp_lengths)
    for expectation in [
        field_expectation(
            f"{layer_prefix} Length",
            f"{layer_prefix}.Length",
            udp_lengths["values"],
            str(udp_lengths["mode"]),
        )
        if udp_lengths is not None
        else None,
        field_expectation(
            f"{layer_prefix} Payload Length",
            f"{layer_prefix}.Payload Length",
            udp_payload_lengths["values"],
            str(udp_payload_lengths["mode"]),
        )
        if udp_payload_lengths is not None
        else None,
        field_expectation(
            f"{layer_prefix} Checksum",
            f"{layer_prefix}.Checksum",
            deterministic_hex_word_values(stream, "udp_checksum", "0000"),
            field_mode(stream, "udp_checksum"),
        )
        if include_checksum and can_expect_udp_checksum(stream)
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def deterministic_udp_lengths(stream: dict[str, Any]) -> dict[str, object] | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.endswith("/UDP"):
        return None
    if stream.get("udp_length_override") is True:
        return {
            "values": deterministic_int_values(stream, "udp_length", 26),
            "mode": field_mode(stream, "udp_length"),
        }
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    udp_length = max(
        8,
        packet_length_without_fcs - workbench_l2_header_length(stream) - workbench_l3_header_length(stream),
    )
    return {
        "values": [str(udp_length)],
        "mode": "Fixed",
    }


def deterministic_udp_payload_lengths(udp_lengths: dict[str, object] | None) -> dict[str, object] | None:
    if udp_lengths is None:
        return None
    values = []
    for value in udp_lengths["values"]:
        try:
            values.append(str(max(0, int(value) - 8)))
        except (TypeError, ValueError):
            continue
    return {
        "values": values,
        "mode": udp_lengths["mode"],
    }


def gre_header_length(stream: dict[str, Any]) -> int:
    return (
        4
        + (4 if stream.get("gre_checksum_present") is True else 0)
        + (4 if stream.get("gre_key_present") is True else 0)
        + (4 if stream.get("gre_sequence_present") is True else 0)
    )


def gre_inner_ipv4_envelope(stream: dict[str, Any]) -> dict[str, int] | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.endswith("/GRE"):
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    return {
        "header_length": 20,
        "total_length": max(
            28,
            packet_length_without_fcs
            - workbench_l2_header_length(stream)
            - workbench_l3_header_length(stream)
            - gre_header_length(stream),
        ),
    }


def gre_inner_ip_version(stream: dict[str, Any]) -> str:
    return "IPv6" if stream.get("gre_inner_ip_version") == "IPv6" or str(stream.get("gre_protocol_type") or "").upper() == "86DD" else "IPv4"


def gre_protocol_type_expectation(stream: dict[str, Any]) -> str:
    return "0x86dd" if gre_inner_ip_version(stream) == "IPv6" else "0x0800"


def gre_inner_envelope(stream: dict[str, Any]) -> dict[str, int | str] | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.endswith("/GRE"):
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    inner_version = gre_inner_ip_version(stream)
    header_length = 40 if inner_version == "IPv6" else 20
    payload_length = max(
        0,
        packet_length_without_fcs
        - workbench_l2_header_length(stream)
        - workbench_l3_header_length(stream)
        - gre_header_length(stream)
        - header_length
        - 8,
    )
    return {
        "inner_version": inner_version,
        "header_length": header_length,
        "payload_length": payload_length,
        "udp_length": 8 + payload_length,
        "ipv4_total_length": header_length + 8 + payload_length,
        "ipv6_payload_length": 8 + payload_length,
    }


def add_gre_inner_ipv4_header_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str,
) -> None:
    envelope = gre_inner_ipv4_envelope(stream)
    for expectation in [
        field_expectation(f"{layer_prefix} Protocol", f"{layer_prefix}.Protocol", ["UDP"], "Fixed")
        if envelope is not None
        else None,
        field_expectation(
            f"{layer_prefix} Header Length",
            f"{layer_prefix}.Header Length",
            [str(envelope["header_length"])],
            "Fixed",
        )
        if envelope is not None
        else None,
        field_expectation(
            f"{layer_prefix} Total Length",
            f"{layer_prefix}.Total Length",
            [str(envelope["total_length"])],
            "Fixed",
        )
        if envelope is not None
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_gre_inner_ipv6_header_expectations(
    expectations: list[dict[str, Any]],
    stream: dict[str, Any],
    *,
    layer_prefix: str,
) -> None:
    envelope = gre_inner_envelope(stream)
    if envelope is None or envelope["inner_version"] != "IPv6":
        return
    for expectation in [
        field_expectation(f"{layer_prefix} Next Header", f"{layer_prefix}.Next Header", ["UDP"], "Fixed"),
        field_expectation(
            f"{layer_prefix} Payload Length",
            f"{layer_prefix}.Payload Length",
            [str(envelope["ipv6_payload_length"])],
            "Fixed",
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def deterministic_gre_inner_udp_lengths(stream: dict[str, Any]) -> dict[str, object] | None:
    envelope = gre_inner_envelope(stream)
    if envelope is None:
        return None
    return {
        "values": [str(envelope["udp_length"])],
        "mode": "Fixed",
    }


def vxlan_inner_envelope(stream: dict[str, Any]) -> dict[str, object] | None:
    if stream.get("vxlan_enabled") is not True:
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    inner_version = "IPv6" if stream.get("vxlan_inner_ip_version") == "IPv6" else "IPv4"
    header_length = 40 if inner_version == "IPv6" else 20
    payload_length = max(
        0,
        packet_length_without_fcs
        - workbench_l2_header_length(stream)
        - workbench_l3_header_length(stream)
        - 8
        - 8
        - 14
        - header_length
        - 8,
    )
    return {
        "header_length": header_length,
        "inner_version": inner_version,
        "payload_length": payload_length,
        "total_length": header_length + 8 + payload_length,
        "udp_length": 8 + payload_length,
    }


def add_vxlan_inner_ipv4_header_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    envelope = vxlan_inner_envelope(stream)
    for expectation in [
        field_expectation("IPv4[2] Protocol", "IPv4[2].Protocol", ["UDP"], "Fixed")
        if envelope is not None and envelope["inner_version"] == "IPv4"
        else None,
        field_expectation(
            "IPv4[2] Header Length",
            "IPv4[2].Header Length",
            [str(envelope["header_length"])],
            "Fixed",
        )
        if envelope is not None
        else None,
        field_expectation(
            "IPv4[2] Total Length",
            "IPv4[2].Total Length",
            [str(envelope["total_length"])],
            "Fixed",
        )
        if envelope is not None
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_vxlan_inner_ipv6_header_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    envelope = vxlan_inner_envelope(stream)
    for expectation in [
        field_expectation("IPv6 Next Header", "IPv6.Next Header", ["UDP"], "Fixed")
        if envelope is not None and envelope["inner_version"] == "IPv6"
        else None,
        field_expectation(
            "IPv6 Payload Length",
            "IPv6.Payload Length",
            [str(envelope["udp_length"])],
            "Fixed",
        )
        if envelope is not None and envelope["inner_version"] == "IPv6"
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def deterministic_vxlan_inner_udp_lengths(stream: dict[str, Any]) -> dict[str, object] | None:
    envelope = vxlan_inner_envelope(stream)
    if envelope is None:
        return None
    return {
        "values": [str(envelope["udp_length"])],
        "mode": "Fixed",
    }


def gtpu_optional_header_length(stream: dict[str, Any]) -> int:
    return (
        4
        if (
            stream.get("gtpu_sequence_enabled") is True
            or stream.get("gtpu_npdu_enabled") is True
            or stream.get("gtpu_extension_enabled") is True
        )
        else 0
    )


def gtpu_extension_header_length(stream: dict[str, Any]) -> int:
    return 4 if stream.get("gtpu_extension_enabled") is True else 0


def gtpu_outer_payload_length(stream: dict[str, Any]) -> int | None:
    if stream.get("gtpu_enabled") is not True:
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    return max(0, packet_length_without_fcs - workbench_l2_header_length(stream) - 20 - 8)


def gtpu_length_envelope(stream: dict[str, Any]) -> dict[str, int] | None:
    outer_payload_length = gtpu_outer_payload_length(stream)
    if outer_payload_length is None:
        return None
    return {
        "length": max(0, outer_payload_length - 8),
        "payload_length": max(0, outer_payload_length - 8 - gtpu_optional_header_length(stream)),
    }


def gtpu_inner_envelope(stream: dict[str, Any]) -> dict[str, int | str] | None:
    outer_payload_length = gtpu_outer_payload_length(stream)
    if outer_payload_length is None:
        return None
    inner_version = "IPv6" if stream.get("gtpu_inner_ip_version") == "IPv6" else "IPv4"
    header_length = 40 if inner_version == "IPv6" else 20
    payload_length = max(
        0,
        outer_payload_length
        - 8
        - gtpu_optional_header_length(stream)
        - gtpu_extension_header_length(stream)
        - header_length
        - 8,
    )
    return {
        "inner_version": inner_version,
        "header_length": header_length,
        "payload_length": payload_length,
        "udp_length": 8 + payload_length,
        "ipv4_total_length": header_length + 8 + payload_length,
        "ipv6_payload_length": 8 + payload_length,
    }


def add_gtpu_inner_ip_header_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    envelope = gtpu_inner_envelope(stream)
    if envelope is None:
        return
    if envelope["inner_version"] == "IPv6":
        expectations.extend(
            [
                field_expectation("IPv6 Next Header", "IPv6.Next Header", ["UDP"], "Fixed"),
                field_expectation("IPv6 Payload Length", "IPv6.Payload Length", [str(envelope["ipv6_payload_length"])], "Fixed"),
            ]
        )
        return
    expectations.extend(
        [
            field_expectation("IPv4[2] Protocol", "IPv4[2].Protocol", ["UDP"], "Fixed"),
            field_expectation("IPv4[2] Header Length", "IPv4[2].Header Length", [str(envelope["header_length"])], "Fixed"),
            field_expectation("IPv4[2] Total Length", "IPv4[2].Total Length", [str(envelope["ipv4_total_length"])], "Fixed"),
        ]
    )


def deterministic_gtpu_inner_udp_lengths(stream: dict[str, Any]) -> dict[str, object] | None:
    envelope = gtpu_inner_envelope(stream)
    if envelope is None:
        return None
    return {
        "values": [str(envelope["udp_length"])],
        "mode": "Fixed",
    }


def arp_operation_values(stream: dict[str, Any]) -> list[str]:
    operation_names = {1: "request", 2: "reply"}
    values = deterministic_int_values(stream, "arp_operation", 1)
    return [operation_names.get(int(value), value) for value in values]


def add_arp_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    for expectation in [
        field_expectation(
            "ARP Hardware Type",
            "ARP.Hardware Type",
            deterministic_int_values(stream, "arp_hardware_type", 1),
            "Fixed",
        ),
        field_expectation(
            "ARP Protocol Type",
            "ARP.Protocol Type",
            [hex_word_value(stream, "arp_protocol_type", "0800")],
            "Fixed",
        ),
        field_expectation(
            "ARP Hardware Size",
            "ARP.Hardware Size",
            deterministic_int_values(stream, "arp_hardware_size", 6),
            "Fixed",
        ),
        field_expectation(
            "ARP Protocol Size",
            "ARP.Protocol Size",
            deterministic_int_values(stream, "arp_protocol_size", 4),
            "Fixed",
        ),
        field_expectation(
            "ARP Operation",
            "ARP.Operation",
            arp_operation_values(stream),
            field_mode(stream, "arp_operation"),
        ),
        field_expectation(
            "ARP Sender MAC",
            "ARP.Sender MAC",
            deterministic_mac_values(stream, "arp_sender_mac", "00:00:00:00:00:00"),
            field_mode(stream, "arp_sender_mac"),
        ),
        field_expectation(
            "ARP Sender IP",
            "ARP.Sender IP",
            deterministic_ip_values(stream, "arp_sender_ip", "16.0.0.1"),
            field_mode(stream, "arp_sender_ip"),
        ),
        field_expectation(
            "ARP Target MAC",
            "ARP.Target MAC",
            deterministic_mac_values(stream, "arp_target_mac", "00:00:00:00:00:00"),
            field_mode(stream, "arp_target_mac"),
        ),
        field_expectation(
            "ARP Target IP",
            "ARP.Target IP",
            deterministic_ip_values(stream, "arp_target_ip", "48.0.0.1"),
            field_mode(stream, "arp_target_ip"),
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def icmp_echo_layer_prefix(stream: dict[str, Any]) -> str | None:
    packet_type = str(stream.get("packet_type") or "")
    if packet_type == "Ethernet/IPv4/ICMP":
        icmp_type = int_stream_value(stream, "icmp_type", 8)
        return "ICMP" if icmp_type in {0, 8} else None
    if packet_type == "Ethernet/IPv6/ICMPv6":
        icmp_type = int_stream_value(stream, "icmp_type", 128)
        return "ICMPv6" if icmp_type in {128, 129} else None
    return None


def icmp_echo_type_name(layer_prefix: str, icmp_type: int) -> str:
    names = {
        "ICMP": {
            0: "Echo Reply",
            8: "Echo Request",
        },
        "ICMPv6": {
            128: "Echo Request",
            129: "Echo Reply",
        },
    }
    return names.get(layer_prefix, {}).get(icmp_type, str(icmp_type))


def can_expect_icmp_checksum(stream: dict[str, Any]) -> bool:
    layer_prefix = icmp_echo_layer_prefix(stream)
    if (
        layer_prefix is None
        or stream.get("icmp_checksum_override") is not True
        or str(stream.get("frame_length_type") or "Fixed") != "Fixed"
    ):
        return False
    checksum_covered_keys = ["icmp_type", "icmp_code", "icmp_identifier", "icmp_sequence"]
    if layer_prefix == "ICMPv6":
        checksum_covered_keys.extend(["ipv6_src", "ipv6_dst"])
    return are_field_modes_fixed(stream, checksum_covered_keys)


def add_icmp_echo_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    layer_prefix = icmp_echo_layer_prefix(stream)
    if layer_prefix is None:
        return
    icmp_type = int_stream_value(stream, "icmp_type", 128 if layer_prefix == "ICMPv6" else 8)
    icmp_type_values = deterministic_int_values(stream, "icmp_type", 128 if layer_prefix == "ICMPv6" else 8)
    for expectation in [
        field_expectation(
            f"{layer_prefix} Type",
            f"{layer_prefix}.Type",
            icmp_type_values,
            field_mode(stream, "icmp_type"),
        ),
        field_expectation(
            f"{layer_prefix} Type Name",
            f"{layer_prefix}.Type Name",
            list(
                dict.fromkeys(
                    icmp_echo_type_name(layer_prefix, int(value) if str(value).isdigit() else icmp_type)
                    for value in icmp_type_values
                )
            ),
            field_mode(stream, "icmp_type"),
        ),
        field_expectation(
            f"{layer_prefix} Code",
            f"{layer_prefix}.Code",
            deterministic_int_values(stream, "icmp_code", 0),
            field_mode(stream, "icmp_code"),
        ),
        field_expectation(
            f"{layer_prefix} Checksum",
            f"{layer_prefix}.Checksum",
            deterministic_hex_word_values(stream, "icmp_checksum", "0000"),
            "Fixed",
        )
        if can_expect_icmp_checksum(stream)
        else None,
        field_expectation(
            f"{layer_prefix} Identifier",
            f"{layer_prefix}.Identifier",
            deterministic_int_values(stream, "icmp_identifier", 1),
            field_mode(stream, "icmp_identifier"),
        ),
        field_expectation(
            f"{layer_prefix} Sequence",
            f"{layer_prefix}.Sequence",
            deterministic_int_values(stream, "icmp_sequence", 1),
            field_mode(stream, "icmp_sequence"),
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def icmpv6_type_name(icmp_type: int) -> str:
    names = {
        128: "Echo Request",
        129: "Echo Reply",
        133: "Router Solicitation",
        134: "Router Advertisement",
        135: "Neighbor Solicitation",
        136: "Neighbor Advertisement",
    }
    return names.get(icmp_type, str(icmp_type))


def icmpv6_na_flags_value(stream: dict[str, Any]) -> int:
    flags = (
        (0x80 if stream.get("icmpv6_nd_na_router") is True else 0)
        | (0x40 if stream.get("icmpv6_nd_na_solicited") is True else 0)
        | (0x20 if stream.get("icmpv6_nd_na_override") is True else 0)
    )
    return flags << 24


def icmpv6_ra_flags_value(stream: dict[str, Any]) -> int:
    return (0x80 if stream.get("icmpv6_ra_managed") is True else 0) | (
        0x40 if stream.get("icmpv6_ra_other") is True else 0
    )


def icmpv6_ra_prefix_flags_value(stream: dict[str, Any]) -> int:
    return (0x80 if stream.get("icmpv6_ra_prefix_on_link") is True else 0) | (
        0x40 if stream.get("icmpv6_ra_prefix_autonomous") is True else 0
    )


def add_icmpv6_option_expectations(
    expectations: list[dict[str, Any]],
    option_types: list[str],
    option_lengths: list[str],
) -> None:
    for expectation in [
        field_expectation("ICMPv6 Option Type", "ICMPv6.Option Type", option_types, "Fixed")
        if option_types
        else None,
        field_expectation("ICMPv6 Option Length", "ICMPv6.Option Length", option_lengths, "Fixed")
        if option_lengths
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_icmpv6_discovery_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    if stream.get("packet_type") != "Ethernet/IPv6/ICMPv6":
        return
    icmp_type = int_stream_value(stream, "icmp_type", 128)
    if icmp_type not in {133, 134, 135, 136}:
        return

    for expectation in [
        field_expectation("ICMPv6 Type", "ICMPv6.Type", deterministic_int_values(stream, "icmp_type", 128), "Fixed"),
        field_expectation("ICMPv6 Type Name", "ICMPv6.Type Name", [icmpv6_type_name(icmp_type)], "Fixed"),
        field_expectation("ICMPv6 Code", "ICMPv6.Code", deterministic_int_values(stream, "icmp_code", 0), "Fixed"),
    ]:
        if expectation is not None:
            expectations.append(expectation)

    if icmp_type in {135, 136}:
        option_types: list[str] = []
        option_lengths: list[str] = []
        for expectation in [
            field_expectation(
                "ICMPv6 ND Flags",
                "ICMPv6.Flags",
                [hex_int_text(icmpv6_na_flags_value(stream) if icmp_type == 136 else 0, 8)],
                "Fixed",
            ),
            field_expectation(
                "ICMPv6 ND Target",
                "ICMPv6.Target",
                deterministic_ip_values(stream, "icmpv6_nd_target", "2001:db8::2"),
                "Fixed",
            ),
        ]:
            if expectation is not None:
                expectations.append(expectation)
        if stream.get("icmpv6_nd_include_option") is not False:
            option_types.append("Target Link-Layer Address" if icmp_type == 136 else "Source Link-Layer Address")
            option_lengths.append("8")
            expectation = field_expectation(
                "ICMPv6 ND Option MAC",
                "ICMPv6.Option MAC",
                deterministic_mac_values(stream, "icmpv6_nd_option_mac", "00:00:00:00:00:00"),
                "Fixed",
            )
            if expectation is not None:
                expectations.append(expectation)
        add_icmpv6_option_expectations(expectations, option_types, option_lengths)
        return

    if icmp_type == 133:
        option_types: list[str] = []
        option_lengths: list[str] = []
        expectation = field_expectation("ICMPv6 RS Reserved", "ICMPv6.Reserved", ["0x00000000"], "Fixed")
        if expectation is not None:
            expectations.append(expectation)
        if stream.get("icmpv6_rs_include_slla") is not False:
            option_types.append("Source Link-Layer Address")
            option_lengths.append("8")
            expectation = field_expectation(
                "ICMPv6 RS Source MAC",
                "ICMPv6.Option MAC",
                deterministic_mac_values(stream, "icmpv6_rs_slla_mac", "00:00:00:00:00:00"),
                "Fixed",
            )
            if expectation is not None:
                expectations.append(expectation)
        add_icmpv6_option_expectations(expectations, option_types, option_lengths)
        return

    if icmp_type == 134:
        option_types: list[str] = []
        option_lengths: list[str] = []
        for expectation in [
            field_expectation(
                "ICMPv6 RA Current Hop Limit",
                "ICMPv6.Current Hop Limit",
                deterministic_int_values(stream, "icmpv6_ra_cur_hop_limit", 64),
                "Fixed",
            ),
            field_expectation("ICMPv6 RA Flags", "ICMPv6.Flags", [hex_int_text(icmpv6_ra_flags_value(stream), 2)], "Fixed"),
            field_expectation(
                "ICMPv6 RA Router Lifetime",
                "ICMPv6.Router Lifetime",
                deterministic_int_values(stream, "icmpv6_ra_router_lifetime", 1800),
                "Fixed",
            ),
            field_expectation(
                "ICMPv6 RA Reachable Time",
                "ICMPv6.Reachable Time",
                deterministic_int_values(stream, "icmpv6_ra_reachable_time", 0),
                "Fixed",
            ),
            field_expectation(
                "ICMPv6 RA Retrans Timer",
                "ICMPv6.Retrans Timer",
                deterministic_int_values(stream, "icmpv6_ra_retrans_timer", 0),
                "Fixed",
            ),
        ]:
            if expectation is not None:
                expectations.append(expectation)
        if stream.get("icmpv6_ra_include_slla") is not False:
            option_types.append("Source Link-Layer Address")
            option_lengths.append("8")
            expectation = field_expectation(
                "ICMPv6 RA Source MAC",
                "ICMPv6.Option MAC",
                deterministic_mac_values(stream, "icmpv6_ra_slla_mac", "00:00:00:00:00:00"),
                "Fixed",
            )
            if expectation is not None:
                expectations.append(expectation)
        if stream.get("icmpv6_ra_include_prefix") is not False:
            option_types.append("Prefix Information")
            option_lengths.append("32")
            for expectation in [
                field_expectation(
                    "ICMPv6 RA Prefix Length",
                    "ICMPv6.Prefix Length",
                    deterministic_int_values(stream, "icmpv6_ra_prefix_length", 64),
                    "Fixed",
                ),
                field_expectation(
                    "ICMPv6 RA Prefix Flags",
                    "ICMPv6.Prefix Flags",
                    [hex_int_text(icmpv6_ra_prefix_flags_value(stream), 2)],
                    "Fixed",
                ),
                field_expectation(
                    "ICMPv6 RA Prefix Valid Lifetime",
                    "ICMPv6.Prefix Valid Lifetime",
                    deterministic_int_values(stream, "icmpv6_ra_prefix_valid_lifetime", 2592000),
                    "Fixed",
                ),
                field_expectation(
                    "ICMPv6 RA Prefix Preferred Lifetime",
                    "ICMPv6.Prefix Preferred Lifetime",
                    deterministic_int_values(stream, "icmpv6_ra_prefix_preferred_lifetime", 604800),
                    "Fixed",
                ),
                field_expectation(
                    "ICMPv6 RA Prefix",
                    "ICMPv6.Prefix",
                    deterministic_ip_values(stream, "icmpv6_ra_prefix", "2001:db8:100::"),
                    "Fixed",
                ),
            ]:
                if expectation is not None:
                    expectations.append(expectation)
        add_icmpv6_option_expectations(expectations, option_types, option_lengths)


def tcp_flags_value(stream: dict[str, Any]) -> int:
    return (
        (0x20 if stream.get("tcp_flag_urg") is True else 0)
        | (0x10 if stream.get("tcp_flag_ack") is True else 0)
        | (0x08 if stream.get("tcp_flag_psh") is True else 0)
        | (0x04 if stream.get("tcp_flag_rst") is True else 0)
        | (0x02 if stream.get("tcp_flag_syn") is True else 0)
        | (0x01 if stream.get("tcp_flag_fin") is True else 0)
    )


def tcp_flags_text(value: int) -> str:
    enabled = [
        label
        for label, mask in [
            ("URG", 0x20),
            ("ACK", 0x10),
            ("PSH", 0x08),
            ("RST", 0x04),
            ("SYN", 0x02),
            ("FIN", 0x01),
        ]
        if value & mask
    ]
    return ", ".join(enabled) if enabled else "-"


def deterministic_tcp_flags_values(stream: dict[str, Any]) -> list[str]:
    return [
        tcp_flags_text(int(value) & 0x3F)
        for value in deterministic_int_values_from(
            tcp_flags_value(stream),
            field_mode(stream, "tcp_flags"),
            field_count(stream, "tcp_flags"),
            field_step(stream, "tcp_flags"),
        )
    ]


def has_tcp_options(stream: dict[str, Any]) -> bool:
    return bool(
        stream.get("tcp_option_mss_enabled") is True
        or stream.get("tcp_option_window_scale_enabled") is True
        or stream.get("tcp_option_sack_permitted_enabled") is True
        or stream.get("tcp_option_sack_blocks_enabled") is True
        or stream.get("tcp_option_timestamp_enabled") is True
    )


def tcp_options_length(stream: dict[str, Any]) -> int:
    length = 0
    if stream.get("tcp_option_mss_enabled") is True:
        length += 4
    if stream.get("tcp_option_sack_permitted_enabled") is True:
        length += 2
    if stream.get("tcp_option_sack_blocks_enabled") is True:
        length += 10
    if stream.get("tcp_option_timestamp_enabled") is True:
        length += 12
    if stream.get("tcp_option_window_scale_enabled") is True:
        length += 4
    return length + ((4 - (length % 4)) % 4)


def are_field_modes_fixed(stream: dict[str, Any], keys: list[str]) -> bool:
    return all(field_mode(stream, key) == "Fixed" for key in keys)


def can_expect_udp_checksum(stream: dict[str, Any]) -> bool:
    if stream.get("udp_checksum_override") is not True or str(stream.get("frame_length_type") or "Fixed") != "Fixed":
        return False
    checksum_fixup_keys = [
        "src_ipv4",
        "dst_ipv4",
        "ipv4_src",
        "ipv4_dst",
        "ipv4_dscp",
        "ipv4_ecn",
        "ipv4_id",
        "ipv4_fragment_offset",
        "ipv4_ttl",
        "src_ipv6",
        "dst_ipv6",
        "ipv6_src",
        "ipv6_dst",
        "ipv6_traffic_class",
        "ipv6_flow_label",
        "ipv6_hop_limit",
        "l4_src_port",
        "l4_dst_port",
        "udp_length",
        "dns_transaction_id",
        "dns_flags",
        "dns_query_type",
        "dns_query_class",
        "dns_answer_ttl",
        "dns_answer_ipv4",
        "dhcp_operation",
        "dhcp_hops",
        "dhcp_seconds",
        "dhcp_message_type",
        "dhcp_flags",
        "dhcp_client_ip",
        "dhcp_your_ip",
        "dhcp_server_ip",
        "dhcp_relay_ip",
        "dhcp_client_mac",
        "dhcp_requested_ip",
        "dhcp_server_id",
        "dhcp_xid",
    ]
    return are_field_modes_fixed(stream, checksum_fixup_keys)


def can_expect_ipv4_checksum(stream: dict[str, Any]) -> bool:
    advanced_vm = stream.get("advanced_vm")
    advanced_instructions = (
        advanced_vm.get("instructions")
        if isinstance(advanced_vm, dict) and isinstance(advanced_vm.get("instructions"), list)
        else []
    )
    if (
        stream.get("ipv4_checksum_override") is not True
        or str(stream.get("frame_length_type") or "Fixed") != "Fixed"
        or (stream.get("advanced_mode") is True and len(advanced_instructions) > 0)
    ):
        return False
    checksum_fixup_keys = [
        "src_ipv4",
        "dst_ipv4",
        "ipv4_src",
        "ipv4_dst",
        "ipv4_dscp",
        "ipv4_ecn",
        "ipv4_id",
        "ipv4_fragment_offset",
        "ipv4_ttl",
        "l4_src_port",
        "l4_dst_port",
        "udp_length",
        "dns_transaction_id",
        "dns_flags",
        "dns_query_type",
        "dns_query_class",
        "dns_answer_ttl",
        "dns_answer_ipv4",
        "dhcp_operation",
        "dhcp_hops",
        "dhcp_seconds",
        "dhcp_message_type",
        "dhcp_flags",
        "dhcp_client_ip",
        "dhcp_your_ip",
        "dhcp_server_ip",
        "dhcp_relay_ip",
        "dhcp_client_mac",
        "dhcp_requested_ip",
        "dhcp_server_id",
        "dhcp_xid",
        "tcp_sequence",
        "tcp_ack",
        "tcp_window",
        "tcp_urgent_pointer",
        "tcp_flags",
        "tcp_option_mss",
        "tcp_option_window_scale",
        "tcp_option_sack_left_edge",
        "tcp_option_sack_right_edge",
        "tcp_option_timestamp_value",
        "tcp_option_timestamp_echo",
        "icmp_identifier",
        "icmp_sequence",
        "sctp_verification_tag",
        "sctp_data_flags",
        "sctp_tsn",
        "sctp_stream_id",
        "sctp_stream_sequence",
        "sctp_payload_protocol_id",
    ]
    return are_field_modes_fixed(stream, checksum_fixup_keys)


def can_expect_tcp_checksum(stream: dict[str, Any]) -> bool:
    if stream.get("tcp_checksum_override") is not True or str(stream.get("frame_length_type") or "Fixed") != "Fixed":
        return False
    checksum_fixup_keys = [
        "src_ipv4",
        "dst_ipv4",
        "ipv4_src",
        "ipv4_dst",
        "ipv4_dscp",
        "ipv4_ecn",
        "ipv4_id",
        "ipv4_fragment_offset",
        "ipv4_ttl",
        "src_ipv6",
        "dst_ipv6",
        "ipv6_src",
        "ipv6_dst",
        "l4_src_port",
        "l4_dst_port",
        "tcp_sequence",
        "tcp_ack",
        "tcp_window",
        "tcp_urgent_pointer",
        "tcp_flags",
        "tcp_option_mss",
        "tcp_option_window_scale",
        "tcp_option_sack_left_edge",
        "tcp_option_sack_right_edge",
        "tcp_option_timestamp_value",
        "tcp_option_timestamp_echo",
    ]
    return are_field_modes_fixed(stream, checksum_fixup_keys)


def can_expect_sctp_checksum(stream: dict[str, Any]) -> bool:
    if (
        stream.get("sctp_checksum_override") is not True
        or str(stream.get("frame_length_type") or "Fixed") != "Fixed"
        or "frame_length" not in stream
    ):
        return False
    checksum_covered_keys = [
        "src_ipv4",
        "dst_ipv4",
        "ipv4_src",
        "ipv4_dst",
        "ipv4_dscp",
        "ipv4_ecn",
        "ipv4_id",
        "ipv4_fragment_offset",
        "ipv4_ttl",
        "src_ipv6",
        "dst_ipv6",
        "ipv6_src",
        "ipv6_dst",
        "ipv6_traffic_class",
        "ipv6_flow_label",
        "ipv6_hop_limit",
        "l4_src_port",
        "l4_dst_port",
        "sctp_verification_tag",
        "sctp_data_flags",
        "sctp_tsn",
        "sctp_stream_id",
        "sctp_stream_sequence",
        "sctp_payload_protocol_id",
    ]
    return are_field_modes_fixed(stream, checksum_covered_keys)


def workbench_vlan_tag_count(stream: dict[str, Any]) -> int:
    if stream.get("vlan_enabled") is not True:
        return 0
    return 2 if stream.get("vlan2_enabled") is True else 1


def workbench_mpls_label_count(stream: dict[str, Any]) -> int:
    if stream.get("mpls_enabled") is not True:
        return 0
    return 1 + (1 if stream.get("mpls_label2_enabled") is True else 0) + (
        1 if stream.get("mpls_label2_enabled") is True and stream.get("mpls_label3_enabled") is True else 0
    )


def workbench_l2_header_length(stream: dict[str, Any]) -> int:
    return 14 + (workbench_vlan_tag_count(stream) * 4) + (workbench_mpls_label_count(stream) * 4)


def workbench_l3_header_length(stream: dict[str, Any]) -> int:
    packet_type = str(stream.get("packet_type") or "")
    if packet_type.startswith("Ethernet/IPv6"):
        return 40
    if packet_type.startswith("Ethernet/IPv4"):
        return 20
    return 0


def sctp_fixed_lengths(stream: dict[str, Any]) -> dict[str, int] | None:
    packet_type = str(stream.get("packet_type") or "")
    if "frame_length" not in stream or str(stream.get("frame_length_type") or "Fixed") != "Fixed" or not packet_type.endswith("/SCTP"):
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    payload_length = max(
        0,
        packet_length_without_fcs - workbench_l2_header_length(stream) - workbench_l3_header_length(stream) - 28,
    )
    return {"chunk_length": 16 + payload_length, "payload_length": payload_length}


def tcp_fixed_lengths(stream: dict[str, Any]) -> dict[str, int] | None:
    packet_type = str(stream.get("packet_type") or "")
    if not packet_type.endswith("/TCP"):
        return None
    packet_length_without_fcs = fixed_workbench_packet_length_without_fcs(stream)
    if packet_length_without_fcs is None:
        return None
    header_length = 20 + tcp_options_length(stream)
    payload_length = max(
        0,
        packet_length_without_fcs - workbench_l2_header_length(stream) - workbench_l3_header_length(stream) - header_length,
    )
    return {"header_length": header_length, "payload_length": payload_length}


def add_tcp_option_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    if not has_tcp_options(stream):
        return
    lengths = tcp_fixed_lengths(stream)
    for expectation in [
        field_expectation(
            "TCP Header Length",
            "TCP.Header Length",
            [str(20 + tcp_options_length(stream))],
            "Fixed",
        )
        if lengths is None
        else None,
        field_expectation(
            "TCP Option MSS",
            "TCP.Option MSS",
            deterministic_int_values(stream, "tcp_option_mss", 1460),
            field_mode(stream, "tcp_option_mss"),
        )
        if stream.get("tcp_option_mss_enabled") is True
        else None,
        field_expectation(
            "TCP Option SACK Permitted",
            "TCP.Option SACK Permitted",
            ["yes"],
            "Fixed",
        )
        if stream.get("tcp_option_sack_permitted_enabled") is True
        else None,
        field_expectation(
            "TCP Option SACK Left Edge",
            "TCP.Option SACK Left Edge",
            deterministic_int_values(stream, "tcp_option_sack_left_edge", 1000),
            field_mode(stream, "tcp_option_sack_left_edge"),
        )
        if stream.get("tcp_option_sack_blocks_enabled") is True
        else None,
        field_expectation(
            "TCP Option SACK Right Edge",
            "TCP.Option SACK Right Edge",
            deterministic_int_values(stream, "tcp_option_sack_right_edge", 2000),
            field_mode(stream, "tcp_option_sack_right_edge"),
        )
        if stream.get("tcp_option_sack_blocks_enabled") is True
        else None,
        field_expectation(
            "TCP Option Timestamp Value",
            "TCP.Option Timestamp Value",
            deterministic_int_values(stream, "tcp_option_timestamp_value", 1),
            field_mode(stream, "tcp_option_timestamp_value"),
        )
        if stream.get("tcp_option_timestamp_enabled") is True
        else None,
        field_expectation(
            "TCP Option Timestamp Echo",
            "TCP.Option Timestamp Echo",
            deterministic_int_values(stream, "tcp_option_timestamp_echo", 0),
            field_mode(stream, "tcp_option_timestamp_echo"),
        )
        if stream.get("tcp_option_timestamp_enabled") is True
        else None,
        field_expectation(
            "TCP Option Window Scale",
            "TCP.Option Window Scale",
            deterministic_int_values(stream, "tcp_option_window_scale", 7),
            field_mode(stream, "tcp_option_window_scale"),
        )
        if stream.get("tcp_option_window_scale_enabled") is True
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_tcp_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    lengths = tcp_fixed_lengths(stream)
    for expectation in [
        field_expectation("TCP Header Length", "TCP.Header Length", [str(lengths["header_length"])], "Fixed")
        if lengths is not None
        else None,
        field_expectation("TCP Payload Length", "TCP.Payload Length", [str(lengths["payload_length"])], "Fixed")
        if lengths is not None
        else None,
        field_expectation(
            "TCP Sequence",
            "TCP.Sequence",
            deterministic_int_values_for(stream, "tcp_sequence_number", "tcp_sequence", 1_234_567),
            field_mode(stream, "tcp_sequence"),
        ),
        field_expectation(
            "TCP Acknowledge",
            "TCP.Acknowledge",
            deterministic_int_values_for(stream, "tcp_ack_number", "tcp_ack", 7_654_321),
            field_mode(stream, "tcp_ack"),
        ),
        field_expectation(
            "TCP Window",
            "TCP.Window",
            deterministic_int_values(stream, "tcp_window", 9999),
            field_mode(stream, "tcp_window"),
        ),
        field_expectation(
            "TCP Flags",
            "TCP.Flags",
            deterministic_tcp_flags_values(stream),
            field_mode(stream, "tcp_flags"),
        ),
        field_expectation(
            "TCP Urgent Pointer",
            "TCP.Urgent Pointer",
            deterministic_int_values(stream, "tcp_urgent_pointer", 1111),
            field_mode(stream, "tcp_urgent_pointer"),
        ),
        field_expectation(
            "TCP Checksum",
            "TCP.Checksum",
            deterministic_hex_word_values(stream, "tcp_checksum", "ABCD"),
            field_mode(stream, "tcp_checksum"),
        )
        if can_expect_tcp_checksum(stream)
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)
    add_tcp_option_expectations(expectations, stream)


def add_sctp_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    lengths = sctp_fixed_lengths(stream)
    for expectation in [
        field_expectation(
            "SCTP Verification Tag",
            "SCTP.Verification Tag",
            deterministic_hex_int_values(stream, "sctp_verification_tag", 0x12345678),
            field_mode(stream, "sctp_verification_tag"),
        ),
        field_expectation(
            "SCTP Checksum",
            "SCTP.Checksum",
            [hex_dword_value(stream, "sctp_checksum", "00000000")],
            "Fixed",
        )
        if can_expect_sctp_checksum(stream)
        else None,
        field_expectation("SCTP Chunk Type", "SCTP.Chunk Type", ["DATA"], "Fixed"),
        field_expectation(
            "SCTP Chunk Flags",
            "SCTP.Chunk Flags",
            deterministic_hex_int_values(stream, "sctp_data_flags", 3, width=2),
            field_mode(stream, "sctp_data_flags"),
        ),
        field_expectation("SCTP Chunk Length", "SCTP.Chunk Length", [str(lengths["chunk_length"])], "Fixed")
        if lengths is not None
        else None,
        field_expectation(
            "SCTP TSN",
            "SCTP.TSN",
            deterministic_int_values(stream, "sctp_tsn", 1),
            field_mode(stream, "sctp_tsn"),
        ),
        field_expectation(
            "SCTP Stream ID",
            "SCTP.Stream ID",
            deterministic_int_values(stream, "sctp_stream_id", 0),
            field_mode(stream, "sctp_stream_id"),
        ),
        field_expectation(
            "SCTP Stream Sequence",
            "SCTP.Stream Sequence",
            deterministic_int_values(stream, "sctp_stream_sequence", 0),
            field_mode(stream, "sctp_stream_sequence"),
        ),
        field_expectation(
            "SCTP Payload Protocol ID",
            "SCTP.Payload Protocol ID",
            deterministic_int_values(stream, "sctp_payload_protocol_id", 0),
            field_mode(stream, "sctp_payload_protocol_id"),
        ),
        field_expectation("SCTP Payload Length", "SCTP.Payload Length", [str(lengths["payload_length"])], "Fixed")
        if lengths is not None
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def dns_query_type_name(value: int) -> str:
    names = {1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 28: "AAAA", 33: "SRV", 255: "ANY"}
    return names.get(value, str(value))


def dns_query_class_name(value: int) -> str:
    names = {1: "IN", 3: "CH", 4: "HS", 255: "ANY"}
    return names.get(value, str(value))


def dns_flags_number(stream: dict[str, Any]) -> int:
    return int(hex_word_value(stream, "dns_flags", "0100"), 16)


def deterministic_dns_flags_numbers(stream: dict[str, Any]) -> list[int]:
    start = dns_flags_number(stream)
    return [
        int(value) & 0xFFFF
        for value in deterministic_int_values_from(start, field_mode(stream, "dns_flags"), field_count(stream, "dns_flags"), field_step(stream, "dns_flags"))
    ]


def deterministic_dns_flags_values(stream: dict[str, Any]) -> list[str]:
    if field_mode(stream, "dns_flags") == "Fixed":
        return [hex_word_value(stream, "dns_flags", "0100")]
    return [hex_int_text(value, width=4) for value in deterministic_dns_flags_numbers(stream)]


def deterministic_dns_qr_values(stream: dict[str, Any]) -> list[str]:
    return unique_text(["response" if flags & 0x8000 else "query" for flags in deterministic_dns_flags_numbers(stream)])


def deterministic_dns_opcode_values(stream: dict[str, Any]) -> list[str]:
    return unique_text([str((flags >> 11) & 0x0F) for flags in deterministic_dns_flags_numbers(stream)])


def deterministic_dns_response_code_values(stream: dict[str, Any]) -> list[str]:
    return unique_text([str(flags & 0x0F) for flags in deterministic_dns_flags_numbers(stream)])


def deterministic_dns_query_type_values(stream: dict[str, Any]) -> list[str]:
    return [dns_query_type_name(int(value)) for value in deterministic_int_values(stream, "dns_query_type", 1)]


def deterministic_dns_query_class_values(stream: dict[str, Any]) -> list[str]:
    return [dns_query_class_name(int(value)) for value in deterministic_int_values(stream, "dns_query_class", 1)]


def add_dns_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    for expectation in [
        field_expectation(
            "DNS Transaction ID",
            "DNS.Transaction ID",
            deterministic_hex_int_values(stream, "dns_transaction_id", 0x1234, width=4),
            field_mode(stream, "dns_transaction_id"),
        ),
        field_expectation("DNS Flags", "DNS.Flags", deterministic_dns_flags_values(stream), field_mode(stream, "dns_flags")),
        field_expectation("DNS QR", "DNS.QR", deterministic_dns_qr_values(stream), field_mode(stream, "dns_flags")),
        field_expectation("DNS Opcode", "DNS.Opcode", deterministic_dns_opcode_values(stream), field_mode(stream, "dns_flags")),
        field_expectation(
            "DNS Response Code",
            "DNS.Response Code",
            deterministic_dns_response_code_values(stream),
            field_mode(stream, "dns_flags"),
        ),
        field_expectation("DNS Questions", "DNS.Questions", ["1"], "Fixed"),
        field_expectation("DNS Answers", "DNS.Answers", ["1" if stream.get("dns_answer_enabled") is True else "0"], "Fixed"),
        field_expectation("DNS Authority RRs", "DNS.Authority RRs", ["0"], "Fixed"),
        field_expectation("DNS Additional RRs", "DNS.Additional RRs", ["0"], "Fixed"),
        field_expectation(
            "DNS Query Name",
            "DNS.Query Name",
            [text_stream_value(stream, "dns_query_name", "example.com").removesuffix(".")],
            "Fixed",
        ),
        field_expectation(
            "DNS Query Type",
            "DNS.Query Type",
            deterministic_dns_query_type_values(stream),
            field_mode(stream, "dns_query_type"),
        ),
        field_expectation(
            "DNS Query Class",
            "DNS.Query Class",
            deterministic_dns_query_class_values(stream),
            field_mode(stream, "dns_query_class"),
        ),
        field_expectation("DNS Answer Type", "DNS.Answer Type", ["A"], "Fixed")
        if stream.get("dns_answer_enabled") is True
        else None,
        field_expectation(
            "DNS Answer Class",
            "DNS.Answer Class",
            [dns_query_class_name(int_stream_value(stream, "dns_query_class", 1))],
            "Fixed",
        )
        if stream.get("dns_answer_enabled") is True
        else None,
        field_expectation(
            "DNS Answer TTL",
            "DNS.Answer TTL",
            deterministic_int_values(stream, "dns_answer_ttl", 60),
            field_mode(stream, "dns_answer_ttl"),
        )
        if stream.get("dns_answer_enabled") is True
        else None,
        field_expectation(
            "DNS Answer IPv4",
            "DNS.Answer IPv4",
            deterministic_ip_values(stream, "dns_answer_ipv4", "192.0.2.1"),
            field_mode(stream, "dns_answer_ipv4"),
        )
        if stream.get("dns_answer_enabled") is True
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def dhcp_message_type_name(value: int) -> str:
    names = {
        1: "Discover",
        2: "Offer",
        3: "Request",
        4: "Decline",
        5: "Ack",
        6: "Nak",
        7: "Release",
        8: "Inform",
    }
    return names.get(value, str(value))


def deterministic_dhcp_message_type_values(stream: dict[str, Any]) -> list[str]:
    return [dhcp_message_type_name(int(value)) for value in deterministic_int_values(stream, "dhcp_message_type", 1)]


def dhcp_operation_name(value: int) -> str:
    names = {
        1: "request",
        2: "reply",
    }
    return names.get(value, str(value))


def deterministic_dhcp_operation_values(stream: dict[str, Any]) -> list[str]:
    return [dhcp_operation_name(int(value)) for value in deterministic_int_values(stream, "dhcp_operation", 1)]


def dhcp_parameter_request_list_text(value: str) -> str:
    tokens = [token for token in re.split(r"[\s,]+", value.strip()) if token]
    normalized: list[str] = []
    for token in tokens:
        if re.fullmatch(r"\d{1,3}", token) is None:
            return ""
        option = int(token, 10)
        if option < 0 or option > 255:
            return ""
        normalized.append(str(option))
    return ",".join(normalized)


def add_dhcp_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    hostname = text_stream_value(stream, "dhcp_hostname", "trex-webui")
    parameter_request_list = dhcp_parameter_request_list_text(
        text_stream_value(stream, "dhcp_parameter_request_list", "1,3,6,15,28,51,58,59")
    )
    requested_ip = text_stream_value(stream, "dhcp_requested_ip", "0.0.0.0")
    server_id = text_stream_value(stream, "dhcp_server_id", "0.0.0.0")
    lease_time = int_stream_value(stream, "dhcp_lease_time", 0)
    renewal_time = int_stream_value(stream, "dhcp_renewal_time", 0)
    rebinding_time = int_stream_value(stream, "dhcp_rebinding_time", 0)
    for expectation in [
        field_expectation(
            "DHCP Operation",
            "DHCP.Operation",
            deterministic_dhcp_operation_values(stream),
            field_mode(stream, "dhcp_operation"),
        ),
        field_expectation("DHCP Hardware Type", "DHCP.Hardware Type", ["1"], "Fixed"),
        field_expectation("DHCP Hardware Size", "DHCP.Hardware Size", ["6"], "Fixed"),
        field_expectation(
            "DHCP Hops",
            "DHCP.Hops",
            deterministic_int_values(stream, "dhcp_hops", 0),
            field_mode(stream, "dhcp_hops"),
        ),
        field_expectation(
            "DHCP Transaction ID",
            "DHCP.Transaction ID",
            deterministic_hex_int_values(stream, "dhcp_xid", 0x3903F326),
            field_mode(stream, "dhcp_xid"),
        ),
        field_expectation(
            "DHCP Seconds",
            "DHCP.Seconds",
            deterministic_int_values(stream, "dhcp_seconds", 0),
            field_mode(stream, "dhcp_seconds"),
        ),
        field_expectation(
            "DHCP Flags",
            "DHCP.Flags",
            deterministic_hex_word_values(stream, "dhcp_flags", "8000"),
            field_mode(stream, "dhcp_flags"),
        ),
        field_expectation(
            "DHCP Client IP",
            "DHCP.Client IP",
            deterministic_ip_values(stream, "dhcp_client_ip", "0.0.0.0"),
            field_mode(stream, "dhcp_client_ip"),
        ),
        field_expectation(
            "DHCP Your IP",
            "DHCP.Your IP",
            deterministic_ip_values(stream, "dhcp_your_ip", "0.0.0.0"),
            field_mode(stream, "dhcp_your_ip"),
        ),
        field_expectation(
            "DHCP Server IP",
            "DHCP.Server IP",
            deterministic_ip_values(stream, "dhcp_server_ip", "0.0.0.0"),
            field_mode(stream, "dhcp_server_ip"),
        ),
        field_expectation(
            "DHCP Relay IP",
            "DHCP.Relay IP",
            deterministic_ip_values(stream, "dhcp_relay_ip", "0.0.0.0"),
            field_mode(stream, "dhcp_relay_ip"),
        ),
        field_expectation(
            "DHCP Client MAC",
            "DHCP.Client MAC",
            deterministic_mac_values(stream, "dhcp_client_mac", "00:11:22:33:44:55"),
            field_mode(stream, "dhcp_client_mac"),
        ),
        field_expectation("DHCP Magic Cookie", "DHCP.Magic Cookie", ["63825363"], "Fixed"),
        field_expectation(
            "DHCP Message Type",
            "DHCP.Message Type",
            deterministic_dhcp_message_type_values(stream),
            field_mode(stream, "dhcp_message_type"),
        ),
        field_expectation("DHCP Hostname", "DHCP.Hostname", [hostname], "Fixed") if hostname else None,
        field_expectation(
            "DHCP Parameter Request List",
            "DHCP.Parameter Request List",
            [parameter_request_list],
            "Fixed",
        )
        if parameter_request_list
        else None,
        field_expectation(
            "DHCP Requested IP",
            "DHCP.Requested IP",
            deterministic_ip_values(stream, "dhcp_requested_ip", "0.0.0.0"),
            field_mode(stream, "dhcp_requested_ip"),
        )
        if requested_ip != "0.0.0.0"
        else None,
        field_expectation(
            "DHCP Server ID",
            "DHCP.Server ID",
            deterministic_ip_values(stream, "dhcp_server_id", "0.0.0.0"),
            field_mode(stream, "dhcp_server_id"),
        )
        if server_id != "0.0.0.0"
        else None,
        field_expectation(
            "DHCP Lease Time",
            "DHCP.Lease Time",
            deterministic_int_values(stream, "dhcp_lease_time", 0),
            field_mode(stream, "dhcp_lease_time"),
        )
        if lease_time > 0
        else None,
        field_expectation(
            "DHCP Renewal Time",
            "DHCP.Renewal Time",
            deterministic_int_values(stream, "dhcp_renewal_time", 0),
            field_mode(stream, "dhcp_renewal_time"),
        )
        if renewal_time > 0
        else None,
        field_expectation(
            "DHCP Rebinding Time",
            "DHCP.Rebinding Time",
            deterministic_int_values(stream, "dhcp_rebinding_time", 0),
            field_mode(stream, "dhcp_rebinding_time"),
        )
        if rebinding_time > 0
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_vlan_tag_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any], tag_index: int) -> None:
    if tag_index == 1 and stream.get("vlan_enabled") is not True:
        return
    if tag_index == 2 and not (stream.get("vlan_enabled") is True and stream.get("vlan2_enabled") is True):
        return

    prefix = "vlan" if tag_index == 1 else "vlan2"
    layer_prefix = "802.1Q VLAN" if tag_index == 1 else "802.1Q VLAN[2]"
    label_prefix = "VLAN" if tag_index == 1 else "VLAN[2]"
    default_vlan_id = 0 if tag_index == 1 else 1
    for expectation in [
        field_expectation(
            f"{label_prefix} TPID",
            f"{layer_prefix}.TPID",
            [hex_word_value(stream, f"{prefix}_tpid", "8100")],
            "Fixed",
        ),
        field_expectation(
            f"{label_prefix} Priority",
            f"{layer_prefix}.Priority",
            deterministic_int_values(stream, f"{prefix}_priority", 0),
            field_mode(stream, f"{prefix}_priority"),
        ),
        field_expectation(
            f"{label_prefix} DEI",
            f"{layer_prefix}.DEI",
            deterministic_int_values(stream, f"{prefix}_cfi", 0),
            "Fixed",
        ),
        field_expectation(
            f"{label_prefix} ID",
            f"{layer_prefix}.VLAN ID",
            deterministic_int_values(stream, f"{prefix}_id", default_vlan_id),
            field_mode(stream, f"{prefix}_id"),
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_vlan_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    add_vlan_tag_expectations(expectations, stream, 1)
    add_vlan_tag_expectations(expectations, stream, 2)


def add_mpls_label_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any], label_index: int) -> None:
    if label_index == 1 and stream.get("mpls_enabled") is not True:
        return
    if label_index == 2 and not (stream.get("mpls_enabled") is True and stream.get("mpls_label2_enabled") is True):
        return
    if label_index == 3 and not (
        stream.get("mpls_enabled") is True
        and stream.get("mpls_label2_enabled") is True
        and stream.get("mpls_label3_enabled") is True
    ):
        return

    label_key = "mpls_label" if label_index == 1 else f"mpls_label{label_index}"
    tc_key = "mpls_tc" if label_index == 1 else f"mpls_label{label_index}_tc"
    ttl_key = "mpls_ttl" if label_index == 1 else f"mpls_label{label_index}_ttl"
    layer_prefix = "MPLS" if label_index == 1 else f"MPLS[{label_index}]"
    label_prefix = "MPLS" if label_index == 1 else f"MPLS[{label_index}]"
    label_default = 17 if label_index == 1 else 18 if label_index == 2 else 19
    bottom_of_stack = (
        stream.get("mpls_label2_enabled") is not True
        if label_index == 1
        else stream.get("mpls_label3_enabled") is not True
        if label_index == 2
        else True
    )
    for expectation in [
        field_expectation(
            f"{label_prefix} Label",
            f"{layer_prefix}.Label",
            deterministic_int_values(stream, label_key, label_default),
            field_mode(stream, label_key),
        ),
        field_expectation(
            f"{label_prefix} Traffic Class",
            f"{layer_prefix}.Traffic Class",
            deterministic_int_values(stream, tc_key, 0),
            field_mode(stream, tc_key),
        ),
        field_expectation(
            f"{label_prefix} Bottom Of Stack",
            f"{layer_prefix}.Bottom Of Stack",
            ["1" if bottom_of_stack else "0"],
            "Fixed",
        ),
        field_expectation(
            f"{label_prefix} TTL",
            f"{layer_prefix}.TTL",
            deterministic_int_values(stream, ttl_key, 255),
            field_mode(stream, ttl_key),
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_mpls_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    add_mpls_label_expectations(expectations, stream, 1)
    add_mpls_label_expectations(expectations, stream, 2)
    add_mpls_label_expectations(expectations, stream, 3)


def gtpu_flags_value(stream: dict[str, Any]) -> int:
    return (
        0x30
        | (0x04 if stream.get("gtpu_extension_enabled") is True else 0)
        | (0x02 if stream.get("gtpu_sequence_enabled") is True else 0)
        | (0x01 if stream.get("gtpu_npdu_enabled") is True else 0)
    )


def gtpu_message_type_name(value: int) -> str:
    names = {
        1: "Echo Request",
        2: "Echo Response",
        26: "Error Indication",
        31: "Supported Extension Headers Notification",
        254: "End Marker",
        255: "G-PDU",
    }
    label = names.get(value, "Message")
    return f"{label} ({value})"


def add_gtpu_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    has_optional_header = bool(
        stream.get("gtpu_sequence_enabled") is True
        or stream.get("gtpu_npdu_enabled") is True
        or stream.get("gtpu_extension_enabled") is True
    )
    length_envelope = gtpu_length_envelope(stream)
    for expectation in [
        field_expectation("GTP-U Flags", "GTP-U.Flags", [hex_int_text(gtpu_flags_value(stream), 2)], "Fixed"),
        field_expectation("GTP-U Version", "GTP-U.Version", ["1"], "Fixed"),
        field_expectation("GTP-U Protocol Type", "GTP-U.Protocol Type", ["GTP"], "Fixed"),
        field_expectation(
            "GTP-U Message Type",
            "GTP-U.Message Type",
            [gtpu_message_type_name(int_stream_value(stream, "gtpu_message_type", 255))],
            "Fixed",
        ),
        field_expectation("GTP-U Length", "GTP-U.Length", [str(length_envelope["length"])], "Fixed")
        if length_envelope is not None
        else None,
        field_expectation(
            "GTP-U Payload Length",
            "GTP-U.Payload Length",
            [str(length_envelope["payload_length"])],
            "Fixed",
        )
        if length_envelope is not None
        else None,
        field_expectation(
            "GTP-U TEID",
            "GTP-U.TEID",
            deterministic_hex_int_values(stream, "gtpu_teid", 0x12345678),
            field_mode(stream, "gtpu_teid"),
        ),
        field_expectation(
            "GTP-U Extension Header",
            "GTP-U.Extension Header",
            ["yes" if stream.get("gtpu_extension_enabled") is True else "no"],
            "Fixed",
        ),
        field_expectation(
            "GTP-U Sequence Number Present",
            "GTP-U.Sequence Number Present",
            ["yes" if stream.get("gtpu_sequence_enabled") is True else "no"],
            "Fixed",
        ),
        field_expectation(
            "GTP-U N-PDU Present",
            "GTP-U.N-PDU Present",
            ["yes" if stream.get("gtpu_npdu_enabled") is True else "no"],
            "Fixed",
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)

    if not has_optional_header:
        return

    for expectation in [
        field_expectation(
            "GTP-U Sequence",
            "GTP-U.Sequence",
            deterministic_int_values(stream, "gtpu_sequence", 0),
            field_mode(stream, "gtpu_sequence"),
        ),
        field_expectation(
            "GTP-U N-PDU Number",
            "GTP-U.N-PDU Number",
            deterministic_int_values(stream, "gtpu_npdu", 0),
            field_mode(stream, "gtpu_npdu"),
        ),
        field_expectation(
            "GTP-U Next Extension Header",
            "GTP-U.Next Extension Header",
            ["0x40" if stream.get("gtpu_extension_enabled") is True else "0x00"],
            "Fixed",
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)

    if stream.get("gtpu_extension_enabled") is not True:
        return

    for expectation in [
        field_expectation("GTP-U Extension Type", "GTP-U Extension.Type", ["UDP Port (0x40)"], "Fixed"),
        field_expectation("GTP-U Extension Length Units", "GTP-U Extension.Length Units", ["1"], "Fixed"),
        field_expectation("GTP-U Extension Length", "GTP-U Extension.Length", ["4"], "Fixed"),
        field_expectation(
            "GTP-U Extension UDP Port",
            "GTP-U Extension.UDP Port",
            deterministic_int_values(stream, "gtpu_extension_udp_port", 2152),
            field_mode(stream, "gtpu_extension_udp_port"),
        ),
        field_expectation(
            "GTP-U Extension Next Header",
            "GTP-U Extension.Next Extension Header",
            ["0x00"],
            "Fixed",
        ),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def add_vxlan_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    for expectation in [
        field_expectation(
            "VXLAN Inner Ethernet Destination",
            "Inner Ethernet.Destination",
            [text_stream_value(stream, "vxlan_inner_ether_dst", "00:00:00:00:00:00").lower()],
            "Fixed",
        ),
        field_expectation(
            "VXLAN Inner Ethernet Source",
            "Inner Ethernet.Source",
            [text_stream_value(stream, "vxlan_inner_ether_src", "00:00:00:00:00:00").lower()],
            "Fixed",
        ),
        field_expectation(
            "VXLAN Inner Ethernet EtherType",
            "Inner Ethernet.EtherType",
            ["0x86dd" if stream.get("vxlan_inner_ip_version") == "IPv6" else "0x0800"],
            "Fixed",
        ),
        field_expectation("VXLAN Flags", "VXLAN.Flags", ["0x08"], "Fixed"),
        field_expectation("VXLAN Reserved", "VXLAN.Reserved", ["0x000000"], "Fixed"),
        field_expectation(
            "VXLAN VNI",
            "VXLAN.VNI",
            deterministic_int_values(stream, "vxlan_vni", 42),
            field_mode(stream, "vxlan_vni"),
        ),
        field_expectation("VXLAN VNI Reserved", "VXLAN.VNI Reserved", ["0x00"], "Fixed"),
    ]:
        if expectation is not None:
            expectations.append(expectation)


def gre_flags_value(stream: dict[str, Any]) -> int:
    flags = 0
    if stream.get("gre_checksum_present") is True:
        flags |= 0x8000
    if stream.get("gre_key_present") is True:
        flags |= 0x2000
    if stream.get("gre_sequence_present") is True:
        flags |= 0x1000
    return flags


def can_expect_gre_checksum(stream: dict[str, Any]) -> bool:
    if stream.get("gre_checksum_present") is not True or stream.get("gre_checksum_override") is not True:
        return False
    if stream.get("frame_length_type") != "Fixed":
        return False
    checksum_covered_keys = [
        "gre_key",
        "gre_sequence",
        "gre_inner_ipv4_src",
        "gre_inner_ipv4_dst",
        "gre_inner_ipv4_ttl",
        "gre_inner_ipv6_src",
        "gre_inner_ipv6_dst",
        "gre_inner_ipv6_hop_limit",
        "gre_inner_l4_src_port",
        "gre_inner_l4_dst_port",
    ]
    return all(field_mode(stream, key) == "Fixed" for key in checksum_covered_keys)


def add_gre_expectations(expectations: list[dict[str, Any]], stream: dict[str, Any]) -> None:
    for expectation in [
        field_expectation(
            "GRE Flags",
            "GRE.Flags",
            [hex_int_text(gre_flags_value(stream), 4)],
            "Fixed",
        ),
        field_expectation(
            "GRE Protocol Type",
            "GRE.Protocol Type",
            [gre_protocol_type_expectation(stream)],
            "Fixed",
        ),
        field_expectation(
            "GRE Checksum",
            "GRE.Checksum",
            deterministic_hex_word_values(stream, "gre_checksum", "0000"),
            field_mode(stream, "gre_checksum"),
        )
        if can_expect_gre_checksum(stream)
        else None,
        field_expectation(
            "GRE Key",
            "GRE.Key",
            deterministic_hex_int_values(stream, "gre_key", 0),
            field_mode(stream, "gre_key"),
        )
        if stream.get("gre_key_present") is True
        else None,
        field_expectation(
            "GRE Sequence",
            "GRE.Sequence",
            deterministic_int_values(stream, "gre_sequence", 0),
            field_mode(stream, "gre_sequence"),
        )
        if stream.get("gre_sequence_present") is True
        else None,
    ]:
        if expectation is not None:
            expectations.append(expectation)


def workbench_field_expectations(stream: dict[str, Any]) -> list[dict[str, Any]]:
    expectations: list[dict[str, Any]] = []
    packet_type = str(stream.get("packet_type") or "")
    add_ethernet_expectations(expectations, stream)
    add_vlan_expectations(expectations, stream)
    add_mpls_expectations(expectations, stream)
    if packet_type == "Ethernet/ARP":
        add_arp_expectations(expectations, stream)
        return expectations

    if stream.get("gtpu_enabled") is True:
        add_ip_expectations(
            expectations,
            stream,
            layer_prefix="IPv4",
            source_key="ipv4_src",
            source_default="16.0.0.1",
            destination_key="ipv4_dst",
            destination_default="48.0.0.1",
            ttl_key="ipv4_ttl",
            ttl_default=127,
            ttl_label="TTL",
            source_aliases=("src_ipv4",),
            destination_aliases=("dst_ipv4",),
        )
        add_ipv4_header_expectations(expectations, stream)
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="UDP",
            source_key="l4_src_port",
            destination_key="l4_dst_port",
            source_default=2152,
            destination_default=2152,
        )
        add_udp_header_expectations(expectations, stream, include_checksum=False)
        if stream.get("gtpu_inner_ip_version") == "IPv6":
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix="IPv6",
                source_key="gtpu_inner_ipv6_src",
                source_default="2001:db8:30::1",
                destination_key="gtpu_inner_ipv6_dst",
                destination_default="2001:db8:30::2",
                ttl_key="gtpu_inner_ipv6_hop_limit",
                ttl_default=64,
                ttl_label="Hop Limit",
            )
        else:
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix="IPv4[2]",
                source_key="gtpu_inner_ipv4_src",
                source_default="10.3.0.1",
                destination_key="gtpu_inner_ipv4_dst",
                destination_default="10.3.0.2",
                ttl_key="gtpu_inner_ipv4_ttl",
                ttl_default=64,
                ttl_label="TTL",
            )
        add_gtpu_inner_ip_header_expectations(expectations, stream)
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="UDP[2]",
            source_key="gtpu_inner_l4_src_port",
            destination_key="gtpu_inner_l4_dst_port",
            source_default=1025,
            destination_default=12,
        )
        add_udp_header_expectations(
            expectations,
            stream,
            layer_prefix="UDP[2]",
            udp_lengths=deterministic_gtpu_inner_udp_lengths(stream),
            include_checksum=False,
        )
        add_gtpu_expectations(expectations, stream)
        return expectations

    if stream.get("vxlan_enabled") is True:
        add_ip_expectations(
            expectations,
            stream,
            layer_prefix="IPv4",
            source_key="ipv4_src",
            source_default="16.0.0.1",
            destination_key="ipv4_dst",
            destination_default="48.0.0.1",
            ttl_key="ipv4_ttl",
            ttl_default=127,
            ttl_label="TTL",
            source_aliases=("src_ipv4",),
            destination_aliases=("dst_ipv4",),
        )
        add_ipv4_header_expectations(expectations, stream)
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="UDP",
            source_key="l4_src_port",
            destination_key="l4_dst_port",
            source_default=1337,
            destination_default=4789,
        )
        add_udp_header_expectations(expectations, stream, include_checksum=False)
        if stream.get("vxlan_inner_ip_version") == "IPv6":
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix="IPv6",
                source_key="vxlan_inner_ipv6_src",
                source_default="2001:db8:50::1",
                destination_key="vxlan_inner_ipv6_dst",
                destination_default="2001:db8:50::2",
                ttl_key="vxlan_inner_ipv6_hop_limit",
                ttl_default=64,
                ttl_label="Hop Limit",
            )
            add_vxlan_inner_ipv6_header_expectations(expectations, stream)
        else:
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix="IPv4[2]",
                source_key="vxlan_inner_ipv4_src",
                source_default="10.0.0.1",
                destination_key="vxlan_inner_ipv4_dst",
                destination_default="10.0.0.2",
                ttl_key="vxlan_inner_ipv4_ttl",
                ttl_default=127,
                ttl_label="TTL",
            )
            add_vxlan_inner_ipv4_header_expectations(expectations, stream)
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="UDP[2]",
            source_key="vxlan_inner_l4_src_port",
            destination_key="vxlan_inner_l4_dst_port",
            source_default=1025,
            destination_default=12,
        )
        add_udp_header_expectations(
            expectations,
            stream,
            layer_prefix="UDP[2]",
            udp_lengths=deterministic_vxlan_inner_udp_lengths(stream),
            include_checksum=False,
        )
        add_vxlan_expectations(expectations, stream)
        return expectations

    if packet_type.endswith("/GRE"):
        if packet_type.startswith("Ethernet/IPv4"):
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix="IPv4",
                source_key="ipv4_src",
                source_default="16.0.0.1",
                destination_key="ipv4_dst",
                destination_default="48.0.0.1",
                ttl_key="ipv4_ttl",
                ttl_default=127,
                ttl_label="TTL",
                source_aliases=("src_ipv4",),
                destination_aliases=("dst_ipv4",),
            )
            add_ipv4_header_expectations(expectations, stream)
        elif packet_type.startswith("Ethernet/IPv6"):
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix="IPv6",
                source_key="ipv6_src",
                source_default="2001:db8::1",
                destination_key="ipv6_dst",
                destination_default="2001:db8::2",
                ttl_key="ipv6_hop_limit",
                ttl_default=127,
                ttl_label="Hop Limit",
            )
            add_ipv6_header_expectations(expectations, stream)
        add_gre_expectations(expectations, stream)
        inner_version = gre_inner_ip_version(stream)
        inner_ipv4_prefix = "IPv4[2]" if packet_type.startswith("Ethernet/IPv4") else "IPv4"
        inner_ipv6_prefix = "IPv6[2]" if packet_type.startswith("Ethernet/IPv6") else "IPv6"
        if inner_version == "IPv6":
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix=inner_ipv6_prefix,
                source_key="gre_inner_ipv6_src",
                source_default="2001:db8:40::1",
                destination_key="gre_inner_ipv6_dst",
                destination_default="2001:db8:40::2",
                ttl_key="gre_inner_ipv6_hop_limit",
                ttl_default=64,
                ttl_label="Hop Limit",
            )
            add_gre_inner_ipv6_header_expectations(expectations, stream, layer_prefix=inner_ipv6_prefix)
        else:
            add_ip_expectations(
                expectations,
                stream,
                layer_prefix=inner_ipv4_prefix,
                source_key="gre_inner_ipv4_src",
                source_default="10.2.0.1",
                destination_key="gre_inner_ipv4_dst",
                destination_default="10.2.0.2",
                ttl_key="gre_inner_ipv4_ttl",
                ttl_default=64,
                ttl_label="TTL",
            )
            add_gre_inner_ipv4_header_expectations(expectations, stream, layer_prefix=inner_ipv4_prefix)
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="UDP",
            source_key="gre_inner_l4_src_port",
            destination_key="gre_inner_l4_dst_port",
            source_default=1025,
            destination_default=12,
        )
        add_udp_header_expectations(
            expectations,
            stream,
            udp_lengths=deterministic_gre_inner_udp_lengths(stream),
            include_checksum=False,
        )
        return expectations

    if packet_type.startswith("Ethernet/IPv4"):
        add_ip_expectations(
            expectations,
            stream,
            layer_prefix="IPv4",
            source_key="ipv4_src",
            source_default="16.0.0.1",
            destination_key="ipv4_dst",
            destination_default="48.0.0.1",
            ttl_key="ipv4_ttl",
            ttl_default=127,
            ttl_label="TTL",
            source_aliases=("src_ipv4",),
            destination_aliases=("dst_ipv4",),
        )
        add_ipv4_header_expectations(expectations, stream)
    if packet_type.startswith("Ethernet/IPv6"):
        add_ip_expectations(
            expectations,
            stream,
            layer_prefix="IPv6",
            source_key="ipv6_src",
            source_default="2001:db8::1",
            destination_key="ipv6_dst",
            destination_default="2001:db8::2",
            ttl_key="ipv6_hop_limit",
            ttl_default=127,
            ttl_label="Hop Limit",
        )
        add_ipv6_header_expectations(expectations, stream)
    if packet_type.endswith("/UDP"):
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="UDP",
            source_key="l4_src_port",
            destination_key="l4_dst_port",
            source_default=1025,
            destination_default=12,
        )
        add_udp_header_expectations(expectations, stream)
        if stream.get("dns_enabled") is True:
            add_dns_expectations(expectations, stream)
        if stream.get("dhcp_enabled") is True:
            add_dhcp_expectations(expectations, stream)
    if packet_type.endswith("/TCP"):
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="TCP",
            source_key="l4_src_port",
            destination_key="l4_dst_port",
            source_default=1025,
            destination_default=12,
        )
        add_tcp_expectations(expectations, stream)
    if packet_type.endswith("/SCTP"):
        add_l4_port_expectations(
            expectations,
            stream,
            layer_prefix="SCTP",
            source_key="l4_src_port",
            destination_key="l4_dst_port",
            source_default=1025,
            destination_default=12,
        )
        add_sctp_expectations(expectations, stream)
    add_icmpv6_discovery_expectations(expectations, stream)
    add_icmp_echo_expectations(expectations, stream)
    return expectations


def workbench_stream_intent_rows(streams: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, stream in enumerate((streams or [])[:64], start=1):
        field_engines = workbench_field_engines(stream)
        field_expectations = workbench_field_expectations(stream)
        flow_stats_enabled = stream.get("flow_stats_enabled") is True
        latency_enabled = stream.get("latency_enabled") is True
        rows.append(
            {
                "index": index,
                "name": str(stream.get("name") or f"stream-{index}"),
                "enabled": stream.get("enabled") is not False,
                "packet_type": workbench_packet_type(stream),
                "rate": f"{stream.get('rate_value', '-')} {stream.get('rate_type', '-')}",
                "pg_id": stream.get("pg_id") if flow_stats_enabled or latency_enabled else None,
                "rx_stats": flow_stats_enabled,
                "latency": latency_enabled,
                "field_engines": field_engines,
                "field_engine_count": len(field_engines),
                "field_expectations": field_expectations,
                "field_expectation_count": len(field_expectations),
                "expected_layer_chain": workbench_expected_layer_chain(stream),
            }
        )
    return rows


def unique_text(values: list[str]) -> list[str]:
    unique: list[str] = []
    for value in values:
        value = value.strip()
        if value and value != "-" and value not in unique:
            unique.append(value)
    return unique


def comparable_layer_chain(value: str) -> str:
    transparent_layers = {"802.1Q VLAN", "MPLS"}
    return " > ".join(part.strip() for part in value.split(">") if part.strip() and part.strip() not in transparent_layers)


def layer_chain_matches(expected: str, observed: str) -> bool:
    normalized_expected = comparable_layer_chain(expected)
    normalized_observed = comparable_layer_chain(observed)
    if not normalized_expected or not normalized_observed:
        return False
    if normalized_expected == normalized_observed:
        return True
    if not normalized_observed.startswith(f"{normalized_expected} > "):
        return False
    suffix = [
        part.strip()
        for part in normalized_observed[len(normalized_expected) + 3 :].split(">")
        if part.strip()
    ]
    first_extra_layer = suffix[0] if suffix else ""
    return (
        first_extra_layer in {"DNS", "DHCP", "Payload", "Data", "Raw"}
        or normalized_expected.endswith(" > IPv4")
        or normalized_expected.endswith(" > IPv6")
    )


def build_capture_layer_match(profile_streams: list[dict[str, Any]], decode_summary: dict[str, Any]) -> dict[str, Any]:
    expected = unique_text(
        [
            str(stream.get("expected_layer_chain") or "")
            for stream in profile_streams
            if stream.get("enabled") is not False
        ]
    )
    chains = decode_summary.get("layer_chains")
    observed = unique_text([str(chain) for chain in chains if isinstance(chain, str)]) if isinstance(chains, list) else []
    if not expected:
        return {
            "applicable": False,
            "status": "unknown",
            "summary": "No editable stream intent is attached for capture matching",
            "action": "Run acceptance with a workbench stream JSON or file to validate profile/capture intent",
            "expected": expected,
            "observed": observed,
            "matched": [],
            "missing": [],
            "unexpected": observed,
        }
    if not observed:
        return {
            "applicable": True,
            "status": "unknown",
            "summary": "No decoded capture layer chains are available to compare with the profile intent",
            "action": "Fetch or stop capture after traffic is running, then save the report archive",
            "expected": expected,
            "observed": observed,
            "matched": [],
            "missing": expected,
            "unexpected": [],
        }
    matched = [chain for chain in expected if any(layer_chain_matches(chain, observed_chain) for observed_chain in observed)]
    missing = [chain for chain in expected if chain not in matched]
    unexpected = [chain for chain in observed if not any(layer_chain_matches(expected_chain, chain) for expected_chain in expected)]
    if not missing:
        return {
            "applicable": True,
            "status": "pass",
            "summary": f"Capture decode matched {len(matched)} expected stream layer chain(s)",
            "action": "No operator action required",
            "expected": expected,
            "observed": observed,
            "matched": matched,
            "missing": missing,
            "unexpected": unexpected,
        }
    return {
        "applicable": True,
        "status": "warn" if matched else "fail",
        "summary": (
            f"Capture decode matched {len(matched)} chain(s) but missed {len(missing)} expected chain(s)"
            if matched
            else "Captured layer chains did not match the loaded stream intent"
        ),
        "action": "Compare Stream Builder protocol selection with the captured packet decode and confirm the selected profile is the one that was started",
        "expected": expected,
        "observed": observed,
        "matched": matched,
        "missing": missing,
        "unexpected": unexpected,
    }


def capture_decode_summary(payload: dict[str, Any]) -> dict[str, Any]:
    packets = capture_packets(payload)
    chains: list[str] = []
    decoded_packets = 0
    first_info = "-"
    for packet in packets:
        if first_info == "-" and isinstance(packet.get("info"), str) and packet["info"].strip():
            first_info = packet["info"].strip()
        chain = capture_packet_layer_chain(packet)
        if not chain:
            continue
        decoded_packets += 1
        if chain not in chains:
            chains.append(chain)
    return {
        "packet_count": len(packets),
        "decoded_packets": decoded_packets,
        "layer_chains": chains[:8],
        "first_packet_info": first_info,
    }


def capture_field_summary(payload: dict[str, Any]) -> dict[str, Any]:
    packets = capture_packets(payload)
    field_values: dict[str, list[str]] = {}
    decoded_packets = 0
    for packet in packets:
        packet_fields = capture_packet_field_map(packet)
        if not packet_fields:
            continue
        decoded_packets += 1
        for key, packet_values in packet_fields.items():
            values = field_values.setdefault(key, [])
            for value in packet_values:
                if value not in values:
                    values.append(value)
    return {
        "packet_count": len(packets),
        "decoded_packets": decoded_packets,
        "fields": {key: values[:32] for key, values in sorted(field_values.items())},
    }


def profile_field_expectation_rows(profile_streams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for stream in profile_streams:
        if stream.get("enabled") is False:
            continue
        stream_name = str(stream.get("name") or "-")
        expectations = stream.get("field_expectations")
        if not isinstance(expectations, list):
            continue
        for expectation in expectations:
            if not isinstance(expectation, dict):
                continue
            field = str(expectation.get("field") or "").strip()
            values = expectation.get("expected_values")
            expected_values = unique_text([str(value) for value in values]) if isinstance(values, list) else []
            if not field or not expected_values:
                continue
            rows.append(
                {
                    "stream": stream_name,
                    "field": field,
                    "label": str(expectation.get("label") or field),
                    "mode": str(expectation.get("mode") or "-"),
                    "expected_values": expected_values,
                }
            )
    return rows


def build_capture_field_match(profile_streams: list[dict[str, Any]], field_summary: dict[str, Any]) -> dict[str, Any]:
    expected = profile_field_expectation_rows(profile_streams)
    fields = field_summary.get("fields")
    observed = fields if isinstance(fields, dict) else {}
    if not expected:
        return {
            "applicable": False,
            "status": "unknown",
            "summary": "No deterministic profile fields are attached for capture matching",
            "action": "Use fixed or deterministic increment/decrement Stream Builder fields to validate capture field values",
            "expected": [],
            "observed": observed,
            "matched": [],
            "missing": [],
        }
    if not observed:
        return {
            "applicable": True,
            "status": "unknown",
            "summary": "No decoded capture fields are available to compare with the profile intent",
            "action": "Fetch or stop capture after traffic is running, then save the report archive",
            "expected": expected,
            "observed": observed,
            "matched": [],
            "missing": expected,
        }

    matched: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for row in expected:
        field = row["field"]
        observed_values = unique_text([str(value) for value in observed.get(field, [])]) if isinstance(observed.get(field), list) else []
        expected_values = row["expected_values"]
        missing_values = [value for value in expected_values if value not in observed_values]
        record = {
            **row,
            "observed_values": observed_values,
            "missing_values": missing_values,
        }
        if missing_values:
            missing.append(record)
        else:
            matched.append(record)

    if not missing:
        return {
            "applicable": True,
            "status": "pass",
            "summary": f"Capture decode matched {len(matched)} expected profile field(s)",
            "action": "No operator action required",
            "expected": expected,
            "observed": observed,
            "matched": matched,
            "missing": missing,
        }
    return {
        "applicable": True,
        "status": "fail",
        "summary": f"Capture decode missed {len(missing)} expected profile field(s)",
        "action": "Compare Stream Builder field values with the captured packet decode and confirm enough packets were captured for Field Engine cycles",
        "expected": expected,
        "observed": observed,
        "matched": matched,
        "missing": missing,
    }


def ensure_expected_layer_chain(summary: dict[str, Any], expected_layer_chain: str | None) -> None:
    expected = expected_layer_chain.strip() if isinstance(expected_layer_chain, str) else ""
    if not expected:
        return
    chains = summary.get("layer_chains")
    if isinstance(chains, list) and expected in {str(chain) for chain in chains}:
        return
    raise AcceptanceError(
        "capture decode",
        f"expected layer chain was not observed: {expected}",
        summary,
    )


def report_archive_payload(content: str) -> dict[str, Any]:
    try:
        archive = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AcceptanceError("report download", "downloaded report content was not JSON", str(exc)) from exc
    if not isinstance(archive, dict):
        raise AcceptanceError("report download", "downloaded report JSON was not an object", archive)
    payload = archive.get("payload")
    if not isinstance(payload, dict):
        raise AcceptanceError("report download", "downloaded report did not include an object payload", archive)
    return payload


def report_omitted_key_paths(value: Any, *, path: str = "$") -> list[str]:
    paths: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            item_path = f"{path}.{key}"
            if key in REPORT_OMITTED_KEYS:
                paths.append(item_path)
            paths.extend(report_omitted_key_paths(item, path=item_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            paths.extend(report_omitted_key_paths(item, path=f"{path}[{index}]"))
    return paths


def ensure_report_archive_has_no_binary_payloads(content: str) -> None:
    payload = report_archive_payload(content)
    paths = report_omitted_key_paths(payload)
    raw_hits = sorted(key for key in REPORT_OMITTED_KEYS if key in content)
    if paths or raw_hits:
        raise AcceptanceError(
            "report download",
            "downloaded report still included packet or PCAP base64 payload keys",
            {"paths": paths[:20], "raw_hits": raw_hits},
        )


def ensure_report_archive_capture_decode(content: str, expected_layer_chain: str | None) -> dict[str, Any]:
    payload = report_archive_payload(content)
    summary = payload.get("capture_decode_summary")
    if not isinstance(summary, dict):
        raise AcceptanceError("report download", "downloaded report did not include capture_decode_summary", payload)
    if summary.get("decoded_packets", 0) <= 0:
        raise AcceptanceError("report download", "downloaded report had no decoded capture packets", summary)
    ensure_expected_layer_chain(summary, expected_layer_chain)
    return summary


def ensure_report_archive_run_evidence(content: str, tx_port: int) -> dict[str, Any]:
    payload = report_archive_payload(content)
    if payload.get("verdict") != "pass":
        raise AcceptanceError("report download", "downloaded report verdict was not pass", payload.get("verdict"))

    traffic_session = payload.get("traffic_session")
    if not isinstance(traffic_session, dict):
        raise AcceptanceError("report download", "downloaded report did not include traffic_session", payload)
    for key in ["started_at", "ended_at", "profile", "ports", "multiplier"]:
        if not traffic_session.get(key):
            raise AcceptanceError("report download", f"traffic_session missing {key}", traffic_session)
    start_result = traffic_session.get("start_result")
    stop_result = traffic_session.get("stop_result")
    if not (isinstance(start_result, dict) and start_result.get("ok") is True):
        raise AcceptanceError("report download", "traffic_session.start_result was not ok", traffic_session)
    if not (isinstance(stop_result, dict) and stop_result.get("ok") is True):
        raise AcceptanceError("report download", "traffic_session.stop_result was not ok", traffic_session)

    samples = payload.get("stats_samples")
    if not isinstance(samples, list) or not samples:
        raise AcceptanceError("report download", "downloaded report did not include stats_samples", payload)
    last_sample = samples[-1] if isinstance(samples[-1], dict) else {}
    if not (last_sample.get("opackets", 0) > 0 and last_sample.get("ipackets", 0) > 0):
        raise AcceptanceError("report download", "stats_samples did not prove TX/RX packet movement", samples[-3:])

    after_stop_sample = payload.get("stats_after_stop_sample")
    if not isinstance(after_stop_sample, dict):
        raise AcceptanceError("report download", "downloaded report did not include stats_after_stop_sample", payload)

    capture_status_after_stop = payload.get("capture_status_after_stop")
    if capture_recorder_count(capture_status_after_stop if isinstance(capture_status_after_stop, dict) else {}) != 0:
        raise AcceptanceError(
            "report download",
            "downloaded report shows capture recorders after stop",
            capture_status_after_stop,
        )

    ports_after_stop = payload.get("ports_after_stop")
    if isinstance(ports_after_stop, dict):
        remaining_active = active_port_ids(ports_after_stop).intersection({tx_port})
        if remaining_active:
            raise AcceptanceError(
                "report download",
                "downloaded report shows requested traffic port active after stop",
                {"active_ports": sorted(remaining_active), "ports_after_stop": ports_after_stop},
            )
    else:
        raise AcceptanceError("report download", "downloaded report did not include ports_after_stop", payload)

    return {
        "verdict": payload.get("verdict"),
        "sample_count": len(samples),
        "last_sample": last_sample,
        "stats_after_stop_sample": after_stop_sample,
        "traffic_session": {
            "profile": traffic_session.get("profile"),
            "ports": traffic_session.get("ports"),
            "multiplier": traffic_session.get("multiplier"),
            "started_at": traffic_session.get("started_at"),
            "ended_at": traffic_session.get("ended_at"),
        },
    }


def ensure_report_archive_profile_capture_match(content: str, required: bool, expected_layer_chain: str | None) -> dict[str, Any]:
    if not required:
        return {}
    payload = report_archive_payload(content)
    profile_streams = payload.get("profile_streams")
    if not isinstance(profile_streams, list) or not profile_streams:
        raise AcceptanceError("report download", "downloaded report did not include profile_streams", payload)
    match = payload.get("capture_layer_match")
    if not isinstance(match, dict):
        raise AcceptanceError("report download", "downloaded report did not include capture_layer_match", payload)
    if match.get("status") != "pass":
        raise AcceptanceError("report download", "downloaded report profile/capture match was not pass", match)
    expected = expected_layer_chain.strip() if isinstance(expected_layer_chain, str) else ""
    chain_candidates: list[str] = []
    for key in ("expected", "observed", "matched"):
        values = match.get(key)
        if isinstance(values, list):
            chain_candidates.extend(str(chain) for chain in values if isinstance(chain, str))
    if expected and not any(
        expected == chain
        or layer_chain_matches(expected, chain)
        or layer_chain_matches(chain, expected)
        for chain in chain_candidates
    ):
        raise AcceptanceError(
            "report download",
            f"downloaded report did not match expected profile/capture chain: {expected}",
            match,
        )
    return match


def ensure_report_archive_profile_capture_fields(content: str, required: bool) -> dict[str, Any]:
    if not required:
        return {}
    payload = report_archive_payload(content)
    profile_streams = payload.get("profile_streams")
    if not isinstance(profile_streams, list) or not profile_streams:
        raise AcceptanceError("report download", "downloaded report did not include profile_streams", payload)
    has_expected_fields = any(
        isinstance(stream, dict) and int_stream_value(stream, "field_expectation_count", 0) > 0
        for stream in profile_streams
    )
    if not has_expected_fields:
        return {}
    field_summary = payload.get("capture_field_summary")
    if not isinstance(field_summary, dict):
        raise AcceptanceError("report download", "downloaded report did not include capture_field_summary", payload)
    match = payload.get("capture_field_match")
    if not isinstance(match, dict):
        raise AcceptanceError("report download", "downloaded report did not include capture_field_match", payload)
    if match.get("status") != "pass":
        raise AcceptanceError("report download", "downloaded report profile/capture field match was not pass", match)
    return match


def capture_recorder_count(payload: dict[str, Any]) -> int:
    data = payload.get("data")
    if not isinstance(data, dict):
        return 0
    captures = data.get("captures")
    return len(captures) if isinstance(captures, list) else 0


def compact_stats_sample(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "sample_time": utc_now(),
        "opackets": total_counter(payload, "opackets"),
        "ipackets": total_counter(payload, "ipackets"),
        "tx_bps": total_counter(payload, "tx_bps"),
        "rx_bps": total_counter(payload, "rx_bps"),
        "tx_pps": total_counter(payload, "tx_pps"),
        "rx_pps": total_counter(payload, "rx_pps"),
        "oerrors": total_counter(payload, "oerrors"),
        "ierrors": total_counter(payload, "ierrors"),
        "drop_bps": stats_drop_bps(payload),
        "queue_full": stats_queue_full(payload),
        "latency_errors": stats_latency_errors(payload),
    }


def sanitize_report_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: sanitize_report_payload(item)
            for key, item in value.items()
            if key not in REPORT_OMITTED_KEYS
        }
    if isinstance(value, list):
        return [sanitize_report_payload(item) for item in value]
    return value


def parse_tunables(values: list[str]) -> dict[str, str]:
    tunables: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise AcceptanceError("args", f"tunable must be key=value: {value}")
        key, item_value = value.split("=", 1)
        key = key.strip()
        if not key:
            raise AcceptanceError("args", "tunable key cannot be empty")
        tunables[key] = item_value.strip()
    return tunables


def normalize_workbench_streams(payload: Any) -> list[dict[str, Any]]:
    streams = payload.get("streams") if isinstance(payload, dict) else payload
    if not isinstance(streams, list) or not streams:
        raise AcceptanceError("args", "workbench stream input must contain a non-empty stream list")
    records = [stream for stream in streams if isinstance(stream, dict)]
    if len(records) != len(streams):
        raise AcceptanceError("args", "workbench streams must be JSON objects")
    return records


def load_workbench_streams(file_name: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(Path(file_name).read_text(encoding="utf-8"))
    except OSError as exc:
        raise AcceptanceError("args", f"unable to read workbench stream file: {file_name}", str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise AcceptanceError("args", f"workbench stream file is not JSON: {file_name}", str(exc)) from exc
    return normalize_workbench_streams(payload)


def parse_workbench_streams_json(value: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError as exc:
        raise AcceptanceError("args", "workbench stream JSON is invalid", str(exc)) from exc
    return normalize_workbench_streams(payload)


def report_markdown(run: dict[str, Any]) -> str:
    samples = run.get("stats_samples")
    last_sample = samples[-1] if isinstance(samples, list) and samples else {}
    capture = run.get("capture_stop")
    packet_count = capture_packet_count(capture) if isinstance(capture, dict) else 0
    decode_summary = run.get("capture_decode_summary")
    decode_summary = decode_summary if isinstance(decode_summary, dict) else {}
    field_summary = run.get("capture_field_summary")
    field_summary = field_summary if isinstance(field_summary, dict) else {}
    profile_streams = run.get("profile_streams")
    profile_streams = profile_streams if isinstance(profile_streams, list) else []
    capture_layer_match = run.get("capture_layer_match")
    capture_layer_match = capture_layer_match if isinstance(capture_layer_match, dict) else {}
    capture_field_match = run.get("capture_field_match")
    capture_field_match = capture_field_match if isinstance(capture_field_match, dict) else {}
    layer_chains = decode_summary.get("layer_chains")
    layer_chain_text = "; ".join(str(chain) for chain in layer_chains) if isinstance(layer_chains, list) else "-"
    traffic_session = run.get("traffic_session")
    traffic_session = traffic_session if isinstance(traffic_session, dict) else {}
    stop_result = traffic_session.get("stop_result")
    traffic_stopped = isinstance(stop_result, dict) and stop_result.get("ok") is True
    ports_after_stop = run.get("ports_after_stop")
    active_after_stop = active_port_ids(ports_after_stop) if isinstance(ports_after_stop, dict) else set()
    capture_status_after_stop = run.get("capture_status_after_stop")
    active_recorders_after_stop = (
        capture_recorder_count(capture_status_after_stop)
        if isinstance(capture_status_after_stop, dict)
        else 0
    )
    report = run.get("report_save")
    report_file = str(run.get("report_file_name") or "-")
    if isinstance(report, dict):
        data = report.get("data")
        if isinstance(data, dict):
            file_record = data.get("file")
            if isinstance(file_record, dict):
                report_file = str(file_record.get("name") or "-")
    failure = sanitize_report_payload(run.get("failure"))

    return "\n".join(
        [
            f"# TRex Acceptance Run {run['run_id']}",
            "",
            "| Field | Value |",
            "| --- | --- |",
            f"| Verdict | {run.get('verdict', 'unknown')} |",
            f"| Base URL | {run['base_url']} |",
            f"| Profile | {run['profile']} |",
            f"| TX port | {run['tx_port']} |",
            f"| RX capture port | {run['rx_port']} |",
            f"| Multiplier | {run['multiplier']} |",
            f"| Duration | {run['duration_seconds']} s |",
            f"| Observe window | {run.get('observe_seconds', '-')} s |",
            f"| Total TX packets | {last_sample.get('opackets', 0)} |",
            f"| Total RX packets | {last_sample.get('ipackets', 0)} |",
            f"| Drop rate bps | {last_sample.get('drop_bps', 0)} |",
            f"| Queue full | {last_sample.get('queue_full', 0)} |",
            f"| Port errors | {port_error_total(run.get('stats_last') or {}) if isinstance(run.get('stats_last'), dict) else 0} |",
            f"| Latency errors | {last_sample.get('latency_errors', 0)} |",
            f"| Capture packets | {packet_count} |",
            f"| Capture decoded packets | {decode_summary.get('decoded_packets', 0)} |",
            f"| Capture layer chains | {layer_chain_text or '-'} |",
            f"| Profile streams | {len(profile_streams)} |",
            f"| Profile/capture match | {capture_layer_match.get('status', '-')}: {capture_layer_match.get('summary', '-')} |",
            f"| Profile/capture fields | {capture_field_match.get('status', '-')}: {capture_field_match.get('summary', '-')} |",
            f"| Traffic stopped | {'yes' if traffic_stopped else 'no'} |",
            f"| Active ports after stop | {','.join(str(port) for port in sorted(active_after_stop)) or '-'} |",
            f"| Capture recorders after stop | {active_recorders_after_stop} |",
            f"| Report archive | {report_file} |",
            "",
            "## Run Session",
            json.dumps(sanitize_report_payload(traffic_session), indent=2, sort_keys=True),
            "",
            "## Capture Decode",
            json.dumps(sanitize_report_payload(decode_summary), indent=2, sort_keys=True)
            if decode_summary
            else "-",
            "",
            "## Capture Fields",
            json.dumps(sanitize_report_payload(field_summary), indent=2, sort_keys=True)
            if field_summary
            else "-",
            "",
            "## Profile Streams",
            json.dumps(sanitize_report_payload(profile_streams), indent=2, sort_keys=True)
            if profile_streams
            else "-",
            "",
            "## Profile/Capture Match",
            json.dumps(sanitize_report_payload(capture_layer_match), indent=2, sort_keys=True)
            if capture_layer_match
            else "-",
            "",
            "## Profile/Capture Fields",
            json.dumps(sanitize_report_payload(capture_field_match), indent=2, sort_keys=True)
            if capture_field_match
            else "-",
            "",
            "## Failure",
            json.dumps(failure, indent=2, sort_keys=True) if failure else "-",
        ]
    )


def write_local_report(output_dir: Path, file_name: str, content: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / file_name
    target.write_text(content, encoding="utf-8")
    return target


def cleanup_post(run: dict[str, Any], base_url: str, endpoint: str, body: dict[str, Any], timeout: float) -> None:
    try:
        payload = request_json(base_url, "POST", endpoint, body, timeout)
        run.setdefault("cleanup", []).append({"endpoint": endpoint, "payload": payload})
    except AcceptanceError as exc:
        run.setdefault("cleanup", []).append({"endpoint": endpoint, "error": exc.to_record()})


def required_traffic_session_id(payload: dict[str, Any], stage: str) -> str:
    session_id = read_path(payload, "data.session.id")
    if not isinstance(session_id, str) or not session_id:
        raise AcceptanceError(
            stage,
            "traffic response did not include a persisted session id",
            payload,
        )
    return session_id


def run_acceptance(args: argparse.Namespace) -> dict[str, Any]:
    generated_at = utc_now()
    run_id = clean_file_timestamp(generated_at)
    report_name = f"{args.report_prefix}-{run_id}.json"
    capture_name = f"{args.report_prefix}-{run_id}.pcap"
    tunables = parse_tunables(args.tunable)
    if args.workbench_stream_file and args.workbench_stream_json:
        raise AcceptanceError("args", "use only one of --workbench-stream-file or --workbench-stream-json")
    workbench_streams = (
        load_workbench_streams(args.workbench_stream_file)
        if args.workbench_stream_file
        else parse_workbench_streams_json(args.workbench_stream_json)
        if args.workbench_stream_json
        else None
    )
    workbench_stream_source = args.workbench_stream_file or ("inline-json" if args.workbench_stream_json else None)
    workbench_profile_name = (
        args.workbench_profile_name
        if args.workbench_profile_name
        else f"{args.report_prefix}-{run_id}.yaml"
    ) if workbench_streams is not None else None
    profile_path = workbench_profile_name or args.profile
    run: dict[str, Any] = {
        "run_id": run_id,
        "generated_at": generated_at,
        "base_url": args.base_url,
        "profile": profile_path,
        "source_profile": args.profile,
        "workbench_stream_source": workbench_stream_source,
        "tx_port": args.tx_port,
        "rx_port": args.rx_port,
        "multiplier": args.multiplier,
        "duration_seconds": args.duration,
        "observe_seconds": args.observe_seconds,
        "report_file_name": report_name,
        "capture_file_name": capture_name if args.save_pcap else None,
        "tunables": tunables,
        "stats_samples": [],
        "cleanup": [],
    }
    profile_streams = workbench_stream_intent_rows(workbench_streams)
    if profile_streams:
        run["profile_streams"] = profile_streams
    capture_bpf_filter = (
        args.bpf_filter
        if args.bpf_filter is not None
        else infer_capture_bpf_filter(args.expected_layer_chain, profile_streams)
    )
    run["capture_bpf_filter"] = capture_bpf_filter
    capture_id: int | None = None
    traffic_started = False
    traffic_session_id: str | None = None

    try:
        health = request_json(args.base_url, "GET", "/api/health", None, args.timeout)
        run["health"] = health
        if health.get("status") != "ok":
            raise AcceptanceError("health", "health endpoint did not return ok", health)

        ports = require_ok("ports", request_json(args.base_url, "GET", "/api/trex/ports", None, args.timeout))
        run["ports_before"] = ports
        live_port_ids = port_ids(ports)
        if args.tx_port not in live_port_ids or args.rx_port not in live_port_ids:
            raise AcceptanceError(
                "ports",
                f"requested ports tx={args.tx_port} rx={args.rx_port} are not both present",
                {"available": sorted(live_port_ids)},
            )

        if workbench_streams is not None and workbench_profile_name is not None:
            save = require_ok(
                "workbench profile save",
                request_json(
                    args.base_url,
                    "POST",
                    "/api/trex/profiles/workbench/save",
                    {"profile_name": workbench_profile_name, "streams": workbench_streams},
                    args.timeout,
                ),
            )
            run["workbench_profile_save"] = save
            run["workbench_profile"] = {
                "profile_name": workbench_profile_name,
                "stream_count": len(workbench_streams),
                "source": workbench_stream_source,
            }

        profiles = require_ok("profiles", request_json(args.base_url, "GET", "/api/trex/profiles", None, args.timeout))
        run["profile_selected"] = profile_catalog_contains(profiles, profile_path)
        if not run["profile_selected"]:
            raise AcceptanceError("profile selection", f"{profile_path} was not found in the profile catalog", profiles)

        cleanup_post(run, args.base_url, "/api/trex/capture/remove-all", {}, args.timeout)
        require_ok(
            "stats clear",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/stats/clear",
                {"ports": [args.tx_port, args.rx_port]},
                args.timeout,
            ),
        )

        capture_start = require_ok(
            "capture start",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/capture/start",
                {
                    "rx_ports": [args.rx_port],
                    "limit": args.capture_limit,
                    "mode": args.capture_mode,
                    "bpf_filter": capture_bpf_filter,
                    "snaplen": args.snaplen,
                },
                args.timeout,
            ),
        )
        run["capture_start"] = capture_start
        capture_data = capture_start.get("data")
        if not isinstance(capture_data, dict) or not isinstance(capture_data.get("id"), int):
            raise AcceptanceError("capture start", "capture start did not return an id", capture_start)
        capture_id = capture_data["id"]

        start = require_ok(
            "traffic start",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/traffic/start",
                {
                    "profile_path": profile_path,
                    "ports": [args.tx_port],
                    "expected_session_id": None,
                    "multiplier": args.multiplier,
                    "duration": args.duration,
                    "force": True,
                    "confirmation": "start-traffic",
                    "tunables": tunables,
                },
                args.timeout,
            ),
        )
        traffic_session_id = required_traffic_session_id(start, "traffic start")
        traffic_started = True
        run["traffic_start"] = start
        run["traffic_session"] = {
            "id": traffic_session_id,
            "started_at": utc_now(),
            "ended_at": None,
            "profile": profile_path,
            "ports": [args.tx_port],
            "multiplier": args.multiplier,
            "requested_duration": args.duration,
            "observe_seconds": args.observe_seconds,
            "tunables": tunables,
            "start_result": start,
            "stop_result": None,
        }

        started_at = time.monotonic()
        observe_seconds = max(0.0, args.observe_seconds)
        if args.duration > 0:
            observe_seconds = min(observe_seconds, max(args.poll_interval, args.duration - args.poll_interval))
        minimum_end = started_at + observe_seconds
        deadline = started_at + max(args.stats_timeout, observe_seconds + args.poll_interval)
        saw_packets = False
        while time.monotonic() < deadline:
            time.sleep(args.poll_interval)
            stats = require_ok("stats", request_json(args.base_url, "GET", "/api/trex/stats", None, args.timeout))
            sample = compact_stats_sample(stats)
            run["stats_samples"].append(sample)
            run["stats_last"] = stats
            if sample["opackets"] > 0 and sample["ipackets"] > 0:
                saw_packets = True
            if saw_packets and time.monotonic() >= minimum_end:
                break

        if not saw_packets:
            raise AcceptanceError("stats", "traffic did not produce both TX and RX packets", run["stats_samples"])

        capture_stop = require_ok(
            "capture stop",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/capture/stop",
                {
                    "capture_id": capture_id,
                    "pkt_count": args.capture_packets,
                    "save_pcap": args.save_pcap,
                    "file_name": capture_name if args.save_pcap else None,
                    "snaplen": args.snaplen,
                },
                args.timeout,
            ),
        )
        capture_id = None
        run["capture_stop"] = capture_stop
        if capture_packet_count(capture_stop) <= 0:
            raise AcceptanceError("capture stop", "capture did not return any packets", capture_stop)
        decode_summary = capture_decode_summary(capture_stop)
        run["capture_decode_summary"] = decode_summary
        if decode_summary["decoded_packets"] <= 0:
            raise AcceptanceError("capture decode", "capture packets did not include backend decoded layers", capture_stop)
        ensure_expected_layer_chain(decode_summary, args.expected_layer_chain)
        field_summary = capture_field_summary(capture_stop)
        run["capture_field_summary"] = field_summary
        if profile_streams:
            capture_layer_match = build_capture_layer_match(profile_streams, decode_summary)
            run["capture_layer_match"] = capture_layer_match
            if capture_layer_match.get("status") != "pass":
                raise AcceptanceError("profile/capture match", "capture decode did not match workbench stream intent", capture_layer_match)
            capture_field_match = build_capture_field_match(profile_streams, field_summary)
            run["capture_field_match"] = capture_field_match
            if capture_field_match.get("applicable") is True and capture_field_match.get("status") != "pass":
                raise AcceptanceError("profile/capture fields", "capture fields did not match workbench stream intent", capture_field_match)

        run["capture_files"] = require_ok(
            "capture files",
            request_json(args.base_url, "GET", "/api/trex/capture/files", None, args.timeout),
        )
        if args.save_pcap:
            files_data = run["capture_files"].get("data")
            files = files_data.get("files") if isinstance(files_data, dict) else None
            names = {file.get("name") for file in files if isinstance(file, dict)} if isinstance(files, list) else set()
            if capture_name not in names:
                raise AcceptanceError("capture files", f"{capture_name} was not listed after capture stop", run["capture_files"])

        traffic_stop = require_ok(
            "traffic stop",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/traffic/stop",
                {
                    "ports": [args.tx_port],
                    "confirmation": "stop",
                    "expected_session_id": traffic_session_id,
                },
                args.timeout,
            ),
        )
        observed_session_id = required_traffic_session_id(
            traffic_stop,
            "traffic stop",
        )
        if observed_session_id != traffic_session_id:
            raise AcceptanceError(
                "traffic stop",
                "traffic stop response belongs to a different managed session",
                {
                    "expected_session_id": traffic_session_id,
                    "observed_session_id": observed_session_id,
                    "response": traffic_stop,
                },
            )
        traffic_started = False
        run["traffic_stop"] = traffic_stop
        traffic_session = run.get("traffic_session")
        if isinstance(traffic_session, dict):
            traffic_session["ended_at"] = utc_now()
            traffic_session["stop_result"] = traffic_stop

        stats_after_stop = require_ok(
            "stats after stop",
            request_json(args.base_url, "GET", "/api/trex/stats", None, args.timeout),
        )
        run["stats_after_stop"] = stats_after_stop
        run["stats_after_stop_sample"] = compact_stats_sample(stats_after_stop)
        run["capture_status_after_stop"] = require_ok(
            "capture status after stop",
            request_json(args.base_url, "GET", "/api/trex/capture/status", None, args.timeout),
        )
        run["ports_after_stop"] = require_ok(
            "ports after stop",
            request_json(args.base_url, "GET", "/api/trex/ports", None, args.timeout),
        )
        remaining_active = active_port_ids(run["ports_after_stop"]).intersection({args.tx_port})
        if remaining_active:
            raise AcceptanceError(
                "traffic stop",
                "requested traffic port was still active after stop",
                {"active_ports": sorted(remaining_active), "ports_after_stop": run["ports_after_stop"]},
            )
        if capture_recorder_count(run["capture_status_after_stop"]) != 0:
            raise AcceptanceError(
                "capture status after stop",
                "capture recorders were still active after stop",
                run["capture_status_after_stop"],
            )
        run["verdict"] = "pass"
    except AcceptanceError as exc:
        run["verdict"] = "fail"
        run["failure"] = exc.to_record()
    finally:
        if capture_id is not None:
            cleanup_post(
                run,
                args.base_url,
                "/api/trex/capture/stop",
                {"capture_id": capture_id, "pkt_count": 1, "save_pcap": False},
                args.timeout,
            )
        if traffic_started and traffic_session_id is not None:
            try:
                cleanup_stop = require_ok(
                    "cleanup traffic stop",
                    request_json(
                        args.base_url,
                        "POST",
                        "/api/trex/traffic/stop",
                        {
                            "ports": [args.tx_port],
                            "confirmation": "stop",
                            "expected_session_id": traffic_session_id,
                        },
                        args.timeout,
                    ),
                )
                observed_session_id = required_traffic_session_id(
                    cleanup_stop,
                    "cleanup traffic stop",
                )
                if observed_session_id != traffic_session_id:
                    raise AcceptanceError(
                        "cleanup traffic stop",
                        "cleanup response belongs to a different managed session",
                        {
                            "expected_session_id": traffic_session_id,
                            "observed_session_id": observed_session_id,
                            "response": cleanup_stop,
                        },
                    )
                run.setdefault("cleanup", []).append(
                    {
                        "endpoint": "/api/trex/traffic/stop",
                        "payload": cleanup_stop,
                    }
                )
            except AcceptanceError as exc:
                run.setdefault("cleanup", []).append(
                    {
                        "endpoint": "/api/trex/traffic/stop",
                        "error": exc.to_record(),
                    }
                )
        cleanup_post(run, args.base_url, "/api/trex/capture/remove-all", {}, args.timeout)
        if workbench_profile_name is not None:
            cleanup_post(
                run,
                args.base_url,
                "/api/trex/profiles/delete",
                {"profile_path": workbench_profile_name, "confirmation": "delete-profile"},
                args.timeout,
            )
        try:
            run["ports_after"] = request_json(args.base_url, "GET", "/api/trex/ports", None, args.timeout)
        except AcceptanceError as exc:
            run["ports_after_error"] = exc.to_record()

    markdown = report_markdown(run)
    report_payload = {
        "title": f"TRex Acceptance Run {run_id}",
        "markdown": markdown,
        "payload": sanitize_report_payload(run),
        "file_name": report_name,
    }
    report_save = require_ok(
        "report save",
        request_json(args.base_url, "POST", "/api/trex/reports/save", report_payload, args.timeout),
    )
    run["report_save"] = report_save
    report_data = report_save.get("data") if isinstance(report_save, dict) else None
    report_file = report_data.get("file") if isinstance(report_data, dict) else None
    saved_name = report_file.get("name") if isinstance(report_file, dict) else report_name
    download = require_ok(
        "report download",
        request_json(args.base_url, "POST", "/api/trex/reports/download", {"file_name": saved_name}, args.timeout),
    )
    run["report_download"] = download
    downloaded_file = download.get("data", {}).get("file") if isinstance(download.get("data"), dict) else None
    content = downloaded_file.get("content") if isinstance(downloaded_file, dict) else None
    if not isinstance(content, str) or f"TRex Acceptance Run {run_id}" not in content:
        raise AcceptanceError("report download", "downloaded report did not contain this run title", download)
    ensure_report_archive_has_no_binary_payloads(content)
    run["report_capture_decode_summary"] = ensure_report_archive_capture_decode(content, args.expected_layer_chain)
    run["report_run_evidence"] = ensure_report_archive_run_evidence(content, args.tx_port)
    run["report_profile_capture_match"] = ensure_report_archive_profile_capture_match(
        content,
        bool(profile_streams),
        args.expected_layer_chain,
    )
    run["report_profile_capture_fields"] = ensure_report_archive_profile_capture_fields(content, bool(profile_streams))
    run["local_report"] = str(write_local_report(Path(args.output_dir), report_name, content))

    if run["verdict"] != "pass":
        raise AcceptanceError("acceptance", "acceptance workflow failed", sanitize_report_payload(run))
    return run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a real TRex WebUI acceptance workflow through HTTP APIs.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="WebUI base URL, with or without /api")
    parser.add_argument("--profile", default=DEFAULT_PROFILE, help="Profile relative path from the live catalog")
    parser.add_argument(
        "--workbench-stream-file",
        default=None,
        help="JSON file containing one workbench stream object list, or an object with a streams list",
    )
    parser.add_argument(
        "--workbench-stream-json",
        default=None,
        help="Inline JSON containing one workbench stream object list, or an object with a streams list",
    )
    parser.add_argument(
        "--workbench-profile-name",
        default=None,
        help="Temporary workbench YAML profile name to save before running",
    )
    parser.add_argument(
        "--expected-layer-chain",
        default=None,
        help="Require at least one captured packet to decode to this exact layer chain",
    )
    parser.add_argument("--tx-port", type=int, default=0, help="Traffic transmit port")
    parser.add_argument("--rx-port", type=int, default=1, help="Capture receive port")
    parser.add_argument("--multiplier", default=DEFAULT_MULTIPLIER, help="TRex start multiplier, e.g. 5kpps")
    parser.add_argument("--duration", type=float, default=DEFAULT_DURATION_SECONDS, help="Traffic duration in seconds")
    parser.add_argument(
        "--observe-seconds",
        type=float,
        default=DEFAULT_OBSERVE_SECONDS,
        help="Stats/capture observation window before stopping traffic",
    )
    parser.add_argument("--tunable", action="append", default=[], help="Python profile tunable key=value, repeatable")
    parser.add_argument("--capture-limit", type=int, default=128, help="Capture buffer limit")
    parser.add_argument("--capture-packets", type=int, default=32, help="Packets to fetch when stopping capture")
    parser.add_argument("--capture-mode", choices=["fixed", "cyclic"], default="fixed")
    parser.add_argument(
        "--bpf-filter",
        default=None,
        help="Capture BPF filter; omitted values are inferred from expected layer chains",
    )
    parser.add_argument("--snaplen", type=int, default=0, help="Capture snap length, 0 keeps backend default")
    parser.add_argument("--no-save-pcap", dest="save_pcap", action="store_false", help="Do not save a PCAP file")
    parser.set_defaults(save_pcap=True)
    parser.add_argument("--stats-timeout", type=float, default=DEFAULT_STATS_TIMEOUT_SECONDS)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS)
    parser.add_argument("--timeout", type=float, default=DEFAULT_HTTP_TIMEOUT_SECONDS, help="HTTP timeout in seconds")
    parser.add_argument("--report-prefix", default=DEFAULT_REPORT_PREFIX, help="Report and PCAP file prefix")
    parser.add_argument("--output-dir", default=".logs", help="Local directory for downloaded report evidence")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        run = run_acceptance(args)
    except AcceptanceError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        if exc.payload is not None:
            print(json.dumps(exc.payload, indent=2, sort_keys=True), file=sys.stderr)
        return 1
    print(
        "PASS "
        f"profile={run['profile']} tx={run['tx_port']} rx={run['rx_port']} "
        f"report={run['report_save']['data']['file']['name']} local={run['local_report']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
