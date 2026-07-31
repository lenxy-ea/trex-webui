from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Callable
from typing import Any, Union

import yaml

from app.trex.result import TrexCallResult


GuiStreamLoader = Callable[[dict[str, Any], dict[str, Any], int], dict[str, Any]]
StreamNormalizer = Callable[[list[dict[str, Any]]], Union[list[dict[str, Any]], TrexCallResult]]


def load_workbench_profile_document(content: str, suffix: str) -> Any | TrexCallResult:
    try:
        return json.loads(content) if suffix == ".json" else yaml.safe_load(content)
    except (json.JSONDecodeError, yaml.YAMLError) as exc:
        return TrexCallResult(False, blocker="profile_load_failed", error=str(exc))


def decode_workbench_packet_meta(value: object) -> dict[str, Any]:
    if not isinstance(value, str):
        return {}
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
        loaded = yaml.safe_load(decoded)
    except (ValueError, binascii.Error, UnicodeDecodeError, yaml.YAMLError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


def mpls_labels_from_meta_or_packet(mpls: dict[str, Any], mpls_info: dict[str, Any] | None) -> list[dict[str, Any]]:
    raw_labels = mpls.get("labels")
    labels: list[dict[str, Any]] = []
    if isinstance(raw_labels, list):
        labels = [label for label in raw_labels[:3] if isinstance(label, dict)]
    if labels:
        return labels
    if mpls_info is not None:
        return [label for label in mpls_info["labels"][:3] if isinstance(label, dict)]
    if any(key in mpls for key in ("label", "traffic_class", "ttl")):
        return [mpls]
    return []


def vlan_tags_from_meta_or_packet(
    vlan: dict[str, Any],
    vlan_stack: list[dict[str, Any]],
    *,
    tagged_selected: bool,
    has_selection: bool,
) -> list[dict[str, Any]]:
    raw_tags = vlan.get("tags")
    tags: list[dict[str, Any]] = []
    if isinstance(raw_tags, list):
        tags = [tag for tag in raw_tags[:2] if isinstance(tag, dict)]
    if tags:
        return tags
    if vlan_stack:
        return [tag for tag in vlan_stack[:2] if isinstance(tag, dict)]
    if (tagged_selected or not has_selection) and any(key in vlan for key in ("tp_id", "priority", "cfi", "v_id", "vlan")):
        return [vlan]
    return []


def vlan_tag_value(tags: list[dict[str, Any]], index: int, key: str, default: Any) -> Any:
    if index < len(tags):
        return tags[index].get(key, default)
    return default


def mpls_label_value(labels: list[dict[str, Any]], index: int, key: str, default: Any) -> Any:
    if index < len(labels):
        return labels[index].get(key, default)
    return default


def streams_from_workbench_profile_document(
    loaded: Any,
    suffix: str,
    *,
    stream_from_gui_yaml: GuiStreamLoader,
    normalize_workbench_streams: StreamNormalizer,
) -> list[dict[str, Any]] | TrexCallResult:
    if isinstance(loaded, list):
        streams: list[dict[str, Any]] = []
        for index, entry in enumerate(loaded):
            if not isinstance(entry, dict):
                continue
            stream_data = entry.get("stream")
            if not isinstance(stream_data, dict):
                continue
            stream = stream_from_gui_yaml(entry, stream_data, index)
            streams.append(stream)
        return streams

    if suffix == ".json" and isinstance(loaded, dict) and isinstance(loaded.get("streams"), list):
        return normalize_workbench_streams(loaded["streams"])

    profile_type = "JSON" if suffix == ".json" else "YAML"
    error = (
        "profile JSON root must be an exported workbench object or GUI stream list"
        if suffix == ".json"
        else f"profile {profile_type} root must be a list"
    )
    return TrexCallResult(False, blocker="profile_workbench_unsupported", error=error)
