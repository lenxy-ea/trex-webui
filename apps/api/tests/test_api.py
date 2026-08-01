from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.trex.api_contracts import (
    SystemOverviewResponse,
    TrexPortsResultResponse,
)

from app.main import (
    AcquirePortsRequest,
    ClearStatsRequest,
    ConnectTrexRequest,
    DaemonActionRequest,
    DaemonConfigVersionDiffRequest,
    DaemonConfigVersionLoadRequest,
    DaemonConfigVersionRestoreRequest,
    DaemonConfigVersionSaveRequest,
    DaemonTrexReservationRequest,
    DaemonTrexStartRequest,
    DaemonTrexStopRequest,
    CaptureFetchRequest,
    CaptureFileRequest,
    CaptureRemoveRequest,
    CaptureStartRequest,
    CaptureStopRequest,
    PortArpResolveRequest,
    PortAttributeRequest,
    PortIpv6ScanRequest,
    PortLayerConfigurationRequest,
    PortPingRequest,
    ProfileDeleteRequest,
    ProfileDuplicateRequest,
    ProfileFileRequest,
    ProfileWorkbenchPcapExportRequest,
    ProfileWorkbenchPcapImportRequest,
    ProfileWorkbenchYamlExportRequest,
    PortsRequest,
    ResetPortsRequest,
    RunReportFileRequest,
    RunReportSaveRequest,
    ServiceModeRequest,
    StartTrafficRequest,
    TrafficGroupStartRequest,
    TrafficPortsRequest,
    UpdateTrafficRequest,
    app,
    acquire_ports,
    apply_port_configuration,
    clear_trex_stats,
    connect_trex,
    daemon_action,
    daemon_config_audit,
    daemon_config_metadata,
    daemon_config_version_diff,
    daemon_config_version_load,
    daemon_config_version_restore,
    daemon_config_version_save,
    daemon_config_versions,
    daemon_default_config,
    daemon_devices_info,
    daemon_file_content,
    daemon_files,
    daemon_overview,
    daemon_preview,
    daemon_status,
    daemon_trex_cancel_reservation,
    daemon_trex_reserve,
    daemon_trex_start,
    daemon_trex_status,
    daemon_trex_stop,
    delete_trex_profile,
    disconnect_trex,
    duplicate_trex_profile,
    export_trex_profile_json,
    trex_profile_workbench_export_yaml,
    trex_profile_workbench_export_pcap,
    trex_profile_workbench_import_pcap,
    daemon_trex_log,
    daemon_trex_latest_dump,
    daemon_trex_reservation,
    daemon_trex_running_info,
    daemon_trex_version,
    fetch_packet_capture,
    download_packet_capture_file,
    download_trex_run_report,
    health,
    open_packet_capture_file,
    overview,
    ping_from_port,
    release_ports,
    remove_packet_captures,
    remove_packet_capture,
    packet_capture_files,
    render_config,
    reset_ports,
    resolve_ports_arp,
    runtime_state_error_response,
    save_trex_run_report,
    scan_ports_ipv6,
    set_ports_attribute,
    set_ports_service_mode,
    start_packet_capture,
    start_traffic,
    start_traffic_group,
    STATS_STREAM_HEARTBEAT_EVENT,
    stats_sse_event,
    stats_sse_events,
    stop_packet_capture,
    traffic_action,
    trex_run_report_trends,
    trex_run_reports,
    trex_capture_status,
    trex_port_xstats,
    trex_ports,
    trex_profile_preview,
    trex_profiles,
    trex_stats,
    trex_stats_latest,
    trex_stats_stream,
    update_traffic,
)
from app.trex.config_model import TrexConfig
from app.trex.runtime import (
    DAEMON_COMMAND_TIMEOUT_MAX_SECONDS,
    DAEMON_CONFIG_MAX_BYTES,
    DAEMON_FILE_CONTENT_MAX_BYTES,
    DAEMON_FILE_PATH_MAX_CHARS,
    DAEMON_RESERVATION_USER_MAX_CHARS,
    CommandResult,
)
from app.trex.stats_sampler import TrexStatsSampler
from app.trex.result import TrexCallResult
from app.trex.runtime_state import (
    CaptureLeaseState,
    RuntimeAuthorityIdentity,
    RuntimeConnectionState,
    RuntimeStateDocument,
    RuntimeStateError,
    RuntimeStateStore,
    utc_now_iso,
)
from app.trex.stats_operations import ProbeResult
from app.core import settings


@pytest.fixture(autouse=True)
def isolate_runtime_state_path(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    monkeypatch.setenv(
        "TREX_WEBUI_RUNTIME_STATE_PATH",
        str(tmp_path / "isolated-runtime-state.json"),
    )
    settings.clear_runtime_trex_connection()
    try:
        yield
    finally:
        settings.clear_runtime_trex_connection()


class RecordingStlService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def probe(self) -> ProbeResult:
        self.calls.append(("probe", None))
        return ProbeResult(True, server_version={"version": "unit"}, system_info={"ports": []})

    def snapshot(self) -> TrexCallResult:
        self.calls.append(("snapshot", None))
        return TrexCallResult(
            True,
            data={
                "server_version": {"version": "unit"},
                "system_info": {"ports": [{"index": 0}, {"index": 1}]},
                "port_ids": [0, 1],
                "acquired_ports": [1],
                "ports": [
                    {"id": 0, "acquired": False, "info": {"link": "UP"}},
                    {"id": 1, "acquired": True, "info": {"link": "UP"}},
                ],
                "warnings": [],
            },
        )

    def stats(self, ports: list[int] | None = None) -> TrexCallResult:
        self.calls.append(("stats", ports))
        return TrexCallResult(True, data={"ports": ports, "global": {"tx_bps": 10}})

    def clear_stats(
        self,
        ports: list[int] | None,
        clear_global: bool,
        clear_flow_stats: bool,
        clear_latency_stats: bool,
        clear_xstats: bool,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "clear_stats",
                {
                    "ports": ports,
                    "clear_global": clear_global,
                    "clear_flow_stats": clear_flow_stats,
                    "clear_latency_stats": clear_latency_stats,
                    "clear_xstats": clear_xstats,
                },
            )
        )
        return TrexCallResult(True, data={"accepted": True, "ports": ports})

    def port_xstats(self, port: int) -> TrexCallResult:
        self.calls.append(("port_xstats", port))
        return TrexCallResult(True, data={"port": port, "xstats": {"tx_good_packets": 42}})

    def list_profiles(self) -> TrexCallResult:
        self.calls.append(("list_profiles", None))
        return TrexCallResult(
            True,
            data={
                "roots": [
                    {
                        "path": "/opt/trex-core/scripts/stl",
                        "exists": True,
                        "readable": True,
                        "profile_count": 1,
                        "blocker": None,
                        "error": None,
                    }
                ],
                "profiles": [
                    {
                        "name": "udp_1pkt_simple.py",
                        "path": "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
                        "relative_path": "udp_1pkt_simple.py",
                        "root": "/opt/trex-core/scripts/stl",
                        "suffix": ".py",
                        "kind": "python",
                        "size_bytes": 128,
                        "modified_time": "2026-06-03T00:00:00+00:00",
                        "previewable": True,
                    }
                ],
                "supported_suffixes": [".cap", ".json", ".pcap", ".py", ".yaml", ".yml"],
            },
        )

    def profile_preview(self, profile_path: str, max_bytes: int) -> TrexCallResult:
        self.calls.append(("profile_preview", {"profile_path": profile_path, "max_bytes": max_bytes}))
        return TrexCallResult(
            True,
            data={
                "profile": {"relative_path": "udp_1pkt_simple.py", "previewable": True},
                "preview_available": True,
                "content": "class STLProfile",
                "truncated": False,
                "bytes_read": 16,
                "max_bytes": max_bytes,
            },
        )

    def duplicate_profile(self, profile_path: str, target_name: str | None = None) -> TrexCallResult:
        self.calls.append(("duplicate_profile", {"profile_path": profile_path, "target_name": target_name}))
        return TrexCallResult(
            True,
            data={"accepted": True, "profile": {"relative_path": target_name or "udp_1pkt_simple-copy.py"}},
        )

    def delete_profile(self, profile_path: str) -> TrexCallResult:
        self.calls.append(("delete_profile", profile_path))
        return TrexCallResult(True, data={"accepted": True, "profile": {"relative_path": profile_path}})

    def export_profile_json(self, profile_path: str) -> TrexCallResult:
        self.calls.append(("export_profile_json", profile_path))
        return TrexCallResult(True, data={"accepted": True, "file_name": "profile.json", "content": "{}"})

    def export_workbench_profile_yaml(self, profile_name: str, streams: list[dict[str, object]]) -> TrexCallResult:
        self.calls.append(("export_workbench_profile_yaml", {"profile_name": profile_name, "streams": streams}))
        return TrexCallResult(
            True,
            data={"accepted": True, "file_name": profile_name, "content": "---\n[]\n", "bytes": 7, "streams": []},
        )

    def export_workbench_stream_pcap(self, stream: dict[str, object], file_name: str | None = None) -> TrexCallResult:
        self.calls.append(("export_workbench_stream_pcap", {"stream": stream, "file_name": file_name}))
        return TrexCallResult(
            True,
            data={
                "accepted": True,
                "file_name": file_name or "stream.pcap",
                "content_base64": "1MOyoQ==",
                "bytes": 4,
                "stream": {"index": 1, "name": stream.get("name", "stream")},
                "packet_preview": {"index": 1, "name": stream.get("name", "stream")},
            },
        )

    def import_workbench_pcap(
        self,
        file_name: str,
        content_base64: str,
        max_packets: int,
        options: dict[str, object] | None = None,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "import_workbench_pcap",
                {"file_name": file_name, "content_base64": content_base64, "max_packets": max_packets, "options": options},
            )
        )
        return TrexCallResult(
            True,
            data={
                "accepted": True,
                "file_name": file_name,
                "packet_count": 1,
                "unsupported_count": 0,
                "streams": [{"name": "packet_1"}],
                "packet_previews": [{"index": 1, "name": "packet_1"}],
            },
        )

    def acquire(self, ports: list[int] | None, force: bool, sync_streams: bool) -> TrexCallResult:
        self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
        return TrexCallResult(True, data={"accepted": True})

    def release(self, ports: list[int] | None) -> TrexCallResult:
        self.calls.append(("release", ports))
        return TrexCallResult(True, data={"accepted": True})

    def reset(self, ports: list[int] | None, restart: bool) -> TrexCallResult:
        self.calls.append(("reset", {"ports": ports, "restart": restart}))
        return TrexCallResult(True, data={"accepted": True})

    def set_service_mode(
        self,
        ports: list[int] | None,
        enabled: bool,
        filtered: bool,
        mask: int | None,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "service_mode",
                {"ports": ports, "enabled": enabled, "filtered": filtered, "mask": mask},
            )
        )
        return TrexCallResult(True, data={"accepted": True})

    def set_port_attribute(self, ports: list[int] | None, attribute: str, value: object) -> TrexCallResult:
        self.calls.append(("port_attribute", {"ports": ports, "attribute": attribute, "value": value}))
        return TrexCallResult(True, data={"accepted": True, "ports": ports, "attribute": attribute, "value": value})

    def configure_port_layer(
        self,
        port: int,
        mode: str,
        l2_destination: str | None,
        l3_source: str | None,
        l3_destination: str | None,
        vlan: list[int] | None,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "configure_port_layer",
                {
                    "port": port,
                    "mode": mode,
                    "l2_destination": l2_destination,
                    "l3_source": l3_source,
                    "l3_destination": l3_destination,
                    "vlan": vlan,
                },
            )
        )
        return TrexCallResult(True, data={"accepted": True, "mode": mode})

    def resolve_arp(self, ports: list[int] | None, retries: int, vlan: list[int] | None) -> TrexCallResult:
        self.calls.append(("resolve_arp", {"ports": ports, "retries": retries, "vlan": vlan}))
        return TrexCallResult(True, data={"accepted": True})

    def scan_ipv6_neighbors(self, ports: list[int] | None, timeout_seconds: float) -> TrexCallResult:
        self.calls.append(("scan_ipv6_neighbors", {"ports": ports, "timeout_seconds": timeout_seconds}))
        return TrexCallResult(True, data={"accepted": True, "hosts": []})

    def ping(
        self,
        port: int,
        destination: str,
        pkt_size: int,
        count: int,
        interval_sec: float,
        vlan: list[int] | None,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "ping",
                {
                    "port": port,
                    "destination": destination,
                    "pkt_size": pkt_size,
                    "count": count,
                    "interval_sec": interval_sec,
                    "vlan": vlan,
                },
            )
        )
        return TrexCallResult(True, data={"accepted": True, "records": []})

    def capture_status(self) -> TrexCallResult:
        self.calls.append(("capture_status", None))
        return TrexCallResult(True, data={"captures": [{"id": 3, "pkt_count": 0}]})

    def start_capture(
        self,
        tx_ports: list[int] | None,
        rx_ports: list[int] | None,
        limit: int,
        mode: str,
        bpf_filter: str,
        snaplen: int,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "start_capture",
                {
                    "tx_ports": tx_ports,
                    "rx_ports": rx_ports,
                    "limit": limit,
                    "mode": mode,
                    "bpf_filter": bpf_filter,
                    "snaplen": snaplen,
                },
            )
        )
        return TrexCallResult(True, data={"accepted": True, "id": 3})

    def fetch_capture(
        self,
        capture_id: int,
        pkt_count: int,
        fetch_limit: int,
        snaplen: int,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "fetch_capture",
                {
                    "capture_id": capture_id,
                    "pkt_count": pkt_count,
                    "fetch_limit": fetch_limit,
                    "snaplen": snaplen,
                },
            )
        )
        return TrexCallResult(True, data={"accepted": True, "packets": []})

    def stop_capture(
        self,
        capture_id: int,
        pkt_count: int,
        save_pcap: bool,
        file_name: str | None,
        snaplen: int,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "stop_capture",
                {
                    "capture_id": capture_id,
                    "pkt_count": pkt_count,
                    "save_pcap": save_pcap,
                    "file_name": file_name,
                    "snaplen": snaplen,
                },
            )
        )
        return TrexCallResult(True, data={"accepted": True, "packets": [], "saved_file": None})

    def remove_all_captures(self) -> TrexCallResult:
        self.calls.append(("remove_all_captures", None))
        return TrexCallResult(True, data={"accepted": True, "removed_ids": [3], "captures": []})

    def remove_capture(self, capture_id: int) -> TrexCallResult:
        self.calls.append(("remove_capture", capture_id))
        return TrexCallResult(True, data={"accepted": True, "removed_ids": [capture_id], "captures": []})

    def list_capture_files(self) -> TrexCallResult:
        self.calls.append(("list_capture_files", None))
        return TrexCallResult(True, data={"root": "/tmp/captures", "files": [{"name": "unit.pcap"}]})

    def download_capture_file(self, file_name: str) -> TrexCallResult:
        self.calls.append(("download_capture_file", file_name))
        return TrexCallResult(
            True,
            data={"accepted": True, "file": {"name": file_name, "content_base64": "1MOyoQ==", "download_available": True}},
        )

    def open_capture_file(self, file_name: str) -> TrexCallResult:
        self.calls.append(("open_capture_file", file_name))
        return TrexCallResult(
            True,
            data={"accepted": True, "file": {"name": file_name, "download_available": True}, "command": ["wireshark", "-r", file_name], "pid": 1234},
        )

    def list_run_reports(self) -> TrexCallResult:
        self.calls.append(("list_run_reports", None))
        return TrexCallResult(
            True,
            data={
                "root": "/tmp/reports",
                "files": [{"name": "run.json", "title": "Run", "content": None, "download_available": True}],
            },
        )

    def run_report_trends(self, limit: int = 30) -> TrexCallResult:
        self.calls.append(("run_report_trends", limit))
        return TrexCallResult(
            True,
            data={
                "root": "/tmp/reports",
                "total": 1,
                "skipped": 0,
                "verdict_counts": {"pass": 1, "warn": 0, "fail": 0, "unknown": 0},
                "conclusion": {
                    "verdict": "pass",
                    "title": "History Clean",
                    "summary": "No failed or warning verdicts",
                    "reasons": [],
                },
                "metric_trends": [],
                "records": [{"name": "run.json", "verdict": "pass", "metrics": {}}],
            },
        )

    def save_run_report(
        self,
        title: str,
        markdown: str,
        payload: dict[str, object],
        file_name: str | None = None,
        traffic_session_id: str | None = None,
        traffic_session_revision: int | None = None,
    ) -> TrexCallResult:
        self.calls.append(
            (
                "save_run_report",
                {
                    "title": title,
                    "markdown": markdown,
                    "payload": payload,
                    "file_name": file_name,
                    "traffic_session_id": traffic_session_id,
                    "traffic_session_revision": traffic_session_revision,
                },
            )
        )
        return TrexCallResult(
            True,
            data={
                "accepted": True,
                "file": {"name": file_name or "run.json", "title": title, "content": "{\"title\":\"Run\"}"},
            },
        )

    def download_run_report(self, file_name: str) -> TrexCallResult:
        self.calls.append(("download_run_report", file_name))
        return TrexCallResult(
            True,
            data={"accepted": True, "file": {"name": file_name, "content": "{\"title\":\"Run\"}", "download_available": True}},
        )

    def traffic_action(
        self,
        action: str,
        ports: list[int] | None,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        payload: dict[str, object] = {"action": action, "ports": ports}
        if expected_session_id is not None:
            payload["expected_session_id"] = expected_session_id
        self.calls.append(("traffic", payload))
        return TrexCallResult(True, data={"accepted": True})

    def update_traffic(
        self,
        ports: list[int] | None,
        multiplier: str,
        force: bool,
        total: bool,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        payload: dict[str, object] = {
            "ports": ports,
            "multiplier": multiplier,
            "force": force,
            "total": total,
        }
        if expected_session_id is not None:
            payload["expected_session_id"] = expected_session_id
        self.calls.append(
            (
                "update_traffic",
                payload,
            )
        )
        return TrexCallResult(True, data={"accepted": True, "multiplier": multiplier})

    def start_profile(
        self,
        profile_path: str,
        ports: list[int] | None,
        multiplier: str,
        duration: float,
        force: bool,
        total: bool,
        synchronized: bool,
        clear_existing: bool,
        tunables: dict[str, object],
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        payload: dict[str, object] = {
            "profile_path": profile_path,
            "ports": ports,
            "multiplier": multiplier,
            "duration": duration,
            "force": force,
            "total": total,
            "synchronized": synchronized,
            "clear_existing": clear_existing,
            "tunables": tunables,
            "expected_session_id": expected_session_id,
        }
        if hard_stop_at is not None:
            payload["hard_stop_at"] = hard_stop_at
        self.calls.append(
            (
                "start_profile",
                payload,
            )
        )
        return TrexCallResult(True, data={"accepted": True, "stream_ids": [1, 2]})

    def start_traffic_group(
        self,
        group_id: str,
        expected_revision: int,
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        payload: dict[str, object] = {
            "group_id": group_id,
            "expected_revision": expected_revision,
            "expected_session_id": expected_session_id,
        }
        if hard_stop_at is not None:
            payload["hard_stop_at"] = hard_stop_at
        self.calls.append(
            (
                "start_traffic_group",
                payload,
            )
        )
        return TrexCallResult(True, data={"accepted": True})


@pytest.fixture()
def recording_service() -> RecordingStlService:
    return RecordingStlService()


def test_health_endpoint() -> None:
    assert health() == {"status": "ok"}


def test_health_fails_readiness_when_runtime_state_is_corrupt(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    state_path.write_text('{"version":99}\n', encoding="utf-8")
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    settings.clear_runtime_trex_connection()

    try:
        with pytest.raises(HTTPException) as exc_info:
            health()
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail["status"] == "blocked"
        assert exc_info.value.detail["blocker"] == "trex_environment_invalid"
        assert "TREX_WEBUI_RUNTIME_STATE_PATH" in exc_info.value.detail["configuration_errors"]
    finally:
        settings.clear_runtime_trex_connection()


def test_health_fails_readiness_for_remote_state_in_managed_systemd_mode(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_HOST", "127.0.0.1")
    monkeypatch.setenv("TREX_WEBUI_TREX_SYNC_PORT", "4501")
    monkeypatch.setenv("TREX_WEBUI_TREX_ASYNC_PORT", "4500")
    monkeypatch.setenv("TREX_WEBUI_TREX_SCAPY_PORT", "4507")
    monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "systemd")

    def persist_remote(state: RuntimeStateDocument) -> RuntimeStateDocument:
        state.connection = RuntimeConnectionState(
            host="remote.trex",
            sync_port=4511,
            async_port=4510,
            scapy_port=4517,
            client_name="RemoteClient",
            connect_timeout_seconds=9,
            updated_at=utc_now_iso(),
        )
        return state

    RuntimeStateStore(state_path).update(persist_remote)
    settings.clear_runtime_trex_connection()

    try:
        with pytest.raises(HTTPException) as exc_info:
            health()
        assert exc_info.value.status_code == 503
        assert exc_info.value.detail["status"] == "blocked"
        assert exc_info.value.detail["blocker"] == "trex_environment_invalid"
        assert (
            exc_info.value.detail["configuration_errors"]["TREX_WEBUI_RUNTIME_STATE_PATH"]
            == settings.MANAGED_LOCAL_CONNECTION_ERROR
        )
    finally:
        settings.clear_runtime_trex_connection()


def test_health_fails_readiness_when_managed_daemon_generation_is_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "systemd")
    monkeypatch.setenv(
        "TREX_WEBUI_DAEMON_GENERATION_PATH",
        str(tmp_path / "missing-generation"),
    )
    monkeypatch.setenv(
        "TREX_WEBUI_RUNTIME_STATE_PATH",
        str(tmp_path / "runtime-state.json"),
    )
    settings.clear_runtime_trex_connection()

    try:
        with pytest.raises(
            RuntimeStateError,
            match="managed daemon generation is unavailable",
        ):
            health()
    finally:
        settings.clear_runtime_trex_connection()


def test_api_routes_are_registered() -> None:
    paths = {route.path for route in app.routes}

    assert "/api/trex/profiles" in paths
    assert "/api/trex/profiles/preview" in paths
    assert "/api/trex/profiles/workbench" in paths
    assert "/api/trex/profiles/duplicate" in paths
    assert "/api/trex/profiles/delete" in paths
    assert "/api/trex/profiles/export-json" in paths
    assert "/api/trex/profiles/workbench/render" in paths
    assert "/api/trex/profiles/workbench/save" in paths
    assert "/api/trex/profiles/workbench/export-yaml" in paths
    assert "/api/trex/profiles/workbench/export-pcap" in paths
    assert "/api/trex/profiles/workbench/import-pcap" in paths
    assert "/api/trex/connect" in paths
    assert "/api/trex/disconnect" in paths
    assert "/api/trex/stats/latest" in paths
    assert "/api/trex/stats/stream" in paths
    assert "/api/trex/stats/clear" in paths
    assert "/api/trex/ports/xstats" in paths
    assert "/api/trex/ports/configuration/apply" in paths
    assert "/api/trex/ports/attribute" in paths
    assert "/api/trex/ports/arp/resolve" in paths
    assert "/api/trex/ports/ipv6/scan" in paths
    assert "/api/trex/ports/ping" in paths
    assert "/api/trex/capture/status" in paths
    assert "/api/trex/capture/start" in paths
    assert "/api/trex/capture/fetch" in paths
    assert "/api/trex/capture/stop" in paths
    assert "/api/trex/capture/remove" in paths
    assert "/api/trex/capture/remove-all" in paths
    assert "/api/trex/capture/files" in paths
    assert "/api/trex/capture/files/download" in paths
    assert "/api/trex/capture/files/open" in paths
    assert "/api/trex/reports" in paths
    assert "/api/trex/reports/trends" in paths
    assert "/api/trex/reports/save" in paths
    assert "/api/trex/reports/download" in paths
    assert "/api/trex/traffic/start" in paths
    assert "/api/trex/traffic/update" in paths
    assert "/api/system/daemon" in paths
    assert "/api/system/daemon/config/metadata" in paths
    assert "/api/system/daemon/config/default" in paths
    assert "/api/system/daemon/devices" in paths
    assert "/api/system/daemon/files" in paths
    assert "/api/system/daemon/files/content" in paths
    assert "/api/system/daemon/trex/latest-dump" in paths
    assert "/api/system/daemon/trex/reservation" in paths
    assert "/api/system/daemon/trex/reservation/cancel" in paths
    assert "/api/system/daemon/trex/reservation/reserve" in paths
    assert "/api/system/daemon/trex/start" in paths
    assert "/api/system/daemon/trex/stop" in paths


def test_daemon_route_limits_reuse_runtime_constants() -> None:
    paths = app.openapi()["paths"]
    files_path_schema = paths["/api/system/daemon/files"]["get"]["parameters"][0]["schema"]
    files_path_string_schema = next(schema for schema in files_path_schema["anyOf"] if schema.get("type") == "string")
    file_content_params = {
        parameter["name"]: parameter["schema"]
        for parameter in paths["/api/system/daemon/files/content"]["get"]["parameters"]
    }

    assert files_path_string_schema["maxLength"] == DAEMON_FILE_PATH_MAX_CHARS
    assert file_content_params["path"]["maxLength"] == DAEMON_FILE_PATH_MAX_CHARS
    assert file_content_params["max_bytes"]["maximum"] == DAEMON_FILE_CONTENT_MAX_BYTES


def test_trex_ports_endpoint_uses_injected_stl_service(recording_service: RecordingStlService) -> None:
    payload = trex_ports(service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["port_ids"] == [0, 1]
    assert recording_service.calls == [("snapshot", None)]


def test_trex_ports_endpoint_sanitizes_hard_stop_priority_diagnostics(
    recording_service: RecordingStlService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        recording_service,
        "snapshot",
        lambda: TrexCallResult(
            False,
            data={
                "rpc_count": 8,
                "remaining_seconds": 12.0,
                "required_seconds": 25.0,
            },
            blocker="traffic_hard_stop_priority",
            error="TRex RPC is deferred for the hard-stop supervisor",
        ),
    )

    payload = trex_ports(service=recording_service)

    assert payload == {
        "ok": False,
        "data": None,
        "blocker": "traffic_hard_stop_priority",
        "error": "TRex RPC is deferred for the hard-stop supervisor",
    }
    TrexPortsResultResponse.model_validate(payload)


def test_disconnect_trex_endpoint_closes_backend_stl_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: TrexCallResult(
            True,
            data={
                "disconnected": True,
                "client_cached": False,
                "stats_sampler_closed": True,
            },
        ),
    )

    payload = disconnect_trex()

    assert payload == {
        "ok": True,
        "data": {
            "disconnected": True,
            "client_cached": False,
            "stats_sampler_closed": True,
        },
        "blocker": None,
        "error": None,
    }


def test_runtime_state_errors_use_fail_closed_service_unavailable_envelope() -> None:
    response = asyncio.run(
        runtime_state_error_response(
            None,  # type: ignore[arg-type]
            RuntimeStateError("runtime state is invalid"),
        )
    )

    assert response.status_code == 503
    assert response.body == (
        b'{"ok":false,"data":null,"blocker":"runtime_state_invalid",'
        b'"error":"runtime state is invalid"}'
    )


def test_connect_trex_endpoint_applies_runtime_connection(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    service = RecordingStlService()
    disconnect_calls: list[bool] = []
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(tmp_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(tmp_path / "missing-daemon"))
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(tmp_path / "runtime-state.json"))
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: disconnect_calls.append(True) or TrexCallResult(
            True,
            data={
                "disconnected": True,
                "client_cached": False,
                "stats_sampler_closed": True,
            },
        ),
    )
    monkeypatch.setattr("app.main.get_stl_service", lambda: service)

    try:
        payload = connect_trex(
            ConnectTrexRequest(
                host="trex.lab",
                sync_port=4511,
                async_port=4510,
                scapy_port=4517,
                client_name="RuntimeClient",
                timeout_seconds=9,
            )
        )
    finally:
        settings.clear_runtime_trex_connection()

    assert disconnect_calls == [True]
    assert payload["environment"]["host"] == "trex.lab"
    assert payload["environment"]["sync_port"] == 4511
    assert payload["environment"]["async_port"] == 4510
    assert payload["environment"]["scapy_port"] == 4517
    assert payload["environment"]["client_name"] == "RuntimeClient"
    assert payload["environment"]["connect_timeout_seconds"] == 9
    assert payload["environment"]["runtime_state_path"] == str(tmp_path / "runtime-state.json")
    assert payload["trex_probe"]["ok"] is True
    assert payload["trex_ports"]["data"]["port_ids"] == [0, 1]
    assert service.calls == [("snapshot", None)]
    persisted = RuntimeStateStore(tmp_path / "runtime-state.json").load().connection
    assert persisted is not None
    assert persisted.host == "trex.lab"
    assert persisted.sync_port == 4511


def test_connect_trex_endpoint_rejects_remote_target_in_managed_mode_before_disconnect(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "systemd")
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: (_ for _ in ()).throw(AssertionError("managed target validation must run first")),
    )
    settings.clear_runtime_trex_connection()

    try:
        with pytest.raises(HTTPException) as exc_info:
            connect_trex(
                ConnectTrexRequest(
                    host="remote.trex",
                    sync_port=4501,
                    async_port=4500,
                    scapy_port=4507,
                    client_name="Client1",
                    timeout_seconds=3,
                )
            )
        assert exc_info.value.status_code == 400
        assert "managed systemd mode pins" in str(exc_info.value.detail)
        assert not state_path.exists()
    finally:
        settings.clear_runtime_trex_connection()


def test_connect_trex_endpoint_blocks_reconnect_while_runtime_capture_is_managed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    RuntimeStateStore(state_path).update(
        lambda state: state.model_copy(
            update={
                "capture_leases": [
                    CaptureLeaseState(
                        capture_id=7,
                        authority=RuntimeAuthorityIdentity(
                            host="127.0.0.1",
                            sync_port=4501,
                            async_port=4500,
                            scapy_port=4507,
                            daemon_supervisor="external",
                            generation="process:11111111-1111-4111-8111-111111111111",
                        ),
                        tx_ports=[0],
                        rx_ports=[],
                        bpf_filter="",
                        ports=[0],
                        acquired_ports=[0],
                    )
                ]
            }
        )
    )
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: (_ for _ in ()).throw(AssertionError("runtime guard must run before disconnect")),
    )
    settings.clear_runtime_trex_connection()

    try:
        payload = connect_trex(
            ConnectTrexRequest(
                host="trex.lab",
                sync_port=4511,
                async_port=4510,
                scapy_port=4517,
                client_name="Client1",
                timeout_seconds=3,
            )
        )
        assert payload["ok"] is False
        assert payload["blocker"] == "runtime_capture_active"
        assert RuntimeStateStore(state_path).load().connection is None
    finally:
        settings.clear_runtime_trex_connection()


def test_connect_trex_endpoint_keeps_previous_runtime_connection_when_disconnect_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings.set_runtime_trex_connection(
        host="old.trex",
        sync_port=4501,
        async_port=4500,
        scapy_port=4507,
        client_name="OldClient",
        connect_timeout_seconds=3,
    )
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: TrexCallResult(
            False,
            data={"disconnected": False, "phase": "capture_remove"},
            blocker="trex_disconnect_cleanup_failed",
            error="remove failed",
        ),
    )
    monkeypatch.setattr(
        "app.main.get_stl_service",
        lambda: (_ for _ in ()).throw(AssertionError("failed disconnect must not construct the replacement service")),
    )

    try:
        payload = connect_trex(
            ConnectTrexRequest(
                host="new.trex",
                sync_port=4511,
                async_port=4510,
                scapy_port=4517,
                client_name="NewClient",
                timeout_seconds=9,
            )
        )
        current = settings.get_environment()
    finally:
        settings.clear_runtime_trex_connection()

    assert payload == {
        "ok": False,
        "data": {"disconnected": False, "phase": "capture_remove"},
        "blocker": "trex_disconnect_cleanup_failed",
        "error": "remove failed",
    }
    assert current.host == "old.trex"
    assert current.sync_port == 4501
    assert current.async_port == 4500
    assert current.scapy_port == 4507
    assert current.client_name == "OldClient"
    assert current.connect_timeout_seconds == 3


