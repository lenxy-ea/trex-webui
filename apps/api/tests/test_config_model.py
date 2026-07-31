from __future__ import annotations

import pytest
import yaml
from pydantic import ValidationError

from app.trex.config_model import TrexConfig, mac_to_ints


def test_mac_to_ints_accepts_canonical_string() -> None:
    assert mac_to_ints("02:00:00:5d:82:d1") == [2, 0, 0, 93, 130, 209]


def test_mac_to_ints_rejects_bad_shape() -> None:
    with pytest.raises(ValueError):
        mac_to_ints("00:e0:ed")


def test_trex_config_renders_top_level_sequence_yaml() -> None:
    config = TrexConfig(
        port_limit=2,
        interfaces=["03:00.0", "03:00.1"],
        port_bandwidth_gb=25,
        port_info=[
            {"ip": "1.1.1.1", "default_gw": "2.2.2.2"},
            {"ip": "2.2.2.2", "default_gw": "1.1.1.1"},
        ],
    )

    rendered = yaml.safe_load(config.to_yaml())

    assert isinstance(rendered, list)
    assert rendered[0]["version"] == 2
    assert rendered[0]["port_limit"] == 2
    assert rendered[0]["interfaces"] == ["03:00.0", "03:00.1"]
    assert rendered[0]["port_bandwidth_gb"] == 25
    assert rendered[0]["port_info"][0]["ip"] == "1.1.1.1"


def test_trex_config_rejects_port_limit_larger_than_interfaces() -> None:
    with pytest.raises(ValidationError):
        TrexConfig(port_limit=2, interfaces=["03:00.0"])


def test_trex_config_rejects_non_positive_port_bandwidth() -> None:
    with pytest.raises(ValidationError):
        TrexConfig(port_limit=1, interfaces=["03:00.0"], port_bandwidth_gb=0)


def test_platform_threads_render_without_sorting_keys() -> None:
    config = TrexConfig(
        port_limit=2,
        interfaces=["03:00.0", "03:00.1"],
        platform={
            "master_thread_id": 0,
            "latency_thread_id": 15,
            "dual_if": [{"socket": 0, "threads": [1, 2, 3]}],
        },
    )

    payload = config.to_trex_dict()

    assert list(payload.keys())[:3] == ["port_limit", "version", "interfaces"]
    assert payload["platform"]["dual_if"][0]["threads"] == [1, 2, 3]


def test_six_port_i350_config_accepts_repeated_socket_entries() -> None:
    config = TrexConfig(
        port_limit=6,
        interfaces=[
            "0000:01:00.0",
            "0000:01:00.1",
            "0000:01:00.2",
            "0000:01:00.3",
            "0000:02:00.0",
            "0000:02:00.1",
        ],
        port_bandwidth_gb=1,
        c=4,
        platform={
            "master_thread_id": 0,
            "latency_thread_id": 1,
            "dual_if": [
                {"socket": 0, "threads": [2, 3, 4, 5]},
                {"socket": 0, "threads": [6, 7, 8, 9]},
                {"socket": 0, "threads": [10, 11, 12, 13]},
            ],
        },
    )

    payload = config.to_trex_dict()

    assert payload["port_bandwidth_gb"] == 1
    assert [entry["socket"] for entry in payload["platform"]["dual_if"]] == [0, 0, 0]


@pytest.mark.parametrize(
    "interfaces",
    [
        ["03:00.0", "03:00.0"],
        ["03:00.0", "0000:03:00.0"],
        ["net_af_packet0", "net_af_packet0"],
    ],
)
def test_trex_config_rejects_duplicate_interface_identity(interfaces: list[str]) -> None:
    with pytest.raises(ValidationError, match="interfaces must be unique"):
        TrexConfig(port_limit=2, interfaces=interfaces)


@pytest.mark.parametrize(
    "platform",
    [
        {
            "master_thread_id": 0,
            "latency_thread_id": 1,
            "dual_if": [{"socket": 0, "threads": [0, 2]}],
        },
        {
            "master_thread_id": 0,
            "latency_thread_id": 1,
            "dual_if": [{"socket": 0, "threads": [1, 2]}],
        },
        {
            "master_thread_id": 0,
            "latency_thread_id": 1,
            "dual_if": [
                {"socket": 0, "threads": [2, 3]},
                {"socket": 1, "threads": [3, 4]},
            ],
        },
    ],
)
def test_platform_rejects_reserved_or_reused_worker_threads(platform: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        TrexConfig(port_limit=2, interfaces=["03:00.0", "03:00.1"], platform=platform)


def test_platform_accepts_distinct_workers_across_numa_sockets() -> None:
    config = TrexConfig(
        port_limit=4,
        interfaces=["02:00.0", "02:00.1", "04:00.0", "04:00.1"],
        platform={
            "master_thread_id": 0,
            "latency_thread_id": 31,
            "dual_if": [
                {"socket": 0, "threads": [1, 2, 3, 16, 17]},
                {"socket": 1, "threads": [8, 9, 10, 24, 25]},
            ],
        },
    )

    assert len(config.platform.dual_if) == 2


@pytest.mark.parametrize(
    "payload",
    [
        {"port_limit": 1, "interfaces": ["03:00.0"], "unknown": True},
        {
            "port_limit": 1,
            "interfaces": ["03:00.0"],
            "port_info": [{"ip": "1.1.1.1", "unknown": True}],
        },
        {
            "port_limit": 2,
            "interfaces": ["03:00.0", "03:00.1"],
            "platform": {
                "master_thread_id": 0,
                "latency_thread_id": 1,
                "dual_if": [{"socket": 0, "threads": [2]}],
                "unknown": True,
            },
        },
        {
            "port_limit": 2,
            "interfaces": ["03:00.0", "03:00.1"],
            "platform": {
                "master_thread_id": 0,
                "latency_thread_id": 1,
                "dual_if": [{"socket": 0, "threads": [2], "unknown": True}],
            },
        },
    ],
)
def test_trex_config_rejects_unknown_fields_at_every_structured_level(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        TrexConfig.model_validate(payload)
