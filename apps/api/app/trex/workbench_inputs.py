from __future__ import annotations

import base64
import binascii
import json
import re
from collections.abc import Mapping
from typing import Any

from app.trex.result import TrexCallResult
from app.trex.workbench_values import (
    PROFILE_ADVANCED_VM_MAX_BYTES,
    PROFILE_PACKET_MODEL_MAX_CHARS,
    PROFILE_PCAP_BASE64_MAX_CHARS,
    bool_value,
)


def packet_binary_from_base64(value: object) -> bytes | TrexCallResult | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return TrexCallResult(False, blocker="profile_packet_binary_invalid", error="packet binary must be base64 text")
    if value == "":
        return None
    if len(value) > PROFILE_PCAP_BASE64_MAX_CHARS:
        return TrexCallResult(False, blocker="profile_packet_binary_too_large", error="packet binary exceeds allowed size")
    try:
        packet = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        return TrexCallResult(False, blocker="profile_packet_binary_invalid", error=str(exc))
    if len(packet) == 0:
        return None
    if len(packet) + 4 > 9216:
        return TrexCallResult(False, blocker="profile_packet_binary_too_large", error="packet length exceeds 9216 bytes with FCS")
    return packet


def clean_optional_profile_text(value: object, max_chars: int, label: str, blocker: str) -> str | TrexCallResult | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        return TrexCallResult(False, blocker=blocker, error=f"{label} must be text")
    if "\x00" in value:
        return TrexCallResult(False, blocker=blocker, error=f"{label} must not contain NUL")
    if len(value) > max_chars:
        return TrexCallResult(False, blocker=blocker, error=f"{label} is too large")
    return value


def normalize_advanced_vm(value: object) -> dict[str, Any] | TrexCallResult | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        return TrexCallResult(False, blocker="profile_advanced_vm_invalid", error="advanced VM must be an object")
    try:
        encoded = json.dumps(value, sort_keys=True, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        return TrexCallResult(False, blocker="profile_advanced_vm_invalid", error=str(exc))
    if len(encoded) > PROFILE_ADVANCED_VM_MAX_BYTES:
        return TrexCallResult(False, blocker="profile_advanced_vm_too_large", error="advanced VM is too large")
    return value


def normalize_workbench_advanced_fields(
    stream: Mapping[str, Any], packet_binary: bytes | None
) -> dict[str, Any] | TrexCallResult:
    advanced_mode = bool_value(stream.get("advanced_mode"), False)
    packet_model = clean_optional_profile_text(
        stream.get("packet_model"), PROFILE_PACKET_MODEL_MAX_CHARS, "packet model", "profile_packet_model_invalid"
    )
    if isinstance(packet_model, TrexCallResult):
        return packet_model
    packet_meta = clean_optional_profile_text(
        stream.get("packet_meta_base64"), PROFILE_PCAP_BASE64_MAX_CHARS, "packet meta", "profile_packet_meta_invalid"
    )
    if isinstance(packet_meta, TrexCallResult):
        return packet_meta
    advanced_vm = normalize_advanced_vm(stream.get("advanced_vm"))
    if isinstance(advanced_vm, TrexCallResult):
        return advanced_vm
    if advanced_mode and packet_binary is None:
        return TrexCallResult(
            False,
            blocker="profile_advanced_packet_missing",
            error="advanced mode streams require packet_binary_base64",
        )
    return {
        "advanced_mode": advanced_mode,
        "packet_model": packet_model,
        "packet_meta_base64": packet_meta,
        "advanced_vm": advanced_vm,
    }


def clean_payload_pattern(value: object) -> str | TrexCallResult:
    if value is None:
        return "00"
    if not isinstance(value, str):
        return TrexCallResult(False, blocker="profile_payload_pattern_invalid", error="payload pattern must be a hex string")
    candidate = "".join(value.split())
    if candidate == "":
        return "00"
    if len(candidate) > 1024:
        return TrexCallResult(False, blocker="profile_payload_pattern_invalid", error="payload pattern exceeds 1024 hex characters")
    if len(candidate) % 2 != 0 or re.fullmatch(r"[0-9a-fA-F]+", candidate) is None:
        return TrexCallResult(False, blocker="profile_payload_pattern_invalid", error="payload pattern must contain whole hex bytes")
    return candidate.upper()


def clean_dns_query_name(value: object, fallback: str) -> str | TrexCallResult:
    if value is None:
        return fallback
    if not isinstance(value, str):
        return TrexCallResult(False, blocker="profile_dns_query_name_invalid", error="DNS query name must be text")
    candidate = value.strip().rstrip(".")
    if candidate == "" or candidate != value.rstrip(".") or "\x00" in value or len(candidate) > 253:
        return TrexCallResult(False, blocker="profile_dns_query_name_invalid", error="DNS query name is invalid")
    labels = candidate.split(".")
    label_pattern = re.compile(r"[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?")
    if any(label == "" or len(label.encode("ascii", "ignore")) != len(label) or not label_pattern.fullmatch(label) for label in labels):
        return TrexCallResult(False, blocker="profile_dns_query_name_invalid", error="DNS query name labels are invalid")
    return ".".join(label.lower() for label in labels)


def clean_dhcp_hostname(value: object, fallback: str) -> str | TrexCallResult:
    if value is None:
        return fallback
    if not isinstance(value, str):
        return TrexCallResult(False, blocker="profile_dhcp_hostname_invalid", error="DHCP hostname must be text")
    candidate = value.strip()
    if candidate != value or "\x00" in value:
        return TrexCallResult(False, blocker="profile_dhcp_hostname_invalid", error="DHCP hostname is invalid")
    try:
        encoded = candidate.encode("ascii")
    except UnicodeEncodeError:
        return TrexCallResult(False, blocker="profile_dhcp_hostname_invalid", error="DHCP hostname must be ASCII")
    if len(encoded) > 63:
        return TrexCallResult(False, blocker="profile_dhcp_hostname_invalid", error="DHCP hostname exceeds 63 bytes")
    if candidate and re.fullmatch(r"[A-Za-z0-9_.-]+", candidate) is None:
        return TrexCallResult(False, blocker="profile_dhcp_hostname_invalid", error="DHCP hostname is invalid")
    return candidate


def clean_dhcp_parameter_request_list(value: object, fallback: str) -> str | TrexCallResult:
    if value is None:
        return fallback
    if isinstance(value, list):
        tokens = [str(item).strip() for item in value]
    elif isinstance(value, str):
        candidate = value.strip()
        if candidate == "":
            return ""
        tokens = re.split(r"[\s,]+", candidate)
    else:
        return TrexCallResult(
            False,
            blocker="profile_dhcp_parameter_request_list_invalid",
            error="DHCP parameter request list must be text",
        )
    values: list[str] = []
    for token in tokens:
        if token == "":
            continue
        if re.fullmatch(r"\d{1,3}", token) is None:
            return TrexCallResult(
                False,
                blocker="profile_dhcp_parameter_request_list_invalid",
                error="DHCP parameter request list must contain option numbers",
            )
        option = int(token, 10)
        if option < 0 or option > 255:
            return TrexCallResult(
                False,
                blocker="profile_dhcp_parameter_request_list_invalid",
                error="DHCP parameter request list options must be between 0 and 255",
            )
        values.append(str(option))
    if len(values) > 255:
        return TrexCallResult(
            False,
            blocker="profile_dhcp_parameter_request_list_invalid",
            error="DHCP parameter request list exceeds 255 options",
        )
    return ",".join(values)
