from __future__ import annotations

import os
import time

import pytest

from app.core.settings import get_environment
from app.main import (
    ClearStatsRequest,
    CaptureStartRequest,
    CaptureStopRequest,
    StartTrafficRequest,
    TrafficPortsRequest,
    clear_trex_stats,
    probe_trex,
    remove_packet_captures,
    start_traffic,
    start_packet_capture,
    stop_packet_capture,
    traffic_action,
    trex_ports,
    trex_stats,
)
from app.trex.stl_client import RealStlClientService


pytestmark = pytest.mark.skipif(
    os.getenv("TREX_WEBUI_RUN_HARDWARE_TESTS") != "1",
    reason="Set TREX_WEBUI_RUN_HARDWARE_TESTS=1 to exercise real TRex hardware",
)


def real_service() -> RealStlClientService:
    return RealStlClientService(get_environment())


def total_counter(payload: dict[str, object], counter: str) -> float:
    data = payload.get("data")
    if not isinstance(data, dict):
        return 0
    total = data.get("total")
    if not isinstance(total, dict):
        return 0
    value = total.get(counter, 0)
    return value if isinstance(value, (int, float)) else 0


def test_real_trex_probe_reports_live_server() -> None:
    payload = probe_trex(service=real_service())

    assert payload["ok"] is True, payload


def test_real_trex_ports_endpoint_reports_live_ports() -> None:
    payload = trex_ports(service=real_service())

    assert payload["ok"] is True, payload
    assert isinstance(payload["data"]["ports"], list)
    assert payload["data"]["port_ids"] == [port["id"] for port in payload["data"]["ports"]]


def test_real_trex_stats_endpoint_reports_live_stats() -> None:
    payload = trex_stats(service=real_service())

    assert payload["ok"] is True, payload
    assert isinstance(payload["data"], dict)


@pytest.mark.skipif(
    os.getenv("TREX_WEBUI_RUN_TRAFFIC_SMOKE") != "1",
    reason="Set TREX_WEBUI_RUN_TRAFFIC_SMOKE=1 to run a short real traffic profile",
)
def test_real_trex_gui_profile_start_stats_stop_smoke() -> None:
    service = real_service()
    session_id: str | None = None
    try:
        clear_payload = clear_trex_stats(ClearStatsRequest(ports=[0, 1]), service=service)
        assert clear_payload["ok"] is True, clear_payload

        start_payload = start_traffic(
            StartTrafficRequest(
                expected_session_id=None,
                profile_path="/opt/trex-core/scripts/stl/gui_example.yaml",
                ports=[0],
                multiplier="5kpps",
                duration=3,
                force=True,
                confirmation="start-traffic",
            ),
            service=service,
        )
        assert start_payload["ok"] is True, start_payload
        session_id = start_payload["data"]["session"]["id"]
        assert isinstance(session_id, str) and session_id

        stats_payload: dict[str, object] = {}
        for _ in range(10):
            time.sleep(0.5)
            stats_payload = trex_stats(service=service)
            assert stats_payload["ok"] is True, stats_payload
            if total_counter(stats_payload, "opackets") > 0 and total_counter(stats_payload, "ipackets") > 0:
                break

        assert total_counter(stats_payload, "opackets") > 0, stats_payload
        assert total_counter(stats_payload, "ipackets") > 0, stats_payload
    finally:
        if session_id is not None:
            stop_payload = traffic_action(
                "stop",
                TrafficPortsRequest(
                    ports=[0],
                    confirmation="stop",
                    expected_session_id=session_id,
                ),
                service=service,
            )
            assert stop_payload["ok"] is True, stop_payload
        service.close()


@pytest.mark.skipif(
    os.getenv("TREX_WEBUI_RUN_CAPTURE_SMOKE") != "1",
    reason="Set TREX_WEBUI_RUN_CAPTURE_SMOKE=1 to run a short real capture workflow",
)
def test_real_trex_capture_start_fetch_stop_smoke() -> None:
    service = real_service()
    capture_id: int | None = None
    session_id: str | None = None
    try:
        start_capture_payload = start_packet_capture(
            CaptureStartRequest(rx_ports=[1], limit=64, mode="fixed", bpf_filter="udp"),
            service=service,
        )
        assert start_capture_payload["ok"] is True, start_capture_payload
        capture_id = start_capture_payload["data"]["id"]
        assert isinstance(capture_id, int)
        assert start_capture_payload["data"]["service_mode"]["enabled_ports"] == [1]

        start_payload = start_traffic(
            StartTrafficRequest(
                expected_session_id=None,
                profile_path="/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
                ports=[0],
                multiplier="5kpps",
                duration=2,
                force=True,
                confirmation="start-traffic",
            ),
            service=service,
        )
        assert start_payload["ok"] is True, start_payload
        session_id = start_payload["data"]["session"]["id"]
        assert isinstance(session_id, str) and session_id
        time.sleep(1.5)

        stop_capture_payload = stop_packet_capture(
            CaptureStopRequest(capture_id=capture_id, pkt_count=16, save_pcap=False),
            service=service,
        )
        capture_id = None
        assert stop_capture_payload["ok"] is True, stop_capture_payload
        assert stop_capture_payload["data"]["packet_count"] > 0, stop_capture_payload
        packet = stop_capture_payload["data"]["packets"][0]
        assert packet["port"] == 1
        assert packet["mode"] == "RX"
        assert packet["type"] == "IPv4/UDP"
        assert stop_capture_payload["data"]["service_mode"]["restored_ports"] == [1]
    finally:
        if capture_id is not None:
            stop_packet_capture(CaptureStopRequest(capture_id=capture_id, pkt_count=1), service=service)
        remove_packet_captures(service=service)
        if session_id is not None:
            traffic_action(
                "stop",
                TrafficPortsRequest(
                    ports=[0],
                    confirmation="stop",
                    expected_session_id=session_id,
                ),
                service=service,
            )
        service.close()
