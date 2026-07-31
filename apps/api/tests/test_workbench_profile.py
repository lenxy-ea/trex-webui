import base64

import yaml

from app.trex.result import TrexCallResult
from app.trex.workbench_profile import (
    decode_workbench_packet_meta,
    load_workbench_profile_document,
    mpls_label_value,
    mpls_labels_from_meta_or_packet,
    vlan_tag_value,
    vlan_tags_from_meta_or_packet,
)


def packet_meta(value: object) -> str:
    return base64.b64encode(yaml.safe_dump(value, sort_keys=True).encode("utf-8")).decode("ascii")


def test_decode_workbench_packet_meta_loads_base64_yaml_dict() -> None:
    encoded = packet_meta({"ipv4": {"ttl": "64"}, "protocol_selection": {"frame_length_type": "Fixed"}})

    assert decode_workbench_packet_meta(encoded) == {
        "ipv4": {"ttl": "64"},
        "protocol_selection": {"frame_length_type": "Fixed"},
    }


def test_decode_workbench_packet_meta_rejects_invalid_or_non_object_meta() -> None:
    assert decode_workbench_packet_meta(None) == {}
    assert decode_workbench_packet_meta("not-base64") == {}
    assert decode_workbench_packet_meta(packet_meta(["not", "a", "dict"])) == {}


def test_load_workbench_profile_document_keeps_parse_errors_as_call_results() -> None:
    loaded = load_workbench_profile_document("stream: [", ".yaml")

    assert isinstance(loaded, TrexCallResult)
    assert loaded.ok is False
    assert loaded.blocker == "profile_load_failed"


def test_vlan_tags_from_meta_or_packet_prefers_bounded_meta_tags() -> None:
    tags = vlan_tags_from_meta_or_packet(
        {
            "tags": [
                {"v_id": "100"},
                {"v_id": "200"},
                {"v_id": "300"},
            ],
        },
        [{"vlan": 10}],
        tagged_selected=False,
        has_selection=True,
    )

    assert tags == [{"v_id": "100"}, {"v_id": "200"}]
    assert vlan_tag_value(tags, 1, "v_id", "1") == "200"
    assert vlan_tag_value(tags, 2, "v_id", "1") == "1"


def test_vlan_tags_from_meta_or_packet_uses_packet_or_legacy_selection() -> None:
    assert vlan_tags_from_meta_or_packet(
        {"priority": "3", "v_id": "7"},
        [],
        tagged_selected=True,
        has_selection=True,
    ) == [{"priority": "3", "v_id": "7"}]
    assert vlan_tags_from_meta_or_packet(
        {},
        [{"vlan": 10}, {"vlan": 20}, {"vlan": 30}],
        tagged_selected=False,
        has_selection=True,
    ) == [{"vlan": 10}, {"vlan": 20}]


def test_mpls_labels_from_meta_or_packet_prefers_bounded_meta_labels() -> None:
    labels = mpls_labels_from_meta_or_packet(
        {
            "labels": [
                {"label": "10"},
                {"label": "20"},
                {"label": "30"},
                {"label": "40"},
            ],
        },
        {"labels": [{"label": 99}]},
    )

    assert labels == [{"label": "10"}, {"label": "20"}, {"label": "30"}]
    assert mpls_label_value(labels, 2, "label", "17") == "30"
    assert mpls_label_value(labels, 3, "label", "17") == "17"


def test_mpls_labels_from_meta_or_packet_uses_packet_or_legacy_label() -> None:
    assert mpls_labels_from_meta_or_packet(
        {},
        {"labels": [{"label": 10}, {"label": 20}, {"label": 30}, {"label": 40}]},
    ) == [{"label": 10}, {"label": 20}, {"label": 30}]
    assert mpls_labels_from_meta_or_packet({"label": "17", "ttl": "255"}, None) == [
        {"label": "17", "ttl": "255"}
    ]