def test_connect_trex_endpoint_rejects_dirty_host() -> None:
    try:
        with pytest.raises(HTTPException) as exc_info:
            connect_trex(
                ConnectTrexRequest(
                    host="http://trex.lab:4501",
                    sync_port=4501,
                    async_port=4500,
                    scapy_port=4507,
                    client_name="Client1",
                    timeout_seconds=3,
                )
            )
        assert exc_info.value.status_code == 400
    finally:
        settings.clear_runtime_trex_connection()


def test_connect_trex_endpoint_rejects_dirty_client_name() -> None:
    try:
        with pytest.raises(HTTPException) as exc_info:
            connect_trex(
                ConnectTrexRequest(
                    host="trex.lab",
                    sync_port=4501,
                    async_port=4500,
                    scapy_port=4507,
                    client_name="bad\nclient",
                    timeout_seconds=3,
                )
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == settings.TREX_CLIENT_NAME_ERROR
    finally:
        settings.clear_runtime_trex_connection()


def test_trex_stats_endpoint_passes_ports(recording_service: RecordingStlService) -> None:
    payload = trex_stats(ports=[0, 1], service=recording_service)

    assert payload["data"]["ports"] == [0, 1]
    assert recording_service.calls == [("stats", [0, 1])]


def test_trex_stats_endpoint_defaults_direct_call_ports_to_none(recording_service: RecordingStlService) -> None:
    payload = trex_stats(service=recording_service)

    assert payload["data"]["ports"] is None
    assert recording_service.calls == [("stats", None)]


def test_trex_stats_endpoint_records_full_samples(recording_service: RecordingStlService) -> None:
    sampler = TrexStatsSampler(recording_service)

    payload = trex_stats(service=recording_service, sampler=sampler)

    assert payload["ok"] is True
    assert sampler.latest_payload()["data"] == {"ports": None, "global": {"tx_bps": 10}}
    assert recording_service.calls == [("stats", None)]
    sampler.close()


def test_trex_stats_latest_uses_sampler_cache(recording_service: RecordingStlService) -> None:
    sampler = TrexStatsSampler(recording_service)
    sampler.record_result(TrexCallResult(True, data={"global": {"tx_pps": 5}}))

    payload = trex_stats_latest(sampler=sampler)

    assert payload["ok"] is True
    assert payload["data"] == {"global": {"tx_pps": 5}}
    assert recording_service.calls == []
    sampler.close()


def test_trex_stats_latest_samples_when_cache_is_empty(recording_service: RecordingStlService) -> None:
    sampler = TrexStatsSampler(recording_service)

    payload = trex_stats_latest(sampler=sampler)

    assert payload["ok"] is True
    assert payload["data"] == {"ports": None, "global": {"tx_bps": 10}}
    assert recording_service.calls == [("stats", None)]
    sampler.close()


@pytest.mark.parametrize(
    "blocker",
    [
        "traffic_hard_stop_priority",
        "traffic_hard_stop_window_insufficient",
    ],
)
def test_stats_latest_and_sse_redact_hard_stop_scheduler_evidence(
    blocker: str,
    recording_service: RecordingStlService,
) -> None:
    sampler = TrexStatsSampler(recording_service, interval_seconds=60)
    sample = sampler.record_result(
        TrexCallResult(
            False,
            data={
                "rpc_count": 8,
                "remaining_seconds": 12.0,
                "required_seconds": 25.0,
            },
            blocker=blocker,
            error="TRex RPC is deferred for the hard-stop supervisor",
        )
    )

    assert sample["data"] is None
    latest = trex_stats_latest(sampler=sampler)
    assert latest["data"] is None
    assert latest["blocker"] == blocker

    class ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    async def exercise() -> None:
        subscription = sampler.subscribe()
        events = stats_sse_events(
            ConnectedRequest(),
            subscription,
            heartbeat_seconds=60,
        )
        event = await asyncio.wait_for(events.__anext__(), timeout=1)
        assert '"data":null' in event
        assert f'"blocker":"{blocker}"' in event
        assert "rpc_count" not in event
        await events.aclose()

    asyncio.run(exercise())
    sampler.close()


def test_stats_sse_event_serializes_sample_payload() -> None:
    event = stats_sse_event({"ok": True, "data": {"global": {"tx_pps": 1}}})

    assert event.startswith("data: ")
    assert event.endswith("\n\n")
    assert '"tx_pps":1' in event


def test_stats_sse_stream_sends_heartbeat_while_idle() -> None:
    class ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    class IdleSubscription:
        def __init__(self) -> None:
            self.closed = False

        async def __anext__(self) -> dict[str, object]:
            await asyncio.Future()
            raise AssertionError("unreachable")

        def close(self) -> None:
            self.closed = True

    async def exercise() -> None:
        subscription = IdleSubscription()
        events = stats_sse_events(ConnectedRequest(), subscription, heartbeat_seconds=0.01)

        assert await asyncio.wait_for(events.__anext__(), timeout=1) == STATS_STREAM_HEARTBEAT_EVENT

        await events.aclose()
        assert subscription.closed is True

    asyncio.run(exercise())


def test_stats_sse_stream_cancellation_unsubscribes() -> None:
    class ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    sampler = TrexStatsSampler(RecordingStlService(), interval_seconds=60)

    async def exercise() -> None:
        subscription = sampler.subscribe()
        events = stats_sse_events(ConnectedRequest(), subscription, heartbeat_seconds=60)
        first_event = await asyncio.wait_for(events.__anext__(), timeout=1)
        assert first_event.startswith("data: ")

        waiting = asyncio.create_task(events.__anext__())
        await asyncio.sleep(0)
        waiting.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiting

        assert sampler.subscriber_count == 0
        assert subscription.closed is True

    asyncio.run(exercise())
    sampler.close()


def test_stats_sse_stream_disconnect_unsubscribes() -> None:
    class DisconnectedRequest:
        async def is_disconnected(self) -> bool:
            return True

    sampler = TrexStatsSampler(RecordingStlService(), interval_seconds=60)

    async def exercise() -> None:
        subscription = sampler.subscribe()
        events = stats_sse_events(DisconnectedRequest(), subscription, heartbeat_seconds=60)

        with pytest.raises(StopAsyncIteration):
            await events.__anext__()

        assert sampler.subscriber_count == 0
        assert subscription.closed is True

    asyncio.run(exercise())
    sampler.close()


def test_stats_stream_response_immediate_disconnect_unsubscribes() -> None:
    class ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    sampler = TrexStatsSampler(RecordingStlService(), interval_seconds=60)

    async def exercise() -> None:
        response = await trex_stats_stream(request=ConnectedRequest(), sampler=sampler)

        async def receive() -> dict[str, str]:
            return {"type": "http.disconnect"}

        async def send(_message: dict[str, object]) -> None:
            return None

        await response(
            {"type": "http", "method": "GET", "path": "/api/trex/stats/stream", "headers": []},
            receive,
            send,
        )

        assert sampler.subscriber_count == 0

    asyncio.run(exercise())
    sampler.close()


def test_stats_stream_endpoint_rejects_subscribers_above_limit() -> None:
    class ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    sampler = TrexStatsSampler(RecordingStlService(), interval_seconds=60, max_subscribers=1)

    async def exercise() -> None:
        subscription = sampler.subscribe()

        with pytest.raises(HTTPException) as exc_info:
            await trex_stats_stream(request=ConnectedRequest(), sampler=sampler)

        assert exc_info.value.status_code == 503
        assert exc_info.value.headers == {"Retry-After": "1"}
        subscription.close()

    asyncio.run(exercise())
    sampler.close()


def test_clear_trex_stats_calls_service(recording_service: RecordingStlService) -> None:
    payload = clear_trex_stats(
        ClearStatsRequest(
            ports=[0],
            clear_global=False,
            clear_flow_stats=True,
            clear_latency_stats=False,
            clear_xstats=True,
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "clear_stats",
            {
                "ports": [0],
                "clear_global": False,
                "clear_flow_stats": True,
                "clear_latency_stats": False,
                "clear_xstats": True,
            },
        )
    ]


def test_clear_trex_stats_resets_and_refreshes_sampler(recording_service: RecordingStlService) -> None:
    sampler = TrexStatsSampler(recording_service)
    sampler.record_result(TrexCallResult(True, data={"global": {"tx_pps": 99}}))

    payload = clear_trex_stats(
        ClearStatsRequest(),
        service=recording_service,
        sampler=sampler,
    )

    assert payload["ok"] is True
    assert sampler.latest_payload()["data"] == {"ports": None, "global": {"tx_bps": 10}}
    assert recording_service.calls == [
        (
            "clear_stats",
            {
                "ports": None,
                "clear_global": True,
                "clear_flow_stats": True,
                "clear_latency_stats": True,
                "clear_xstats": True,
            },
        ),
        ("stats", None),
    ]
    sampler.close()


def test_trex_port_xstats_endpoint_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_port_xstats(port=1, service=recording_service)

    assert payload["ok"] is True
    assert payload["data"] == {"port": 1, "xstats": {"tx_good_packets": 42}}
    assert recording_service.calls == [("port_xstats", 1)]


def test_trex_profiles_endpoint_uses_injected_stl_service(recording_service: RecordingStlService) -> None:
    payload = trex_profiles(service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["profiles"][0]["relative_path"] == "udp_1pkt_simple.py"
    assert recording_service.calls == [("list_profiles", None)]


def test_trex_profile_preview_passes_query_to_service(recording_service: RecordingStlService) -> None:
    payload = trex_profile_preview(
        profile_path="udp_1pkt_simple.py",
        max_bytes=2048,
        service=recording_service,
    )

    assert payload["data"]["content"] == "class STLProfile"
    assert recording_service.calls == [
        ("profile_preview", {"profile_path": "udp_1pkt_simple.py", "max_bytes": 2048})
    ]


def test_duplicate_profile_calls_service(recording_service: RecordingStlService) -> None:
    payload = duplicate_trex_profile(
        ProfileDuplicateRequest(profile_path="udp_1pkt_simple.py", target_name="copy.py"),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        ("duplicate_profile", {"profile_path": "udp_1pkt_simple.py", "target_name": "copy.py"})
    ]


def test_delete_profile_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = delete_trex_profile(
        ProfileDeleteRequest(profile_path="profile.yaml"),
        service=recording_service,
    )

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_delete_profile_calls_service_after_confirmation(recording_service: RecordingStlService) -> None:
    payload = delete_trex_profile(
        ProfileDeleteRequest(profile_path="profile.yaml", confirmation="delete-profile"),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [("delete_profile", "profile.yaml")]


def test_export_profile_json_calls_service(recording_service: RecordingStlService) -> None:
    payload = export_trex_profile_json(
        ProfileFileRequest(profile_path="profile.yaml"),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert payload["data"]["file_name"] == "profile.json"
    assert recording_service.calls == [("export_profile_json", "profile.yaml")]


def test_workbench_export_yaml_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="profile.yaml",
            streams=[{"name": "stream", "packet_type": "Ethernet/IPv4/TCP"}],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert payload["data"]["file_name"] == "profile.yaml"
    assert recording_service.calls == [
        (
            "export_workbench_profile_yaml",
            {
                "profile_name": "profile.yaml",
                "streams": [
                    {
                        "advanced_cache_size_type": "Auto",
                        "advanced_cache_value": 5000,
                        "action_count": 0,
                        "count": 1,
                        "enabled": True,
                        "ether_dst": "00:00:00:00:00:00",
                        "ether_dst_count": 16,
                        "ether_dst_mode": "TRex Config",
                        "ether_dst_step": 1,
                        "ether_src": "00:00:00:00:00:00",
                        "ether_type_override": False,
                        "ether_type": "0800",
                        "ether_src_count": 16,
                        "ether_src_mode": "TRex Config",
                        "ether_src_step": 1,
                        "arp_hardware_type": 1,
                        "arp_protocol_type": "0800",
                        "arp_hardware_size": 6,
                        "arp_protocol_size": 4,
                        "arp_operation": 1,
                        "arp_operation_mode": "Fixed",
                        "arp_operation_count": 4,
                        "arp_operation_step": 1,
                        "arp_sender_mac": "00:00:00:00:00:00",
                        "arp_sender_mac_mode": "Fixed",
                        "arp_sender_mac_count": 16,
                        "arp_sender_mac_step": 1,
                        "arp_sender_ip": "16.0.0.1",
                        "arp_sender_ip_mode": "Fixed",
                        "arp_sender_ip_count": 16,
                        "arp_sender_ip_step": 1,
                        "arp_target_mac": "00:00:00:00:00:00",
                        "arp_target_mac_mode": "Fixed",
                        "arp_target_mac_count": 16,
                        "arp_target_mac_step": 1,
                        "arp_target_ip": "48.0.0.1",
                        "arp_target_ip_mode": "Fixed",
                        "arp_target_ip_count": 16,
                        "arp_target_ip_step": 1,
                        "flow_stats_enabled": True,
                        "frame_length_type": "Fixed",
                        "frame_length": 64,
                        "frame_length_min": 64,
                        "frame_length_max": 1518,
                        "ibg": 0.0,
                        "icmp_checksum": "0000",
                        "icmp_checksum_override": False,
                        "icmp_code": 0,
                        "icmp_code_mode": "Fixed",
                        "icmp_code_count": 16,
                        "icmp_code_step": 1,
                        "icmp_identifier": 1,
                        "icmp_identifier_mode": "Fixed",
                        "icmp_identifier_count": 16,
                        "icmp_identifier_step": 1,
                        "icmp_sequence": 1,
                        "icmp_sequence_mode": "Fixed",
                        "icmp_sequence_count": 16,
                        "icmp_sequence_step": 1,
                        "icmp_type": 8,
                        "icmp_type_mode": "Fixed",
                        "icmp_type_count": 16,
                        "icmp_type_step": 1,
                        "icmpv6_nd_target": "2001:db8::2",
                        "icmpv6_nd_include_option": True,
                        "icmpv6_nd_option_mac": "00:00:00:00:00:00",
                        "icmpv6_nd_na_router": False,
                        "icmpv6_nd_na_solicited": True,
                        "icmpv6_nd_na_override": True,
                        "icmpv6_rs_include_slla": True,
                        "icmpv6_rs_slla_mac": "00:00:00:00:00:00",
                        "icmpv6_ra_cur_hop_limit": 64,
                        "icmpv6_ra_managed": False,
                        "icmpv6_ra_other": False,
                        "icmpv6_ra_router_lifetime": 1800,
                        "icmpv6_ra_reachable_time": 0,
                        "icmpv6_ra_retrans_timer": 0,
                        "icmpv6_ra_include_slla": True,
                        "icmpv6_ra_slla_mac": "00:00:00:00:00:00",
                        "icmpv6_ra_include_prefix": True,
                        "icmpv6_ra_prefix": "2001:db8:1::",
                        "icmpv6_ra_prefix_length": 64,
                        "icmpv6_ra_prefix_on_link": True,
                        "icmpv6_ra_prefix_autonomous": True,
                        "icmpv6_ra_prefix_valid_lifetime": 2592000,
                        "icmpv6_ra_prefix_preferred_lifetime": 604800,
                        "ipv4_dst": "48.0.0.1",
                        "ipv4_dst_count": 16,
                        "ipv4_dst_mode": "Fixed",
                        "ipv4_dst_step": 1,
                        "ipv4_dscp": 0,
                        "ipv4_dscp_mode": "Fixed",
                        "ipv4_dscp_count": 16,
                        "ipv4_dscp_step": 1,
                        "ipv4_ecn": 0,
                        "ipv4_ecn_count": 4,
                        "ipv4_ecn_mode": "Fixed",
                        "ipv4_ecn_step": 1,
                        "ipv4_id": 1234,
                        "ipv4_id_mode": "Fixed",
                        "ipv4_id_count": 16,
                        "ipv4_id_step": 1,
                        "ipv4_flag_df": False,
                        "ipv4_flag_mf": False,
                        "ipv4_fragment_offset": 0,
                        "ipv4_fragment_offset_mode": "Fixed",
                        "ipv4_fragment_offset_count": 16,
                        "ipv4_fragment_offset_step": 1,
                        "ipv4_src": "16.0.0.1",
                        "ipv4_src_count": 16,
                        "ipv4_src_mode": "Fixed",
                        "ipv4_src_step": 1,
                        "ipv4_ttl": 127,
                        "ipv4_ttl_mode": "Fixed",
                        "ipv4_ttl_count": 16,
                        "ipv4_ttl_step": 1,
                        "ipv4_checksum_override": False,
                        "ipv4_checksum": "0000",
                        "ipv6_dst": "2001:db8::2",
                        "ipv6_dst_count": 16,
                        "ipv6_dst_mode": "Fixed",
                        "ipv6_dst_step": 1,
                        "ipv6_flow_label": 0,
                        "ipv6_flow_label_count": 16,
                        "ipv6_flow_label_mode": "Fixed",
                        "ipv6_flow_label_step": 1,
                        "ipv6_hop_limit": 127,
                        "ipv6_hop_limit_mode": "Fixed",
                        "ipv6_hop_limit_count": 16,
                        "ipv6_hop_limit_step": 1,
                        "ipv6_src": "2001:db8::1",
                        "ipv6_src_count": 16,
                        "ipv6_src_mode": "Fixed",
                        "ipv6_src_step": 1,
                        "ipv6_traffic_class": 0,
                        "ipv6_traffic_class_mode": "Fixed",
                        "ipv6_traffic_class_count": 16,
                        "ipv6_traffic_class_step": 1,
                        "isg": 0.0,
                        "l4_dst_port": 12,
                        "l4_dst_port_count": 16,
                        "l4_dst_port_mode": "Fixed",
                        "l4_dst_port_override": False,
                        "l4_dst_port_step": 1,
                        "l4_src_port": 1025,
                        "l4_src_port_count": 16,
                        "l4_src_port_mode": "Fixed",
                        "l4_src_port_override": False,
                        "l4_src_port_step": 1,
                        "latency_enabled": False,
                        "mpls_enabled": False,
                        "mpls_label": 17,
                        "mpls_label_count": 16,
                        "mpls_label_mode": "Fixed",
                        "mpls_label_step": 1,
                        "mpls_tc": 0,
                        "mpls_tc_mode": "Fixed",
                        "mpls_tc_count": 4,
                        "mpls_tc_step": 1,
                        "mpls_ttl": 255,
                        "mpls_ttl_mode": "Fixed",
                        "mpls_ttl_count": 16,
                        "mpls_ttl_step": 1,
                        "mpls_label2_enabled": False,
                        "mpls_label2": 18,
                        "mpls_label2_mode": "Fixed",
                        "mpls_label2_count": 16,
                        "mpls_label2_step": 1,
                        "mpls_label2_tc": 0,
                        "mpls_label2_tc_mode": "Fixed",
                        "mpls_label2_tc_count": 4,
                        "mpls_label2_tc_step": 1,
                        "mpls_label2_ttl": 255,
                        "mpls_label2_ttl_mode": "Fixed",
                        "mpls_label2_ttl_count": 16,
                        "mpls_label2_ttl_step": 1,
                        "mpls_label3_enabled": False,
                        "mpls_label3": 19,
                        "mpls_label3_mode": "Fixed",
                        "mpls_label3_count": 16,
                        "mpls_label3_step": 1,
                        "mpls_label3_tc": 0,
                        "mpls_label3_tc_mode": "Fixed",
                        "mpls_label3_tc_count": 4,
                        "mpls_label3_tc_step": 1,
                        "mpls_label3_ttl": 255,
                        "mpls_label3_ttl_mode": "Fixed",
                        "mpls_label3_ttl_count": 16,
                        "mpls_label3_ttl_step": 1,
                        "vxlan_enabled": False,
                        "vxlan_vni": 42,
                        "vxlan_vni_mode": "Fixed",
                        "vxlan_vni_count": 16,
                        "vxlan_vni_step": 1,
                        "vxlan_inner_ether_dst": "00:00:00:00:00:00",
                        "vxlan_inner_ether_src": "00:00:00:00:00:00",
                        "vxlan_inner_ip_version": "IPv4",
                        "vxlan_inner_ipv4_src": "10.0.0.1",
                        "vxlan_inner_ipv4_src_mode": "Fixed",
                        "vxlan_inner_ipv4_src_count": 16,
                        "vxlan_inner_ipv4_src_step": 1,
                        "vxlan_inner_ipv4_dst": "10.0.0.2",
                        "vxlan_inner_ipv4_dst_mode": "Fixed",
                        "vxlan_inner_ipv4_dst_count": 16,
                        "vxlan_inner_ipv4_dst_step": 1,
                        "vxlan_inner_ipv4_ttl": 127,
                        "vxlan_inner_ipv4_ttl_mode": "Fixed",
                        "vxlan_inner_ipv4_ttl_count": 16,
                        "vxlan_inner_ipv4_ttl_step": 1,
                        "vxlan_inner_ipv6_src": "2001:db8:50::1",
                        "vxlan_inner_ipv6_src_mode": "Fixed",
                        "vxlan_inner_ipv6_src_count": 16,
                        "vxlan_inner_ipv6_src_step": 1,
                        "vxlan_inner_ipv6_dst": "2001:db8:50::2",
                        "vxlan_inner_ipv6_dst_mode": "Fixed",
                        "vxlan_inner_ipv6_dst_count": 16,
                        "vxlan_inner_ipv6_dst_step": 1,
                        "vxlan_inner_ipv6_hop_limit": 64,
                        "vxlan_inner_ipv6_hop_limit_mode": "Fixed",
                        "vxlan_inner_ipv6_hop_limit_count": 16,
                        "vxlan_inner_ipv6_hop_limit_step": 1,
                        "vxlan_inner_l4_src_port": 1025,
                        "vxlan_inner_l4_src_port_mode": "Fixed",
                        "vxlan_inner_l4_src_port_count": 16,
                        "vxlan_inner_l4_src_port_step": 1,
                        "vxlan_inner_l4_dst_port": 12,
                        "vxlan_inner_l4_dst_port_mode": "Fixed",
                        "vxlan_inner_l4_dst_port_count": 16,
                        "vxlan_inner_l4_dst_port_step": 1,
                        "gtpu_enabled": False,
                        "gtpu_message_type": 255,
                        "gtpu_teid": 0x12345678,
                        "gtpu_teid_mode": "Fixed",
                        "gtpu_teid_count": 16,
                        "gtpu_teid_step": 1,
                        "gtpu_sequence_enabled": False,
                        "gtpu_sequence": 0,
                        "gtpu_sequence_mode": "Fixed",
                        "gtpu_sequence_count": 16,
                        "gtpu_sequence_step": 1,
                        "gtpu_npdu_enabled": False,
                        "gtpu_npdu": 0,
                        "gtpu_npdu_mode": "Fixed",
                        "gtpu_npdu_count": 16,
                        "gtpu_npdu_step": 1,
                        "gtpu_extension_enabled": False,
                        "gtpu_extension_udp_port": 2152,
                        "gtpu_extension_udp_port_mode": "Fixed",
                        "gtpu_extension_udp_port_count": 16,
                        "gtpu_extension_udp_port_step": 1,
                        "gtpu_inner_ip_version": "IPv4",
                        "gtpu_inner_ipv4_src": "10.3.0.1",
                        "gtpu_inner_ipv4_src_mode": "Fixed",
                        "gtpu_inner_ipv4_src_count": 16,
                        "gtpu_inner_ipv4_src_step": 1,
                        "gtpu_inner_ipv4_dst": "10.3.0.2",
                        "gtpu_inner_ipv4_dst_mode": "Fixed",
                        "gtpu_inner_ipv4_dst_count": 16,
                        "gtpu_inner_ipv4_dst_step": 1,
                        "gtpu_inner_ipv4_ttl": 64,
                        "gtpu_inner_ipv4_ttl_mode": "Fixed",
                        "gtpu_inner_ipv4_ttl_count": 16,
                        "gtpu_inner_ipv4_ttl_step": 1,
                        "gtpu_inner_ipv6_src": "2001:db8:30::1",
                        "gtpu_inner_ipv6_src_mode": "Fixed",
                        "gtpu_inner_ipv6_src_count": 16,
                        "gtpu_inner_ipv6_src_step": 1,
                        "gtpu_inner_ipv6_dst": "2001:db8:30::2",
                        "gtpu_inner_ipv6_dst_mode": "Fixed",
                        "gtpu_inner_ipv6_dst_count": 16,
                        "gtpu_inner_ipv6_dst_step": 1,
                        "gtpu_inner_ipv6_hop_limit": 64,
                        "gtpu_inner_ipv6_hop_limit_mode": "Fixed",
                        "gtpu_inner_ipv6_hop_limit_count": 16,
                        "gtpu_inner_ipv6_hop_limit_step": 1,
                        "gtpu_inner_l4_src_port": 1025,
                        "gtpu_inner_l4_src_port_mode": "Fixed",
                        "gtpu_inner_l4_src_port_count": 16,
                        "gtpu_inner_l4_src_port_step": 1,
                        "gtpu_inner_l4_dst_port": 12,
                        "gtpu_inner_l4_dst_port_mode": "Fixed",
                        "gtpu_inner_l4_dst_port_count": 16,
                        "gtpu_inner_l4_dst_port_step": 1,
                        "gre_checksum_present": False,
                        "gre_checksum_override": False,
                        "gre_checksum": "0000",
                        "gre_key_present": False,
                        "gre_key": 0,
                        "gre_key_mode": "Fixed",
                        "gre_key_count": 16,
                        "gre_key_step": 1,
                        "gre_sequence_present": False,
                        "gre_sequence": 0,
                        "gre_sequence_mode": "Fixed",
                        "gre_sequence_count": 16,
                        "gre_sequence_step": 1,
                        "gre_protocol_type": "0800",
                        "gre_inner_ip_version": "IPv4",
                        "gre_inner_ipv4_src": "10.2.0.1",
                        "gre_inner_ipv4_src_mode": "Fixed",
                        "gre_inner_ipv4_src_count": 16,
                        "gre_inner_ipv4_src_step": 1,
                        "gre_inner_ipv4_dst": "10.2.0.2",
                        "gre_inner_ipv4_dst_mode": "Fixed",
                        "gre_inner_ipv4_dst_count": 16,
                        "gre_inner_ipv4_dst_step": 1,
                        "gre_inner_ipv4_ttl": 64,
                        "gre_inner_ipv4_ttl_mode": "Fixed",
                        "gre_inner_ipv4_ttl_count": 16,
                        "gre_inner_ipv4_ttl_step": 1,
                        "gre_inner_ipv6_src": "2001:db8:40::1",
                        "gre_inner_ipv6_src_mode": "Fixed",
                        "gre_inner_ipv6_src_count": 16,
                        "gre_inner_ipv6_src_step": 1,
                        "gre_inner_ipv6_dst": "2001:db8:40::2",
                        "gre_inner_ipv6_dst_mode": "Fixed",
                        "gre_inner_ipv6_dst_count": 16,
                        "gre_inner_ipv6_dst_step": 1,
                        "gre_inner_ipv6_hop_limit": 64,
                        "gre_inner_ipv6_hop_limit_mode": "Fixed",
                        "gre_inner_ipv6_hop_limit_count": 16,
                        "gre_inner_ipv6_hop_limit_step": 1,
                        "gre_inner_l4_src_port": 1025,
                        "gre_inner_l4_src_port_mode": "Fixed",
                        "gre_inner_l4_src_port_count": 16,
                        "gre_inner_l4_src_port_step": 1,
                        "gre_inner_l4_dst_port": 12,
                        "gre_inner_l4_dst_port_mode": "Fixed",
                        "gre_inner_l4_dst_port_count": 16,
                        "gre_inner_l4_dst_port_step": 1,
                        "sctp_verification_tag": 0x12345678,
                        "sctp_verification_tag_mode": "Fixed",
                        "sctp_verification_tag_count": 16,
                        "sctp_verification_tag_step": 1,
                        "sctp_checksum_override": False,
                        "sctp_checksum": "00000000",
                        "sctp_data_flags": 3,
                        "sctp_data_flags_mode": "Fixed",
                        "sctp_data_flags_count": 16,
                        "sctp_data_flags_step": 1,
                        "sctp_tsn": 1,
                        "sctp_tsn_mode": "Fixed",
                        "sctp_tsn_count": 16,
                        "sctp_tsn_step": 1,
                        "sctp_stream_id": 0,
                        "sctp_stream_id_mode": "Fixed",
                        "sctp_stream_id_count": 16,
                        "sctp_stream_id_step": 1,
                        "sctp_stream_sequence": 0,
                        "sctp_stream_sequence_mode": "Fixed",
                        "sctp_stream_sequence_count": 16,
                        "sctp_stream_sequence_step": 1,
                        "sctp_payload_protocol_id": 0,
                        "sctp_payload_protocol_id_mode": "Fixed",
                        "sctp_payload_protocol_id_count": 16,
                        "sctp_payload_protocol_id_step": 1,
                        "mode": "continuous",
                        "name": "stream",
                        "next_stream_id": None,
                        "advanced_mode": False,
                        "advanced_vm": None,
                        "packet_binary_base64": None,
                        "packet_meta_base64": None,
                        "packet_model": None,
                        "payload_enabled": True,
                        "payload_pattern": "00",
                        "payload_type": "Fixed Word",
                        "packet_type": "Ethernet/IPv4/TCP",
                        "pg_id": 1,
                        "pkts_per_burst": 1,
                        "rate_type": "pps",
                        "rate_value": 1.0,
                        "self_start": True,
                        "tcp_ack_number": 7654321,
                        "tcp_ack_mode": "Fixed",
                        "tcp_ack_count": 16,
                        "tcp_ack_step": 1,
                        "tcp_checksum": "ABCD",
                        "tcp_checksum_override": False,
                        "tcp_checksum_mode": "Fixed",
                        "tcp_checksum_count": 16,
                        "tcp_checksum_step": 1,
                        "tcp_option_mss_enabled": False,
                        "tcp_option_mss": 1460,
                        "tcp_option_mss_mode": "Fixed",
                        "tcp_option_mss_count": 16,
                        "tcp_option_mss_step": 1,
                        "tcp_option_window_scale_enabled": False,
                        "tcp_option_window_scale": 7,
                        "tcp_option_window_scale_mode": "Fixed",
                        "tcp_option_window_scale_count": 16,
                        "tcp_option_window_scale_step": 1,
                        "tcp_option_sack_permitted_enabled": False,
                        "tcp_option_sack_blocks_enabled": False,
                        "tcp_option_sack_left_edge": 1000,
                        "tcp_option_sack_left_edge_mode": "Fixed",
                        "tcp_option_sack_left_edge_count": 16,
                        "tcp_option_sack_left_edge_step": 1,
                        "tcp_option_sack_right_edge": 2000,
                        "tcp_option_sack_right_edge_mode": "Fixed",
                        "tcp_option_sack_right_edge_count": 16,
                        "tcp_option_sack_right_edge_step": 1,
                        "tcp_option_timestamp_enabled": False,
                        "tcp_option_timestamp_value": 1,
                        "tcp_option_timestamp_value_mode": "Fixed",
                        "tcp_option_timestamp_value_count": 16,
                        "tcp_option_timestamp_value_step": 1,
                        "tcp_option_timestamp_echo": 0,
                        "tcp_option_timestamp_echo_mode": "Fixed",
                        "tcp_option_timestamp_echo_count": 16,
                        "tcp_option_timestamp_echo_step": 1,
                        "tcp_flags_mode": "Fixed",
                        "tcp_flags_count": 16,
                        "tcp_flags_step": 1,
                        "tcp_flag_ack": False,
                        "tcp_flag_fin": False,
                        "tcp_flag_psh": False,
                        "tcp_flag_rst": False,
                        "tcp_flag_syn": False,
                        "tcp_flag_urg": False,
                        "tcp_sequence_number": 1234567,
                        "tcp_sequence_mode": "Fixed",
                        "tcp_sequence_count": 16,
                        "tcp_sequence_step": 1,
                        "tcp_urgent_pointer": 1111,
                        "tcp_urgent_pointer_mode": "Fixed",
                        "tcp_urgent_pointer_count": 16,
                        "tcp_urgent_pointer_step": 1,
                        "tcp_window": 9999,
                        "tcp_window_mode": "Fixed",
                        "tcp_window_count": 16,
                        "tcp_window_step": 1,
                        "total_pkts": 1,
                        "udp_length": 26,
                        "udp_length_mode": "Fixed",
                        "udp_length_count": 16,
                        "udp_length_step": 1,
                        "udp_checksum": "0000",
                        "udp_checksum_override": False,
                        "udp_checksum_mode": "Fixed",
                        "udp_checksum_count": 16,
                        "udp_checksum_step": 1,
                        "dns_enabled": False,
                        "dns_transaction_id": 0x1234,
                        "dns_transaction_id_mode": "Fixed",
                        "dns_transaction_id_count": 16,
                        "dns_transaction_id_step": 1,
                        "dns_flags": "0100",
                        "dns_flags_mode": "Fixed",
                        "dns_flags_count": 16,
                        "dns_flags_step": 1,
                        "dns_query_name": "example.com",
                        "dns_query_type": 1,
                        "dns_query_type_mode": "Fixed",
                        "dns_query_type_count": 16,
                        "dns_query_type_step": 1,
                        "dns_query_class": 1,
                        "dns_query_class_mode": "Fixed",
                        "dns_query_class_count": 16,
                        "dns_query_class_step": 1,
                        "dns_answer_enabled": False,
                        "dns_answer_ttl": 60,
                        "dns_answer_ttl_mode": "Fixed",
                        "dns_answer_ttl_count": 16,
                        "dns_answer_ttl_step": 1,
                        "dns_answer_ipv4": "192.0.2.1",
                        "dns_answer_ipv4_mode": "Fixed",
                        "dns_answer_ipv4_count": 16,
                        "dns_answer_ipv4_step": 1,
                        "dhcp_enabled": False,
                        "dhcp_operation": 1,
                        "dhcp_operation_mode": "Fixed",
                        "dhcp_operation_count": 2,
                        "dhcp_operation_step": 1,
                        "dhcp_hops": 0,
                        "dhcp_hops_mode": "Fixed",
                        "dhcp_hops_count": 16,
                        "dhcp_hops_step": 1,
                        "dhcp_seconds": 0,
                        "dhcp_seconds_mode": "Fixed",
                        "dhcp_seconds_count": 16,
                        "dhcp_seconds_step": 1,
                        "dhcp_message_type": 1,
                        "dhcp_message_type_mode": "Fixed",
                        "dhcp_message_type_count": 16,
                        "dhcp_message_type_step": 1,
                        "dhcp_xid": 0x3903F326,
                        "dhcp_xid_mode": "Fixed",
                        "dhcp_xid_count": 16,
                        "dhcp_xid_step": 1,
                        "dhcp_flags": "8000",
                        "dhcp_flags_mode": "Fixed",
                        "dhcp_flags_count": 16,
                        "dhcp_flags_step": 1,
                        "dhcp_client_ip": "0.0.0.0",
                        "dhcp_client_ip_mode": "Fixed",
                        "dhcp_client_ip_count": 16,
                        "dhcp_client_ip_step": 1,
                        "dhcp_your_ip": "0.0.0.0",
                        "dhcp_your_ip_mode": "Fixed",
                        "dhcp_your_ip_count": 16,
                        "dhcp_your_ip_step": 1,
                        "dhcp_server_ip": "0.0.0.0",
                        "dhcp_server_ip_mode": "Fixed",
                        "dhcp_server_ip_count": 16,
                        "dhcp_server_ip_step": 1,
                        "dhcp_relay_ip": "0.0.0.0",
                        "dhcp_relay_ip_mode": "Fixed",
                        "dhcp_relay_ip_count": 16,
                        "dhcp_relay_ip_step": 1,
                        "dhcp_client_mac": "00:11:22:33:44:55",
                        "dhcp_client_mac_mode": "Fixed",
                        "dhcp_client_mac_count": 16,
                        "dhcp_client_mac_step": 1,
                        "dhcp_hostname": "trex-webui",
                        "dhcp_requested_ip": "0.0.0.0",
                        "dhcp_requested_ip_mode": "Fixed",
                        "dhcp_requested_ip_count": 16,
                        "dhcp_requested_ip_step": 1,
                        "dhcp_server_id": "0.0.0.0",
                        "dhcp_server_id_mode": "Fixed",
                        "dhcp_server_id_count": 16,
                        "dhcp_server_id_step": 1,
                        "dhcp_parameter_request_list": "1,3,6,15,28,51,58,59",
                        "dhcp_lease_time": 0,
                        "dhcp_lease_time_mode": "Fixed",
                        "dhcp_lease_time_count": 16,
                        "dhcp_lease_time_step": 1,
                        "dhcp_renewal_time": 0,
                        "dhcp_renewal_time_mode": "Fixed",
                        "dhcp_renewal_time_count": 16,
                        "dhcp_renewal_time_step": 1,
                        "dhcp_rebinding_time": 0,
                        "dhcp_rebinding_time_mode": "Fixed",
                        "dhcp_rebinding_time_count": 16,
                        "dhcp_rebinding_time_step": 1,
                        "udp_length_override": False,
                        "vlan_cfi": 0,
                        "vlan_enabled": False,
                        "vlan_id": 0,
                        "vlan_id_count": 16,
                        "vlan_id_mode": "Fixed",
                        "vlan_id_step": 1,
                        "vlan_priority": 0,
                        "vlan_priority_count": 4,
                        "vlan_priority_mode": "Fixed",
                        "vlan_priority_step": 1,
                        "vlan_tpid": "8100",
                        "vlan_tpid_override": False,
                        "vlan2_cfi": 0,
                        "vlan2_enabled": False,
                        "vlan2_id": 1,
                        "vlan2_id_count": 16,
                        "vlan2_id_mode": "Fixed",
                        "vlan2_id_step": 1,
                        "vlan2_priority": 0,
                        "vlan2_priority_count": 4,
                        "vlan2_priority_mode": "Fixed",
                        "vlan2_priority_step": 1,
                        "vlan2_tpid": "8100",
                        "vlan2_tpid_override": False,
                    }
                ],
            },
        )
    ]


def test_workbench_export_yaml_preserves_tcp_flags_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="tcp-flags.yaml",
            streams=[
                {
                    "name": "tcp-flags",
                    "packet_type": "Ethernet/IPv4/TCP",
                    "tcp_flag_syn": True,
                    "tcp_flags_mode": "Increment",
                    "tcp_flags_count": 4,
                    "tcp_flags_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["tcp_flag_syn"] is True
    assert stream["tcp_flags_mode"] == "Increment"
    assert stream["tcp_flags_count"] == 4
    assert stream["tcp_flags_step"] == 1


def test_workbench_export_yaml_preserves_udp_length_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="udp-length.yaml",
            streams=[
                {
                    "name": "udp-length",
                    "packet_type": "Ethernet/IPv4/UDP",
                    "udp_length_override": True,
                    "udp_length": 64,
                    "udp_length_mode": "Increment",
                    "udp_length_count": 4,
                    "udp_length_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["udp_length_override"] is True
    assert stream["udp_length"] == 64
    assert stream["udp_length_mode"] == "Increment"
    assert stream["udp_length_count"] == 4
    assert stream["udp_length_step"] == 1


def test_workbench_export_yaml_preserves_udp_checksum_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="udp-checksum.yaml",
            streams=[
                {
                    "name": "udp-checksum",
                    "packet_type": "Ethernet/IPv4/UDP",
                    "udp_checksum_override": True,
                    "udp_checksum": "BEEF",
                    "udp_checksum_mode": "Increment",
                    "udp_checksum_count": 4,
                    "udp_checksum_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["udp_checksum_override"] is True
    assert stream["udp_checksum"] == "BEEF"
    assert stream["udp_checksum_mode"] == "Increment"
    assert stream["udp_checksum_count"] == 4
    assert stream["udp_checksum_step"] == 1


def test_workbench_export_yaml_preserves_dns_query_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="dns-query.yaml",
            streams=[
                {
                    "name": "dns-query",
                    "packet_type": "Ethernet/IPv4/UDP",
                    "l4_dst_port_override": True,
                    "l4_dst_port": 53,
                    "dns_enabled": True,
                    "dns_transaction_id": 0x1234,
                    "dns_transaction_id_mode": "Increment",
                    "dns_transaction_id_count": 4,
                    "dns_transaction_id_step": 1,
                    "dns_flags": "0100",
                    "dns_flags_mode": "Fixed",
                    "dns_flags_count": 16,
                    "dns_flags_step": 1,
                    "dns_query_name": "example.com",
                    "dns_query_type": 1,
                    "dns_query_type_mode": "Fixed",
                    "dns_query_type_count": 16,
                    "dns_query_type_step": 1,
                    "dns_query_class": 1,
                    "dns_query_class_mode": "Fixed",
                    "dns_query_class_count": 16,
                    "dns_query_class_step": 1,
                    "dns_answer_enabled": True,
                    "dns_answer_ttl": 60,
                    "dns_answer_ttl_mode": "Increment",
                    "dns_answer_ttl_count": 4,
                    "dns_answer_ttl_step": 5,
                    "dns_answer_ipv4": "192.0.2.10",
                    "dns_answer_ipv4_mode": "Increment Host",
                    "dns_answer_ipv4_count": 4,
                    "dns_answer_ipv4_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["dns_enabled"] is True
    assert stream["dns_transaction_id"] == 0x1234
    assert stream["dns_transaction_id_mode"] == "Increment"
    assert stream["dns_transaction_id_count"] == 4
    assert stream["dns_transaction_id_step"] == 1
    assert stream["dns_flags"] == "0100"
    assert stream["dns_flags_mode"] == "Fixed"
    assert stream["dns_flags_count"] == 16
    assert stream["dns_flags_step"] == 1
    assert stream["dns_query_name"] == "example.com"
    assert stream["dns_query_type"] == 1
    assert stream["dns_query_type_mode"] == "Fixed"
    assert stream["dns_query_type_count"] == 16
    assert stream["dns_query_type_step"] == 1
    assert stream["dns_query_class"] == 1
    assert stream["dns_query_class_mode"] == "Fixed"
    assert stream["dns_query_class_count"] == 16
    assert stream["dns_query_class_step"] == 1
    assert stream["dns_answer_enabled"] is True
    assert stream["dns_answer_ttl"] == 60
    assert stream["dns_answer_ttl_mode"] == "Increment"
    assert stream["dns_answer_ttl_count"] == 4
    assert stream["dns_answer_ttl_step"] == 5
    assert stream["dns_answer_ipv4"] == "192.0.2.10"
    assert stream["dns_answer_ipv4_mode"] == "Increment Host"
    assert stream["dns_answer_ipv4_count"] == 4
    assert stream["dns_answer_ipv4_step"] == 1


def test_workbench_export_yaml_preserves_dhcp_xid_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="dhcp-xid.yaml",
            streams=[
                {
                    "name": "dhcp-xid",
                    "packet_type": "Ethernet/IPv4/UDP",
                    "dhcp_enabled": True,
                    "dhcp_operation": 1,
                    "dhcp_operation_mode": "Increment",
                    "dhcp_operation_count": 2,
                    "dhcp_operation_step": 1,
                    "dhcp_hops": 1,
                    "dhcp_hops_mode": "Increment",
                    "dhcp_hops_count": 4,
                    "dhcp_hops_step": 1,
                    "dhcp_seconds": 10,
                    "dhcp_seconds_mode": "Increment",
                    "dhcp_seconds_count": 4,
                    "dhcp_seconds_step": 10,
                    "dhcp_message_type": 1,
                    "dhcp_message_type_mode": "Increment",
                    "dhcp_message_type_count": 4,
                    "dhcp_message_type_step": 1,
                    "dhcp_xid": 0x3903F326,
                    "dhcp_xid_mode": "Increment",
                    "dhcp_xid_count": 4,
                    "dhcp_xid_step": 1,
                    "dhcp_flags": "0000",
                    "dhcp_flags_mode": "Increment",
                    "dhcp_flags_count": 4,
                    "dhcp_flags_step": 1,
                    "dhcp_client_ip": "10.10.0.10",
                    "dhcp_client_ip_mode": "Increment Host",
                    "dhcp_client_ip_count": 4,
                    "dhcp_client_ip_step": 1,
                    "dhcp_your_ip": "10.10.0.20",
                    "dhcp_your_ip_mode": "Increment Host",
                    "dhcp_your_ip_count": 4,
                    "dhcp_your_ip_step": 1,
                    "dhcp_server_ip": "10.10.0.30",
                    "dhcp_server_ip_mode": "Increment Host",
                    "dhcp_server_ip_count": 4,
                    "dhcp_server_ip_step": 1,
                    "dhcp_relay_ip": "10.10.0.40",
                    "dhcp_relay_ip_mode": "Increment Host",
                    "dhcp_relay_ip_count": 4,
                    "dhcp_relay_ip_step": 1,
                    "dhcp_client_mac": "00:11:22:33:44:10",
                    "dhcp_client_mac_mode": "Increment",
                    "dhcp_client_mac_count": 4,
                    "dhcp_client_mac_step": 1,
                    "dhcp_hostname": "trex-webui",
                    "dhcp_requested_ip": "10.0.0.10",
                    "dhcp_requested_ip_mode": "Increment Host",
                    "dhcp_requested_ip_count": 4,
                    "dhcp_requested_ip_step": 1,
                    "dhcp_server_id": "10.0.0.1",
                    "dhcp_server_id_mode": "Increment Host",
                    "dhcp_server_id_count": 4,
                    "dhcp_server_id_step": 1,
                    "dhcp_parameter_request_list": "1,3,6,15,28,51,58,59",
                    "dhcp_lease_time": 3600,
                    "dhcp_lease_time_mode": "Increment",
                    "dhcp_lease_time_count": 4,
                    "dhcp_lease_time_step": 60,
                    "dhcp_renewal_time": 1800,
                    "dhcp_renewal_time_mode": "Increment",
                    "dhcp_renewal_time_count": 4,
                    "dhcp_renewal_time_step": 30,
                    "dhcp_rebinding_time": 3150,
                    "dhcp_rebinding_time_mode": "Increment",
                    "dhcp_rebinding_time_count": 4,
                    "dhcp_rebinding_time_step": 45,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["dhcp_enabled"] is True
    assert stream["dhcp_operation"] == 1
    assert stream["dhcp_operation_mode"] == "Increment"
    assert stream["dhcp_operation_count"] == 2
    assert stream["dhcp_operation_step"] == 1
    assert stream["dhcp_hops"] == 1
    assert stream["dhcp_hops_mode"] == "Increment"
    assert stream["dhcp_hops_count"] == 4
    assert stream["dhcp_hops_step"] == 1
    assert stream["dhcp_seconds"] == 10
    assert stream["dhcp_seconds_mode"] == "Increment"
    assert stream["dhcp_seconds_count"] == 4
    assert stream["dhcp_seconds_step"] == 10
    assert stream["dhcp_message_type"] == 1
    assert stream["dhcp_message_type_mode"] == "Increment"
    assert stream["dhcp_message_type_count"] == 4
    assert stream["dhcp_message_type_step"] == 1
    assert stream["dhcp_xid"] == 0x3903F326
    assert stream["dhcp_xid_mode"] == "Increment"
    assert stream["dhcp_xid_count"] == 4
    assert stream["dhcp_xid_step"] == 1
    assert stream["dhcp_flags"] == "0000"
    assert stream["dhcp_flags_mode"] == "Increment"
    assert stream["dhcp_flags_count"] == 4
    assert stream["dhcp_flags_step"] == 1
    assert stream["dhcp_client_ip"] == "10.10.0.10"
    assert stream["dhcp_client_ip_mode"] == "Increment Host"
    assert stream["dhcp_client_ip_count"] == 4
    assert stream["dhcp_client_ip_step"] == 1
    assert stream["dhcp_your_ip"] == "10.10.0.20"
    assert stream["dhcp_your_ip_mode"] == "Increment Host"
    assert stream["dhcp_your_ip_count"] == 4
    assert stream["dhcp_your_ip_step"] == 1
    assert stream["dhcp_server_ip"] == "10.10.0.30"
    assert stream["dhcp_server_ip_mode"] == "Increment Host"
    assert stream["dhcp_server_ip_count"] == 4
    assert stream["dhcp_server_ip_step"] == 1
    assert stream["dhcp_relay_ip"] == "10.10.0.40"
    assert stream["dhcp_relay_ip_mode"] == "Increment Host"
    assert stream["dhcp_relay_ip_count"] == 4
    assert stream["dhcp_relay_ip_step"] == 1
    assert stream["dhcp_client_mac"] == "00:11:22:33:44:10"
    assert stream["dhcp_client_mac_mode"] == "Increment"
    assert stream["dhcp_client_mac_count"] == 4
    assert stream["dhcp_client_mac_step"] == 1
    assert stream["dhcp_hostname"] == "trex-webui"
    assert stream["dhcp_requested_ip"] == "10.0.0.10"
    assert stream["dhcp_requested_ip_mode"] == "Increment Host"
    assert stream["dhcp_requested_ip_count"] == 4
    assert stream["dhcp_requested_ip_step"] == 1
    assert stream["dhcp_server_id"] == "10.0.0.1"
    assert stream["dhcp_server_id_mode"] == "Increment Host"
    assert stream["dhcp_server_id_count"] == 4
    assert stream["dhcp_server_id_step"] == 1
    assert stream["dhcp_lease_time"] == 3600
    assert stream["dhcp_lease_time_mode"] == "Increment"
    assert stream["dhcp_lease_time_count"] == 4
    assert stream["dhcp_lease_time_step"] == 60
    assert stream["dhcp_renewal_time"] == 1800
    assert stream["dhcp_renewal_time_mode"] == "Increment"
    assert stream["dhcp_renewal_time_count"] == 4
    assert stream["dhcp_renewal_time_step"] == 30
    assert stream["dhcp_rebinding_time"] == 3150
    assert stream["dhcp_rebinding_time_mode"] == "Increment"
    assert stream["dhcp_rebinding_time_count"] == 4
    assert stream["dhcp_rebinding_time_step"] == 45


def test_workbench_export_yaml_preserves_tcp_checksum_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="tcp-checksum.yaml",
            streams=[
                {
                    "name": "tcp-checksum",
                    "packet_type": "Ethernet/IPv4/TCP",
                    "tcp_checksum_override": True,
                    "tcp_checksum": "BEEF",
                    "tcp_checksum_mode": "Increment",
                    "tcp_checksum_count": 4,
                    "tcp_checksum_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["tcp_checksum_override"] is True
    assert stream["tcp_checksum"] == "BEEF"
    assert stream["tcp_checksum_mode"] == "Increment"
    assert stream["tcp_checksum_count"] == 4
    assert stream["tcp_checksum_step"] == 1


def test_workbench_export_yaml_preserves_tcp_options(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="tcp-options.yaml",
            streams=[
                {
                    "name": "tcp-options",
                    "packet_type": "Ethernet/IPv4/TCP",
                    "tcp_option_mss_enabled": True,
                    "tcp_option_mss": 1460,
                    "tcp_option_mss_mode": "Increment",
                    "tcp_option_mss_count": 4,
                    "tcp_option_mss_step": 1,
                    "tcp_option_window_scale_enabled": True,
                    "tcp_option_window_scale": 7,
                    "tcp_option_window_scale_mode": "Increment",
                    "tcp_option_window_scale_count": 4,
                    "tcp_option_window_scale_step": 1,
                    "tcp_option_sack_permitted_enabled": True,
                    "tcp_option_sack_blocks_enabled": True,
                    "tcp_option_sack_left_edge": 1000,
                    "tcp_option_sack_left_edge_mode": "Increment",
                    "tcp_option_sack_left_edge_count": 4,
                    "tcp_option_sack_left_edge_step": 1,
                    "tcp_option_sack_right_edge": 2000,
                    "tcp_option_sack_right_edge_mode": "Increment",
                    "tcp_option_sack_right_edge_count": 4,
                    "tcp_option_sack_right_edge_step": 1,
                    "tcp_option_timestamp_enabled": True,
                    "tcp_option_timestamp_value": 123456,
                    "tcp_option_timestamp_value_mode": "Increment",
                    "tcp_option_timestamp_value_count": 4,
                    "tcp_option_timestamp_value_step": 1,
                    "tcp_option_timestamp_echo": 654321,
                    "tcp_option_timestamp_echo_mode": "Increment",
                    "tcp_option_timestamp_echo_count": 4,
                    "tcp_option_timestamp_echo_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["tcp_option_mss_enabled"] is True
    assert stream["tcp_option_mss"] == 1460
    assert stream["tcp_option_mss_mode"] == "Increment"
    assert stream["tcp_option_mss_count"] == 4
    assert stream["tcp_option_mss_step"] == 1
    assert stream["tcp_option_window_scale_enabled"] is True
    assert stream["tcp_option_window_scale"] == 7
    assert stream["tcp_option_window_scale_mode"] == "Increment"
    assert stream["tcp_option_window_scale_count"] == 4
    assert stream["tcp_option_window_scale_step"] == 1
    assert stream["tcp_option_sack_permitted_enabled"] is True
    assert stream["tcp_option_sack_blocks_enabled"] is True
    assert stream["tcp_option_sack_left_edge"] == 1000
    assert stream["tcp_option_sack_left_edge_mode"] == "Increment"
    assert stream["tcp_option_sack_left_edge_count"] == 4
    assert stream["tcp_option_sack_left_edge_step"] == 1
    assert stream["tcp_option_sack_right_edge"] == 2000
    assert stream["tcp_option_sack_right_edge_mode"] == "Increment"
    assert stream["tcp_option_sack_right_edge_count"] == 4
    assert stream["tcp_option_sack_right_edge_step"] == 1
    assert stream["tcp_option_timestamp_enabled"] is True
    assert stream["tcp_option_timestamp_value"] == 123456
    assert stream["tcp_option_timestamp_value_mode"] == "Increment"
    assert stream["tcp_option_timestamp_value_count"] == 4
    assert stream["tcp_option_timestamp_value_step"] == 1
    assert stream["tcp_option_timestamp_echo"] == 654321
    assert stream["tcp_option_timestamp_echo_mode"] == "Increment"
    assert stream["tcp_option_timestamp_echo_count"] == 4
    assert stream["tcp_option_timestamp_echo_step"] == 1


def test_workbench_export_yaml_preserves_icmp_echo_fields(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="icmp-echo.yaml",
            streams=[
                {
                    "name": "icmp-echo",
                    "packet_type": "Ethernet/IPv4/ICMP",
                    "icmp_type": 8,
                    "icmp_code": 0,
                    "icmp_identifier": 4660,
                    "icmp_identifier_mode": "Increment",
                    "icmp_identifier_count": 4,
                    "icmp_identifier_step": 1,
                    "icmp_sequence": 7,
                    "icmp_sequence_mode": "Increment",
                    "icmp_sequence_count": 4,
                    "icmp_sequence_step": 1,
                    "icmp_checksum_override": True,
                    "icmp_checksum": "BEEF",
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["packet_type"] == "Ethernet/IPv4/ICMP"
    assert stream["icmp_type"] == 8
    assert stream["icmp_code"] == 0
    assert stream["icmp_identifier"] == 4660
    assert stream["icmp_identifier_mode"] == "Increment"
    assert stream["icmp_identifier_count"] == 4
    assert stream["icmp_identifier_step"] == 1
    assert stream["icmp_sequence"] == 7
    assert stream["icmp_sequence_mode"] == "Increment"
    assert stream["icmp_sequence_count"] == 4
    assert stream["icmp_sequence_step"] == 1
    assert stream["icmp_checksum_override"] is True
    assert stream["icmp_checksum"] == "BEEF"


def test_workbench_export_yaml_preserves_icmpv6_echo_fields(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="icmpv6-echo.yaml",
            streams=[
                {
                    "name": "icmpv6-echo",
                    "packet_type": "Ethernet/IPv6/ICMPv6",
                    "icmp_type": 128,
                    "icmp_type_mode": "Increment",
                    "icmp_type_count": 2,
                    "icmp_type_step": 1,
                    "icmp_code": 0,
                    "icmp_code_mode": "Increment",
                    "icmp_code_count": 4,
                    "icmp_code_step": 1,
                    "icmp_identifier": 4660,
                    "icmp_sequence": 7,
                    "icmp_checksum_override": True,
                    "icmp_checksum": "BEEF",
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert stream["icmp_type"] == 128
    assert stream["icmp_type_mode"] == "Increment"
    assert stream["icmp_type_count"] == 2
    assert stream["icmp_type_step"] == 1
    assert stream["icmp_code"] == 0
    assert stream["icmp_code_mode"] == "Increment"
    assert stream["icmp_code_count"] == 4
    assert stream["icmp_code_step"] == 1
    assert stream["icmp_identifier"] == 4660
    assert stream["icmp_sequence"] == 7
    assert stream["icmp_checksum_override"] is True
    assert stream["icmp_checksum"] == "BEEF"


def test_workbench_export_yaml_preserves_arp_fields(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="arp.yaml",
            streams=[
                {
                    "name": "arp-request",
                    "packet_type": "Ethernet/ARP",
                    "ether_dst": "ff:ff:ff:ff:ff:ff",
                    "ether_src": "00:11:22:33:44:55",
                    "arp_hardware_type": 1,
                    "arp_protocol_type": "0800",
                    "arp_hardware_size": 6,
                    "arp_protocol_size": 4,
                    "arp_operation": 1,
                    "arp_operation_mode": "Increment",
                    "arp_operation_count": 2,
                    "arp_operation_step": 1,
                    "arp_sender_mac": "00:11:22:33:44:55",
                    "arp_sender_mac_mode": "Increment",
                    "arp_sender_mac_count": 4,
                    "arp_sender_mac_step": 1,
                    "arp_sender_ip": "10.0.0.1",
                    "arp_sender_ip_mode": "Increment Host",
                    "arp_sender_ip_count": 4,
                    "arp_sender_ip_step": 1,
                    "arp_target_mac": "00:00:00:00:00:00",
                    "arp_target_mac_mode": "Random",
                    "arp_target_mac_count": 8,
                    "arp_target_mac_step": 1,
                    "arp_target_ip": "10.0.0.2",
                    "arp_target_ip_mode": "Random Host",
                    "arp_target_ip_count": 8,
                    "arp_target_ip_step": 1,
                    "flow_stats_enabled": True,
                    "latency_enabled": True,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["packet_type"] == "Ethernet/ARP"
    assert stream["flow_stats_enabled"] is True
    assert stream["latency_enabled"] is True
    assert stream["arp_hardware_type"] == 1
    assert stream["arp_protocol_type"] == "0800"
    assert stream["arp_hardware_size"] == 6
    assert stream["arp_protocol_size"] == 4
    assert stream["arp_operation"] == 1
    assert stream["arp_operation_mode"] == "Increment"
    assert stream["arp_operation_count"] == 2
    assert stream["arp_operation_step"] == 1
    assert stream["arp_sender_mac"] == "00:11:22:33:44:55"
    assert stream["arp_sender_mac_mode"] == "Increment"
    assert stream["arp_sender_mac_count"] == 4
    assert stream["arp_sender_mac_step"] == 1
    assert stream["arp_sender_ip"] == "10.0.0.1"
    assert stream["arp_sender_ip_mode"] == "Increment Host"
    assert stream["arp_sender_ip_count"] == 4
    assert stream["arp_sender_ip_step"] == 1
    assert stream["arp_target_mac"] == "00:00:00:00:00:00"
    assert stream["arp_target_mac_mode"] == "Random"
    assert stream["arp_target_mac_count"] == 8
    assert stream["arp_target_mac_step"] == 1
    assert stream["arp_target_ip"] == "10.0.0.2"
    assert stream["arp_target_ip_mode"] == "Random Host"
    assert stream["arp_target_ip_count"] == 8
    assert stream["arp_target_ip_step"] == 1


def test_workbench_export_yaml_preserves_ipv4_fragment_offset_field_engine(
    recording_service: RecordingStlService,
) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="ipv4-fragment-offset.yaml",
            streams=[
                {
                    "name": "ipv4-fragment-offset",
                    "packet_type": "Ethernet/IPv4/UDP",
                    "ipv4_flag_df": True,
                    "ipv4_flag_mf": True,
                    "ipv4_fragment_offset": 100,
                    "ipv4_fragment_offset_mode": "Increment",
                    "ipv4_fragment_offset_count": 4,
                    "ipv4_fragment_offset_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["ipv4_flag_df"] is True
    assert stream["ipv4_flag_mf"] is True
    assert stream["ipv4_fragment_offset"] == 100
    assert stream["ipv4_fragment_offset_mode"] == "Increment"
    assert stream["ipv4_fragment_offset_count"] == 4
    assert stream["ipv4_fragment_offset_step"] == 1


def test_workbench_export_yaml_preserves_gtpu_inner_field_engine(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_yaml(
        ProfileWorkbenchYamlExportRequest(
            profile_name="gtpu-inner-fe.yaml",
            streams=[
                {
                    "name": "gtpu-inner-fe",
                    "packet_type": "Ethernet/IPv4/UDP",
                    "gtpu_enabled": True,
                    "gtpu_teid": 0xABCDEF01,
                    "gtpu_teid_mode": "Increment",
                    "gtpu_teid_count": 4,
                    "gtpu_teid_step": 1,
                    "gtpu_sequence_enabled": True,
                    "gtpu_sequence": 7,
                    "gtpu_sequence_mode": "Increment",
                    "gtpu_sequence_count": 4,
                    "gtpu_sequence_step": 1,
                    "gtpu_npdu_enabled": True,
                    "gtpu_npdu": 3,
                    "gtpu_npdu_mode": "Increment",
                    "gtpu_npdu_count": 4,
                    "gtpu_npdu_step": 1,
                    "gtpu_extension_enabled": True,
                    "gtpu_extension_udp_port": 65000,
                    "gtpu_extension_udp_port_mode": "Increment",
                    "gtpu_extension_udp_port_count": 4,
                    "gtpu_extension_udp_port_step": 1,
                    "gtpu_inner_ip_version": "IPv4",
                    "gtpu_inner_ipv4_src": "10.9.0.1",
                    "gtpu_inner_ipv4_src_mode": "Increment Host",
                    "gtpu_inner_ipv4_src_count": 4,
                    "gtpu_inner_ipv4_src_step": 1,
                    "gtpu_inner_ipv4_dst": "10.9.0.2",
                    "gtpu_inner_ipv4_dst_mode": "Increment Host",
                    "gtpu_inner_ipv4_dst_count": 4,
                    "gtpu_inner_ipv4_dst_step": 1,
                    "gtpu_inner_ipv4_ttl": 40,
                    "gtpu_inner_ipv4_ttl_mode": "Increment",
                    "gtpu_inner_ipv4_ttl_count": 4,
                    "gtpu_inner_ipv4_ttl_step": 1,
                    "gtpu_inner_ipv6_src": "2001:db8:30::1",
                    "gtpu_inner_ipv6_src_mode": "Fixed",
                    "gtpu_inner_ipv6_src_count": 16,
                    "gtpu_inner_ipv6_src_step": 1,
                    "gtpu_inner_ipv6_dst": "2001:db8:30::2",
                    "gtpu_inner_ipv6_dst_mode": "Fixed",
                    "gtpu_inner_ipv6_dst_count": 16,
                    "gtpu_inner_ipv6_dst_step": 1,
                    "gtpu_inner_ipv6_hop_limit": 64,
                    "gtpu_inner_ipv6_hop_limit_mode": "Fixed",
                    "gtpu_inner_ipv6_hop_limit_count": 16,
                    "gtpu_inner_ipv6_hop_limit_step": 1,
                    "gtpu_inner_l4_src_port": 5000,
                    "gtpu_inner_l4_src_port_mode": "Increment",
                    "gtpu_inner_l4_src_port_count": 4,
                    "gtpu_inner_l4_src_port_step": 1,
                    "gtpu_inner_l4_dst_port": 6000,
                    "gtpu_inner_l4_dst_port_mode": "Increment",
                    "gtpu_inner_l4_dst_port_count": 4,
                    "gtpu_inner_l4_dst_port_step": 1,
                }
            ],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls[0][0] == "export_workbench_profile_yaml"
    stream = recording_service.calls[0][1]["streams"][0]
    assert stream["gtpu_enabled"] is True
    assert stream["gtpu_teid"] == 0xABCDEF01
    assert stream["gtpu_teid_mode"] == "Increment"
    assert stream["gtpu_sequence_enabled"] is True
    assert stream["gtpu_sequence_mode"] == "Increment"
    assert stream["gtpu_npdu_enabled"] is True
    assert stream["gtpu_npdu_mode"] == "Increment"
    assert stream["gtpu_extension_enabled"] is True
    assert stream["gtpu_extension_udp_port"] == 65000
    assert stream["gtpu_extension_udp_port_mode"] == "Increment"
    assert stream["gtpu_inner_ipv4_src_mode"] == "Increment Host"
    assert stream["gtpu_inner_ipv4_dst_mode"] == "Increment Host"
    assert stream["gtpu_inner_ipv4_ttl_mode"] == "Increment"
    assert stream["gtpu_inner_l4_src_port_mode"] == "Increment"
    assert stream["gtpu_inner_l4_dst_port_mode"] == "Increment"


def test_workbench_export_pcap_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_export_pcap(
        ProfileWorkbenchPcapExportRequest(
            stream={"name": "stream", "packet_type": "Ethernet/IPv4/TCP"},
            file_name="stream.pcap",
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert payload["data"]["file_name"] == "stream.pcap"
    assert recording_service.calls == [
        (
            "export_workbench_stream_pcap",
            {
                "stream": {
                    "name": "stream",
                    "packet_type": "Ethernet/IPv4/TCP",
                    "frame_length_type": "Fixed",
                    "frame_length": 64,
                    "frame_length_min": 64,
                    "frame_length_max": 1518,
                    "mode": "continuous",
                    "rate_type": "pps",
                    "rate_value": 1.0,
                    "enabled": True,
                    "self_start": True,
                    "total_pkts": 1,
                    "pkts_per_burst": 1,
                    "count": 1,
                    "next_stream_id": None,
                    "action_count": 0,
                    "isg": 0.0,
                    "ibg": 0.0,
                    "icmp_checksum": "0000",
                    "icmp_checksum_override": False,
                    "icmp_code": 0,
                    "icmp_code_mode": "Fixed",
                    "icmp_code_count": 16,
                    "icmp_code_step": 1,
                    "icmp_identifier": 1,
                    "icmp_identifier_mode": "Fixed",
                    "icmp_identifier_count": 16,
                    "icmp_identifier_step": 1,
                    "icmp_sequence": 1,
                    "icmp_sequence_mode": "Fixed",
                    "icmp_sequence_count": 16,
                    "icmp_sequence_step": 1,
                    "icmp_type": 8,
                    "icmp_type_mode": "Fixed",
                    "icmp_type_count": 16,
                    "icmp_type_step": 1,
                    "icmpv6_nd_target": "2001:db8::2",
                    "icmpv6_nd_include_option": True,
                    "icmpv6_nd_option_mac": "00:00:00:00:00:00",
                    "icmpv6_nd_na_router": False,
                    "icmpv6_nd_na_solicited": True,
                    "icmpv6_nd_na_override": True,
                    "icmpv6_rs_include_slla": True,
                    "icmpv6_rs_slla_mac": "00:00:00:00:00:00",
                    "icmpv6_ra_cur_hop_limit": 64,
                    "icmpv6_ra_managed": False,
                    "icmpv6_ra_other": False,
                    "icmpv6_ra_router_lifetime": 1800,
                    "icmpv6_ra_reachable_time": 0,
                    "icmpv6_ra_retrans_timer": 0,
                    "icmpv6_ra_include_slla": True,
                    "icmpv6_ra_slla_mac": "00:00:00:00:00:00",
                    "icmpv6_ra_include_prefix": True,
                    "icmpv6_ra_prefix": "2001:db8:1::",
                    "icmpv6_ra_prefix_length": 64,
                    "icmpv6_ra_prefix_on_link": True,
                    "icmpv6_ra_prefix_autonomous": True,
                    "icmpv6_ra_prefix_valid_lifetime": 2592000,
                    "icmpv6_ra_prefix_preferred_lifetime": 604800,
                    "pg_id": 1,
                    "flow_stats_enabled": True,
                    "latency_enabled": False,
                    "ether_dst": "00:00:00:00:00:00",
                    "ether_dst_mode": "TRex Config",
                    "ether_dst_count": 16,
                    "ether_dst_step": 1,
                    "ether_src": "00:00:00:00:00:00",
                    "ether_type_override": False,
                    "ether_type": "0800",
                    "ether_src_mode": "TRex Config",
                    "ether_src_count": 16,
                    "ether_src_step": 1,
                    "arp_hardware_type": 1,
                    "arp_protocol_type": "0800",
                    "arp_hardware_size": 6,
                    "arp_protocol_size": 4,
                    "arp_operation": 1,
                    "arp_operation_mode": "Fixed",
                    "arp_operation_count": 4,
                    "arp_operation_step": 1,
                    "arp_sender_mac": "00:00:00:00:00:00",
                    "arp_sender_mac_mode": "Fixed",
                    "arp_sender_mac_count": 16,
                    "arp_sender_mac_step": 1,
                    "arp_sender_ip": "16.0.0.1",
                    "arp_sender_ip_mode": "Fixed",
                    "arp_sender_ip_count": 16,
                    "arp_sender_ip_step": 1,
                    "arp_target_mac": "00:00:00:00:00:00",
                    "arp_target_mac_mode": "Fixed",
                    "arp_target_mac_count": 16,
                    "arp_target_mac_step": 1,
                    "arp_target_ip": "48.0.0.1",
                    "arp_target_ip_mode": "Fixed",
                    "arp_target_ip_count": 16,
                    "arp_target_ip_step": 1,
                    "vlan_enabled": False,
                    "vlan_tpid_override": False,
                    "vlan_tpid": "8100",
                    "vlan_priority": 0,
                    "vlan_priority_mode": "Fixed",
                    "vlan_priority_count": 4,
                    "vlan_priority_step": 1,
                    "vlan_cfi": 0,
                    "vlan_id": 0,
                    "vlan_id_mode": "Fixed",
                    "vlan_id_count": 16,
                    "vlan_id_step": 1,
                    "vlan2_enabled": False,
                    "vlan2_tpid_override": False,
                    "vlan2_tpid": "8100",
                    "vlan2_priority": 0,
                    "vlan2_priority_mode": "Fixed",
                    "vlan2_priority_count": 4,
                    "vlan2_priority_step": 1,
                    "vlan2_cfi": 0,
                    "vlan2_id": 1,
                    "vlan2_id_mode": "Fixed",
                    "vlan2_id_count": 16,
                    "vlan2_id_step": 1,
                    "mpls_enabled": False,
                    "mpls_label": 17,
                    "mpls_label_count": 16,
                    "mpls_label_mode": "Fixed",
                    "mpls_label_step": 1,
                    "mpls_tc": 0,
                    "mpls_tc_mode": "Fixed",
                    "mpls_tc_count": 4,
                    "mpls_tc_step": 1,
                    "mpls_ttl": 255,
                    "mpls_ttl_mode": "Fixed",
                    "mpls_ttl_count": 16,
                    "mpls_ttl_step": 1,
                    "mpls_label2_enabled": False,
                    "mpls_label2": 18,
                    "mpls_label2_mode": "Fixed",
                    "mpls_label2_count": 16,
                    "mpls_label2_step": 1,
                    "mpls_label2_tc": 0,
                    "mpls_label2_tc_mode": "Fixed",
                    "mpls_label2_tc_count": 4,
                    "mpls_label2_tc_step": 1,
                    "mpls_label2_ttl": 255,
                    "mpls_label2_ttl_mode": "Fixed",
                    "mpls_label2_ttl_count": 16,
                    "mpls_label2_ttl_step": 1,
                    "mpls_label3_enabled": False,
                    "mpls_label3": 19,
                    "mpls_label3_mode": "Fixed",
                    "mpls_label3_count": 16,
                    "mpls_label3_step": 1,
                    "mpls_label3_tc": 0,
                    "mpls_label3_tc_mode": "Fixed",
                    "mpls_label3_tc_count": 4,
                    "mpls_label3_tc_step": 1,
                    "mpls_label3_ttl": 255,
                    "mpls_label3_ttl_mode": "Fixed",
                    "mpls_label3_ttl_count": 16,
                    "mpls_label3_ttl_step": 1,
                    "vxlan_enabled": False,
                    "vxlan_vni": 42,
                    "vxlan_vni_mode": "Fixed",
                    "vxlan_vni_count": 16,
                    "vxlan_vni_step": 1,
                    "vxlan_inner_ether_dst": "00:00:00:00:00:00",
                    "vxlan_inner_ether_src": "00:00:00:00:00:00",
                    "vxlan_inner_ip_version": "IPv4",
                    "vxlan_inner_ipv4_src": "10.0.0.1",
                    "vxlan_inner_ipv4_src_mode": "Fixed",
                    "vxlan_inner_ipv4_src_count": 16,
                    "vxlan_inner_ipv4_src_step": 1,
                    "vxlan_inner_ipv4_dst": "10.0.0.2",
                    "vxlan_inner_ipv4_dst_mode": "Fixed",
                    "vxlan_inner_ipv4_dst_count": 16,
                    "vxlan_inner_ipv4_dst_step": 1,
                    "vxlan_inner_ipv4_ttl": 127,
                    "vxlan_inner_ipv4_ttl_mode": "Fixed",
                    "vxlan_inner_ipv4_ttl_count": 16,
                    "vxlan_inner_ipv4_ttl_step": 1,
                    "vxlan_inner_ipv6_src": "2001:db8:50::1",
                    "vxlan_inner_ipv6_src_mode": "Fixed",
                    "vxlan_inner_ipv6_src_count": 16,
                    "vxlan_inner_ipv6_src_step": 1,
                    "vxlan_inner_ipv6_dst": "2001:db8:50::2",
                    "vxlan_inner_ipv6_dst_mode": "Fixed",
                    "vxlan_inner_ipv6_dst_count": 16,
                    "vxlan_inner_ipv6_dst_step": 1,
                    "vxlan_inner_ipv6_hop_limit": 64,
                    "vxlan_inner_ipv6_hop_limit_mode": "Fixed",
                    "vxlan_inner_ipv6_hop_limit_count": 16,
                    "vxlan_inner_ipv6_hop_limit_step": 1,
                    "vxlan_inner_l4_src_port": 1025,
                    "vxlan_inner_l4_src_port_mode": "Fixed",
                    "vxlan_inner_l4_src_port_count": 16,
                    "vxlan_inner_l4_src_port_step": 1,
                    "vxlan_inner_l4_dst_port": 12,
                    "vxlan_inner_l4_dst_port_mode": "Fixed",
                    "vxlan_inner_l4_dst_port_count": 16,
                    "vxlan_inner_l4_dst_port_step": 1,
                    "gtpu_enabled": False,
                    "gtpu_message_type": 255,
                    "gtpu_teid": 0x12345678,
                    "gtpu_teid_mode": "Fixed",
                    "gtpu_teid_count": 16,
                    "gtpu_teid_step": 1,
                    "gtpu_sequence_enabled": False,
                    "gtpu_sequence": 0,
                    "gtpu_sequence_mode": "Fixed",
                    "gtpu_sequence_count": 16,
                    "gtpu_sequence_step": 1,
                    "gtpu_npdu_enabled": False,
                    "gtpu_npdu": 0,
                    "gtpu_npdu_mode": "Fixed",
                    "gtpu_npdu_count": 16,
                    "gtpu_npdu_step": 1,
                    "gtpu_extension_enabled": False,
                    "gtpu_extension_udp_port": 2152,
                    "gtpu_extension_udp_port_mode": "Fixed",
                    "gtpu_extension_udp_port_count": 16,
                    "gtpu_extension_udp_port_step": 1,
                    "gtpu_inner_ip_version": "IPv4",
                    "gtpu_inner_ipv4_src": "10.3.0.1",
                    "gtpu_inner_ipv4_src_mode": "Fixed",
                    "gtpu_inner_ipv4_src_count": 16,
                    "gtpu_inner_ipv4_src_step": 1,
                    "gtpu_inner_ipv4_dst": "10.3.0.2",
                    "gtpu_inner_ipv4_dst_mode": "Fixed",
                    "gtpu_inner_ipv4_dst_count": 16,
                    "gtpu_inner_ipv4_dst_step": 1,
                    "gtpu_inner_ipv4_ttl": 64,
                    "gtpu_inner_ipv4_ttl_mode": "Fixed",
                    "gtpu_inner_ipv4_ttl_count": 16,
                    "gtpu_inner_ipv4_ttl_step": 1,
                    "gtpu_inner_ipv6_src": "2001:db8:30::1",
                    "gtpu_inner_ipv6_src_mode": "Fixed",
                    "gtpu_inner_ipv6_src_count": 16,
                    "gtpu_inner_ipv6_src_step": 1,
                    "gtpu_inner_ipv6_dst": "2001:db8:30::2",
                    "gtpu_inner_ipv6_dst_mode": "Fixed",
                    "gtpu_inner_ipv6_dst_count": 16,
                    "gtpu_inner_ipv6_dst_step": 1,
                    "gtpu_inner_ipv6_hop_limit": 64,
                    "gtpu_inner_ipv6_hop_limit_mode": "Fixed",
                    "gtpu_inner_ipv6_hop_limit_count": 16,
                    "gtpu_inner_ipv6_hop_limit_step": 1,
                    "gtpu_inner_l4_src_port": 1025,
                    "gtpu_inner_l4_src_port_mode": "Fixed",
                    "gtpu_inner_l4_src_port_count": 16,
                    "gtpu_inner_l4_src_port_step": 1,
                    "gtpu_inner_l4_dst_port": 12,
                    "gtpu_inner_l4_dst_port_mode": "Fixed",
                    "gtpu_inner_l4_dst_port_count": 16,
                    "gtpu_inner_l4_dst_port_step": 1,
                    "gre_checksum_present": False,
                    "gre_checksum_override": False,
                    "gre_checksum": "0000",
                    "gre_key_present": False,
                    "gre_key": 0,
                    "gre_key_mode": "Fixed",
                    "gre_key_count": 16,
                    "gre_key_step": 1,
                    "gre_sequence_present": False,
                    "gre_sequence": 0,
                    "gre_sequence_mode": "Fixed",
                    "gre_sequence_count": 16,
                    "gre_sequence_step": 1,
                    "gre_protocol_type": "0800",
                    "gre_inner_ip_version": "IPv4",
                    "gre_inner_ipv4_src": "10.2.0.1",
                    "gre_inner_ipv4_src_mode": "Fixed",
                    "gre_inner_ipv4_src_count": 16,
                    "gre_inner_ipv4_src_step": 1,
                    "gre_inner_ipv4_dst": "10.2.0.2",
                    "gre_inner_ipv4_dst_mode": "Fixed",
                    "gre_inner_ipv4_dst_count": 16,
                    "gre_inner_ipv4_dst_step": 1,
                    "gre_inner_ipv4_ttl": 64,
                    "gre_inner_ipv4_ttl_mode": "Fixed",
                    "gre_inner_ipv4_ttl_count": 16,
                    "gre_inner_ipv4_ttl_step": 1,
                    "gre_inner_ipv6_src": "2001:db8:40::1",
                    "gre_inner_ipv6_src_mode": "Fixed",
                    "gre_inner_ipv6_src_count": 16,
                    "gre_inner_ipv6_src_step": 1,
                    "gre_inner_ipv6_dst": "2001:db8:40::2",
                    "gre_inner_ipv6_dst_mode": "Fixed",
                    "gre_inner_ipv6_dst_count": 16,
                    "gre_inner_ipv6_dst_step": 1,
                    "gre_inner_ipv6_hop_limit": 64,
                    "gre_inner_ipv6_hop_limit_mode": "Fixed",
                    "gre_inner_ipv6_hop_limit_count": 16,
                    "gre_inner_ipv6_hop_limit_step": 1,
                    "gre_inner_l4_src_port": 1025,
                    "gre_inner_l4_src_port_mode": "Fixed",
                    "gre_inner_l4_src_port_count": 16,
                    "gre_inner_l4_src_port_step": 1,
                    "gre_inner_l4_dst_port": 12,
                    "gre_inner_l4_dst_port_mode": "Fixed",
                    "gre_inner_l4_dst_port_count": 16,
                    "gre_inner_l4_dst_port_step": 1,
                    "sctp_verification_tag": 0x12345678,
                    "sctp_verification_tag_mode": "Fixed",
                    "sctp_verification_tag_count": 16,
                    "sctp_verification_tag_step": 1,
                    "sctp_checksum_override": False,
                    "sctp_checksum": "00000000",
                    "sctp_data_flags": 3,
                    "sctp_data_flags_mode": "Fixed",
                    "sctp_data_flags_count": 16,
                    "sctp_data_flags_step": 1,
                    "sctp_tsn": 1,
                    "sctp_tsn_mode": "Fixed",
                    "sctp_tsn_count": 16,
                    "sctp_tsn_step": 1,
                    "sctp_stream_id": 0,
                    "sctp_stream_id_mode": "Fixed",
                    "sctp_stream_id_count": 16,
                    "sctp_stream_id_step": 1,
                    "sctp_stream_sequence": 0,
                    "sctp_stream_sequence_mode": "Fixed",
                    "sctp_stream_sequence_count": 16,
                    "sctp_stream_sequence_step": 1,
                    "sctp_payload_protocol_id": 0,
                    "sctp_payload_protocol_id_mode": "Fixed",
                    "sctp_payload_protocol_id_count": 16,
                    "sctp_payload_protocol_id_step": 1,
                    "ipv4_src": "16.0.0.1",
                    "ipv4_src_mode": "Fixed",
                    "ipv4_src_count": 16,
                    "ipv4_src_step": 1,
                    "ipv4_dst": "48.0.0.1",
                    "ipv4_dst_mode": "Fixed",
                    "ipv4_dst_count": 16,
                    "ipv4_dst_step": 1,
                    "ipv4_dscp": 0,
                    "ipv4_dscp_mode": "Fixed",
                    "ipv4_dscp_count": 16,
                    "ipv4_dscp_step": 1,
                    "ipv4_ecn": 0,
                    "ipv4_ecn_mode": "Fixed",
                    "ipv4_ecn_count": 4,
                    "ipv4_ecn_step": 1,
                    "ipv4_id": 1234,
                    "ipv4_id_mode": "Fixed",
                    "ipv4_id_count": 16,
                    "ipv4_id_step": 1,
                    "ipv4_flag_df": False,
                    "ipv4_flag_mf": False,
                    "ipv4_fragment_offset": 0,
                    "ipv4_fragment_offset_mode": "Fixed",
                    "ipv4_fragment_offset_count": 16,
                    "ipv4_fragment_offset_step": 1,
                    "ipv4_ttl": 127,
                    "ipv4_ttl_mode": "Fixed",
                    "ipv4_ttl_count": 16,
                    "ipv4_ttl_step": 1,
                    "ipv4_checksum_override": False,
                    "ipv4_checksum": "0000",
                    "ipv6_dst": "2001:db8::2",
                    "ipv6_dst_mode": "Fixed",
                    "ipv6_dst_count": 16,
                    "ipv6_dst_step": 1,
                    "ipv6_flow_label": 0,
                    "ipv6_flow_label_mode": "Fixed",
                    "ipv6_flow_label_count": 16,
                    "ipv6_flow_label_step": 1,
                    "ipv6_hop_limit": 127,
                    "ipv6_hop_limit_mode": "Fixed",
                    "ipv6_hop_limit_count": 16,
                    "ipv6_hop_limit_step": 1,
                    "ipv6_src": "2001:db8::1",
                    "ipv6_src_mode": "Fixed",
                    "ipv6_src_count": 16,
                    "ipv6_src_step": 1,
                    "ipv6_traffic_class": 0,
                    "ipv6_traffic_class_mode": "Fixed",
                    "ipv6_traffic_class_count": 16,
                    "ipv6_traffic_class_step": 1,
                    "l4_src_port_override": False,
                    "l4_src_port": 1025,
                    "l4_src_port_mode": "Fixed",
                    "l4_src_port_count": 16,
                    "l4_src_port_step": 1,
                    "l4_dst_port_override": False,
                    "l4_dst_port": 12,
                    "l4_dst_port_mode": "Fixed",
                    "l4_dst_port_count": 16,
                    "l4_dst_port_step": 1,
                    "udp_length_override": False,
                    "udp_length": 26,
                    "udp_length_mode": "Fixed",
                    "udp_length_count": 16,
                    "udp_length_step": 1,
                    "udp_checksum_override": False,
                    "udp_checksum": "0000",
                    "udp_checksum_mode": "Fixed",
                    "udp_checksum_count": 16,
                    "udp_checksum_step": 1,
                    "dns_enabled": False,
                    "dns_transaction_id": 0x1234,
                    "dns_transaction_id_mode": "Fixed",
                    "dns_transaction_id_count": 16,
                    "dns_transaction_id_step": 1,
                    "dns_flags": "0100",
                    "dns_flags_mode": "Fixed",
                    "dns_flags_count": 16,
                    "dns_flags_step": 1,
                    "dns_query_name": "example.com",
                    "dns_query_type": 1,
                    "dns_query_type_mode": "Fixed",
                    "dns_query_type_count": 16,
                    "dns_query_type_step": 1,
                    "dns_query_class": 1,
                    "dns_query_class_mode": "Fixed",
                    "dns_query_class_count": 16,
                    "dns_query_class_step": 1,
                    "dns_answer_enabled": False,
                    "dns_answer_ttl": 60,
                    "dns_answer_ttl_mode": "Fixed",
                    "dns_answer_ttl_count": 16,
                    "dns_answer_ttl_step": 1,
                    "dns_answer_ipv4": "192.0.2.1",
                    "dns_answer_ipv4_mode": "Fixed",
                    "dns_answer_ipv4_count": 16,
                    "dns_answer_ipv4_step": 1,
                    "dhcp_enabled": False,
                    "dhcp_operation": 1,
                    "dhcp_operation_mode": "Fixed",
                    "dhcp_operation_count": 2,
                    "dhcp_operation_step": 1,
                    "dhcp_hops": 0,
                    "dhcp_hops_mode": "Fixed",
                    "dhcp_hops_count": 16,
                    "dhcp_hops_step": 1,
                    "dhcp_seconds": 0,
                    "dhcp_seconds_mode": "Fixed",
                    "dhcp_seconds_count": 16,
                    "dhcp_seconds_step": 1,
                    "dhcp_message_type": 1,
                    "dhcp_message_type_mode": "Fixed",
                    "dhcp_message_type_count": 16,
                    "dhcp_message_type_step": 1,
                    "dhcp_xid": 0x3903F326,
                    "dhcp_xid_mode": "Fixed",
                    "dhcp_xid_count": 16,
                    "dhcp_xid_step": 1,
                    "dhcp_flags": "8000",
                    "dhcp_flags_mode": "Fixed",
                    "dhcp_flags_count": 16,
                    "dhcp_flags_step": 1,
                    "dhcp_client_ip": "0.0.0.0",
                    "dhcp_client_ip_mode": "Fixed",
                    "dhcp_client_ip_count": 16,
                    "dhcp_client_ip_step": 1,
                    "dhcp_your_ip": "0.0.0.0",
                    "dhcp_your_ip_mode": "Fixed",
                    "dhcp_your_ip_count": 16,
                    "dhcp_your_ip_step": 1,
                    "dhcp_server_ip": "0.0.0.0",
                    "dhcp_server_ip_mode": "Fixed",
                    "dhcp_server_ip_count": 16,
                    "dhcp_server_ip_step": 1,
                    "dhcp_relay_ip": "0.0.0.0",
                    "dhcp_relay_ip_mode": "Fixed",
                    "dhcp_relay_ip_count": 16,
                    "dhcp_relay_ip_step": 1,
                    "dhcp_client_mac": "00:11:22:33:44:55",
                    "dhcp_client_mac_mode": "Fixed",
                    "dhcp_client_mac_count": 16,
                    "dhcp_client_mac_step": 1,
                    "dhcp_hostname": "trex-webui",
                    "dhcp_requested_ip": "0.0.0.0",
                    "dhcp_requested_ip_mode": "Fixed",
                    "dhcp_requested_ip_count": 16,
                    "dhcp_requested_ip_step": 1,
                    "dhcp_server_id": "0.0.0.0",
                    "dhcp_server_id_mode": "Fixed",
                    "dhcp_server_id_count": 16,
                    "dhcp_server_id_step": 1,
                    "dhcp_parameter_request_list": "1,3,6,15,28,51,58,59",
                    "dhcp_lease_time": 0,
                    "dhcp_lease_time_mode": "Fixed",
                    "dhcp_lease_time_count": 16,
                    "dhcp_lease_time_step": 1,
                    "dhcp_renewal_time": 0,
                    "dhcp_renewal_time_mode": "Fixed",
                    "dhcp_renewal_time_count": 16,
                    "dhcp_renewal_time_step": 1,
                    "dhcp_rebinding_time": 0,
                    "dhcp_rebinding_time_mode": "Fixed",
                    "dhcp_rebinding_time_count": 16,
                    "dhcp_rebinding_time_step": 1,
                    "advanced_cache_size_type": "Auto",
                    "advanced_cache_value": 5000,
                    "advanced_mode": False,
                    "advanced_vm": None,
                    "packet_binary_base64": None,
                    "packet_meta_base64": None,
                    "packet_model": None,
                    "payload_enabled": True,
                    "payload_pattern": "00",
                    "payload_type": "Fixed Word",
                    "tcp_sequence_number": 1234567,
                    "tcp_sequence_mode": "Fixed",
                    "tcp_sequence_count": 16,
                    "tcp_sequence_step": 1,
                    "tcp_ack_number": 7654321,
                    "tcp_ack_mode": "Fixed",
                    "tcp_ack_count": 16,
                    "tcp_ack_step": 1,
                    "tcp_window": 9999,
                    "tcp_window_mode": "Fixed",
                    "tcp_window_count": 16,
                    "tcp_window_step": 1,
                    "tcp_checksum_override": False,
                    "tcp_checksum": "ABCD",
                    "tcp_checksum_mode": "Fixed",
                    "tcp_checksum_count": 16,
                    "tcp_checksum_step": 1,
                    "tcp_option_mss_enabled": False,
                    "tcp_option_mss": 1460,
                    "tcp_option_mss_mode": "Fixed",
                    "tcp_option_mss_count": 16,
                    "tcp_option_mss_step": 1,
                    "tcp_option_window_scale_enabled": False,
                    "tcp_option_window_scale": 7,
                    "tcp_option_window_scale_mode": "Fixed",
                    "tcp_option_window_scale_count": 16,
                    "tcp_option_window_scale_step": 1,
                    "tcp_option_sack_permitted_enabled": False,
                    "tcp_option_sack_blocks_enabled": False,
                    "tcp_option_sack_left_edge": 1000,
                    "tcp_option_sack_left_edge_mode": "Fixed",
                    "tcp_option_sack_left_edge_count": 16,
                    "tcp_option_sack_left_edge_step": 1,
                    "tcp_option_sack_right_edge": 2000,
                    "tcp_option_sack_right_edge_mode": "Fixed",
                    "tcp_option_sack_right_edge_count": 16,
                    "tcp_option_sack_right_edge_step": 1,
                    "tcp_option_timestamp_enabled": False,
                    "tcp_option_timestamp_value": 1,
                    "tcp_option_timestamp_value_mode": "Fixed",
                    "tcp_option_timestamp_value_count": 16,
                    "tcp_option_timestamp_value_step": 1,
                    "tcp_option_timestamp_echo": 0,
                    "tcp_option_timestamp_echo_mode": "Fixed",
                    "tcp_option_timestamp_echo_count": 16,
                    "tcp_option_timestamp_echo_step": 1,
                    "tcp_urgent_pointer": 1111,
                    "tcp_urgent_pointer_mode": "Fixed",
                    "tcp_urgent_pointer_count": 16,
                    "tcp_urgent_pointer_step": 1,
                    "tcp_flags_mode": "Fixed",
                    "tcp_flags_count": 16,
                    "tcp_flags_step": 1,
                    "tcp_flag_urg": False,
                    "tcp_flag_ack": False,
                    "tcp_flag_psh": False,
                    "tcp_flag_rst": False,
                    "tcp_flag_syn": False,
                    "tcp_flag_fin": False,
                },
                "file_name": "stream.pcap",
            },
        )
    ]


def test_workbench_import_pcap_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_profile_workbench_import_pcap(
        ProfileWorkbenchPcapImportRequest(
            file_name="stream.pcap",
            content_base64="1MOyoQ==",
            max_packets=8,
            options={
                "name_prefix": "trace",
                "rate_mode": "speedup",
                "speedup": 2,
                "ipg": 1,
                "loop_count": 3,
            },
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert payload["data"]["packet_count"] == 1
    assert recording_service.calls == [
        (
            "import_workbench_pcap",
            {
                "file_name": "stream.pcap",
                "content_base64": "1MOyoQ==",
                "max_packets": 8,
                "options": {
                    "name_prefix": "trace",
                    "rewrite_src_enabled": False,
                    "src_address": "16.0.0.1",
                    "src_mode": "Fixed",
                    "src_count": 16,
                    "rewrite_dst_enabled": False,
                    "dst_address": "48.0.0.1",
                    "dst_mode": "Fixed",
                    "dst_count": 16,
                    "rate_mode": "speedup",
                    "speedup": 2.0,
                    "ipg": 1.0,
                    "loop_count": 3,
                },
            },
        )
    ]


def test_force_acquire_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = acquire_ports(AcquirePortsRequest(ports=[0], force=True), service=recording_service)

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_force_acquire_calls_service_after_confirmation(recording_service: RecordingStlService) -> None:
    payload = acquire_ports(
        AcquirePortsRequest(ports=[0], force=True, confirmation="force-acquire"),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        ("acquire", {"ports": [0], "force": True, "sync_streams": True})
    ]


def test_release_calls_service_without_confirmation(recording_service: RecordingStlService) -> None:
    payload = release_ports(PortsRequest(ports=[1]), service=recording_service)

    assert payload["ok"] is True
    assert recording_service.calls == [("release", [1])]


def test_reset_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = reset_ports(ResetPortsRequest(ports=[0]), service=recording_service)

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_service_mode_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = set_ports_service_mode(
        ServiceModeRequest(ports=[0], enabled=True),
        service=recording_service,
    )

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_service_mode_calls_service_after_confirmation(recording_service: RecordingStlService) -> None:
    payload = set_ports_service_mode(
        ServiceModeRequest(ports=[0], enabled=True, filtered=True, mask=255, confirmation="service-mode"),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        ("service_mode", {"ports": [0], "enabled": True, "filtered": True, "mask": 255})
    ]


def test_port_attribute_calls_service(recording_service: RecordingStlService) -> None:
    payload = set_ports_attribute(
        PortAttributeRequest(ports=[0], attribute="multicast", value=True),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        ("port_attribute", {"ports": [0], "attribute": "multicast", "value": True})
    ]


def test_link_down_attribute_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = set_ports_attribute(
        PortAttributeRequest(ports=[0], attribute="link", value=False),
        service=recording_service,
    )

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_link_down_attribute_calls_service_after_confirmation(recording_service: RecordingStlService) -> None:
    payload = set_ports_attribute(
        PortAttributeRequest(ports=[0], attribute="link", value=False, confirmation="port-attribute"),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        ("port_attribute", {"ports": [0], "attribute": "link", "value": False})
    ]


def test_port_configuration_apply_calls_service(recording_service: RecordingStlService) -> None:
    payload = apply_port_configuration(
        PortLayerConfigurationRequest(
            port=0,
            mode="L3",
            l3_source="1.1.1.1",
            l3_destination="2.2.2.2",
            vlan=[100],
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "configure_port_layer",
            {
                "port": 0,
                "mode": "L3",
                "l2_destination": None,
                "l3_source": "1.1.1.1",
                "l3_destination": "2.2.2.2",
                "vlan": [100],
            },
        )
    ]


def test_port_configuration_rejects_more_than_two_vlans() -> None:
    with pytest.raises(ValidationError):
        PortLayerConfigurationRequest(port=0, mode="L2", l2_destination="00:00:00:00:00:01", vlan=[1, 2, 3])


def test_arp_resolve_calls_service(recording_service: RecordingStlService) -> None:
    payload = resolve_ports_arp(
        PortArpResolveRequest(ports=[0], retries=2, vlan=[100]),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [("resolve_arp", {"ports": [0], "retries": 2, "vlan": [100]})]


def test_ipv6_scan_calls_service(recording_service: RecordingStlService) -> None:
    payload = scan_ports_ipv6(
        PortIpv6ScanRequest(ports=[0], timeout_seconds=5),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [("scan_ipv6_neighbors", {"ports": [0], "timeout_seconds": 5.0})]


def test_ping_from_port_calls_service(recording_service: RecordingStlService) -> None:
    payload = ping_from_port(
        PortPingRequest(port=0, destination="2.2.2.2", pkt_size=128, count=2, interval_sec=0),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "ping",
            {
                "port": 0,
                "destination": "2.2.2.2",
                "pkt_size": 128,
                "count": 2,
                "interval_sec": 0.0,
                "vlan": None,
            },
        )
    ]


def test_capture_status_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_capture_status(service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["captures"][0]["id"] == 3
    assert recording_service.calls == [("capture_status", None)]


def test_start_capture_calls_service(recording_service: RecordingStlService) -> None:
    payload = start_packet_capture(
        CaptureStartRequest(tx_ports=[0], rx_ports=[1], limit=64, mode="cyclic", bpf_filter="icmp", snaplen=128),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "start_capture",
            {
                "tx_ports": [0],
                "rx_ports": [1],
                "limit": 64,
                "mode": "cyclic",
                "bpf_filter": "icmp",
                "snaplen": 128,
            },
        )
    ]


def test_start_capture_rejects_server_memory_limit_above_hard_cap() -> None:
    with pytest.raises(ValidationError):
        CaptureStartRequest(tx_ports=[0], limit=10_001)


def test_fetch_capture_calls_service(recording_service: RecordingStlService) -> None:
    payload = fetch_packet_capture(
        CaptureFetchRequest(capture_id=3, pkt_count=32, fetch_limit=16, snaplen=64),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        ("fetch_capture", {"capture_id": 3, "pkt_count": 32, "fetch_limit": 16, "snaplen": 64})
    ]


def test_stop_capture_calls_service(recording_service: RecordingStlService) -> None:
    payload = stop_packet_capture(
        CaptureStopRequest(capture_id=3, pkt_count=32, save_pcap=True, file_name="unit.pcap", snaplen=64),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "stop_capture",
            {"capture_id": 3, "pkt_count": 32, "save_pcap": True, "file_name": "unit.pcap", "snaplen": 64},
        )
    ]


def test_remove_all_captures_calls_service(recording_service: RecordingStlService) -> None:
    payload = remove_packet_captures(service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["removed_ids"] == [3]
    assert recording_service.calls == [("remove_all_captures", None)]


def test_remove_capture_calls_service(recording_service: RecordingStlService) -> None:
    payload = remove_packet_capture(CaptureRemoveRequest(capture_id=3), service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["removed_ids"] == [3]
    assert recording_service.calls == [("remove_capture", 3)]


def test_capture_files_endpoint_calls_service(recording_service: RecordingStlService) -> None:
    payload = packet_capture_files(service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["files"][0]["name"] == "unit.pcap"
    assert recording_service.calls == [("list_capture_files", None)]


def test_download_capture_file_calls_service(recording_service: RecordingStlService) -> None:
    payload = download_packet_capture_file(CaptureFileRequest(file_name="unit.pcap"), service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["file"]["content_base64"] == "1MOyoQ=="
    assert recording_service.calls == [("download_capture_file", "unit.pcap")]


def test_open_capture_file_calls_service(recording_service: RecordingStlService) -> None:
    payload = open_packet_capture_file(CaptureFileRequest(file_name="unit.pcap"), service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["pid"] == 1234
    assert recording_service.calls == [("open_capture_file", "unit.pcap")]


def test_run_reports_endpoint_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_run_reports(service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["files"][0]["name"] == "run.json"
    assert recording_service.calls == [("list_run_reports", None)]


def test_run_report_trends_endpoint_calls_service(recording_service: RecordingStlService) -> None:
    payload = trex_run_report_trends(limit=12, service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["total"] == 1
    assert payload["data"]["verdict_counts"]["pass"] == 1
    assert recording_service.calls == [("run_report_trends", 12)]


def test_save_run_report_calls_service(recording_service: RecordingStlService) -> None:
    payload = save_trex_run_report(
        RunReportSaveRequest(
            title="Run",
            markdown="# Run",
            payload={"ports": [0, 1]},
            file_name="run.json",
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert payload["data"]["file"]["name"] == "run.json"
    assert recording_service.calls == [
        (
            "save_run_report",
            {
                "title": "Run",
                "markdown": "# Run",
                "payload": {"ports": [0, 1]},
                "file_name": "run.json",
                "traffic_session_id": None,
                "traffic_session_revision": None,
            },
        )
    ]


def test_run_report_session_binding_requires_id_and_revision_together() -> None:
    with pytest.raises(ValidationError, match="must be supplied together"):
        RunReportSaveRequest(
            title="Run",
            markdown="# Run",
            traffic_session_id="session-1",
        )


def test_download_run_report_calls_service(recording_service: RecordingStlService) -> None:
    payload = download_trex_run_report(RunReportFileRequest(file_name="run.json"), service=recording_service)

    assert payload["ok"] is True
    assert payload["data"]["file"]["content"] == "{\"title\":\"Run\"}"
    assert recording_service.calls == [("download_run_report", "run.json")]


def test_stop_traffic_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = traffic_action("stop", PortsRequest(ports=[0]), service=recording_service)

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_start_traffic_requires_confirmation(recording_service: RecordingStlService) -> None:
    payload = start_traffic(
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
            multiplier="10mbps",
            expected_session_id=None,
        ),
        service=recording_service,
    )

    assert payload["blocker"] == "confirmation_required"
    assert recording_service.calls == []


def test_start_traffic_calls_service_after_confirmation(recording_service: RecordingStlService) -> None:
    payload = start_traffic(
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
            expected_session_id=None,
            multiplier="10mbps",
            duration=30,
            force=True,
            confirmation="start-traffic",
            tunables={"size": 128},
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "start_profile",
            {
                "profile_path": "udp_1pkt_simple.py",
                "ports": [0],
                "multiplier": "10mbps",
                "duration": 30,
                "force": True,
                "total": False,
                "synchronized": False,
                "clear_existing": True,
                "tunables": {"size": 128},
                "expected_session_id": None,
            },
        )
    ]


def test_start_traffic_group_forwards_expected_session_id(
    recording_service: RecordingStlService,
) -> None:
    payload = start_traffic_group(
        "pair-1",
        TrafficGroupStartRequest(
            plan_revision=3,
            expected_session_id="session-123",
            confirmation="start-traffic",
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "start_traffic_group",
            {
                "group_id": "pair-1",
                "expected_revision": 3,
                "expected_session_id": "session-123",
            },
        )
    ]


def test_start_requests_normalize_and_forward_bounded_utc_hard_stop(
    recording_service: RecordingStlService,
) -> None:
    deadline = datetime.now(timezone.utc) + timedelta(seconds=60)
    offset_form = deadline.isoformat()
    canonical = deadline.isoformat().replace("+00:00", "Z")

    direct = start_traffic(
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
            expected_session_id=None,
            confirmation="start-traffic",
            hard_stop_at=offset_form,
        ),
        service=recording_service,
    )
    grouped = start_traffic_group(
        "pair-0",
        TrafficGroupStartRequest(
            plan_revision=4,
            expected_session_id=None,
            confirmation="start-traffic",
            hard_stop_at=offset_form,
        ),
        service=recording_service,
    )

    assert direct["ok"] is True
    assert grouped["ok"] is True
    assert recording_service.calls[0][1]["hard_stop_at"] == canonical
    assert recording_service.calls[1][1]["hard_stop_at"] == canonical

    with pytest.raises(ValidationError, match="future"):
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
            expected_session_id=None,
            hard_stop_at=(
                datetime.now(timezone.utc) - timedelta(seconds=1)
            ).isoformat(),
        )
    with pytest.raises(ValidationError, match="maximum"):
        TrafficGroupStartRequest(
            plan_revision=4,
            expected_session_id=None,
            hard_stop_at=(
                datetime.now(timezone.utc) + timedelta(seconds=301)
            ).isoformat(),
        )
    with pytest.raises(ValidationError, match="absolute UTC"):
        TrafficGroupStartRequest(
            plan_revision=4,
            expected_session_id=None,
            hard_stop_at="2026-07-31T12:00:00",
        )


def test_update_traffic_calls_service(recording_service: RecordingStlService) -> None:
    payload = update_traffic(
        UpdateTrafficRequest(
            ports=[0, 1],
            multiplier="100%",
            force=True,
            total=True,
            expected_session_id="session-123",
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "update_traffic",
            {
                "ports": [0, 1],
                "multiplier": "100%",
                "force": True,
                "total": True,
                "expected_session_id": "session-123",
            },
        )
    ]


def test_traffic_mutation_requests_require_session_cas() -> None:
    with pytest.raises(ValidationError):
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
        )
    with pytest.raises(ValidationError):
        TrafficGroupStartRequest(plan_revision=1)
    with pytest.raises(ValidationError):
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
            expected_session_id="",
        )
    with pytest.raises(ValidationError):
        TrafficGroupStartRequest(
            plan_revision=1,
            expected_session_id="",
        )
    with pytest.raises(ValidationError):
        TrafficPortsRequest(ports=[0])
    with pytest.raises(ValidationError):
        UpdateTrafficRequest(
            ports=[0, 1],
            multiplier="100%",
            force=False,
            total=False,
        )
    assert (
        StartTrafficRequest(
            ports=[0],
            profile_path="udp_1pkt_simple.py",
            expected_session_id=None,
        ).expected_session_id
        is None
    )
    assert (
        TrafficGroupStartRequest(
            plan_revision=1,
            expected_session_id=None,
        ).expected_session_id
        is None
    )


def test_traffic_action_forwards_expected_session_id(
    recording_service: RecordingStlService,
) -> None:
    payload = traffic_action(
        "pause",
        TrafficPortsRequest(
            ports=[0],
            expected_session_id="session-123",
        ),
        service=recording_service,
    )

    assert payload["ok"] is True
    assert recording_service.calls == [
        (
            "traffic",
            {
                "action": "pause",
                "ports": [0],
                "expected_session_id": "session-123",
            },
        )
    ]


def test_config_render_endpoint() -> None:
    payload = render_config(
        TrexConfig(
            port_limit=2,
            interfaces=["03:00.0", "03:00.1"],
            port_info=[
                {"ip": "1.1.1.1", "default_gw": "2.2.2.2"},
                {"ip": "2.2.2.2", "default_gw": "1.1.1.1"},
            ],
        )
    )

    assert "port_limit: 2" in payload["yaml"]
    assert payload["config"]["interfaces"] == ["03:00.0", "03:00.1"]


def test_daemon_preview_rejects_unknown_action() -> None:
    with pytest.raises(HTTPException) as exc_info:
        daemon_preview("delete-everything")

    assert exc_info.value.status_code == 400


def test_daemon_preview_marks_restart_confirmation() -> None:
    payload = daemon_preview("restart")

    assert payload["action"] == "restart"
    assert payload["command"][-1] == "restart"
    assert payload["requires_confirmation"] is True


def test_daemon_action_requires_confirmation_before_command_execution() -> None:
    payload = daemon_action("restart", DaemonActionRequest())

    assert payload["ok"] is False
    assert payload["command"][-1] == "restart"
    assert payload["returncode"] == 400
    assert payload["blocker"] == "confirmation_required"


def test_daemon_action_passes_start_timeout(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    daemon_bin = scripts_dir / "trex_daemon_server"
    daemon_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(scripts_dir))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(daemon_bin))

    payload = daemon_action("start", DaemonActionRequest(timeout_seconds=40))

    assert payload["command"][-1] == "start"
    assert "confirmation_required" not in str(payload)


def test_daemon_action_serializes_start_timeout_recovery(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeRuntimeManager:
        def __init__(self, environment: object) -> None:
            self.environment = environment

        def run_daemon_action(
            self,
            action: str,
            confirmation: str | None,
            timeout_seconds: int | None,
        ) -> CommandResult:
            assert action == "start"
            assert confirmation is None
            assert timeout_seconds == 20
            return CommandResult(
                ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "start"],
                0,
                "TRex server daemon is running\n",
                "daemon start timed out before returning; status check reports running",
                recovered_from_timeout=True,
            )

    monkeypatch.setattr("app.main.RuntimeManager", FakeRuntimeManager)

    payload = daemon_action("start", DaemonActionRequest(timeout_seconds=20))

    assert payload["ok"] is True
    assert payload["blocker"] is None
    assert payload["recovered_from_timeout"] is True


def test_daemon_status_endpoint_reports_real_command_result(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(tmp_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(tmp_path / "missing-daemon"))
    monkeypatch.setattr(
        "app.trex.runtime.httpx_rpc_caller",
        lambda url, payload, timeout: {"jsonrpc": "2.0", "id": payload["id"], "result": True},
    )

    payload = daemon_status()

    assert payload["command"][-1] == "show"
    assert payload["running"] is True
    assert payload["ok"] is True
    assert payload["source"] == "daemon:connectivity_check"
    assert payload["command_executed"] is False
    assert payload["returncode"] is None
    assert payload["stderr"] == ""
    assert payload["blocker"] is None


def test_daemon_overview_reports_real_files_and_previews(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    config_path = tmp_path / "trex_cfg.yaml"
    log_path = tmp_path / "trex_daemon_server.log"
    config_path.write_text("port_limit: 2\n", encoding="utf-8")
    log_path.write_text("daemon booted\n", encoding="utf-8")
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(scripts_dir))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(scripts_dir / "missing-daemon"))
    monkeypatch.setenv("TREX_WEBUI_TREX_CONFIG_PATH", str(config_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_LOG", str(log_path))
    monkeypatch.setattr(
        "app.trex.runtime.httpx_rpc_caller",
        lambda url, payload, timeout: {"jsonrpc": "2.0", "id": payload["id"], "result": False},
    )

    payload = daemon_overview()

    assert payload["environment"]["config_path"] == str(config_path)
    assert payload["previews"]["restart"]["requires_confirmation"] is True
    assert payload["status"]["blocker"] == "daemon_unreachable"
    assert payload["status"]["command_executed"] is False
    assert payload["status"]["returncode"] is None
    assert payload["config"]["content"] == "port_limit: 2\n"
    assert payload["log"]["content"] == "daemon booted\n"


def test_daemon_default_config_endpoint_uses_real_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "cG9ydF9saW1pdDogMgo="}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_default_config()

    assert payload["ok"] is True
    assert payload["content"] == "port_limit: 2\n"


def test_daemon_config_version_endpoints_save_load_diff_and_list(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    daemon_bin = scripts_dir / "trex_daemon_server"
    daemon_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    config_path = tmp_path / "trex_cfg.yaml"
    log_path = tmp_path / "trex_daemon_server.log"
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(scripts_dir))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(daemon_bin))
    monkeypatch.setenv("TREX_WEBUI_TREX_CONFIG_PATH", str(config_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_LOG", str(log_path))

    saved = daemon_config_version_save(
        DaemonConfigVersionSaveRequest(
            config_content="port_limit: 2\n",
            source="manual",
            note="api candidate",
        )
    )

    assert saved["ok"] is True
    version = saved["version"]
    assert isinstance(version, dict)
    assert version["source"] == "manual"
    assert version["note"] == "api candidate"

    versions = daemon_config_versions(50)
    assert versions["ok"] is True
    assert versions["versions"] == [version]

    loaded = daemon_config_version_load(DaemonConfigVersionLoadRequest(name=str(version["name"])))
    assert loaded["ok"] is True
    assert loaded["content"] == "port_limit: 2\n"

    diff = daemon_config_version_diff(
        DaemonConfigVersionDiffRequest(
            name=str(version["name"]),
            config_content="port_limit: 4\n",
        )
    )
    assert diff["ok"] is True
    assert "-port_limit: 2\n" in str(diff["diff"])
    assert "+port_limit: 4\n" in str(diff["diff"])

    config_path.write_text("port_limit: 8\n", encoding="utf-8")
    restored = daemon_config_version_restore(
        DaemonConfigVersionRestoreRequest(
            name=str(version["name"]),
            confirmation="restore-config",
        )
    )
    assert restored["ok"] is True
    assert restored["restored"] is True
    assert config_path.read_text(encoding="utf-8") == "port_limit: 2\n"
    assert isinstance(restored["before_version"], dict)
    assert restored["audit_written"] is True

    audit = daemon_config_audit(50)
    assert audit["ok"] is True
    assert audit["records"]
    assert audit["records"][0]["restored_name"] == version["name"]


def test_daemon_config_metadata_endpoint_uses_real_rpc_methods(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [{"id": "interfaces", "name": "interfaces", "type": "STRING"}],
            }
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"0000:02:00.0": {"driver": "i40e"}}}
        raise AssertionError(f"unexpected method {payload['method']}")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_config_metadata()

    assert payload["ok"] is True
    assert payload["metadata"] == [{"id": "interfaces", "name": "interfaces", "type": "STRING"}]
    assert payload["devices_info"] == {"0000:02:00.0": {"driver": "i40e"}}
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_config_metadata_endpoint_rejects_invalid_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not metadata fields"}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_config_metadata()

    assert payload["ok"] is False
    assert payload["blocker"] == "daemon_metadata_result_invalid"
    assert payload["metadata"] is None
    assert payload["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_config_metadata_endpoint_rejects_invalid_devices_info(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [{"id": "interfaces", "name": "interfaces", "type": "STRING"}],
            }
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "not devices info"}
        raise AssertionError(f"unexpected method {payload['method']}")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_config_metadata()

    assert payload["ok"] is True
    assert payload["blocker"] == "daemon_devices_info_result_invalid"
    assert payload["metadata"] == [{"id": "interfaces", "name": "interfaces", "type": "STRING"}]
    assert payload["devices_info"] is None
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_devices_info_endpoint_uses_real_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"0000:02:00.0": {"Driver_str": "i40e"}}}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_devices_info()

    assert payload["ok"] is True
    assert payload["devices_info"] == {"0000:02:00.0": {"Driver_str": "i40e"}}


def test_daemon_files_endpoint_uses_real_rpc_methods(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex_files"}
        if payload["method"] == "get_files_list":
            assert payload["params"] == {"path": "/tmp/trex_files"}
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [[], ["unit.log"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_files(None)

    assert payload["ok"] is True
    assert payload["path"] == "/tmp/trex_files"
    assert payload["files"] == ["unit.log"]
    assert calls == ["get_files_path", "get_files_list"]


def test_daemon_files_endpoint_passes_requested_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files/subdir"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [["child"], []]}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_files("/tmp/trex_files/subdir")

    assert payload["ok"] is True
    assert payload["path"] == "/tmp/trex_files/subdir"
    assert payload["directories"] == ["child"]


def test_daemon_files_endpoint_rejects_relative_requested_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("relative requested files path should be rejected before daemon RPC")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_files("tmp/trex_files")

    assert payload["ok"] is False
    assert payload["blocker"] == "daemon_files_path_invalid"
    assert payload["error"] == "files path must be absolute"


def test_daemon_file_content_endpoint_uses_real_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_file"
        assert payload["params"] == {"filepath": "/tmp/trex_files/unit.log"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "dW5pdCBsb2cK"}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_file_content("/tmp/trex_files/unit.log", max_bytes=32)

    assert payload["ok"] is True
    assert payload["path"] == "/tmp/trex_files/unit.log"
    assert payload["content"] == "unit log\n"
    assert payload["content_base64"] == "dW5pdCBsb2cK"


def test_daemon_file_content_endpoint_rejects_relative_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("relative file content path should be rejected before daemon RPC")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_file_content("tmp/trex_files/unit.log", max_bytes=32)

    assert payload["ok"] is False
    assert payload["blocker"] == "daemon_file_path_invalid"
    assert payload["error"] == "file path must be absolute"
    assert payload["content"] == ""
    assert payload["content_base64"] == ""


def test_daemon_file_content_endpoint_rejects_invalid_direct_max_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid max_bytes should be rejected before daemon RPC")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_file_content("/tmp/trex_files/unit.log", max_bytes=0)

    assert payload["ok"] is False
    assert payload["blocker"] == "daemon_file_max_bytes_invalid"
    assert payload["content"] == ""
    assert payload["content_base64"] == ""


def test_daemon_request_models_reuse_runtime_limits() -> None:
    action_request = DaemonActionRequest(timeout_seconds=DAEMON_COMMAND_TIMEOUT_MAX_SECONDS)
    start_request = DaemonTrexStartRequest(
        config_content="x" * DAEMON_CONFIG_MAX_BYTES,
        timeout_seconds=DAEMON_COMMAND_TIMEOUT_MAX_SECONDS,
    )
    version_save_request = DaemonConfigVersionSaveRequest(
        config_content="x" * DAEMON_CONFIG_MAX_BYTES,
        source="x" * 32,
        note="x" * 240,
    )
    reservation_request = DaemonTrexReservationRequest(user="x" * DAEMON_RESERVATION_USER_MAX_CHARS)

    assert action_request.timeout_seconds == DAEMON_COMMAND_TIMEOUT_MAX_SECONDS
    assert start_request.config_content is not None
    assert len(start_request.config_content) == DAEMON_CONFIG_MAX_BYTES
    assert start_request.timeout_seconds == DAEMON_COMMAND_TIMEOUT_MAX_SECONDS
    assert version_save_request.config_content is not None
    assert len(version_save_request.config_content) == DAEMON_CONFIG_MAX_BYTES
    assert reservation_request.user is not None
    assert len(reservation_request.user) == DAEMON_RESERVATION_USER_MAX_CHARS

    with pytest.raises(ValidationError):
        DaemonTrexStartRequest(config_content="x" * (DAEMON_CONFIG_MAX_BYTES + 1))
    with pytest.raises(ValidationError):
        DaemonConfigVersionSaveRequest(config_content="x" * (DAEMON_CONFIG_MAX_BYTES + 1))
    with pytest.raises(ValidationError):
        DaemonConfigVersionSaveRequest(source="x" * 33)
    with pytest.raises(ValidationError):
        DaemonConfigVersionSaveRequest(note="x" * 241)
    with pytest.raises(ValidationError):
        DaemonActionRequest(timeout_seconds=DAEMON_COMMAND_TIMEOUT_MAX_SECONDS + 1)
    with pytest.raises(ValidationError):
        DaemonTrexStartRequest(timeout_seconds=DAEMON_COMMAND_TIMEOUT_MAX_SECONDS + 1)
    with pytest.raises(ValidationError):
        DaemonTrexReservationRequest(user="x" * (DAEMON_RESERVATION_USER_MAX_CHARS + 1))


def test_daemon_trex_start_endpoint_requires_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: (_ for _ in ()).throw(AssertionError("missing confirmation must not disconnect STL")),
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("daemon TRex start should require confirmation before RPC")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_start(DaemonTrexStartRequest(config_content="port_limit: 2\n", timeout_seconds=40))

    assert payload["ok"] is False
    assert payload["blocker"] == "confirmation_required"


def test_daemon_trex_start_endpoint_uses_daemon_rpc_sequence_after_confirmation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "unit/user")
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    daemon_bin = scripts_dir / "trex_daemon_server"
    daemon_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(scripts_dir))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(daemon_bin))
    monkeypatch.setenv("TREX_WEBUI_TREX_CONFIG_PATH", str(tmp_path / "trex_cfg.yaml"))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_LOG", str(tmp_path / "trex_daemon_server.log"))
    calls: list[str] = []
    lifecycle_calls: list[bool] = []
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: lifecycle_calls.append(True)
        or TrexCallResult(True, data={"disconnected": True, "stats_sampler_closed": True}),
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if payload["method"] == "start_trex":
            assert timeout == 45.0
            params = payload["params"]
            assert isinstance(params, dict)
            assert params["timeout"] == 40
            assert params["user"] == "unit/user"
            assert params["trex_cmd_options"] == {"cfg": "/tmp/trex-files/unit_user-8d1a6db7c5b1.yaml"}
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 17}
        raise AssertionError(f"unexpected method {payload['method']}")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_start(
        DaemonTrexStartRequest(
            confirmation="start-trex",
            config_content="port_limit: 2\n",
            timeout_seconds=40,
        )
    )

    assert payload["ok"] is True
    assert payload["user"] == "unit/user"
    assert payload["config_filename"] == "unit_user-8d1a6db7c5b1.yaml"
    assert payload["timeout_seconds"] == 40
    assert payload["sequence"] == 17
    assert calls == ["push_file", "get_files_path", "start_trex"]
    assert lifecycle_calls == [True]
    assert payload["stl_disconnect"]["ok"] is True


@pytest.mark.parametrize(
    "blocker",
    [
        "traffic_hard_stop_priority",
        "traffic_hard_stop_window_insufficient",
    ],
)
def test_daemon_trex_start_redacts_hard_stop_scheduler_evidence(
    blocker: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "unit")
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    daemon_bin = scripts_dir / "trex_daemon_server"
    daemon_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(scripts_dir))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(daemon_bin))
    monkeypatch.setenv(
        "TREX_WEBUI_TREX_CONFIG_PATH",
        str(tmp_path / "trex_cfg.yaml"),
    )
    monkeypatch.setenv(
        "TREX_WEBUI_TREX_DAEMON_LOG",
        str(tmp_path / "trex_daemon_server.log"),
    )
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: TrexCallResult(
            False,
            data={
                "rpc_count": 8,
                "remaining_seconds": 12.0,
                "required_seconds": 25.0,
            },
            blocker=blocker,
            error="TRex RPC is deferred for the hard-stop supervisor",
        ),
    )
    calls: list[str] = []

    def rpc_caller(
        url: str,
        payload: dict[str, object],
        timeout: float,
    ) -> dict[str, object]:
        method = str(payload["method"])
        calls.append(method)
        if method == "push_file":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": True,
            }
        if method == "get_files_path":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": "/tmp/trex-files",
            }
        raise AssertionError(
            "start_trex must not run after lifecycle blocker"
        )

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_start(
        DaemonTrexStartRequest(
            confirmation="start-trex",
            config_content="port_limit: 2\n",
            timeout_seconds=40,
        )
    )

    assert payload["ok"] is False
    assert payload["blocker"] == blocker
    assert payload["stl_disconnect"]["data"] is None
    assert payload["stl_disconnect"]["blocker"] == blocker
    assert calls == ["push_file", "get_files_path"]


def test_daemon_trex_status_endpoint_uses_daemon_rpc_status_methods(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if payload["method"] == "get_trex_cmds":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [["123", "./_t-rex-64"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_status()

    assert payload["ok"] is True
    assert payload["running"] is True
    assert payload["status"] == {"state": 3, "verbose": "Running"}
    assert calls == ["is_running", "get_running_status", "get_trex_cmds"]


def test_daemon_trex_status_endpoint_rejects_invalid_status(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "running"}
        raise AssertionError(f"unexpected method {payload['method']}")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_status()

    assert payload["ok"] is False
    assert payload["running"] is True
    assert payload["status"] is None
    assert payload["commands"] is None
    assert payload["blocker"] == "daemon_running_status_result_invalid"
    assert calls == ["is_running", "get_running_status"]


def test_daemon_trex_version_endpoint_uses_daemon_rpc_version_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_version"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "VmVyc2lvbiA6IHVuaXQK"}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_version()

    assert payload["ok"] is True
    assert payload["version"] == "Version : unit"


def test_daemon_trex_log_endpoint_uses_daemon_rpc_log_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_log"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "VFJleCBsb2cK"}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_log()

    assert payload["ok"] is True
    assert payload["content"] == "TRex log\n"


def test_daemon_trex_running_info_endpoint_uses_daemon_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_running_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '{"queue_full": 0}'}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_running_info()

    assert payload["ok"] is True
    assert payload["data"] == {"queue_full": 0}


def test_daemon_trex_latest_dump_endpoint_uses_daemon_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_latest_dump"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '{"trex-global": {"data": {}}}'}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_latest_dump()

    assert payload["ok"] is True
    assert payload["data"] == {"trex-global": {"data": {}}}


def test_daemon_trex_reservation_endpoint_uses_daemon_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "is_reserved"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_reservation()

    assert payload["ok"] is True
    assert payload["reserved"] is False


def test_daemon_trex_reserve_endpoint_uses_daemon_rpc_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "reserve_trex"
        assert payload["params"] == {"user": "unit-user"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_reserve(DaemonTrexReservationRequest(user="unit-user"))

    assert payload["ok"] is True
    assert payload["reserved"] is True


def test_daemon_trex_cancel_reservation_endpoint_uses_daemon_rpc_method(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "cancel_reservation"
        assert payload["params"] == {"user": "unit-user"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_cancel_reservation(DaemonTrexReservationRequest(user="unit-user"))

    assert payload["ok"] is True
    assert payload["canceled"] is True


def test_daemon_trex_stop_endpoint_requires_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.main.disconnect_stl_service_for_trex_termination",
        lambda: (_ for _ in ()).throw(AssertionError("missing confirmation must not disconnect STL")),
    )
    monkeypatch.setattr(
        "app.main.retire_traffic_after_trex_termination",
        lambda: (_ for _ in ()).throw(AssertionError("missing confirmation must not retire traffic")),
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("daemon TRex stop should require confirmation before RPC")

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_stop(DaemonTrexStopRequest())

    assert payload["ok"] is False
    assert payload["blocker"] == "confirmation_required"


def test_daemon_trex_stop_endpoint_uses_force_trex_kill_after_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[str] = []
    monkeypatch.setattr(
        "app.main.disconnect_stl_service_for_trex_termination",
        lambda: events.append("disconnect_stl") or TrexCallResult(True, data={"disconnected": True}),
    )
    monkeypatch.setattr(
        "app.main.retire_traffic_after_trex_termination",
        lambda: events.append("retire_traffic")
        or TrexCallResult(True, data={"retired": True}),
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        events.append(str(payload["method"]))
        assert payload["method"] == "force_trex_kill"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_stop(DaemonTrexStopRequest(confirmation="stop-trex"))

    assert payload["ok"] is True
    assert payload["stopped"] is True
    assert payload["traffic_retirement"]["ok"] is True
    assert events == ["disconnect_stl", "force_trex_kill", "retire_traffic"]


def test_daemon_trex_stop_uses_termination_lifecycle_during_hard_stop_priority(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    monkeypatch.setattr(
        "app.main.disconnect_stl_service_for_trex_termination",
        lambda: events.append("priority_disconnect")
        or TrexCallResult(True, data={"disconnected": True}),
    )
    monkeypatch.setattr(
        "app.main.retire_traffic_after_trex_termination",
        lambda: events.append("retire_traffic")
        or TrexCallResult(True, data={"retired": True}),
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        events.append(str(payload["method"]))
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    monkeypatch.setattr(
        "app.trex.runtime.httpx_rpc_caller",
        rpc_caller,
    )

    payload = daemon_trex_stop(
        DaemonTrexStopRequest(confirmation="stop-trex")
    )

    assert payload["ok"] is True
    assert events == ["priority_disconnect", "force_trex_kill", "retire_traffic"]


def test_daemon_trex_stop_endpoint_reports_false_result_as_not_running(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.main.disconnect_stl_service_for_trex_termination",
        lambda: TrexCallResult(True, data={"disconnected": False}),
    )
    monkeypatch.setattr(
        "app.main.retire_traffic_after_trex_termination",
        lambda: TrexCallResult(True, data={"retired": False}),
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "force_trex_kill"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    monkeypatch.setattr("app.trex.runtime.httpx_rpc_caller", rpc_caller)

    payload = daemon_trex_stop(DaemonTrexStopRequest(confirmation="stop-trex"))

    assert payload["ok"] is True
    assert payload["stopped"] is False
    assert payload["blocker"] is None
    assert payload["traffic_retirement"]["ok"] is True


def test_daemon_trex_stop_endpoint_preserves_cleanup_failure_without_force_kill(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.main.disconnect_stl_service_for_trex_termination",
        lambda: TrexCallResult(
            False,
            data={"phase": "capture_remove", "remaining_capture_ids": [9]},
            blocker="trex_disconnect_cleanup_failed",
            error="capture cleanup failed",
        ),
    )
    monkeypatch.setattr(
        "app.trex.runtime.httpx_rpc_caller",
        lambda url, payload, timeout: (_ for _ in ()).throw(
            AssertionError("force_trex_kill must not run after cleanup failure")
        ),
    )
    monkeypatch.setattr(
        "app.main.retire_traffic_after_trex_termination",
        lambda: (_ for _ in ()).throw(
            AssertionError("traffic must not retire after lifecycle failure")
        ),
    )

    payload = daemon_trex_stop(DaemonTrexStopRequest(confirmation="stop-trex"))

    assert payload["ok"] is False
    assert payload["stopped"] is None
    assert payload["blocker"] == "trex_disconnect_cleanup_failed"
    assert payload["stl_disconnect"]["data"]["remaining_capture_ids"] == [9]


def test_overview_reports_environment_without_fake_success(
    recording_service: RecordingStlService,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(tmp_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_DAEMON_BIN", str(tmp_path / "missing-daemon"))

    payload = overview(service=recording_service)

    assert payload["environment"]["host"]
    assert payload["daemon_preview"]["action"] == "show"
    assert payload["daemon_status"]["command"][-1] == "show"
    assert payload["trex_probe"]["ok"] is True
    assert payload["trex_ports"]["data"]["port_ids"] == [0, 1]
    assert payload["environment"]["daemon_supervisor"] in {"external", "systemd"}
    assert payload["daemon_preview"]["available"] is (
        payload["environment"]["daemon_supervisor"] != "systemd"
    )
    SystemOverviewResponse.model_validate(payload)


def test_overview_sanitizes_hard_stop_priority_port_diagnostics(
    recording_service: RecordingStlService,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("TREX_WEBUI_TREX_SCRIPTS_DIR", str(tmp_path))
    monkeypatch.setenv(
        "TREX_WEBUI_TREX_DAEMON_BIN",
        str(tmp_path / "missing-daemon"),
    )
    monkeypatch.setattr(
        recording_service,
        "snapshot",
        lambda: TrexCallResult(
            False,
            data={
                "rpc_count": 8,
                "remaining_seconds": 12.0,
                "required_seconds": 25.0,
            },
            blocker="traffic_hard_stop_priority",
            error="TRex RPC is deferred for the hard-stop supervisor",
        ),
    )

    payload = overview(service=recording_service)

    assert payload["trex_probe"]["ok"] is False
    assert (
        payload["trex_probe"]["blocker"]
        == "traffic_hard_stop_priority"
    )
    assert payload["trex_ports"] == {
        "ok": False,
        "data": None,
        "blocker": "traffic_hard_stop_priority",
        "error": "TRex RPC is deferred for the hard-stop supervisor",
    }
    SystemOverviewResponse.model_validate(payload)
