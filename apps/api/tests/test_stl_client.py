from __future__ import annotations

import base64
import ipaddress
import json
import struct
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

import pytest
import yaml

from app.core.settings import TREX_CLIENT_NAME_ERROR, TREX_CONNECT_TIMEOUT_ERROR, TREX_HOST_ERROR, TrexEnvironment
from app.trex import capture_files, capture_operations, stl_client as stl_client_module
from app.trex.capture_decode import _capture_decoded_layers, _dns_query_summary
from app.trex.capture_runtime import CaptureIdentity
from app.trex.profile_files import (
    PROFILE_PATH_ERROR,
    PROFILE_ROOT_PATH_ERROR,
)
from app.trex.result import TrexCallResult
from app.trex.runtime_mutation import runtime_mutation_fence
from app.trex.runtime_state import (
    RuntimeAuthorityIdentity,
    RuntimeStateStore,
    TrafficMutationEvidenceState,
    TrafficSessionGroupState,
    TrafficSessionState,
)
from app.trex.stl_client import (
    RealStlClientService,
)
from app.trex.workbench_values import (
    PROFILE_NO_STREAMS_ERROR,
    PROFILE_NOT_TRAFFIC_PROFILE_ERROR,
)
from app.trex.workbench_packet import sctp_crc32c as _sctp_crc32c


def env(tmp_path: Path) -> TrexEnvironment:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    profile_root = tmp_path / "profiles"
    profile_root.mkdir()
    config_path = tmp_path / "trex_cfg.yaml"
    config_path.write_text(
        yaml.safe_dump(
            [
                {
                    "version": 2,
                    "port_limit": 1,
                    "interfaces": ["03:00.0"],
                }
            ],
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    return TrexEnvironment(
        host="127.0.0.1",
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=scripts_dir,
        daemon_bin=scripts_dir / "trex_daemon_server",
        config_path=config_path,
        daemon_log=tmp_path / "trex.log",
        profile_roots=[profile_root],
        command_timeout_seconds=3,
        require_confirmation=True,
        runtime_state_path=tmp_path / "runtime-state.json",
    )


class IdleTrafficPort:
    def sync(self) -> bool:
        return True

    def sync_streams(self) -> bool:
        return True

    def get_all_streams(self) -> dict[int, object]:
        return {}

    def is_paused(self) -> bool:
        return False

    def is_transmitting(self) -> bool:
        return False

    def is_active(self) -> bool:
        return False

    def get_port_state_name(self) -> str:
        return "IDLE"


def internet_checksum(data: bytes) -> int:
    if len(data) % 2:
        data += b"\x00"
    checksum = 0
    for index in range(0, len(data), 2):
        checksum += (data[index] << 8) + data[index + 1]
        checksum = (checksum & 0xFFFF) + (checksum >> 16)
    return (~checksum) & 0xFFFF


def assert_ipv4_l4_checksums_valid(packet: bytes, ip_offset: int = 14) -> None:
    ihl = (packet[ip_offset] & 0x0F) * 4
    protocol = packet[ip_offset + 9]
    total_length = int.from_bytes(packet[ip_offset + 2 : ip_offset + 4], "big")
    l4_offset = ip_offset + ihl
    l4_length = total_length - ihl
    assert internet_checksum(packet[ip_offset : ip_offset + ihl]) == 0
    if protocol in {6, 17}:
        pseudo_header = packet[ip_offset + 12 : ip_offset + 20] + struct.pack("!BBH", 0, protocol, l4_length)
        assert internet_checksum(pseudo_header + packet[l4_offset : l4_offset + l4_length]) == 0
    elif protocol == 1:
        assert internet_checksum(packet[l4_offset : l4_offset + l4_length]) == 0


def test_resolve_profile_path_accepts_file_inside_allowlist(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "udp.py"
    profile.write_text("profile", encoding="utf-8")

    result = RealStlClientService(environment).resolve_profile_path("udp.py")

    assert result.ok is True
    assert result.data == profile.resolve()


def test_client_rpc_guard_yields_reserved_window_to_hard_stop_supervisor(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = replace(env(tmp_path), connect_timeout_seconds=20)
    now = datetime(2026, 7, 31, tzinfo=timezone.utc)
    authority = RuntimeAuthorityIdentity(
        host=environment.host,
        sync_port=environment.sync_port,
        async_port=environment.async_port,
        scapy_port=environment.scapy_port,
        daemon_supervisor="external",
        generation="process:11111111-1111-4111-8111-111111111111",
    )
    group = TrafficSessionGroupState(
        ports=[0],
        profile_path="/tmp/profile.py",
        multiplier="1",
        duration=0,
        hard_stop_at=(
            now + timedelta(seconds=10)
        ).isoformat().replace("+00:00", "Z"),
        state="running",
        port_states={0: "running"},
        updated_at=now.isoformat().replace("+00:00", "Z"),
    )
    session = TrafficSessionState(
        id="22222222-2222-4222-8222-222222222222",
        authority=authority,
        state="running",
        started_at=now.isoformat().replace("+00:00", "Z"),
        updated_at=now.isoformat().replace("+00:00", "Z"),
        groups=[group],
    )
    store = RuntimeStateStore(environment.runtime_state_path)
    store.update(
        lambda document: (
            setattr(document, "traffic_session", session) or document
        )
    )
    service = RealStlClientService(
        environment,
        runtime_state_store=store,
    )
    service._client = object()
    service._capture_reconciled = True
    monkeypatch.setattr(stl_client_module, "utc_now", lambda: now)
    calls: list[str] = []

    blocked = service._with_client(
        lambda _client: calls.append("ordinary") or {}
    )

    assert blocked.ok is False
    assert blocked.blocker == "traffic_hard_stop_priority"
    assert calls == []
    blocked_disconnect = service.disconnect()
    assert blocked_disconnect.blocker == "traffic_hard_stop_priority"

    with runtime_mutation_fence(hard_stop=True):
        supervisor = service._with_client(
            lambda _client: calls.append("supervisor") or {}
        )

    assert supervisor.ok is True
    assert calls == ["supervisor"]


def test_resolve_profile_path_rejects_file_outside_allowlist(tmp_path: Path) -> None:
    outside = tmp_path / "outside.py"
    outside.write_text("profile", encoding="utf-8")

    result = RealStlClientService(env(tmp_path)).resolve_profile_path(str(outside))

    assert result.ok is False
    assert result.blocker == "profile_path_denied_or_missing"


def test_list_profiles_scans_supported_files_inside_allowlist(tmp_path: Path) -> None:
    environment = env(tmp_path)
    root = environment.profile_roots[0]
    (root / "udp.py").write_text(
        """
import argparse

def register():
    return object()

def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=str, default=64)
    parser.add_argument("--vm", choices={"cached", "random"})
    parser.add_argument("--src", required=True)
""",
        encoding="utf-8",
    )
    nested = root / "nested"
    nested.mkdir()
    (nested / "flow.yaml").write_text("streams: []", encoding="utf-8")
    (root / "notes.txt").write_text("ignore me", encoding="utf-8")

    result = RealStlClientService(environment).list_profiles()

    assert result.ok is True
    assert result.data["roots"][0]["profile_count"] == 2
    assert [profile["relative_path"] for profile in result.data["profiles"]] == [
        "nested/flow.yaml",
        "udp.py",
    ]
    profiles_by_path = {profile["relative_path"]: profile for profile in result.data["profiles"]}
    assert profiles_by_path["nested/flow.yaml"]["tunables"] == []
    assert profiles_by_path["udp.py"]["tunables"] == [
        {"name": "size", "required": False, "default": 64, "type": "str"},
        {"name": "vm", "required": False, "choices": ["cached", "random"]},
        {"name": "src", "required": True},
    ]
    assert all(Path(profile["path"]).is_absolute() for profile in result.data["profiles"])
    assert ".py" in result.data["supported_suffixes"]
    assert ".txt" not in result.data["supported_suffixes"]


def test_list_profiles_skips_symlinks_that_escape_allowlist(tmp_path: Path) -> None:
    environment = env(tmp_path)
    outside = tmp_path / "outside.py"
    outside.write_text("profile", encoding="utf-8")
    symlink = environment.profile_roots[0] / "escape.py"

    try:
        symlink.symlink_to(outside)
    except OSError:
        return

    result = RealStlClientService(environment).list_profiles()

    assert result.ok is True
    assert result.data["profiles"] == []


def test_list_profiles_reports_dirty_profile_root_without_crashing(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), profile_roots=[Path("/tmp/bad\x00profile-root")])

    result = RealStlClientService(environment).list_profiles()

    assert result.ok is True
    assert result.data["profiles"] == []
    assert result.data["roots"] == [
        {
            "path": "/tmp/bad\x00profile-root",
            "exists": False,
            "readable": False,
            "profile_count": 0,
            "blocker": "profile_root_path_invalid",
            "error": PROFILE_ROOT_PATH_ERROR,
        }
    ]


def test_profile_preview_reads_text_without_executing_profile(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "udp.py"
    profile.write_text("print('do not execute')\nclass STLProfile: pass\n", encoding="utf-8")

    result = RealStlClientService(environment).profile_preview("udp.py", max_bytes=12)

    assert result.ok is True
    assert result.data["profile"]["relative_path"] == "udp.py"
    assert result.data["content"] == "print('do no"
    assert result.data["truncated"] is True


def test_profile_preview_reports_binary_profile_blocker(tmp_path: Path) -> None:
    environment = env(tmp_path)
    pcap = environment.profile_roots[0] / "capture.pcap"
    pcap.write_bytes(b"\xd4\xc3\xb2\xa1")

    result = RealStlClientService(environment).profile_preview("capture.pcap")

    assert result.ok is False
    assert result.blocker == "profile_preview_binary"
    assert result.data["profile"]["previewable"] is False


def test_profile_preview_rejects_dirty_profile_path_without_crashing(tmp_path: Path) -> None:
    result = RealStlClientService(env(tmp_path)).profile_preview("bad\x00profile.py")

    assert result.ok is False
    assert result.blocker == "profile_path_invalid"
    assert result.error == PROFILE_PATH_ERROR


def test_profile_preview_reports_dirty_profile_root_without_crashing(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), profile_roots=[Path("/tmp/bad\x00profile-root")])

    result = RealStlClientService(environment).profile_preview("udp.py")

    assert result.ok is False
    assert result.blocker == "profile_root_path_invalid"
    assert result.error == PROFILE_ROOT_PATH_ERROR


def test_duplicate_profile_copies_inside_profile_root_without_overwrite(tmp_path: Path) -> None:
    environment = env(tmp_path)
    source = environment.profile_roots[0] / "udp.py"
    source.write_text("profile", encoding="utf-8")

    result = RealStlClientService(environment).duplicate_profile("udp.py")

    assert result.ok is True
    assert result.data["source"]["relative_path"] == "udp.py"
    assert result.data["profile"]["relative_path"] == "udp-copy.py"
    assert (environment.profile_roots[0] / "udp-copy.py").read_text(encoding="utf-8") == "profile"


def test_duplicate_profile_rejects_dirty_target_name(tmp_path: Path) -> None:
    environment = env(tmp_path)
    (environment.profile_roots[0] / "udp.py").write_text("profile", encoding="utf-8")

    result = RealStlClientService(environment).duplicate_profile("udp.py", "../escape.py")

    assert result.ok is False
    assert result.blocker == "profile_name_invalid"


def test_delete_profile_removes_allowed_file(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "unit.yaml"
    profile.write_text("---\n[]\n", encoding="utf-8")

    result = RealStlClientService(environment).delete_profile("unit.yaml")

    assert result.ok is True
    assert result.data["profile"]["relative_path"] == "unit.yaml"
    assert not profile.exists()


def test_export_profile_json_returns_workbench_streams(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "unit-profile.yaml",
        [
            {
                "name": "stream-json",
                "packet_type": "Ethernet/IPv4/TCP",
                "frame_length": 128,
                "rate_type": "pps",
                "rate_value": 1000,
            }
        ],
    )

    assert saved.ok is True
    result = service.export_profile_json("unit-profile.yaml")

    assert result.ok is True
    assert result.data["file_name"] == "unit-profile.json"
    assert '"name": "stream-json"' in result.data["content"]
    assert '"streams": [' in result.data["content"]


def test_export_workbench_profile_yaml_returns_download_content_without_writing(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    result = service.export_workbench_profile_yaml(
        "downloaded-profile.yaml",
        [
            {
                "name": "stream-yaml",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 96,
                "rate_type": "pps",
                "rate_value": 1000,
            }
        ],
    )

    assert result.ok is True
    assert result.data["accepted"] is True
    assert result.data["file_name"] == "downloaded-profile.yaml"
    assert result.data["bytes"] == len(result.data["content"].encode("utf-8"))
    assert "stream-yaml" in result.data["content"]
    assert result.data["streams"][0]["name"] == "stream-yaml"
    assert result.data["packet_previews"][0]["frame_length"] == 96
    assert not (environment.profile_roots[0] / "downloaded-profile.yaml").exists()


def test_stl_client_rejects_invalid_configured_sync_port_before_import(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        configuration_errors={"TREX_WEBUI_TREX_SYNC_PORT": "TREX_WEBUI_TREX_SYNC_PORT must be an integer"},
    )

    result = RealStlClientService(environment).snapshot()

    assert result.ok is False
    assert result.blocker == "trex_environment_invalid"
    assert result.error == "TREX_WEBUI_TREX_SYNC_PORT must be an integer"


def test_stl_client_rejects_invalid_configured_host_before_import(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        host="http://127.0.0.1:4501",
        configuration_errors={"TREX_WEBUI_TREX_HOST": TREX_HOST_ERROR},
    )

    result = RealStlClientService(environment).snapshot()

    assert result.ok is False
    assert result.blocker == "trex_environment_invalid"
    assert result.error == TREX_HOST_ERROR


def test_stl_client_rejects_host_with_embedded_port_before_import(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), host="127.0.0.1:4501")

    result = RealStlClientService(environment).snapshot()

    assert result.ok is False
    assert result.blocker == "trex_environment_invalid"
    assert result.error == TREX_HOST_ERROR


def test_stl_client_rejects_out_of_range_async_port_before_import(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), async_port=70000)

    result = RealStlClientService(environment).snapshot()

    assert result.ok is False
    assert result.blocker == "trex_environment_invalid"
    assert result.error == "TRex async port must be between 1 and 65535"


def test_stl_client_rejects_dirty_client_name_before_import(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), client_name="bad\nclient")

    result = RealStlClientService(environment).snapshot()

    assert result.ok is False
    assert result.blocker == "trex_environment_invalid"
    assert result.error == TREX_CLIENT_NAME_ERROR


def test_stl_client_rejects_invalid_connect_timeout_before_import(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), connect_timeout_seconds=0)

    result = RealStlClientService(environment).snapshot()

    assert result.ok is False
    assert result.blocker == "trex_environment_invalid"
    assert result.error == TREX_CONNECT_TIMEOUT_ERROR


def test_stl_client_passes_client_name_and_timeouts_to_sdk(tmp_path: Path) -> None:
    init_kwargs: list[dict[str, object]] = []

    class ConnectionClient:
        def __init__(self, **kwargs: object) -> None:
            init_kwargs.append(kwargs)

        def connect(self) -> None:
            pass

        def disconnect(self) -> None:
            pass

        def get_acquired_ports(self) -> list[int]:
            return []

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

    service = RealStlClientService(
        replace(
            env(tmp_path),
            client_name="RuntimeClient",
            connect_timeout_seconds=9,
        )
    )
    service._client_class = lambda: TrexCallResult(True, data=ConnectionClient)  # type: ignore[method-assign]

    result = service.snapshot()

    assert result.ok is True
    assert result.data["ports"][0]["info"]["owner"] is None
    assert init_kwargs == [
        {
            "username": "RuntimeClient",
            "server": "127.0.0.1",
            "sync_port": 4501,
            "async_port": 4500,
            "sync_timeout": 9,
            "async_timeout": 9,
            "verbose_level": "error",
        }
    ]


def test_manual_acquire_persists_on_the_backend_client_session(tmp_path: Path) -> None:
    class PersistentClient:
        instances: list["PersistentClient"] = []

        def __init__(self, **_kwargs: object) -> None:
            self.calls: list[tuple[str, object]] = []
            self.acquired: set[int] = set()
            self.disconnected = False
            PersistentClient.instances.append(self)

        def connect(self) -> None:
            self.calls.append(("connect", None))

        def disconnect(self) -> None:
            self.disconnected = True
            self.calls.append(("disconnect", None))

        def acquire(self, ports: list[int] | None, force: bool, sync_streams: bool) -> str:
            selected = [0, 1] if ports is None else ports
            self.acquired.update(selected)
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
            return "acquired"

        def get_acquired_ports(self) -> list[int]:
            self.calls.append(("get_acquired_ports", None))
            return sorted(self.acquired)

        def get_all_ports(self) -> list[int]:
            return [0, 1]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=PersistentClient)  # type: ignore[method-assign]

    acquire_result = service.acquire([0], force=False, sync_streams=True)
    snapshot = service.snapshot()

    assert acquire_result.ok is True
    assert snapshot.ok is True
    assert snapshot.data["acquired_ports"] == [0]
    assert snapshot.data["ports"][0]["acquired"] is True
    assert len(PersistentClient.instances) == 1
    assert PersistentClient.instances[0].disconnected is False


def test_snapshot_does_not_treat_owner_label_as_local_acquire(tmp_path: Path) -> None:
    class OwnerLabelClient:
        def __init__(self, **_kwargs: object) -> None:
            pass

        def connect(self) -> None:
            pass

        def disconnect(self) -> None:
            pass

        def get_acquired_ports(self) -> list[int]:
            return []

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP", "owner": "acquired"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=OwnerLabelClient)  # type: ignore[method-assign]

    snapshot = service.snapshot()

    assert snapshot.ok is True
    assert snapshot.data["acquired_ports"] == []
    assert snapshot.data["ports"][0]["acquired"] is False
    assert snapshot.data["ports"][0]["info"]["owner"] == "acquired"


def test_disconnect_closes_cached_client_and_next_call_reconnects(tmp_path: Path) -> None:
    class PersistentClient:
        instances: list["PersistentClient"] = []

        def __init__(self, **_kwargs: object) -> None:
            self.disconnected = False
            PersistentClient.instances.append(self)

        def connect(self) -> None:
            pass

        def disconnect(self, *, stop_traffic: bool, release_ports: bool) -> None:
            self.disconnected = True
            self.disconnect_options = {
                "stop_traffic": stop_traffic,
                "release_ports": release_ports,
            }

        def get_acquired_ports(self) -> list[int]:
            return []

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=PersistentClient)  # type: ignore[method-assign]

    assert service.snapshot().ok is True
    result = service.disconnect()

    assert result.ok is True
    assert result.data == {"disconnected": True, "client_cached": False}
    assert PersistentClient.instances[0].disconnected is True
    assert PersistentClient.instances[0].disconnect_options == {
        "stop_traffic": False,
        "release_ports": False,
    }

    assert service.snapshot().ok is True
    assert len(PersistentClient.instances) == 2
    assert PersistentClient.instances[1].disconnected is False


def test_disconnect_without_cached_client_is_idempotent(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))

    result = service.disconnect()

    assert result.ok is True
    assert result.data == {"disconnected": False, "client_cached": False}


def test_snapshot_includes_runtime_service_mode_state(tmp_path: Path) -> None:
    class PortObject:
        service_mask = 255

        def is_service_mode_on(self) -> bool:
            return True

        def is_service_filtered_mode_on(self) -> bool:
            return True

    class ServiceModeClient:
        def __init__(self, **_kwargs: object) -> None:
            self.ports = {0: PortObject()}

        def connect(self) -> None:
            pass

        def disconnect(self) -> None:
            pass

        def get_acquired_ports(self) -> list[int]:
            return [0]

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=ServiceModeClient)  # type: ignore[method-assign]

    snapshot = service.snapshot()

    assert snapshot.ok is True
    assert snapshot.data["ports"][0]["info"]["service_mode"] is True
    assert snapshot.data["ports"][0]["info"]["service_filtered"] is True
    assert snapshot.data["ports"][0]["info"]["service_mask"] == 255


def test_snapshot_merges_formatted_port_info_from_port_object(tmp_path: Path) -> None:
    class PortObject:
        def get_formatted_info(self, sync: bool = True) -> dict[str, object]:
            assert sync is False
            return {
                "fc": "NONE",
                "fc_supported": "yes",
                "led_change_supported": "yes",
                "link_change_supported": "yes",
                "prom": "off",
                "prom_supported": "yes",
                "mult": "off",
            }

    class SparseInfoClient:
        def __init__(self, **_kwargs: object) -> None:
            self.ports = {0: PortObject()}

        def connect(self) -> None:
            pass

        def disconnect(self) -> None:
            pass

        def get_acquired_ports(self) -> list[int]:
            return [0]

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=SparseInfoClient)  # type: ignore[method-assign]

    snapshot = service.snapshot()

    assert snapshot.ok is True
    info = snapshot.data["ports"][0]["info"]
    assert info["status"] == "IDLE"
    assert info["link"] == "UP"
    assert info["fc_supported"] == "yes"
    assert info["link_change_supported"] == "yes"
    assert info["led_change_supported"] == "yes"
    assert info["prom_supported"] == "yes"
    assert info["mult"] == "off"


def test_set_port_attribute_maps_control_fields_to_stl_client(tmp_path: Path) -> None:
    class AttributeClient:
        def __init__(self, **_kwargs: object) -> None:
            self.calls: list[tuple[str, object]] = []

        def connect(self) -> None:
            pass

        def disconnect(self) -> None:
            pass

        def set_port_attr(self, ports: list[int] | None, **kwargs: object) -> str:
            self.calls.append(("set_port_attr", {"ports": ports, "kwargs": kwargs}))
            return "ok"

    client = AttributeClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    multicast = service.set_port_attribute([0], "multicast", True)
    promiscuous = service.set_port_attribute([1], "promiscuous", False)
    led = service.set_port_attribute([0], "led", True)
    link = service.set_port_attribute([1], "link", False)
    flow_control = service.set_port_attribute([0], "flow_control", "RX")

    assert multicast.ok is True
    assert promiscuous.ok is True
    assert led.ok is True
    assert link.ok is True
    assert flow_control.ok is True
    assert client.calls == [
        ("set_port_attr", {"ports": [0], "kwargs": {"multicast": True}}),
        ("set_port_attr", {"ports": [1], "kwargs": {"promiscuous": False}}),
        ("set_port_attr", {"ports": [0], "kwargs": {"led_on": True}}),
        ("set_port_attr", {"ports": [1], "kwargs": {"link_up": False}}),
        ("set_port_attr", {"ports": [0], "kwargs": {"flow_ctrl": 2}}),
    ]
    assert flow_control.data["attribute"] == "flow_control"
    assert flow_control.data["value"] == "RX"


def test_snapshot_echoes_confirmed_port_attribute_overrides_until_release(tmp_path: Path) -> None:
    class AttributeStateClient:
        def __init__(self, **_kwargs: object) -> None:
            self.acquired = {0}
            self.calls: list[tuple[str, object]] = []

        def connect(self) -> None:
            pass

        def disconnect(self) -> None:
            pass

        def get_acquired_ports(self) -> list[int]:
            return sorted(self.acquired)

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            return [{"status": "IDLE", "link": "UP"} for _port in ports]

        def get_server_version(self) -> dict[str, str]:
            return {"version": "unit"}

        def get_server_system_info(self) -> dict[str, object]:
            return {}

        def get_warnings(self) -> list[object]:
            return []

        def set_port_attr(self, ports: list[int], **kwargs: object) -> str:
            self.calls.append(("set_port_attr", {"ports": ports, "kwargs": kwargs}))
            return "ok"

        def release(self, ports: list[int] | None) -> str:
            selected = list(self.acquired) if ports is None else ports
            self.acquired.difference_update(selected)
            return "released"

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=AttributeStateClient)  # type: ignore[method-assign]

    assert service.set_port_attribute([0], "multicast", True).ok is True
    assert service.set_port_attribute([0], "flow_control", "FULL").ok is True

    snapshot = service.snapshot()

    assert snapshot.ok is True
    info = snapshot.data["ports"][0]["info"]
    assert info["multicast"] is True
    assert info["flow_control"] == "FULL"

    assert service.release([0]).ok is True
    released_snapshot = service.snapshot()

    assert released_snapshot.ok is True
    released_info = released_snapshot.data["ports"][0]["info"]
    assert "multicast" not in released_info
    assert "flow_control" not in released_info


def test_set_port_attribute_rejects_invalid_values(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))

    assert service.set_port_attribute([0], "multicast", "on").blocker == "port_attribute_invalid"
    assert service.set_port_attribute([0], "flow_control", "AUTO").blocker == "port_attribute_invalid"
    assert service.set_port_attribute([0], "unknown", True).blocker == "port_attribute_invalid"


def test_traffic_action_without_runtime_session_does_not_touch_manually_owned_port(
    tmp_path: Path,
) -> None:
    class OwnedPortClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []
            self.acquired = {0}

        def get_acquired_ports(self) -> list[int]:
            self.calls.append(("get_acquired_ports", None))
            return sorted(self.acquired)

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
            self.acquired.update(ports)

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))
            self.acquired.difference_update(ports)

        def stop(self, ports: list[int] | None) -> str:
            self.calls.append(("stop", ports))
            return "stopped"

    client = OwnedPortClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.traffic_action("stop", ports=[0])

    assert result.ok is False
    assert result.blocker == "traffic_session_unowned"
    assert "no managed traffic session" in result.error
    assert client.calls == []
    assert client.acquired == {0}


def test_stats_reads_all_ports_when_ports_are_omitted(tmp_path: Path) -> None:
    class StatsClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def get_all_ports(self) -> list[int]:
            self.calls.append(("get_all_ports", None))
            return [0, 1]

        def get_stats(self, ports: list[int], sync_now: bool) -> dict[str, object]:
            self.calls.append(("get_stats", {"ports": ports, "sync_now": sync_now}))
            return {"ports": ports}

    client = StatsClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.stats()

    assert result.ok is True
    assert result.data == {"ports": [0, 1]}
    assert client.calls == [
        ("get_all_ports", None),
        ("get_stats", {"ports": [0, 1], "sync_now": True}),
    ]


def test_clear_stats_passes_sdk_flags(tmp_path: Path) -> None:
    class ClearStatsClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def clear_stats(
            self,
            ports: list[int] | None,
            clear_global: bool,
            clear_flow_stats: bool,
            clear_latency_stats: bool,
            clear_xstats: bool,
        ) -> str:
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
            return "ok"

    client = ClearStatsClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.clear_stats(
        ports=[1, 1, 0],
        clear_global=False,
        clear_flow_stats=True,
        clear_latency_stats=False,
        clear_xstats=True,
    )

    assert result.ok is True
    assert result.data == {
        "accepted": True,
        "ports": [1, 0],
        "clear_global": False,
        "clear_flow_stats": True,
        "clear_latency_stats": False,
        "clear_xstats": True,
        "result": "ok",
    }
    assert client.calls == [
        (
            "clear_stats",
            {
                "ports": [1, 0],
                "clear_global": False,
                "clear_flow_stats": True,
                "clear_latency_stats": False,
                "clear_xstats": True,
            },
        )
    ]


def test_start_profile_acquires_ports_inside_request(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "unit-latency.yaml"
    profile.write_text("profile", encoding="utf-8")

    class TrafficClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []
            self.ports = {0: IdleTrafficPort()}
            self.acquired: set[int] = set()

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_acquired_ports(self) -> list[int]:
            return sorted(self.acquired)

        def get_port_info(self, ports: list[int]) -> list[dict[str, str]]:
            return [{"link": "UP"} for _port in ports]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
            self.acquired.update(ports)

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))
            self.acquired.difference_update(ports)

        def remove_all_streams(self, ports: list[int] | None) -> None:
            self.calls.append(("remove_all_streams", ports))

        def add_profile(self, profile_path: str, ports: list[int] | None, **tunables: object) -> list[int]:
            self.calls.append(("add_profile", {"profile_path": profile_path, "ports": ports, "tunables": tunables}))
            return [10]

        def start(
            self,
            ports: list[int] | None,
            mult: str,
            duration: float,
            force: bool,
            total: bool,
            synchronized: bool,
        ) -> str:
            self.calls.append(
                (
                    "start",
                    {
                        "ports": ports,
                        "mult": mult,
                        "duration": duration,
                        "force": force,
                        "total": total,
                        "synchronized": synchronized,
                    },
                )
            )
            return "started"

    client = TrafficClient()
    service = RealStlClientService(environment)

    def with_client(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = with_client  # type: ignore[method-assign]

    result = service.start_profile(
        expected_session_id=None,
        profile_path="unit-latency.yaml",
        ports=[0],
        multiplier="1",
        duration=5,
        force=True,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={"size": 128},
    )

    assert result.ok is True
    assert result.data["stream_ids"] == [10]
    assert result.data["ports"] == [0]
    assert result.data["multiplier"] == "1"
    assert result.data["duration"] == 5
    assert result.data["tunables"] == {"size": 128}
    assert client.calls == [
        ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
        ("remove_all_streams", [0]),
        (
            "add_profile",
            {"profile_path": str(profile.resolve()), "ports": [0], "tunables": {"size": 128}},
        ),
        (
            "start",
            {
                "ports": [0],
                "mult": "1",
                "duration": 5,
                "force": True,
                "total": False,
                "synchronized": False,
            },
        ),
        ("release", [0]),
    ]


def test_start_profile_reports_python_profile_rejected_tunables(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "syn_attack.py"
    profile.write_text("profile", encoding="utf-8")

    class TrafficClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []
            self.ports = {0: IdleTrafficPort()}
            self.acquired: set[int] = set()

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_acquired_ports(self) -> list[int]:
            return sorted(self.acquired)

        def get_port_info(self, ports: list[int]) -> list[dict[str, str]]:
            return [{"link": "UP"} for _port in ports]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
            self.acquired.update(ports)

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))
            self.acquired.difference_update(ports)

        def remove_all_streams(self, ports: list[int] | None) -> None:
            self.calls.append(("remove_all_streams", ports))

        def add_profile(self, profile_path: str, ports: list[int] | None, **tunables: object) -> list[int]:
            self.calls.append(("add_profile", {"profile_path": profile_path, "ports": ports, "tunables": tunables}))
            raise AttributeError("'NoneType' object has no attribute 'get_streams'")

    client = TrafficClient()
    service = RealStlClientService(environment)

    def with_client(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = with_client  # type: ignore[method-assign]

    result = service.start_profile(
        expected_session_id=None,
        profile_path="syn_attack.py",
        ports=[0],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={"flow": "fs", "size": "256", "vm": "cached"},
    )

    assert result.ok is False
    assert result.blocker == "traffic_mutation_recovery_required"
    assert (
        f"{PROFILE_NO_STREAMS_ERROR}; provided tunables: flow, size, vm"
        in result.error
    )
    assert client.calls == [
        ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
        ("remove_all_streams", [0]),
        (
            "add_profile",
            {
                "profile_path": str(profile.resolve()),
                "ports": [0],
                "tunables": {"flow": "fs", "size": "256", "vm": "cached"},
            },
        ),
        ("release", [0]),
    ]


def test_start_profile_reports_python_profile_missing_stream_entrypoint(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "tpg_tags_conf.py"
    profile.write_text("profile", encoding="utf-8")

    class TrafficClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []
            self.ports = {0: IdleTrafficPort()}
            self.acquired: set[int] = set()

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_acquired_ports(self) -> list[int]:
            return sorted(self.acquired)

        def get_port_info(self, ports: list[int]) -> list[dict[str, str]]:
            return [{"link": "UP"} for _port in ports]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
            self.acquired.update(ports)

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))
            self.acquired.difference_update(ports)

        def remove_all_streams(self, ports: list[int] | None) -> None:
            self.calls.append(("remove_all_streams", ports))

        def add_profile(self, profile_path: str, ports: list[int] | None, **tunables: object) -> list[int]:
            self.calls.append(("add_profile", {"profile_path": profile_path, "ports": ports, "tunables": tunables}))
            raise RuntimeError("'TPGTagConf' object has no attribute 'get_streams'")

    client = TrafficClient()
    service = RealStlClientService(environment)

    def with_client(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = with_client  # type: ignore[method-assign]

    result = service.start_profile(
        expected_session_id=None,
        profile_path="tpg_tags_conf.py",
        ports=[0],
        multiplier="1",
        duration=1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert result.blocker == "traffic_mutation_recovery_required"
    assert PROFILE_NOT_TRAFFIC_PROFILE_ERROR in result.error
    assert client.calls == [
        ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
        ("remove_all_streams", [0]),
        ("add_profile", {"profile_path": str(profile.resolve()), "ports": [0], "tunables": {}}),
        ("release", [0]),
    ]


def test_start_profile_reports_json_without_stream_packets(tmp_path: Path) -> None:
    environment = env(tmp_path)
    profile = environment.profile_roots[0] / "tpg_tags_conf.json"
    profile.write_text("[]", encoding="utf-8")

    class TrafficClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []
            self.ports = {0: IdleTrafficPort()}
            self.acquired: set[int] = set()

        def get_all_ports(self) -> list[int]:
            return [0]

        def get_acquired_ports(self) -> list[int]:
            return sorted(self.acquired)

        def get_port_info(self, ports: list[int]) -> list[dict[str, str]]:
            return [{"link": "UP"} for _port in ports]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
            self.acquired.update(ports)

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))
            self.acquired.difference_update(ports)

        def remove_all_streams(self, ports: list[int] | None) -> None:
            self.calls.append(("remove_all_streams", ports))

        def add_profile(self, profile_path: str, ports: list[int] | None, **tunables: object) -> list[int]:
            self.calls.append(("add_profile", {"profile_path": profile_path, "ports": ports, "tunables": tunables}))
            raise RuntimeError("from_json: missing field 'packet' from JSON")

    client = TrafficClient()
    service = RealStlClientService(environment)

    def with_client(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = with_client  # type: ignore[method-assign]

    result = service.start_profile(
        expected_session_id=None,
        profile_path="tpg_tags_conf.json",
        ports=[0],
        multiplier="1",
        duration=1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert result.blocker == "traffic_mutation_recovery_required"
    assert PROFILE_NOT_TRAFFIC_PROFILE_ERROR in result.error
    assert client.calls == [
        ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
        ("remove_all_streams", [0]),
        ("add_profile", {"profile_path": str(profile.resolve()), "ports": [0], "tunables": {}}),
        ("release", [0]),
    ]


def test_traffic_action_with_omitted_ports_requires_owned_runtime_session(
    tmp_path: Path,
) -> None:
    class StopClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def get_all_ports(self) -> list[int]:
            self.calls.append(("get_all_ports", None))
            return [0, 1]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))

        def stop(self, ports: list[int] | None) -> str:
            self.calls.append(("stop", ports))
            return "stopped"

    client = StopClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.traffic_action("stop", ports=None)

    assert result.ok is False
    assert result.blocker == "traffic_session_unowned"
    assert "no managed traffic session" in result.error
    assert client.calls == []


def test_update_traffic_without_owned_runtime_session_has_zero_side_effects(
    tmp_path: Path,
) -> None:
    class UpdateClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))

        def update(self, ports: list[int] | None, mult: str, force: bool, total: bool) -> str:
            self.calls.append(("update", {"ports": ports, "mult": mult, "force": force, "total": total}))
            return "updated"

    client = UpdateClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.update_traffic(ports=[0], multiplier="100%", force=True, total=False)

    assert result.ok is False
    assert result.blocker == "traffic_session_unowned"
    assert "no managed traffic session" in result.error
    assert client.calls == []


def test_port_xstats_reads_real_sdk_method(tmp_path: Path) -> None:
    class XstatsClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def get_all_ports(self) -> list[int]:
            self.calls.append(("get_all_ports", None))
            return [0, 1]

        def get_xstats(self, port_id: int) -> dict[str, int]:
            self.calls.append(("get_xstats", port_id))
            return {"tx_good_packets": 42, "rx_good_packets": 41}

    client = XstatsClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.port_xstats(port=1)

    assert result.ok is True
    assert result.data == {
        "port": 1,
        "xstats": {"tx_good_packets": 42, "rx_good_packets": 41},
    }
    assert client.calls == [("get_all_ports", None), ("get_xstats", 1)]


def test_port_xstats_rejects_missing_port(tmp_path: Path) -> None:
    class XstatsClient:
        def get_all_ports(self) -> list[int]:
            return [0]

        def get_xstats(self, port_id: int) -> dict[str, int]:
            raise AssertionError("missing ports should be rejected before get_xstats")

    service = RealStlClientService(env(tmp_path))
    def run(operation):  # type: ignore[no-untyped-def]
        try:
            return TrexCallResult(True, data=operation(XstatsClient()))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = run  # type: ignore[method-assign]

    result = service.port_xstats(port=1)

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert result.error == "port 1 does not exist"


class CaptureServicePort:
    def __init__(self, service_mode: bool = False) -> None:
        self.service_mode = service_mode
        self.service_mode_filtered = False
        self.service_mask: int | None = None

    def sync(self) -> bool:
        return True

    def is_service_mode_on(self) -> bool:
        return self.service_mode

    def is_service_filtered_mode_on(self) -> bool:
        return False


class CaptureRpcResult:
    def __init__(self, data: dict[str, object] | None = None, *, ok: bool = True) -> None:
        self._data = data or {}
        self._ok = ok

    def __bool__(self) -> bool:
        return self._ok

    def data(self) -> dict[str, object]:
        return self._data

    def __str__(self) -> str:
        return "capture RPC failed"


class CaptureServiceClient:
    def __init__(self, *, start_raises: bool = False) -> None:
        self.calls: list[tuple[str, object]] = []
        self.ports = {0: CaptureServicePort(False), 1: CaptureServicePort(False)}
        self.acquired_ports: set[int] = set()
        self.status: dict[int, dict[str, object]] = {}
        self.next_capture_id = 7
        self.start_raises = start_raises

    def get_all_ports(self) -> list[int]:
        self.calls.append(("get_all_ports", None))
        return [0, 1]

    def get_acquired_ports(self) -> list[int]:
        self.calls.append(("get_acquired_ports", None))
        return sorted(self.acquired_ports)

    def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
        self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))
        self.acquired_ports.update(ports)

    def release(self, ports: list[int]) -> None:
        self.calls.append(("release", {"ports": ports}))
        for port in ports:
            self.acquired_ports.discard(port)

    def set_service_mode(self, ports: list[int], enabled: bool, filtered: bool, mask: int | None) -> None:
        self.calls.append(("set_service_mode", {"ports": ports, "enabled": enabled, "filtered": filtered, "mask": mask}))
        for port in ports:
            self.ports[port].service_mode = enabled

    def start_capture(
        self,
        tx_ports: list[int],
        rx_ports: list[int],
        limit: int,
        mode: str,
        bpf_filter: str,
        snaplen: int,
    ) -> dict[str, object]:
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
        if self.start_raises:
            raise RuntimeError("capture failed")
        capture_id = self.next_capture_id
        self.next_capture_id += 1
        self.status[capture_id] = {"id": capture_id, "pkt_count": 0, "state": "ACTIVE", "filter": {"tx": tx_ports, "rx": rx_ports, "bpf": bpf_filter}}
        return {"id": capture_id, "ts": 123.5}

    def _transmit(self, command: str, params: dict[str, object]) -> CaptureRpcResult:
        self.calls.append(("_transmit", {"command": command, "params": params}))
        capture_id = int(params["capture_id"])
        if params["command"] == "stop":
            packet_count = int(self.status.get(capture_id, {}).get("pkt_count", 0))
            return CaptureRpcResult({"pkt_count": packet_count})
        if params["command"] == "remove":
            self.status.pop(capture_id, None)
            return CaptureRpcResult()
        return CaptureRpcResult(ok=False)

    def fetch_capture_packets(
        self,
        capture_id: int,
        output: list[dict[str, object]],
        pkt_count: int,
        fetch_limit: int,
        snaplen: int,
    ) -> None:
        self.calls.append(
            (
                "fetch_capture_packets",
                {
                    "capture_id": capture_id,
                    "pkt_count": pkt_count,
                    "fetch_limit": fetch_limit,
                    "snaplen": snaplen,
                },
            )
        )

    def remove_all_captures(self) -> None:
        self.calls.append(("remove_all_captures", None))
        self.status = {}

    def get_capture_status(self) -> dict[int, dict[str, object]]:
        self.calls.append(("get_capture_status", None))
        return self.status


class StaticCaptureRuntimeAuthority:
    def __init__(self, environment: TrexEnvironment) -> None:
        self.environment = environment

    def current(self) -> RuntimeAuthorityIdentity:
        return RuntimeAuthorityIdentity(
            host=self.environment.host,
            sync_port=self.environment.sync_port,
            async_port=self.environment.async_port,
            scapy_port=self.environment.scapy_port,
            daemon_supervisor="systemd",
            generation="11111111-1111-4111-8111-111111111111",
        )


class SharedCaptureServer:
    def __init__(self) -> None:
        self.owners: dict[int, str] = {}
        self.service_mode = {0: False, 1: False}
        self.status: dict[int, dict[str, object]] = {}
        self.next_capture_id = 7
        self.sync_error: Exception | None = None
        self.sync_result = True

    def release_session(self, session_id: str) -> None:
        for port, owner in list(self.owners.items()):
            if owner == session_id:
                self.owners.pop(port)


class SharedServerCapturePort:
    def __init__(self, server: SharedCaptureServer, port: int) -> None:
        self.server = server
        self.port = port
        self.service_mode = False
        self.service_mode_filtered = False
        self.service_mask: int | None = None

    def sync(self) -> bool:
        if self.server.sync_error is not None:
            raise self.server.sync_error
        if not self.server.sync_result:
            return False
        self.service_mode = self.server.service_mode[self.port]
        self.service_mode_filtered = False
        self.service_mask = None
        return True

    def is_service_mode_on(self) -> bool:
        return self.service_mode

    def is_service_filtered_mode_on(self) -> bool:
        return False


class SharedSessionCaptureClient(CaptureServiceClient):
    def __init__(
        self,
        server: SharedCaptureServer,
        session_id: str,
    ) -> None:
        super().__init__()
        self.server = server
        self.session_id = session_id
        self.ports = {
            port: SharedServerCapturePort(server, port)
            for port in (0, 1)
        }

    def acquire(
        self,
        ports: list[int],
        force: bool,
        sync_streams: bool,
    ) -> None:
        self.calls.append(
            (
                "acquire",
                {
                    "ports": ports,
                    "force": force,
                    "sync_streams": sync_streams,
                },
            )
        )
        if force:
            raise AssertionError("capture recovery must never force acquisition")
        blocked = [
            port
            for port in ports
            if self.server.owners.get(port) not in {None, self.session_id}
        ]
        if blocked:
            raise RuntimeError(
                f"ports are owned by another session: {blocked}"
            )
        for port in ports:
            self.server.owners[port] = self.session_id
            self.acquired_ports.add(port)

    def release(self, ports: list[int]) -> None:
        self.calls.append(("release", {"ports": ports}))
        for port in ports:
            if (
                port not in self.acquired_ports
                or self.server.owners.get(port) != self.session_id
            ):
                raise RuntimeError(
                    f"session {self.session_id} cannot release port {port}"
                )
        for port in ports:
            self.server.owners.pop(port, None)
            self.acquired_ports.discard(port)

    def set_service_mode(
        self,
        ports: list[int],
        enabled: bool,
        filtered: bool,
        mask: int | None,
    ) -> None:
        self.calls.append(
            (
                "set_service_mode",
                {
                    "ports": ports,
                    "enabled": enabled,
                    "filtered": filtered,
                    "mask": mask,
                },
            )
        )
        for port in ports:
            if self.server.owners.get(port) != self.session_id:
                raise RuntimeError(
                    f"session {self.session_id} does not own port {port}"
                )
        for port in ports:
            self.server.service_mode[port] = enabled
            port_object = self.ports[port]
            port_object.service_mode = enabled
            port_object.service_mode_filtered = filtered
            port_object.service_mask = mask

    def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
        tx_ports = list(kwargs["tx_ports"])  # type: ignore[arg-type]
        rx_ports = list(kwargs["rx_ports"])  # type: ignore[arg-type]
        bpf_filter = str(kwargs["bpf_filter"])
        self.calls.append(("start_capture", kwargs))
        capture_id = self.server.next_capture_id
        self.server.next_capture_id += 1
        self.server.status[capture_id] = {
            "id": capture_id,
            "pkt_count": 0,
            "state": "ACTIVE",
            "filter": {
                "tx": tx_ports,
                "rx": rx_ports,
                "bpf": bpf_filter,
            },
        }
        return {"id": capture_id, "ts": 123.5}

    def get_capture_status(self) -> dict[int, dict[str, object]]:
        self.calls.append(("get_capture_status", None))
        return self.server.status

    def _transmit(
        self,
        command: str,
        params: dict[str, object],
    ) -> CaptureRpcResult:
        self.calls.append(
            ("_transmit", {"command": command, "params": params})
        )
        capture_id = int(params["capture_id"])
        if params["command"] == "remove":
            self.server.status.pop(capture_id, None)
            return CaptureRpcResult()
        return CaptureRpcResult(ok=False)


def capture_service_for_restart(
    environment: TrexEnvironment,
    client: CaptureServiceClient,
    authority: StaticCaptureRuntimeAuthority,
) -> RealStlClientService:
    service = RealStlClientService(
        environment,
        runtime_authority=authority,  # type: ignore[arg-type]
    )

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]
    return service


def start_test_capture(service: RealStlClientService) -> TrexCallResult:
    return service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )


def test_capture_preparation_wal_exists_before_first_hardware_side_effect(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = env(tmp_path)
    client = CaptureServiceClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    def crash_after_wal(*_args: object, **_kwargs: object) -> dict[str, object]:
        raise SystemExit("crash after capture WAL")

    monkeypatch.setattr(
        service._capture_runtime,
        "prepare_capture_hardware",
        crash_after_wal,
    )

    with pytest.raises(SystemExit, match="crash after capture WAL"):
        start_test_capture(service)

    lease = RuntimeStateStore(environment.runtime_state_path).load().capture_leases[0]
    assert lease.recovery_phase == "preparing"
    assert lease.preparation_stage == "wal"
    assert lease.authority == authority.current()
    assert lease.pre_acquired_ports == []
    assert lease.acquire_planned_ports == [0]
    assert lease.preparation_service_states[0]["enabled"] is False
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False

    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_capture_baseline_sync_rc_failure_has_no_hardware_side_effect(
    tmp_path: Path,
) -> None:
    class SyncFailurePort(CaptureServicePort):
        def sync(self) -> bool:
            return False

    environment = env(tmp_path)
    client = CaptureServiceClient()
    client.ports[0] = SyncFailurePort(False)
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    result = start_test_capture(service)

    assert result.ok is False
    assert "failed to synchronize TRex port 0" in result.error
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []
    assert not any(
        call[0] in {"acquire", "set_service_mode", "start_capture"}
        for call in client.calls
    )


def test_capture_crash_after_unconfirmed_acquire_is_rolled_back_after_restart(
    tmp_path: Path,
) -> None:
    class CrashAfterAcquireClient(CaptureServiceClient):
        def acquire(
            self,
            ports: list[int],
            force: bool,
            sync_streams: bool,
        ) -> None:
            super().acquire(ports, force, sync_streams)
            raise SystemExit("crash after acquire")

    environment = env(tmp_path)
    client = CrashAfterAcquireClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    with pytest.raises(SystemExit, match="crash after acquire"):
        start_test_capture(service)

    lease = RuntimeStateStore(environment.runtime_state_path).load().capture_leases[0]
    assert lease.recovery_phase == "preparing"
    assert lease.preparation_stage == "acquire_intent"
    assert client.acquired_ports == {0}

    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []
    assert any(call[0] == "release" for call in client.calls)


def test_capture_partial_acquire_outcome_safely_claims_remainder_after_restart(
    tmp_path: Path,
) -> None:
    class PartialAcquireClient(CaptureServiceClient):
        crashed = False

        def acquire(
            self,
            ports: list[int],
            force: bool,
            sync_streams: bool,
        ) -> None:
            if self.crashed:
                super().acquire(ports, force, sync_streams)
                return
            self.calls.append(
                (
                    "acquire",
                    {
                        "ports": ports,
                        "force": force,
                        "sync_streams": sync_streams,
                    },
                )
            )
            self.acquired_ports.add(ports[0])
            self.crashed = True
            raise SystemExit("crash after partial acquire")

    environment = env(tmp_path)
    client = PartialAcquireClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    with pytest.raises(SystemExit, match="crash after partial acquire"):
        service.start_capture(
            tx_ports=[0, 1],
            rx_ports=[],
            limit=16,
            mode="fixed",
            bpf_filter="",
            snaplen=0,
        )

    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert client.acquired_ports == set()
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []
    assert any(call[0] == "release" for call in client.calls)


def test_capture_restart_does_not_treat_new_session_local_ownership_as_server_truth(
    tmp_path: Path,
) -> None:
    class CrashAfterServerAcquireClient(SharedSessionCaptureClient):
        def acquire(
            self,
            ports: list[int],
            force: bool,
            sync_streams: bool,
        ) -> None:
            super().acquire(ports, force, sync_streams)
            raise SystemExit("response lost after server acquire")

    environment = env(tmp_path)
    server = SharedCaptureServer()
    authority = StaticCaptureRuntimeAuthority(environment)
    first_client = CrashAfterServerAcquireClient(server, "session-a")
    service = capture_service_for_restart(
        environment,
        first_client,
        authority,
    )

    with pytest.raises(SystemExit, match="response lost after server acquire"):
        start_test_capture(service)

    assert server.owners == {0: "session-a"}
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0].preparation_stage == "acquire_intent"

    second_client = SharedSessionCaptureClient(server, "session-b")
    restarted = capture_service_for_restart(
        environment,
        second_client,
        authority,
    )
    blocked = restarted.capture_status()

    assert blocked.ok is False
    assert "without force" in blocked.error
    assert second_client.get_acquired_ports() == []
    assert server.owners == {0: "session-a"}
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases
    assert not any(call[0] == "release" for call in second_client.calls)

    # Once the old owner is explicitly released, a fresh session can prove
    # server availability by non-force acquisition, then release and clear.
    server.release_session("session-a")
    third_client = SharedSessionCaptureClient(server, "session-c")
    final_restart = capture_service_for_restart(
        environment,
        third_client,
        authority,
    )
    recovered = final_restart.capture_status()

    assert recovered.ok is True
    assert server.owners == {}
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []
    assert any(
        call[0] == "acquire"
        and isinstance(call[1], dict)
        and call[1]["force"] is False
        for call in third_client.calls
    )


def test_capture_service_response_loss_requires_strict_server_sync(
    tmp_path: Path,
) -> None:
    class ServiceResponseLossClient(SharedSessionCaptureClient):
        def set_service_mode(
            self,
            ports: list[int],
            enabled: bool,
            filtered: bool,
            mask: int | None,
        ) -> None:
            if enabled:
                self.calls.append(
                    (
                        "set_service_mode",
                        {
                            "ports": ports,
                            "enabled": enabled,
                            "filtered": filtered,
                            "mask": mask,
                        },
                    )
                )
                for port in ports:
                    if self.server.owners.get(port) != self.session_id:
                        raise RuntimeError("port is not owned")
                    self.server.service_mode[port] = True
                # Server applied the RPC, but this session's local port cache
                # remains false because the response was lost.
                raise SystemExit("response lost after service enable")
            super().set_service_mode(
                ports,
                enabled,
                filtered,
                mask,
            )

    environment = env(tmp_path)
    server = SharedCaptureServer()
    authority = StaticCaptureRuntimeAuthority(environment)
    first_client = ServiceResponseLossClient(server, "session-a")
    service = capture_service_for_restart(
        environment,
        first_client,
        authority,
    )

    with pytest.raises(SystemExit, match="response lost after service enable"):
        start_test_capture(service)

    assert server.service_mode[0] is True
    assert first_client.ports[0].service_mode is False
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0].preparation_stage == "service_intent"

    server.release_session("session-a")
    server.sync_result = False
    second_client = SharedSessionCaptureClient(server, "session-b")
    restarted = capture_service_for_restart(
        environment,
        second_client,
        authority,
    )
    blocked = restarted.capture_status()

    assert blocked.ok is False
    assert "failed to synchronize TRex port 0" in blocked.error
    assert second_client.ports[0].service_mode is False
    assert server.service_mode[0] is True
    assert server.owners == {0: "session-b"}
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases

    server.sync_result = True
    server.sync_error = RuntimeError("port sync transport lost")
    blocked_exception = restarted.capture_status()

    assert blocked_exception.ok is False
    assert "port sync transport lost" in blocked_exception.error
    assert second_client.ports[0].service_mode is False
    assert server.service_mode[0] is True
    assert server.owners == {0: "session-b"}
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases
    assert not any(
        call[0] == "set_service_mode"
        and isinstance(call[1], dict)
        and call[1]["enabled"] is False
        for call in second_client.calls
    )

    server.sync_error = None
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert server.service_mode[0] is False
    assert server.owners == {}
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_capture_crash_after_unconfirmed_service_enable_is_rolled_back_after_restart(
    tmp_path: Path,
) -> None:
    class CrashAfterServiceClient(CaptureServiceClient):
        def set_service_mode(
            self,
            ports: list[int],
            enabled: bool,
            filtered: bool,
            mask: int | None,
        ) -> None:
            super().set_service_mode(ports, enabled, filtered, mask)
            if enabled:
                raise SystemExit("crash after service enable")

    environment = env(tmp_path)
    client = CrashAfterServiceClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    with pytest.raises(SystemExit, match="crash after service enable"):
        service.start_capture(
            tx_ports=[0, 1],
            rx_ports=[],
            limit=16,
            mode="fixed",
            bpf_filter="",
            snaplen=0,
        )

    lease = RuntimeStateStore(environment.runtime_state_path).load().capture_leases[0]
    assert lease.preparation_stage == "service_intent"
    assert client.acquired_ports == {0, 1}
    assert client.ports[0].service_mode is True
    assert client.ports[1].service_mode is False

    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False
    assert client.ports[1].service_mode is False
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []
    assert any(
        call[0] == "set_service_mode"
        and isinstance(call[1], dict)
        and call[1]["enabled"] is False
        for call in client.calls
    )
    assert any(call[0] == "release" for call in client.calls)


def test_capture_non_prefix_service_change_fails_closed_after_restart(
    tmp_path: Path,
) -> None:
    class CrashBeforeServiceClient(CaptureServiceClient):
        def set_service_mode(
            self,
            ports: list[int],
            enabled: bool,
            filtered: bool,
            mask: int | None,
        ) -> None:
            if enabled:
                raise SystemExit("crash before first service enable")
            super().set_service_mode(ports, enabled, filtered, mask)

    environment = env(tmp_path)
    client = CrashBeforeServiceClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    with pytest.raises(SystemExit, match="crash before first service enable"):
        service.start_capture(
            tx_ports=[0, 1],
            rx_ports=[],
            limit=16,
            mode="fixed",
            bpf_filter="",
            snaplen=0,
        )

    # A later, non-prefix service change cannot have been produced by the
    # serialized enable loop and must not be restored or released as ours.
    client.ports[1].service_mode = True
    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is False
    assert "outcome is ambiguous" in recovered.error
    assert client.acquired_ports == {0, 1}
    assert client.ports[1].service_mode is True
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases
    assert not any(call[0] == "release" for call in client.calls)


def test_capture_rpc_intent_transition_crash_is_rolled_back_after_restart(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = env(tmp_path)
    client = CaptureServiceClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    def crash_before_rpc(*_args: object, **_kwargs: object) -> None:
        raise SystemExit("crash before RPC intent confirmation")

    monkeypatch.setattr(
        service._capture_runtime,
        "mark_capture_rpc_attempted",
        crash_before_rpc,
    )

    with pytest.raises(SystemExit, match="crash before RPC intent confirmation"):
        start_test_capture(service)

    lease = RuntimeStateStore(environment.runtime_state_path).load().capture_leases[0]
    assert lease.preparation_stage == "service_enabled"
    assert client.acquired_ports == {0}
    assert client.ports[0].service_mode is True
    assert client.status == {}

    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_capture_preparation_recovery_rejects_new_concurrent_recorder(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = env(tmp_path)
    client = CaptureServiceClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    def crash_before_rpc(*_args: object, **_kwargs: object) -> None:
        raise SystemExit("crash before RPC")

    monkeypatch.setattr(
        service._capture_runtime,
        "mark_capture_rpc_attempted",
        crash_before_rpc,
    )
    with pytest.raises(SystemExit, match="crash before RPC"):
        start_test_capture(service)

    client.status[99] = {
        "id": 99,
        "pkt_count": 0,
        "state": "ACTIVE",
        "filter": {"tx": [1], "rx": [], "bpf": "icmp"},
    }
    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is False
    assert "baseline changed concurrently" in recovered.error
    assert client.status[99]["state"] == "ACTIVE"
    assert client.acquired_ports == {0}
    assert client.ports[0].service_mode is True
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases
    assert not any(call[0] == "release" for call in client.calls)


def test_capture_rpc_crash_after_recorder_creation_recovers_after_restart(
    tmp_path: Path,
) -> None:
    class CrashAfterCaptureRpcClient(CaptureServiceClient):
        def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
            super().start_capture(**kwargs)  # type: ignore[arg-type]
            raise SystemExit("crash after capture RPC")

    environment = env(tmp_path)
    client = CrashAfterCaptureRpcClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    with pytest.raises(SystemExit, match="crash after capture RPC"):
        start_test_capture(service)

    lease = RuntimeStateStore(environment.runtime_state_path).load().capture_leases[0]
    assert lease.recovery_phase == "pending_start"
    assert lease.preparation_stage is None
    assert list(client.status) == [7]

    restarted = capture_service_for_restart(environment, client, authority)
    recovered = restarted.capture_status()

    assert recovered.ok is True
    assert client.status == {}
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_capture_recovery_survives_crashes_after_restore_and_release(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RecoveryCrashClient(CaptureServiceClient):
        crash_restore = False
        crash_release = False

        def set_service_mode(
            self,
            ports: list[int],
            enabled: bool,
            filtered: bool,
            mask: int | None,
        ) -> None:
            super().set_service_mode(ports, enabled, filtered, mask)
            if not enabled and self.crash_restore:
                self.crash_restore = False
                raise SystemExit("crash after restore")

        def release(self, ports: list[int]) -> None:
            super().release(ports)
            if self.crash_release:
                self.crash_release = False
                raise SystemExit("crash after release")

    environment = env(tmp_path)
    client = RecoveryCrashClient()
    authority = StaticCaptureRuntimeAuthority(environment)
    service = capture_service_for_restart(environment, client, authority)

    def crash_before_rpc(*_args: object, **_kwargs: object) -> None:
        raise SystemExit("crash before RPC")

    monkeypatch.setattr(
        service._capture_runtime,
        "mark_capture_rpc_attempted",
        crash_before_rpc,
    )
    with pytest.raises(SystemExit, match="crash before RPC"):
        start_test_capture(service)

    client.crash_restore = True
    client.crash_release = True
    first_restart = capture_service_for_restart(environment, client, authority)
    with pytest.raises(SystemExit, match="crash after restore"):
        first_restart.capture_status()
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0].preparation_stage == "restore_intent"

    second_restart = capture_service_for_restart(environment, client, authority)
    with pytest.raises(SystemExit, match="crash after release"):
        second_restart.capture_status()
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0].preparation_stage == "release_intent"

    final_restart = capture_service_for_restart(environment, client, authority)
    recovered = final_restart.capture_status()

    assert recovered.ok is True
    assert client.acquired_ports == set()
    assert client.ports[0].service_mode is False
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_start_capture_passes_capture_options_to_client(tmp_path: Path) -> None:
    class CaptureClient(CaptureServiceClient):
        def __init__(self) -> None:
            super().__init__()

        def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
            result = super().start_capture(**kwargs)  # type: ignore[arg-type]
            self.status = {7: {"id": 7, "pkt_count": 0, "state": "ACTIVE", "filter": {"tx": 1, "rx": 2, "bpf": "icmp"}}}
            return result

    client = CaptureClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.start_capture(
        tx_ports=[0],
        rx_ports=[1],
        limit=256,
        mode="cyclic",
        bpf_filter=" icmp ",
        snaplen=128,
    )

    assert result.ok is True
    assert result.data["id"] == 7
    assert result.data["bpf_filter"] == "icmp"
    assert result.data["captures"] == [{"id": 7, "pkt_count": 0, "state": "ACTIVE", "filter": {"tx": 1, "rx": 2, "bpf": "icmp"}}]
    assert result.data["port_usage"] == [
        {"port": 0, "rx_recorder_ids": [], "tx_recorder_ids": [7]},
        {"port": 1, "rx_recorder_ids": [7], "tx_recorder_ids": []},
    ]
    assert result.data["service_mode"] == {
        "enabled_ports": [0, 1],
        "already_enabled_ports": [],
        "restored_ports": [],
        "managed_capture_ids": [7],
    }
    assert client.calls == [
        ("get_capture_status", None),
        ("get_capture_status", None),
        ("get_all_ports", None),
            ("get_all_ports", None),
            ("get_acquired_ports", None),
            ("get_acquired_ports", None),
            ("acquire", {"ports": [0, 1], "force": False, "sync_streams": True}),
            ("get_acquired_ports", None),
        ("set_service_mode", {"ports": [0], "enabled": True, "filtered": False, "mask": None}),
        ("set_service_mode", {"ports": [1], "enabled": True, "filtered": False, "mask": None}),
        (
            "start_capture",
            {
                "tx_ports": [0],
                "rx_ports": [1],
                "limit": 256,
                "mode": "cyclic",
                "bpf_filter": "icmp",
                "snaplen": 128,
            },
        ),
        ("get_capture_status", None),
    ]
    leases = RuntimeStateStore(tmp_path / "runtime-state.json").load().capture_leases
    assert [(lease.capture_id, lease.ports, lease.acquired_ports) for lease in leases] == [
        (7, [0, 1], [0, 1]),
    ]


def test_start_capture_persist_failure_compensates_recorder_service_mode_and_ports(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = CaptureServiceClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation):  # type: ignore[no-untyped-def]
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = run  # type: ignore[method-assign]
    state_store = service._capture_runtime._state_store
    assert state_store is not None

    def fail_write(_state: object) -> None:
        raise RuntimeError("state write failed")

    monkeypatch.setattr(state_store, "_write_unlocked", fail_write)

    result = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=1,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert "capture_start_intent_persist: state write failed" in result.error
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert service._capture_runtime.managed_capture_ids() == []
    assert not any(call[0] == "start_capture" for call in client.calls)


@pytest.mark.parametrize(
    "start_response",
    [
        None,
        [],
        {},
        {"id": -1},
        {"id": True},
        {"id": "7"},
    ],
)
def test_start_capture_rejects_malformed_recorder_id_and_removes_unique_diff(
    tmp_path: Path,
    start_response: object,
) -> None:
    class MalformedStartClient(CaptureServiceClient):
        def start_capture(self, **kwargs: object) -> object:  # type: ignore[override]
            super().start_capture(**kwargs)  # type: ignore[arg-type]
            return start_response

    client = MalformedStartClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]

    result = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert "capture_start_response" in result.error
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert service._capture_runtime.managed_capture_ids() == []
    assert RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases == []
    assert any(
        call == (
            "_transmit",
            {
                "command": "capture",
                "params": {"command": "remove", "capture_id": 7},
            },
        )
        for call in client.calls
    )


def test_nonaccepted_unique_capture_persists_cleanup_phase_before_remove(
    tmp_path: Path,
) -> None:
    class CleanupRetryClient(CaptureServiceClient):
        def __init__(self) -> None:
            super().__init__()
            self.restore_failures = 1

        def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
            super().start_capture(**kwargs)  # type: ignore[arg-type]
            return {}

        def set_service_mode(
            self,
            ports: list[int],
            enabled: bool,
            filtered: bool,
            mask: int | None,
        ) -> None:
            if not enabled and self.restore_failures:
                self.calls.append(
                    (
                        "set_service_mode",
                        {
                            "ports": ports,
                            "enabled": enabled,
                            "filtered": filtered,
                            "mask": mask,
                        },
                    )
                )
                self.restore_failures -= 1
                raise RuntimeError("restore failed")
            super().set_service_mode(ports, enabled, filtered, mask)

    client = CleanupRetryClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]

    started = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert started.ok is False
    assert "service_mode_restore: restore failed" in started.error
    assert client.status == {}
    assert client.acquired_ports == {0}
    persisted = RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases
    assert len(persisted) == 1
    assert persisted[0].capture_id == 7
    assert persisted[0].recovery_phase == "cleanup_required"

    recovered = service.capture_status()

    assert recovered.ok is True
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases == []


def test_start_capture_missing_id_without_visible_recorder_retains_recovery_intent(
    tmp_path: Path,
) -> None:
    class NoRecorderClient(CaptureServiceClient):
        def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
            self.calls.append(("start_capture", kwargs))
            return {}

    client = NoRecorderClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]

    result = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert result.ok is False
    assert client.status == {}
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    assert not any(call[0] == "_transmit" for call in client.calls)
    leases = RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases
    assert len(leases) == 1
    assert leases[0].recovery_phase == "pending_start"

    client.status[7] = {
        "id": 7,
        "pkt_count": 0,
        "state": "ACTIVE",
        "filter": {"tx": [0], "rx": [], "bpf": ""},
    }
    recovered = service.capture_status()

    assert recovered.ok is True
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases == []


@pytest.mark.parametrize("transport_failure", [False, True])
def test_capture_start_status_lag_keeps_ledger_until_recorder_appears(
    tmp_path: Path,
    transport_failure: bool,
) -> None:
    class DelayedStatusClient(CaptureServiceClient):
        def __init__(self) -> None:
            super().__init__()
            self.delayed_record: dict[str, object] | None = None

        def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
            result = super().start_capture(**kwargs)  # type: ignore[arg-type]
            self.delayed_record = self.status.pop(7)
            if transport_failure:
                raise RuntimeError("capture transport failed after commit")
            return result

        def reveal_recorder(self) -> None:
            assert self.delayed_record is not None
            self.status[7] = self.delayed_record

    client = DelayedStatusClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]

    started = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert started.ok is False
    assert "recovery ledger" in started.error
    if transport_failure:
        assert "capture transport failed after commit" in started.error
    assert client.status == {}
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    leases = RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases
    assert len(leases) == 1
    assert leases[0].recovery_phase == "pending_start"

    # A later status response exposes the committed recorder. Reconciliation
    # owns it through the durable intent, removes it, and only then releases
    # service mode and ports.
    client.reveal_recorder()
    recovered = service.capture_status()

    assert recovered.ok is True
    assert recovered.data["captures"] == []
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases == []


def test_ambiguous_capture_start_persists_intent_until_unique_recovery(
    tmp_path: Path,
) -> None:
    class AmbiguousStartClient(CaptureServiceClient):
        def start_capture(self, **kwargs: object) -> dict[str, object]:  # type: ignore[override]
            super().start_capture(**kwargs)  # type: ignore[arg-type]
            self.status[8] = {
                "id": 8,
                "pkt_count": 0,
                "state": "ACTIVE",
                "filter": {"tx": [0], "rx": [], "bpf": ""},
            }
            return {}

    client = AmbiguousStartClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]

    started = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert started.ok is False
    assert "cannot safely attribute a unique live recorder" in started.error
    assert sorted(client.status) == [7, 8]
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    leases = RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases
    assert len(leases) == 1
    assert leases[0].recovery_phase == "pending_start"
    assert leases[0].baseline_capture_ids == []
    assert str(leases[0].capture_id).startswith("pending-start:")

    # Once external evidence leaves one uniquely matching new recorder, normal
    # status reconciliation can complete the deferred cleanup.
    client.status.pop(8)
    client.calls.clear()
    recovered = service.capture_status()

    assert recovered.ok is True
    assert recovered.data["captures"] == []
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases == []
    assert any(
        call == (
            "_transmit",
            {
                "command": "capture",
                "params": {"command": "remove", "capture_id": 7},
            },
        )
        for call in client.calls
    )


def test_capture_start_status_failure_retains_durable_recovery_intent(
    tmp_path: Path,
) -> None:
    class StatusFailureClient(CaptureServiceClient):
        def __init__(self) -> None:
            super().__init__()
            self.status_calls = 0
            self.fail_status = True

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            self.status_calls += 1
            if self.fail_status and self.status_calls >= 3:
                raise RuntimeError("capture status unavailable")
            return super().get_capture_status()

    client = StatusFailureClient()
    service = RealStlClientService(env(tmp_path))

    def run(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = run  # type: ignore[method-assign]

    started = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )

    assert started.ok is False
    assert "capture status unavailable" in started.error
    assert client.status == {
        7: {
            "id": 7,
            "pkt_count": 0,
            "state": "ACTIVE",
            "filter": {"tx": [0], "rx": [], "bpf": ""},
        }
    }
    leases = RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases
    assert len(leases) == 1
    assert leases[0].recovery_phase == "pending_start"

    client.fail_status = False
    recovered = service.capture_status()

    assert recovered.ok is True
    assert recovered.data["captures"] == []
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases == []


def test_start_capture_transport_failure_keeps_recovery_authority(
    tmp_path: Path,
) -> None:
    client = CaptureServiceClient(start_raises=True)
    service = RealStlClientService(env(tmp_path))

    def run(operation: object) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))  # type: ignore[operator]
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    service._with_client = run  # type: ignore[method-assign]

    result = service.start_capture(tx_ports=[0], rx_ports=[], limit=256, mode="fixed", bpf_filter="", snaplen=0)

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert "recovery ledger" in result.error
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    leases = RuntimeStateStore(
        tmp_path / "runtime-state.json"
    ).load().capture_leases
    assert len(leases) == 1
    assert leases[0].recovery_phase == "pending_start"
    assert client.calls == [
        ("get_capture_status", None),
        ("get_capture_status", None),
            ("get_all_ports", None),
            ("get_acquired_ports", None),
            ("get_acquired_ports", None),
            ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
            ("get_acquired_ports", None),
        ("set_service_mode", {"ports": [0], "enabled": True, "filtered": False, "mask": None}),
        (
            "start_capture",
            {
                "tx_ports": [0],
                "rx_ports": [],
                "limit": 256,
                "mode": "fixed",
                "bpf_filter": "",
                "snaplen": 0,
            },
        ),
        ("get_capture_status", None),
    ]


@pytest.mark.parametrize("stop_order", [(7, 8), (8, 7)])
def test_capture_service_mode_is_restored_after_last_managed_capture(
    tmp_path: Path,
    stop_order: tuple[int, int],
) -> None:
    client = CaptureServiceClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    first = service.start_capture(tx_ports=[0], rx_ports=[], limit=256, mode="fixed", bpf_filter="", snaplen=0)
    second = service.start_capture(tx_ports=[0], rx_ports=[], limit=256, mode="fixed", bpf_filter="", snaplen=0)
    stopped_first = service.stop_capture(capture_id=stop_order[0], pkt_count=1, save_pcap=False, file_name=None, snaplen=0)

    assert first.ok is True
    assert second.ok is True
    assert stopped_first.ok is True
    assert stopped_first.data["service_mode"]["restored_ports"] == []
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    stopped_second = service.stop_capture(capture_id=stop_order[1], pkt_count=1, save_pcap=False, file_name=None, snaplen=0)
    assert stopped_second.ok is True
    assert stopped_second.data["service_mode"]["restored_ports"] == [0]
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert [
        call for call in client.calls
        if call[0] == "set_service_mode"
    ] == [
        ("set_service_mode", {"ports": [0], "enabled": True, "filtered": False, "mask": None}),
        ("set_service_mode", {"ports": [0], "enabled": False, "filtered": False, "mask": None}),
    ]
    assert [
        call for call in client.calls
        if call[0] in {"acquire", "release"}
    ] == [
        ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
        ("release", {"ports": [0]}),
    ]


def test_remove_all_captures_restores_orphaned_managed_service_state(tmp_path: Path) -> None:
    client = CaptureServiceClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]
    service._capture_service_states[99] = {0: {"enabled": False, "filtered": False, "mask": None}}
    service._capture_ports[99] = [0]
    service._capture_identities[99] = CaptureIdentity.create([0], [], "")
    service._capture_authorities[99] = service._runtime_authority.current()
    client.ports[0].service_mode = True

    result = service.remove_all_captures()

    assert result.ok is True
    assert client.ports[0].service_mode is False
    assert result.data["service_mode"]["released_capture_ids"] == [99]
    assert result.data["service_mode"]["restored_ports"] == [0]


def test_start_capture_requires_at_least_one_direction_before_connect(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(None))  # type: ignore[method-assign]

    result = service.start_capture(tx_ports=[], rx_ports=[], limit=256, mode="fixed", bpf_filter="", snaplen=0)

    assert result.ok is False
    assert result.blocker == "capture_ports_missing"


def test_fetch_capture_returns_packet_records_for_ui(tmp_path: Path) -> None:
    packet = bytes.fromhex(
        "00112233445566778899aabb08004500001c00000000401100000a0000010a00000204d2003500080000"
    )

    class CaptureClient:
        def fetch_capture_packets(
            self,
            capture_id: int,
            output: list[dict[str, object]],
            pkt_count: int,
            fetch_limit: int,
            snaplen: int,
        ) -> None:
            output.append(
                {
                    "binary": packet,
                    "wirelen": 64,
                    "origin": "RX",
                    "ts": 1.25,
                    "index": 9,
                    "port": 0,
                }
            )

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            return {7: {"id": 7, "pkt_count": 1}}

    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(CaptureClient()))  # type: ignore[method-assign]

    result = service.fetch_capture(capture_id=7, pkt_count=1, fetch_limit=1, snaplen=0)

    assert result.ok is True
    assert result.data["packet_count"] == 1
    assert result.data["packets"][0]["binary_base64"] == base64.b64encode(packet).decode("ascii")
    assert result.data["packets"][0]["destination"] == "10.0.0.2"
    assert result.data["packets"][0]["source"] == "10.0.0.1"
    assert result.data["packets"][0]["type"] == "IPv4/UDP"
    assert result.data["packets"][0]["info"] == "10.0.0.1:1234 -> 10.0.0.2:53"
    layers = result.data["packets"][0]["decoded_layers"]
    assert [layer["name"] for layer in layers] == ["Ethernet", "IPv4", "UDP"]
    assert {"name": "Source", "value": "66:77:88:99:aa:bb"} in layers[0]["fields"]
    assert {"name": "Destination", "value": "10.0.0.2"} in layers[1]["fields"]
    assert {"name": "Destination Port", "value": "53"} in layers[2]["fields"]


def test_fetch_managed_capture_rejects_same_id_after_daemon_generation_changes(
    tmp_path: Path,
) -> None:
    generation_path = tmp_path / "daemon-generation"
    generation_path.write_text(
        "11111111-1111-4111-8111-111111111111\n",
        encoding="ascii",
    )
    generation_path.chmod(0o644)
    environment = replace(
        env(tmp_path),
        daemon_supervisor="systemd",
        daemon_generation_path=generation_path,
    )
    client = CaptureServiceClient()

    class TestRuntimeAuthorityProvider:
        def current(self) -> RuntimeAuthorityIdentity:
            return RuntimeAuthorityIdentity(
                host=environment.host,
                sync_port=environment.sync_port,
                async_port=environment.async_port,
                scapy_port=environment.scapy_port,
                daemon_supervisor="systemd",
                generation=generation_path.read_text(encoding="ascii").strip(),
            )

    service = RealStlClientService(
        environment,
        runtime_authority=TestRuntimeAuthorityProvider(),  # type: ignore[arg-type]
    )

    def with_client(operation: Callable[[object], object]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(
                False,
                blocker="trex_command_failed",
                error=str(exc),
            )

    service._with_client = with_client  # type: ignore[method-assign]
    started = service.start_capture(
        tx_ports=[0],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )
    assert started.ok is True
    generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client.calls.clear()

    result = service.fetch_capture(
        capture_id=7,
        pkt_count=1,
        fetch_limit=1,
        snaplen=0,
    )

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert "different TRex target or daemon generation" in result.error
    assert [call for call in client.calls if call[0] == "fetch_capture_packets"] == []

    client.calls.clear()
    second_start = service.start_capture(
        tx_ports=[1],
        rx_ports=[],
        limit=16,
        mode="fixed",
        bpf_filter="",
        snaplen=0,
    )
    assert second_start.ok is False
    assert "different TRex target or daemon generation" in second_start.error
    assert not any(
        call[0] in {"acquire", "set_service_mode", "start_capture"}
        for call in client.calls
    )


def test_fetch_capture_decodes_original_monitor_protocols(tmp_path: Path) -> None:
    vlan_tcp = bytes.fromhex(
        "00112233445566778899aabb810000640800"
        "450000280000000040060000c0000201c6336402"
        "04d2005000000001000000025012040000000000"
    ) + (b"\x00" * 18)
    ipv6_udp = bytes.fromhex(
        "00112233445566778899aabb86dd"
        "6000000000081140"
        "20010db8000000000000000000000001"
        "20010db8000000000000000000000002"
        "04d2003500080000"
    )
    arp_request = bytes.fromhex(
        "ffffffffffff66778899aabb0806"
        "0001080006040001"
        "66778899aabb0a000001"
        "0000000000000a000002"
    )

    class CaptureClient:
        def fetch_capture_packets(
            self,
            capture_id: int,
            output: list[dict[str, object]],
            pkt_count: int,
            fetch_limit: int,
            snaplen: int,
        ) -> None:
            for index, packet in enumerate([vlan_tcp, ipv6_udp, arp_request], start=1):
                output.append({"binary": packet, "wirelen": len(packet), "origin": "RX", "ts": index, "index": index, "port": 0})

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            return {7: {"id": 7, "pkt_count": 3}}

    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(CaptureClient()))  # type: ignore[method-assign]

    result = service.fetch_capture(capture_id=7, pkt_count=3, fetch_limit=3, snaplen=0)

    assert result.ok is True
    packets = result.data["packets"]
    assert packets[0]["destination"] == "198.51.100.2"
    assert packets[0]["source"] == "192.0.2.1"
    assert packets[0]["type"] == "802.1Q/IPv4/TCP"
    assert packets[0]["info"] == "192.0.2.1:1234 -> 198.51.100.2:80 [ACK, SYN] Seq=1 Ack=2 Win=1024 Len=0"
    assert [layer["name"] for layer in packets[0]["decoded_layers"]] == ["Ethernet", "802.1Q VLAN", "IPv4", "TCP"]
    assert {"name": "VLAN ID", "value": "100"} in packets[0]["decoded_layers"][1]["fields"]
    assert {"name": "Flags", "value": "ACK, SYN"} in packets[0]["decoded_layers"][3]["fields"]
    assert packets[1]["destination"] == "2001:db8::2"
    assert packets[1]["source"] == "2001:db8::1"
    assert packets[1]["type"] == "IPv6/UDP"
    assert packets[1]["info"] == "[2001:db8::1]:1234 -> [2001:db8::2]:53"
    assert [layer["name"] for layer in packets[1]["decoded_layers"]] == ["Ethernet", "IPv6", "UDP"]
    assert {"name": "Next Header", "value": "UDP"} in packets[1]["decoded_layers"][1]["fields"]
    assert packets[2]["destination"] == "ff:ff:ff:ff:ff:ff"
    assert packets[2]["source"] == "66:77:88:99:aa:bb"
    assert packets[2]["type"] == "ARP"
    assert packets[2]["info"] == "[Request] Who has 10.0.0.2 tell 10.0.0.1"
    assert [layer["name"] for layer in packets[2]["decoded_layers"]] == ["Ethernet", "ARP"]
    assert {"name": "Operation", "value": "request"} in packets[2]["decoded_layers"][1]["fields"]


def test_fetch_capture_decodes_deep_monitor_protocols(tmp_path: Path) -> None:
    def ethernet(payload: bytes, eth_type: int = 0x0800) -> bytes:
        return bytes.fromhex("00112233445566778899aabb") + eth_type.to_bytes(2, "big") + payload

    def ipv4(payload: bytes, protocol: int, src: bytes = b"\x0a\x00\x00\x01", dst: bytes = b"\x0a\x00\x00\x02") -> bytes:
        total_length = 20 + len(payload)
        return (
            bytes([0x45, 0x00])
            + total_length.to_bytes(2, "big")
            + b"\x00\x00\x00\x00\x40"
            + bytes([protocol])
            + b"\x00\x00"
            + src
            + dst
            + payload
        )

    def ipv6(payload: bytes, protocol: int) -> bytes:
        return (
            bytes.fromhex("60000000")
            + len(payload).to_bytes(2, "big")
            + bytes([protocol, 255])
            + bytes.fromhex("20010db8000000000000000000000001")
            + bytes.fromhex("20010db8000000000000000000000002")
            + payload
        )

    def udp(src_port: int, dst_port: int, payload: bytes) -> bytes:
        return src_port.to_bytes(2, "big") + dst_port.to_bytes(2, "big") + (8 + len(payload)).to_bytes(2, "big") + b"\x00\x00" + payload

    dns_query = (
        b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00"
        + bytes([7])
        + b"example"
        + bytes([3])
        + b"com"
        + b"\x00\x00\x01\x00\x01"
    )
    dns_packet = ethernet(ipv4(udp(1234, 53, dns_query), 17))

    bootp = bytearray(240)
    bootp[0] = 1
    bootp[1] = 1
    bootp[2] = 6
    bootp[4:8] = bytes.fromhex("3903f326")
    bootp[10:12] = bytes.fromhex("8000")
    bootp[28:34] = bytes.fromhex("66778899aabb")
    bootp[236:240] = bytes.fromhex("63825363")
    dhcp_options = bytes([53, 1, 1, 12, 4]) + b"trex" + bytes([50, 4, 10, 0, 0, 99, 255])
    dhcp_packet = ethernet(ipv4(udp(68, 67, bytes(bootp) + dhcp_options), 17))

    inner_ipv4_udp = ipv4(udp(32000, 32100, b"data"), 17, b"\x0a\x02\x00\x0a", b"\x0a\x02\x00\x14")
    gre = b"\x30\x00\x08\x00" + bytes.fromhex("12345678") + (7).to_bytes(4, "big") + inner_ipv4_udp
    gre_packet = ethernet(ipv4(gre, 47))

    mpls_stack = (
        ((100 << 12) | (5 << 9) | (0 << 8) | 64).to_bytes(4, "big")
        + ((200 << 12) | (3 << 9) | (1 << 8) | 63).to_bytes(4, "big")
    )
    mpls_packet = ethernet(
        mpls_stack + ipv4(udp(4000, 5000, b"mpls"), 17, b"\x0a\x03\x00\x01", b"\x0a\x03\x00\x02"),
        eth_type=0x8847,
    )

    inner_vxlan_frame = (
        bytes.fromhex("aabbccddeeff0011223344550800")
        + ipv4(udp(32000, 32100, b"vxlan"), 17, b"\x0a\x01\x00\x0a", b"\x0a\x01\x00\x14")
    )
    vxlan_header = b"\x08\x00\x00\x00" + (5000).to_bytes(3, "big") + b"\x00"
    vxlan_packet = ethernet(
        ipv4(udp(1337, 4789, vxlan_header + inner_vxlan_frame), 17, b"\xac\x10\x00\x01", b"\xac\x10\x00\x02")
    )

    inner_gtpu_ipv4 = ipv4(udp(4900, 4901, b"gtpu"), 17, b"\x0a\x09\x00\x01", b"\x0a\x09\x00\x02")
    gtpu_header = b"\x30\xff" + len(inner_gtpu_ipv4).to_bytes(2, "big") + bytes.fromhex("12345678")
    gtpu_packet = ethernet(
        ipv4(udp(2152, 2152, gtpu_header + inner_gtpu_ipv4), 17, b"\xc6\x33\x64\x01", b"\xc6\x33\x64\x02")
    )

    ipv6_in_ipv4_packet = ethernet(
        ipv4(
            ipv6(udp(32000, 32100, b"ip6in4"), 17),
            41,
            b"\xc0\x00\x02\x0a",
            b"\xc6\x33\x64\x14",
        )
    )

    ipv4_in_ipv6_packet = ethernet(
        ipv6(
            ipv4(udp(4100, 4200, b"ip4in6"), 17, b"\x0a\x04\x00\x01", b"\x0a\x04\x00\x02"),
            4,
        ),
        eth_type=0x86DD,
    )

    udp_ipv6_tunnel_packet = ethernet(
        ipv4(
            udp(3544, 3797, ipv6(udp(1025, 12, b"teredo"), 17)),
            17,
            b"\x10\x00\x00\x01",
            b"\x30\x00\x00\x01",
        )
    )

    icmpv6_ns = (
        bytes([135, 0])
        + b"\x00\x00"
        + b"\x00\x00\x00\x00"
        + bytes.fromhex("20010db8000000000000000000000002")
        + bytes([1, 1])
        + bytes.fromhex("66778899aabb")
    )
    icmpv6_packet = ethernet(ipv6(icmpv6_ns, 58), eth_type=0x86DD)
    icmpv6_ra = (
        bytes([134, 0])
        + b"\x00\x00"
        + bytes([42, 0xC0])
        + (900).to_bytes(2, "big")
        + (1234).to_bytes(4, "big")
        + (5678).to_bytes(4, "big")
        + bytes([1, 1])
        + bytes.fromhex("66778899aabb")
        + bytes([3, 4, 64, 0x80])
        + (3600).to_bytes(4, "big")
        + (1800).to_bytes(4, "big")
        + b"\x00\x00\x00\x00"
        + bytes.fromhex("20010db8100000000000000000000000")
    )
    icmpv6_ra_packet = ethernet(ipv6(icmpv6_ra, 58), eth_type=0x86DD)

    class CaptureClient:
        def fetch_capture_packets(
            self,
            capture_id: int,
            output: list[dict[str, object]],
            pkt_count: int,
            fetch_limit: int,
            snaplen: int,
        ) -> None:
            for index, packet in enumerate(
                [
                    dns_packet,
                    dhcp_packet,
                    gre_packet,
                    mpls_packet,
                    vxlan_packet,
                    gtpu_packet,
                    ipv6_in_ipv4_packet,
                    ipv4_in_ipv6_packet,
                    udp_ipv6_tunnel_packet,
                    icmpv6_packet,
                    icmpv6_ra_packet,
                ],
                start=1,
            ):
                output.append({"binary": packet, "wirelen": len(packet), "origin": "RX", "ts": index, "index": index, "port": 0})

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            return {7: {"id": 7, "pkt_count": 11}}

    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(CaptureClient()))  # type: ignore[method-assign]

    result = service.fetch_capture(capture_id=7, pkt_count=11, fetch_limit=11, snaplen=0)

    assert result.ok is True
    packets = result.data["packets"]
    assert packets[0]["type"] == "IPv4/UDP"
    assert packets[0]["info"] == "10.0.0.1:1234 -> 10.0.0.2:53 DNS example.com A"
    assert [layer["name"] for layer in packets[0]["decoded_layers"]] == ["Ethernet", "IPv4", "UDP", "DNS"]
    assert {"name": "Query Name", "value": "example.com"} in packets[0]["decoded_layers"][3]["fields"]
    assert {"name": "Query Type", "value": "A"} in packets[0]["decoded_layers"][3]["fields"]

    assert packets[1]["info"] == "10.0.0.1:68 -> 10.0.0.2:67 DHCP Discover"
    assert [layer["name"] for layer in packets[1]["decoded_layers"]] == ["Ethernet", "IPv4", "UDP", "DHCP"]
    assert {"name": "Message Type", "value": "Discover"} in packets[1]["decoded_layers"][3]["fields"]
    assert {"name": "Hostname", "value": "trex"} in packets[1]["decoded_layers"][3]["fields"]
    assert {"name": "Requested IP", "value": "10.0.0.99"} in packets[1]["decoded_layers"][3]["fields"]

    assert packets[2]["type"] == "IPv4/GRE"
    assert "key=0x12345678" in packets[2]["info"]
    assert [layer["name"] for layer in packets[2]["decoded_layers"]] == ["Ethernet", "IPv4", "GRE", "IPv4", "UDP"]
    assert {"name": "Key", "value": "0x12345678"} in packets[2]["decoded_layers"][2]["fields"]
    assert {"name": "Sequence", "value": "7"} in packets[2]["decoded_layers"][2]["fields"]

    assert [layer["name"] for layer in packets[3]["decoded_layers"]] == ["Ethernet", "MPLS", "MPLS", "IPv4", "UDP"]
    assert {"name": "Label", "value": "100"} in packets[3]["decoded_layers"][1]["fields"]
    assert {"name": "Traffic Class", "value": "5"} in packets[3]["decoded_layers"][1]["fields"]
    assert {"name": "Bottom Of Stack", "value": "0"} in packets[3]["decoded_layers"][1]["fields"]
    assert {"name": "Label", "value": "200"} in packets[3]["decoded_layers"][2]["fields"]
    assert {"name": "Bottom Of Stack", "value": "1"} in packets[3]["decoded_layers"][2]["fields"]
    assert {"name": "Source Port", "value": "4000"} in packets[3]["decoded_layers"][4]["fields"]

    assert [layer["name"] for layer in packets[4]["decoded_layers"]] == [
        "Ethernet",
        "IPv4",
        "UDP",
        "VXLAN",
        "Inner Ethernet",
        "IPv4",
        "UDP",
    ]
    assert {"name": "VNI", "value": "5000"} in packets[4]["decoded_layers"][3]["fields"]
    assert {"name": "Destination", "value": "aa:bb:cc:dd:ee:ff"} in packets[4]["decoded_layers"][4]["fields"]
    assert {"name": "Source", "value": "10.1.0.10"} in packets[4]["decoded_layers"][5]["fields"]
    assert {"name": "Destination Port", "value": "32100"} in packets[4]["decoded_layers"][6]["fields"]

    assert packets[5]["type"] == "IPv4/UDP"
    assert "GTP-U G-PDU (255) teid=0x12345678 inner IPv4 10.9.0.1 -> 10.9.0.2 UDP" in packets[5]["info"]
    assert [layer["name"] for layer in packets[5]["decoded_layers"]] == ["Ethernet", "IPv4", "UDP", "GTP-U", "IPv4", "UDP"]
    assert {"name": "Message Type", "value": "G-PDU (255)"} in packets[5]["decoded_layers"][3]["fields"]
    assert {"name": "TEID", "value": "0x12345678"} in packets[5]["decoded_layers"][3]["fields"]
    assert {"name": "Source", "value": "10.9.0.1"} in packets[5]["decoded_layers"][4]["fields"]
    assert {"name": "Destination Port", "value": "4901"} in packets[5]["decoded_layers"][5]["fields"]

    assert packets[6]["type"] == "IPv4/IPv6"
    assert "IPv6-in-IPv4 2001:db8::1 -> 2001:db8::2 UDP" in packets[6]["info"]
    assert [layer["name"] for layer in packets[6]["decoded_layers"]] == ["Ethernet", "IPv4", "IP Tunnel", "IPv6", "UDP"]
    assert {"name": "Protocol", "value": "IPv6"} in packets[6]["decoded_layers"][1]["fields"]
    assert {"name": "Encapsulation", "value": "IPv6"} in packets[6]["decoded_layers"][2]["fields"]
    assert {"name": "Outer", "value": "IPv4"} in packets[6]["decoded_layers"][2]["fields"]
    assert {"name": "Source", "value": "2001:db8::1"} in packets[6]["decoded_layers"][3]["fields"]
    assert {"name": "Destination Port", "value": "32100"} in packets[6]["decoded_layers"][4]["fields"]

    assert packets[7]["type"] == "IPv6/IPv4"
    assert "IPv4-in-IPv6 10.4.0.1 -> 10.4.0.2 UDP" in packets[7]["info"]
    assert [layer["name"] for layer in packets[7]["decoded_layers"]] == ["Ethernet", "IPv6", "IP Tunnel", "IPv4", "UDP"]
    assert {"name": "Next Header", "value": "IPv4"} in packets[7]["decoded_layers"][1]["fields"]
    assert {"name": "Encapsulation", "value": "IPv4"} in packets[7]["decoded_layers"][2]["fields"]
    assert {"name": "Outer", "value": "IPv6"} in packets[7]["decoded_layers"][2]["fields"]
    assert {"name": "Source", "value": "10.4.0.1"} in packets[7]["decoded_layers"][3]["fields"]
    assert {"name": "Destination Port", "value": "4200"} in packets[7]["decoded_layers"][4]["fields"]

    assert packets[8]["type"] == "IPv4/UDP"
    assert "IPv6-over-UDP" in packets[8]["info"]
    assert [layer["name"] for layer in packets[8]["decoded_layers"]] == ["Ethernet", "IPv4", "UDP", "UDP Tunnel", "IPv6", "UDP"]
    assert {"name": "Encapsulation", "value": "IPv6"} in packets[8]["decoded_layers"][3]["fields"]
    assert {"name": "Tunnel Type", "value": "Teredo / IP over UDP"} in packets[8]["decoded_layers"][3]["fields"]
    assert {"name": "Source", "value": "2001:db8::1"} in packets[8]["decoded_layers"][4]["fields"]
    assert {"name": "Destination Port", "value": "12"} in packets[8]["decoded_layers"][5]["fields"]

    assert packets[9]["type"] == "IPv6/ICMPv6"
    assert "Neighbor Solicitation" in packets[9]["info"]
    assert [layer["name"] for layer in packets[9]["decoded_layers"]] == ["Ethernet", "IPv6", "ICMPv6"]
    assert {"name": "Type Name", "value": "Neighbor Solicitation"} in packets[9]["decoded_layers"][2]["fields"]
    assert {"name": "Target", "value": "2001:db8::2"} in packets[9]["decoded_layers"][2]["fields"]
    assert {"name": "Option MAC", "value": "66:77:88:99:aa:bb"} in packets[9]["decoded_layers"][2]["fields"]

    assert packets[10]["type"] == "IPv6/ICMPv6"
    assert "Router Advertisement" in packets[10]["info"]
    assert [layer["name"] for layer in packets[10]["decoded_layers"]] == ["Ethernet", "IPv6", "ICMPv6"]
    ra_fields = packets[10]["decoded_layers"][2]["fields"]
    assert {"name": "Current Hop Limit", "value": "42"} in ra_fields
    assert {"name": "Flags", "value": "0xc0"} in ra_fields
    assert {"name": "Router Lifetime", "value": "900"} in ra_fields
    assert {"name": "Option Type", "value": "Source Link-Layer Address"} in ra_fields
    assert {"name": "Option MAC", "value": "66:77:88:99:aa:bb"} in ra_fields
    assert {"name": "Option Type", "value": "Prefix Information"} in ra_fields
    assert {"name": "Prefix Length", "value": "64"} in ra_fields
    assert {"name": "Prefix Flags", "value": "0x80"} in ra_fields
    assert {"name": "Prefix Valid Lifetime", "value": "3600"} in ra_fields
    assert {"name": "Prefix Preferred Lifetime", "value": "1800"} in ra_fields
    assert {"name": "Prefix", "value": "2001:db8:1000::"} in ra_fields


def test_fetch_capture_decodes_gtpu_udp_port_extension(tmp_path: Path) -> None:
    def ethernet(payload: bytes, eth_type: int = 0x0800) -> bytes:
        return bytes.fromhex("665544332211102030405060") + eth_type.to_bytes(2, "big") + payload

    def ipv4(
        payload: bytes,
        protocol: int,
        src: bytes = b"\xc6\x33\x64\x01",
        dst: bytes = b"\xc6\x33\x64\x02",
        *,
        ttl: int = 64,
    ) -> bytes:
        total_length = 20 + len(payload)
        return (
            b"\x45\x00"
            + total_length.to_bytes(2, "big")
            + b"\x00\x01\x40\x00"
            + bytes([ttl, protocol])
            + b"\x00\x00"
            + src
            + dst
            + payload
        )

    def udp(src_port: int, dst_port: int, payload: bytes) -> bytes:
        return (
            src_port.to_bytes(2, "big")
            + dst_port.to_bytes(2, "big")
            + (8 + len(payload)).to_bytes(2, "big")
            + b"\x00\x00"
            + payload
        )

    inner_ipv4 = ipv4(
        udp(5000, 6000, b"gtpu-extension"),
        17,
        b"\x0a\x09\x00\x01",
        b"\x0a\x09\x00\x02",
        ttl=63,
    )
    gtpu_optional = (7).to_bytes(2, "big") + b"\x03\x40"
    gtpu_udp_port_extension = b"\x01" + (65000).to_bytes(2, "big") + b"\x00"
    gtpu_payload = gtpu_optional + gtpu_udp_port_extension + inner_ipv4
    gtpu_header = b"\x37\xff" + len(gtpu_payload).to_bytes(2, "big") + bytes.fromhex("12345678")
    packet = ethernet(ipv4(udp(2152, 2152, gtpu_header + gtpu_payload), 17))

    class CaptureClient:
        def fetch_capture_packets(
            self,
            capture_id: int,
            output: list[dict[str, object]],
            pkt_count: int,
            fetch_limit: int,
            snaplen: int,
        ) -> None:
            output.append({"binary": packet, "wirelen": len(packet), "origin": "RX", "ts": 1, "index": 1, "port": 1})

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            return {9: {"id": 9, "pkt_count": 1}}

    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(CaptureClient()))  # type: ignore[method-assign]

    result = service.fetch_capture(capture_id=9, pkt_count=1, fetch_limit=1, snaplen=0)

    assert result.ok is True
    packet_record = result.data["packets"][0]
    assert (
        "GTP-U G-PDU (255) teid=0x12345678 seq=7 n-pdu=3 ext=0x40 "
        "udp-port=65000 inner IPv4 10.9.0.1 -> 10.9.0.2 UDP"
    ) in packet_record["info"]
    assert [layer["name"] for layer in packet_record["decoded_layers"]] == [
        "Ethernet",
        "IPv4",
        "UDP",
        "GTP-U",
        "GTP-U Extension",
        "IPv4",
        "UDP",
    ]
    assert {"name": "Flags", "value": "0x37"} in packet_record["decoded_layers"][3]["fields"]
    assert {"name": "Sequence", "value": "7"} in packet_record["decoded_layers"][3]["fields"]
    assert {"name": "N-PDU Number", "value": "3"} in packet_record["decoded_layers"][3]["fields"]
    assert {"name": "Next Extension Header", "value": "0x40"} in packet_record["decoded_layers"][3]["fields"]
    assert {"name": "Type", "value": "UDP Port (0x40)"} in packet_record["decoded_layers"][4]["fields"]
    assert {"name": "UDP Port", "value": "65000"} in packet_record["decoded_layers"][4]["fields"]
    assert {"name": "Next Extension Header", "value": "0x00"} in packet_record["decoded_layers"][4]["fields"]
    assert {"name": "TTL", "value": "63"} in packet_record["decoded_layers"][5]["fields"]
    assert {"name": "Source", "value": "10.9.0.1"} in packet_record["decoded_layers"][5]["fields"]
    assert {"name": "Destination Port", "value": "6000"} in packet_record["decoded_layers"][6]["fields"]


def test_dns_query_summary_reads_type_after_compressed_suffix() -> None:
    dns_offset = 42
    suffix_offset = 12
    suffix = bytes([7]) + b"example" + bytes([3]) + b"com" + b"\x00"
    query_offset = dns_offset + suffix_offset + len(suffix)
    packet = (
        b"\x00" * dns_offset
        + b"\x00" * suffix_offset
        + suffix
        + bytes([3])
        + b"www"
        + b"\xc0"
        + bytes([suffix_offset])
        + b"\x00\x01\x00\x01"
    )

    assert _dns_query_summary(packet, query_offset, len(packet), dns_offset) == ("www.example.com", "A", "IN")


def test_stop_capture_can_write_pcap_under_daemon_log_directory(tmp_path: Path) -> None:
    environment = env(tmp_path)
    packet = bytes.fromhex("ffffffffffff66778899aabb08060001")

    class CaptureClient:
        def _transmit(self, command: str, params: dict[str, object]) -> CaptureRpcResult:
            if params["command"] == "stop":
                return CaptureRpcResult({"pkt_count": 1})
            return CaptureRpcResult()

        def fetch_capture_packets(
            self,
            capture_id: int,
            output: list[dict[str, object]],
            pkt_count: int,
            fetch_limit: int,
            snaplen: int,
        ) -> None:
            output.append({"binary": packet, "wirelen": len(packet), "origin": "TX", "ts": 2.5, "index": 1, "port": 1})

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            return {}

    service = RealStlClientService(environment)
    service._with_client = lambda operation: TrexCallResult(True, data=operation(CaptureClient()))  # type: ignore[method-assign]

    result = service.stop_capture(
        capture_id=7,
        pkt_count=10,
        save_pcap=True,
        file_name="unit-capture.pcap",
        snaplen=0,
    )

    assert result.ok is True
    saved_file = Path(result.data["saved_file"]["path"])
    assert saved_file == tmp_path / "captures" / "unit-capture.pcap"
    content = saved_file.read_bytes()
    assert content[:4] == b"\xd4\xc3\xb2\xa1"
    assert content[-len(packet) :] == packet
    assert result.data["saved_file"]["size_bytes"] == 24 + 16 + len(packet)
    assert result.data["saved_file"]["download_available"] is True
    assert base64.b64decode(result.data["saved_file"]["content_base64"]) == content
    assert result.data["saved_file"]["download_error"] is None


def test_capture_fetch_and_stop_obey_the_same_hard_byte_budget(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    packet = b"abcd"

    class CaptureClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, object]] = []

        def _transmit(self, command: str, params: dict[str, object]) -> CaptureRpcResult:
            self.calls.append(("_transmit", {"command": command, "params": params}))
            if params["command"] == "stop":
                return CaptureRpcResult({"pkt_count": 100})
            return CaptureRpcResult()

        def fetch_capture_packets(
            self,
            capture_id: int,
            output: list[dict[str, object]],
            pkt_count: int,
            fetch_limit: int,
            snaplen: int,
        ) -> None:
            self.calls.append(
                (
                    "fetch_capture_packets",
                    {
                        "capture_id": capture_id,
                        "pkt_count": pkt_count,
                        "fetch_limit": fetch_limit,
                        "snaplen": snaplen,
                    },
                )
            )
            for index in range(pkt_count):
                output.append(
                    {
                        "binary": packet,
                        "wirelen": len(packet),
                        "origin": "RX",
                        "ts": float(index),
                        "index": index,
                        "port": 0,
                    }
                )

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            return {7: {"id": 7, "pkt_count": 100}}

    monkeypatch.setattr(capture_operations, "CAPTURE_FETCH_BYTES_MAX", 10)
    client = CaptureClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    fetched = service.fetch_capture(capture_id=7, pkt_count=10, fetch_limit=10, snaplen=4)
    stopped = service.stop_capture(capture_id=7, pkt_count=10, save_pcap=False, file_name=None, snaplen=4)

    assert fetched.ok is True
    assert fetched.data["packet_count"] == 2
    assert fetched.data["fetch_budget"] == {
        "requested_packet_count": 10,
        "target_packet_count": 10,
        "max_packet_count": 10_000,
        "max_bytes": 10,
        "fetched_bytes": 8,
        "effective_snaplen": 4,
        "truncated_by_byte_budget": True,
    }
    assert stopped.ok is True
    assert stopped.data["packet_count"] == 2
    assert stopped.data["available_packet_count"] == 100
    assert stopped.data["fetch_budget"]["omitted_packet_count"] == 98
    assert stopped.data["fetch_budget"]["truncated_by_byte_budget"] is True
    fetch_calls = [call for call in client.calls if call[0] == "fetch_capture_packets"]
    assert [call[1]["pkt_count"] for call in fetch_calls] == [2, 2]  # type: ignore[index]
    assert [call[1]["snaplen"] for call in fetch_calls] == [4, 4]  # type: ignore[index]


def test_stop_capture_cleans_runtime_after_pcap_write_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = CaptureServiceClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]
    started = service.start_capture(tx_ports=[0], rx_ports=[], limit=1, mode="fixed", bpf_filter="", snaplen=0)

    def fail_write(*args: object, **kwargs: object) -> Path:
        raise OSError("disk full")

    monkeypatch.setattr(capture_operations, "write_capture_pcap", fail_write)

    stopped = service.stop_capture(capture_id=7, pkt_count=1, save_pcap=True, file_name="failed.pcap", snaplen=0)

    assert started.ok is True
    assert stopped.ok is False
    assert stopped.blocker == "trex_command_failed"
    assert stopped.data["primary_error"] == {"stage": "pcap_write", "error": "disk full"}
    assert stopped.data["cleanup_errors"] == []
    assert stopped.data["capture_stopped"] is True
    assert stopped.data["capture_removed"] is True
    assert stopped.data["service_mode"]["restored_ports"] == [0]
    assert client.status == {}
    assert client.ports[0].service_mode is False
    assert client.acquired_ports == set()
    assert service._capture_runtime.managed_capture_ids() == []


def test_stop_capture_remove_failure_preserves_runtime_ledger_for_retry(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingCleanupClient(CaptureServiceClient):
        def _transmit(self, command: str, params: dict[str, object]) -> CaptureRpcResult:
            if params["command"] == "stop":
                return CaptureRpcResult({"pkt_count": 0})
            return CaptureRpcResult(ok=False)

    client = FailingCleanupClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]
    started = service.start_capture(tx_ports=[0], rx_ports=[], limit=1, mode="fixed", bpf_filter="", snaplen=0)

    def fail_write(*args: object, **kwargs: object) -> Path:
        raise OSError("disk full")

    monkeypatch.setattr(capture_operations, "write_capture_pcap", fail_write)

    stopped = service.stop_capture(capture_id=7, pkt_count=1, save_pcap=True, file_name="failed.pcap", snaplen=0)

    assert started.ok is True
    assert stopped.ok is False
    assert stopped.blocker == "trex_command_failed"
    assert stopped.data["primary_error"] == {"stage": "pcap_write", "error": "disk full"}
    assert stopped.data["cleanup_errors"] == [
        {"stage": "capture_remove", "error": "capture RPC failed"},
    ]
    assert "pcap_write: disk full" in stopped.error
    assert "capture_remove: capture RPC failed" in stopped.error
    assert not any(
        call[0] == "set_service_mode" and call[1]["enabled"] is False
        for call in client.calls
    )
    assert not any(call[0] == "release" for call in client.calls)
    assert 7 in client.status
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    assert service._capture_runtime.managed_capture_ids() == [7]


def test_stop_capture_restore_failure_keeps_acquired_port_for_retry(tmp_path: Path) -> None:
    class FailingRestoreClient(CaptureServiceClient):
        def set_service_mode(self, ports: list[int], enabled: bool, filtered: bool, mask: int | None) -> None:
            if not enabled:
                self.calls.append(
                    (
                        "set_service_mode",
                        {"ports": ports, "enabled": enabled, "filtered": filtered, "mask": mask},
                    )
                )
                raise RuntimeError("restore failed")
            super().set_service_mode(ports, enabled, filtered, mask)

    client = FailingRestoreClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]
    assert service.start_capture(tx_ports=[0], rx_ports=[], limit=1, mode="fixed", bpf_filter="", snaplen=0).ok

    stopped = service.stop_capture(capture_id=7, pkt_count=1, save_pcap=False, file_name=None, snaplen=0)

    assert stopped.ok is False
    assert stopped.blocker == "capture_cleanup_failed"
    assert stopped.data["capture_removed"] is True
    assert stopped.data["cleanup_errors"] == [
        {"stage": "service_mode_restore", "error": "restore failed"},
    ]
    assert not any(call[0] == "release" for call in client.calls)
    assert client.status == {}
    assert client.ports[0].service_mode is True
    assert client.acquired_ports == {0}
    assert service._capture_runtime.managed_capture_ids() == [7]


def test_capture_release_sdk_failure_keeps_persisted_lease_until_retry(tmp_path: Path) -> None:
    class ReleaseRetryClient(CaptureServiceClient):
        def __init__(self) -> None:
            super().__init__()
            self.release_failures = 1

        def release(self, ports: list[int]) -> None:
            if self.release_failures:
                self.calls.append(("release", {"ports": ports}))
                self.release_failures -= 1
                raise RuntimeError("release failed")
            super().release(ports)

    client = ReleaseRetryClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]
    assert service.start_capture(tx_ports=[0], rx_ports=[], limit=1, mode="fixed", bpf_filter="", snaplen=0).ok

    stopped = service.stop_capture(capture_id=7, pkt_count=1, save_pcap=False, file_name=None, snaplen=0)

    assert stopped.ok is False
    assert stopped.blocker == "capture_cleanup_failed"
    assert stopped.data["cleanup_errors"] == [
        {"stage": "port_release", "error": "release failed"},
    ]
    persisted = RuntimeStateStore(tmp_path / "runtime-state.json").load().capture_leases
    assert len(persisted) == 1
    assert persisted[0].service_states == {}
    assert persisted[0].acquired_ports == [0]

    service._capture_runtime.release_ports(client, [7])

    assert client.acquired_ports == set()
    assert service._capture_runtime.managed_capture_ids() == []
    assert RuntimeStateStore(tmp_path / "runtime-state.json").load().capture_leases == []
    assert [call for call in client.calls if call[0] == "release"] == [
        ("release", {"ports": [0]}),
        ("release", {"ports": [0]}),
    ]


def test_capture_release_persist_failure_does_not_double_release_on_retry(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = CaptureServiceClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]
    assert service.start_capture(tx_ports=[0], rx_ports=[], limit=1, mode="fixed", bpf_filter="", snaplen=0).ok
    state_store = service._capture_runtime._state_store
    assert state_store is not None
    original_write = state_store._write_unlocked
    failed = False

    def fail_empty_lease_write_once(state: object) -> None:
        nonlocal failed
        capture_leases = getattr(state, "capture_leases")
        if not capture_leases and not failed:
            failed = True
            raise RuntimeError("state write failed after release")
        original_write(state)  # type: ignore[arg-type]

    monkeypatch.setattr(state_store, "_write_unlocked", fail_empty_lease_write_once)

    stopped = service.stop_capture(capture_id=7, pkt_count=1, save_pcap=False, file_name=None, snaplen=0)

    assert stopped.ok is False
    assert stopped.blocker == "capture_cleanup_failed"
    assert stopped.data["cleanup_errors"] == [
        {"stage": "port_release", "error": "state write failed after release"},
    ]
    assert client.acquired_ports == set()
    persisted = RuntimeStateStore(tmp_path / "runtime-state.json").load().capture_leases
    assert len(persisted) == 1
    assert persisted[0].service_states == {}
    assert persisted[0].acquired_ports == [0]

    service._capture_runtime.release_ports(client, [7])

    assert service._capture_runtime.managed_capture_ids() == []
    assert RuntimeStateStore(tmp_path / "runtime-state.json").load().capture_leases == []
    assert [call for call in client.calls if call[0] == "release"] == [
        ("release", {"ports": [0]}),
    ]


def test_write_capture_pcap_atomically_keeps_existing_target_when_replace_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = env(tmp_path)
    capture_root = tmp_path / "captures"
    capture_root.mkdir()
    target = capture_root / "existing.pcap"
    target.write_bytes(b"existing capture")

    def fail_replace(source: object, destination: object) -> None:
        raise OSError("replace failed")

    monkeypatch.setattr(capture_files.os, "replace", fail_replace)

    with pytest.raises(OSError, match="replace failed"):
        capture_files.write_capture_pcap(
            environment,
            7,
            [{"binary": b"packet", "wirelen": 6, "ts": 0.0}],
            target.name,
        )

    assert target.read_bytes() == b"existing capture"
    assert list(capture_root.glob(f".{target.name}.*.tmp")) == []


def test_capture_file_list_and_download_stay_under_capture_directory(tmp_path: Path) -> None:
    environment = env(tmp_path)
    root = tmp_path / "captures"
    root.mkdir()
    capture_file = root / "unit-capture.pcap"
    capture_file.write_bytes(b"\xd4\xc3\xb2\xa1unit")
    (root / "notes.txt").write_text("ignore", encoding="utf-8")

    service = RealStlClientService(environment)

    listed = service.list_capture_files()
    assert listed.ok is True
    assert listed.data["root"] == str(root)
    assert [record["name"] for record in listed.data["files"]] == ["unit-capture.pcap"]
    assert listed.data["files"][0]["download_available"] is True
    assert listed.data["files"][0]["content_base64"] is None
    assert listed.data["files"][0]["modified_time"]

    downloaded = service.download_capture_file("unit-capture.pcap")
    assert downloaded.ok is True
    assert downloaded.data["file"]["name"] == "unit-capture.pcap"
    assert base64.b64decode(downloaded.data["file"]["content_base64"]) == capture_file.read_bytes()

    denied = service.download_capture_file("../unit-capture.pcap")
    assert denied.ok is False
    assert denied.blocker == "capture_file_name_invalid"


def test_open_capture_file_requires_configured_command(tmp_path: Path) -> None:
    environment = env(tmp_path)
    root = tmp_path / "captures"
    root.mkdir()
    (root / "unit-capture.pcap").write_bytes(b"\xd4\xc3\xb2\xa1unit")

    result = RealStlClientService(environment).open_capture_file("unit-capture.pcap")

    assert result.ok is False
    assert result.blocker == "capture_open_unconfigured"


def test_open_capture_file_launches_configured_command_under_capture_directory(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), capture_open_command=["wireshark", "-r"])
    root = tmp_path / "captures"
    root.mkdir()
    capture_file = root / "unit-capture.pcap"
    capture_file.write_bytes(b"\xd4\xc3\xb2\xa1unit")
    calls: list[tuple[list[str], Path]] = []

    def opener(command: list[str], cwd: Path) -> int:
        calls.append((command, cwd))
        return 4321

    result = RealStlClientService(environment, capture_file_opener=opener).open_capture_file("unit-capture.pcap")

    assert result.ok is True
    assert result.data["accepted"] is True
    assert result.data["pid"] == 4321
    assert result.data["file"]["name"] == "unit-capture.pcap"
    assert result.data["file"]["content_base64"] is None
    assert calls == [(["wireshark", "-r", str(capture_file.resolve())], root.resolve())]


def test_open_capture_file_keeps_saved_file_path_under_capture_directory(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), capture_open_command=["wireshark", "-r"])
    service = RealStlClientService(
        environment,
        capture_file_opener=lambda _command, _cwd: (_ for _ in ()).throw(AssertionError("opener should not run")),
    )

    result = service.open_capture_file("../unit-capture.pcap")

    assert result.ok is False
    assert result.blocker == "capture_file_name_invalid"


def _evidenced_report_session() -> TrafficSessionState:
    timestamp = "2026-07-31T00:00:00Z"
    run_id = "22222222-2222-4222-8222-222222222222"
    evidence = TrafficMutationEvidenceState(
        intent_nonce=run_id,
        operation="start",
        completion_mode="direct",
        ports=[0],
        baseline_port_states={0: "stopped"},
        desired_port_states={0: "running"},
        prepared_at=timestamp,
        completed_at=timestamp,
    )
    return TrafficSessionState(
        id=run_id,
        revision=1,
        evidence_version=1,
        authority=RuntimeAuthorityIdentity(
            host="127.0.0.1",
            sync_port=4501,
            async_port=4500,
            scapy_port=4507,
            daemon_supervisor="systemd",
            generation="11111111-1111-4111-8111-111111111111",
        ),
        state="running",
        started_at=timestamp,
        updated_at=timestamp,
        groups=[
            TrafficSessionGroupState(
                group_id=None,
                run_id=run_id,
                source="ad_hoc",
                plan_revision=None,
                ports=[0],
                profile_path="/tmp/profile.py",
                profile_sha256="a" * 64,
                start_multiplier="1kpps",
                multiplier="1kpps",
                duration=-1,
                start_force=False,
                start_total=False,
                start_synchronized=False,
                start_clear_existing=True,
                started_at=timestamp,
                start_evidence=evidence,
                state="running",
                port_states={0: "running"},
                updated_at=timestamp,
            )
        ],
        mutation_evidence=[evidence],
    )


def test_run_report_save_list_and_download_stay_under_report_directory(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_run_report(
        title="Line-rate UDP run",
        markdown="# Line-rate UDP run\n\n- profile: bench.py\n",
        payload={"profile": "bench.py", "ports": [0, 1], "stats": {"tx_bps": 10_000_000}},
        file_name="line-rate-run",
    )

    assert saved.ok is True
    report_file = tmp_path / "reports" / "line-rate-run.json"
    assert Path(saved.data["file"]["path"]) == report_file
    assert saved.data["file"]["name"] == "line-rate-run.json"
    assert saved.data["file"]["title"] == "Line-rate UDP run"
    assert saved.data["file"]["generated_at"]
    assert saved.data["file"]["download_available"] is True
    assert "\"markdown\"" in saved.data["file"]["content"]
    assert json.loads(report_file.read_text(encoding="utf-8"))["version"] == 2

    listed = service.list_run_reports()
    assert listed.ok is True
    assert listed.data["root"] == str(tmp_path / "reports")
    assert [record["name"] for record in listed.data["files"]] == ["line-rate-run.json"]
    assert listed.data["files"][0]["content"] is None
    assert listed.data["files"][0]["title"] == "Line-rate UDP run"

    downloaded = service.download_run_report("line-rate-run.json")
    assert downloaded.ok is True
    assert downloaded.data["file"]["content"] == report_file.read_text(encoding="utf-8")

    denied = service.download_run_report("../line-rate-run.json")
    assert denied.ok is False
    assert denied.blocker == "run_report_file_name_invalid"


def test_run_report_save_injects_exact_backend_session_under_revision_cas(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path)
    store = RuntimeStateStore(environment.runtime_state_path)
    session = _evidenced_report_session()
    store.update(
        lambda document: document.model_copy(
            update={"traffic_session": session},
            deep=True,
        )
    )
    service = RealStlClientService(
        environment,
        runtime_state_store=store,
    )

    saved = service.save_run_report(
        title="Canonical run",
        markdown="# Canonical run",
        payload={"traffic_session": {"id": "client-fabricated"}},
        file_name="canonical-run.json",
        traffic_session_id=session.id,
        traffic_session_revision=session.revision,
    )

    assert saved.ok is True
    archive = json.loads(
        (tmp_path / "reports" / "canonical-run.json").read_text(
            encoding="utf-8"
        )
    )
    assert archive["version"] == 2
    assert archive["payload"]["traffic_session"] == session.model_dump(
        mode="json"
    )
    assert archive["payload"]["traffic_session_binding"] == {
        "id": session.id,
        "revision": 1,
        "evidence_version": 1,
    }


def test_run_report_session_binding_fails_closed_without_writing(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path)
    store = RuntimeStateStore(environment.runtime_state_path)
    session = _evidenced_report_session()
    store.update(
        lambda document: document.model_copy(
            update={"traffic_session": session},
            deep=True,
        )
    )
    service = RealStlClientService(
        environment,
        runtime_state_store=store,
    )

    stale = service.save_run_report(
        "Stale",
        "# Stale",
        {},
        "stale.json",
        traffic_session_id=session.id,
        traffic_session_revision=session.revision + 1,
    )
    unbound = service.save_run_report(
        "Unbound",
        "# Unbound",
        {"traffic_session": {"id": session.id}},
        "unbound.json",
    )

    assert stale.blocker == "run_report_session_conflict"
    assert unbound.blocker == "run_report_session_binding_required"
    assert not (tmp_path / "reports").exists()


def test_run_report_rejects_legacy_session_evidence_without_rewriting(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path)
    store = RuntimeStateStore(environment.runtime_state_path)
    evidenced = _evidenced_report_session()
    legacy = TrafficSessionState(
        id=evidenced.id,
        authority=evidenced.authority,
        state="running",
        started_at=evidenced.started_at,
        updated_at=evidenced.updated_at,
        groups=[
            TrafficSessionGroupState(
                group_id="pair-0",
                ports=[0],
                profile_path="/tmp/profile.py",
                multiplier="1",
                duration=-1,
                state="running",
                port_states={0: "running"},
                updated_at=evidenced.updated_at,
            )
        ],
    )
    store.update(
        lambda document: document.model_copy(
            update={"traffic_session": legacy},
            deep=True,
        )
    )
    service = RealStlClientService(
        environment,
        runtime_state_store=store,
    )

    rejected = service.save_run_report(
        "Legacy",
        "# Legacy",
        {},
        "legacy.json",
        traffic_session_id=legacy.id,
        traffic_session_revision=legacy.revision,
    )

    assert rejected.blocker == "run_report_session_evidence_unavailable"
    assert not (tmp_path / "reports").exists()


def test_run_report_save_rejects_non_json_payload_and_dirty_name(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))

    dirty = service.save_run_report("Run", "body", {}, "../run.json")
    assert dirty.ok is False
    assert dirty.blocker == "run_report_file_name_invalid"

    invalid_payload = service.save_run_report("Run", "body", {"bad": {1, 2, 3}}, "run.json")
    assert invalid_payload.ok is False
    assert invalid_payload.blocker == "run_report_payload_invalid"


def test_run_report_trends_summarize_archived_verdicts_and_metrics(tmp_path: Path) -> None:
    reports_root = tmp_path / "reports"
    reports_root.mkdir()
    for file_name, generated_at, verdict, tx_pps, drop_rate in [
        ("old.json", "2026-06-01T00:00:00+00:00", "pass", "10 Kpps", "0 b/s"),
        ("latest.json", "2026-06-02T00:00:00+00:00", "fail", "12 Kpps", "1 Mb/s"),
    ]:
        (reports_root / file_name).write_text(
            json.dumps(
                {
                    "version": 1,
                    "title": file_name,
                    "generated_at": generated_at,
                    "markdown": "# run",
                    "payload": {
                        "profile": "bench.py",
                        "conclusion": {"verdict": verdict, "summary": f"{verdict} summary"},
                        "metrics": [
                            {"label": "Tx PPS", "value": tx_pps},
                            {"label": "Drop rate", "value": drop_rate},
                            {"label": "Monitor packets", "value": "128"},
                        ],
                        "traffic_session": {"duration": "3.0 s"},
                    },
                },
                allow_nan=False,
            ),
            encoding="utf-8",
        )
    (reports_root / "broken.json").write_text("{", encoding="utf-8")

    result = RealStlClientService(env(tmp_path)).run_report_trends(limit=10)

    assert result.ok is True
    assert result.data["root"] == str(reports_root)
    assert result.data["total"] == 2
    assert result.data["skipped"] == 1
    assert result.data["verdict_counts"] == {"pass": 1, "warn": 0, "fail": 1, "unknown": 0}
    assert result.data["conclusion"]["verdict"] == "fail"
    assert "Latest drop rate is non-zero: 1 Mb/s" in result.data["conclusion"]["reasons"]
    assert [record["name"] for record in result.data["records"]] == ["latest.json", "old.json"]
    tx_pps_trend = next(trend for trend in result.data["metric_trends"] if trend["label"] == "Tx PPS")
    assert tx_pps_trend["latest"] == "12 Kpps"
    assert tx_pps_trend["previous"] == "10 Kpps"
    assert tx_pps_trend["delta"] == 2
    assert tx_pps_trend["direction"] == "up"


def test_run_report_trends_reads_v2_summary_duration_and_keeps_v1_session_duration(
    tmp_path: Path,
) -> None:
    reports_root = tmp_path / "reports"
    reports_root.mkdir()
    canonical_session = _evidenced_report_session().model_dump(mode="json")
    archives = [
        (
            "legacy.json",
            {
                "version": 1,
                "title": "Legacy run",
                "generated_at": "2026-07-30T00:00:00+00:00",
                "markdown": "# legacy",
                "payload": {
                    "profile": "legacy.py",
                    "conclusion": {"verdict": "pass", "summary": "legacy pass"},
                    "traffic_session": {"duration": "3.0 s"},
                },
            },
        ),
        (
            "canonical.json",
            {
                "version": 2,
                "title": "Canonical run",
                "generated_at": "2026-07-31T00:00:00+00:00",
                "markdown": "# canonical",
                "payload": {
                    "profile": "canonical.py",
                    "duration_seconds": 99,
                    "conclusion": {"verdict": "pass", "summary": "canonical pass"},
                    "traffic_session": canonical_session,
                    "traffic_session_binding": {
                        "id": canonical_session["id"],
                        "revision": canonical_session["revision"],
                        "evidence_version": canonical_session["evidence_version"],
                    },
                    "traffic_run_summary": {"duration": "4.5 s"},
                },
            },
        ),
    ]
    for file_name, archive in archives:
        (reports_root / file_name).write_text(
            json.dumps(archive, allow_nan=False),
            encoding="utf-8",
        )

    result = RealStlClientService(env(tmp_path)).run_report_trends(limit=10)

    assert result.ok is True
    assert result.data["total"] == 2
    assert [record["name"] for record in result.data["records"]] == [
        "canonical.json",
        "legacy.json",
    ]
    canonical, legacy = result.data["records"]
    assert canonical["title"] == "Canonical run"
    assert canonical["generated_at"] == "2026-07-31T00:00:00+00:00"
    assert canonical["profile"] == "canonical.py"
    assert canonical["run_duration"] == "4.5 s"
    assert legacy["profile"] == "legacy.py"
    assert legacy["run_duration"] == "3.0 s"


def test_run_report_trends_recognizes_acceptance_archives(tmp_path: Path) -> None:
    reports_root = tmp_path / "reports"
    reports_root.mkdir()
    (reports_root / "acceptance.json").write_text(
        json.dumps(
            {
                "version": 1,
                "title": "TRex Acceptance Run",
                "generated_at": "2026-06-09T22:30:36+00:00",
                "markdown": "# acceptance",
                "payload": {
                    "profile": "gre-inner-envelope-field-match-acceptance.yaml",
                    "duration_seconds": 2.0,
                    "verdict": "pass",
                    "capture_layer_match": {
                        "status": "pass",
                        "summary": "Capture decode matched 1 expected stream layer chain(s)",
                    },
                    "capture_field_match": {
                        "status": "pass",
                        "summary": "Capture decode matched 20 expected profile field(s)",
                    },
                    "capture_decode_summary": {"packet_count": 128},
                    "stats_samples": [
                        {
                            "tx_pps": 173.09231567382812,
                            "rx_pps": 173.58251953125,
                            "tx_bps": 132934.890625,
                            "rx_bps": 133311.359375,
                            "drop_bps": 0.0,
                        }
                    ],
                },
            },
            allow_nan=False,
        ),
        encoding="utf-8",
    )

    result = RealStlClientService(env(tmp_path)).run_report_trends(limit=10)

    assert result.ok is True
    assert result.data["verdict_counts"] == {"pass": 1, "warn": 0, "fail": 0, "unknown": 0}
    assert result.data["conclusion"]["verdict"] == "pass"
    assert result.data["records"][0]["summary"] == "pass: Capture decode matched 20 expected profile field(s)"
    assert result.data["records"][0]["run_duration"] == "2.0"
    assert result.data["records"][0]["metrics"]["Tx PPS"]["value"] == "173.092 pps"
    assert result.data["records"][0]["metrics"]["Rx L2"]["value"] == "133311 b/s"
    assert result.data["records"][0]["metrics"]["Drop rate"]["value"] == "0 b/s"
    assert result.data["records"][0]["metrics"]["Monitor packets"]["value"] == "128"


def test_run_report_trends_warn_when_clean_history_metrics_regress(tmp_path: Path) -> None:
    reports_root = tmp_path / "reports"
    reports_root.mkdir()
    for file_name, generated_at, rx_pps, rx_l2, latency_avg in [
        ("old.json", "2026-06-01T00:00:00+00:00", "10 Kpps", "1.28414e+06 b/s", "10 us"),
        ("latest.json", "2026-06-02T00:00:00+00:00", "8 Kpps", "1.16645e+06 b/s", "18 us"),
    ]:
        (reports_root / file_name).write_text(
            json.dumps(
                {
                    "version": 1,
                    "title": file_name,
                    "generated_at": generated_at,
                    "markdown": "# run",
                    "payload": {
                        "profile": "bench.py",
                        "conclusion": {"verdict": "pass", "summary": "clean"},
                        "metrics": [
                            {"label": "Rx PPS", "value": rx_pps},
                            {"label": "Rx L2", "value": rx_l2},
                            {"label": "Latency avg", "value": latency_avg},
                            {"label": "Drop rate", "value": "0 b/s"},
                        ],
                    },
                },
                allow_nan=False,
            ),
            encoding="utf-8",
        )

    result = RealStlClientService(env(tmp_path)).run_report_trends(limit=10)

    assert result.ok is True
    assert result.data["conclusion"]["verdict"] == "warn"
    assert "Latency avg increased by 8 us" in result.data["conclusion"]["reasons"]
    assert "Rx PPS decreased by 2 Kpps" in result.data["conclusion"]["reasons"]
    assert "Rx L2 decreased by 117.69 Kb/s" in result.data["conclusion"]["reasons"]
    rx_l2_trend = next(trend for trend in result.data["metric_trends"] if trend["label"] == "Rx L2")
    assert rx_l2_trend["direction"] == "down"
    assert rx_l2_trend["delta"] == pytest.approx(-117_690)


def test_run_report_trends_rejects_invalid_limit(tmp_path: Path) -> None:
    result = RealStlClientService(env(tmp_path)).run_report_trends(limit=0)

    assert result.ok is False
    assert result.blocker == "run_report_trend_limit_invalid"


def test_remove_capture_uses_capture_remove_rpc_when_public_helper_is_missing(tmp_path: Path) -> None:
    class CaptureClient:
        def __init__(self) -> None:
            self.status: dict[int, dict[str, object]] = {7: {"id": 7, "pkt_count": 12, "state": "ACTIVE"}}
            self.calls: list[tuple[str, object]] = []

        def get_capture_status(self) -> dict[int, dict[str, object]]:
            self.calls.append(("get_capture_status", None))
            return self.status

        def _transmit(self, command: str, params: dict[str, object]) -> bool:
            self.calls.append(("_transmit", {"command": command, "params": params}))
            self.status = {}
            return True

    client = CaptureClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.remove_capture(7)

    assert result.ok is True
    assert result.data["accepted"] is True
    assert result.data["removed_ids"] == [7]
    assert result.data["captures_before"] == [{"id": 7, "pkt_count": 12, "state": "ACTIVE"}]
    assert result.data["captures"] == []
    assert client.calls == [
        ("get_capture_status", None),
        ("_transmit", {"command": "capture", "params": {"command": "remove", "capture_id": 7}}),
        ("get_capture_status", None),
    ]


def test_remove_capture_rejects_invalid_id_before_connect(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(None))  # type: ignore[method-assign]

    result = service.remove_capture(-1)

    assert result.ok is False
    assert result.blocker == "capture_id_invalid"


def test_ping_result_survives_service_restore_failure_from_active_capture(tmp_path: Path) -> None:
    class PortObject:
        def __init__(self) -> None:
            self.service_mode = False

        def is_service_mode_on(self) -> bool:
            return self.service_mode

        def is_service_filtered_mode_on(self) -> bool:
            return False

    class PingClient:
        def __init__(self) -> None:
            self.ports = {0: PortObject()}
            self.calls: list[tuple[str, object]] = []

        def get_all_ports(self) -> list[int]:
            return [0]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", ports))

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))

        def set_service_mode(self, ports: list[int], enabled: bool, filtered: bool, mask: int | None) -> None:
            self.calls.append(("set_service_mode", {"ports": ports, "enabled": enabled}))
            if enabled:
                for port in ports:
                    self.ports[port].service_mode = True
                return
            raise RuntimeError("unable to disable service mode - an active capture on port 0 exists")

        def ping_ip(
            self,
            src_port: int,
            dst_ip: str,
            pkt_size: int,
            count: int,
            interval_sec: float,
            vlan: list[int] | None,
        ) -> list[dict[str, object]]:
            self.calls.append(("ping_ip", {"src_port": src_port, "dst_ip": dst_ip, "count": count}))
            return [
                {
                    "formatted_string": "Reply from 2.2.2.2: bytes=64, time=0.10ms, TTL=64",
                    "status": "success",
                    "src_ip": "2.2.2.2",
                    "rtt": 0.1,
                    "ttl": 64,
                },
                {"responder_ip": "N/A", "ttl": "N/A", "rtt": "N/A", "pkt_size": "N/A", "state": 0},
            ]

    client = PingClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.ping(port=0, destination="2.2.2.2", pkt_size=64, count=1, interval_sec=0, vlan=None)

    assert result.ok is True
    assert result.data["record_count"] == 2
    assert result.data["reply_count"] == 1
    assert result.data["timeout_count"] == 1
    assert result.data["summary"] == "Ping complete: 1/2 replies, 1 timed out."
    assert result.data["records"] == [
        {
            "sequence": 1,
            "status": "success",
            "responder_ip": "2.2.2.2",
            "ttl": "64",
            "rtt_ms": 0.1,
            "packet_size": None,
            "formatted_string": "Reply from 2.2.2.2: bytes=64, time=0.10ms, TTL=64",
        },
        {
            "sequence": 2,
            "status": "timeout",
            "responder_ip": None,
            "ttl": None,
            "rtt_ms": None,
            "packet_size": None,
            "formatted_string": "Request timed out.",
        },
    ]
    assert client.calls == [
        ("acquire", [0]),
        ("set_service_mode", {"ports": [0], "enabled": True}),
        ("ping_ip", {"src_port": 0, "dst_ip": "2.2.2.2", "count": 1}),
        ("set_service_mode", {"ports": [0], "enabled": False}),
        ("release", [0]),
    ]


def test_configure_port_layer_temporarily_enables_service_mode(tmp_path: Path) -> None:
    class PortObject:
        def __init__(self) -> None:
            self.service_mode = False
            self.service_mode_filtered = False
            self.service_mask = None

        def is_service_mode_on(self) -> bool:
            return self.service_mode

        def is_service_filtered_mode_on(self) -> bool:
            return self.service_mode_filtered

    class ConfigClient:
        def __init__(self) -> None:
            self.ports = {0: PortObject()}
            self.calls: list[tuple[str, object]] = []

        def get_all_ports(self) -> list[int]:
            self.calls.append(("get_all_ports", None))
            return [0]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            self.calls.append(("acquire", {"ports": ports, "force": force, "sync_streams": sync_streams}))

        def release(self, ports: list[int]) -> None:
            self.calls.append(("release", ports))

        def set_service_mode(self, ports: list[int], enabled: bool, filtered: bool, mask: int | None) -> None:
            self.calls.append(("set_service_mode", {"ports": ports, "enabled": enabled, "filtered": filtered, "mask": mask}))
            for port in ports:
                self.ports[port].service_mode = enabled
                self.ports[port].service_mode_filtered = filtered
                self.ports[port].service_mask = mask

        def set_vlan(self, ports: list[int], vlan: list[int]) -> None:
            self.calls.append(("set_vlan", {"ports": ports, "vlan": vlan}))

        def set_l3_mode(self, port: int, src_ipv4: str, dst_ipv4: str) -> None:
            self.calls.append(("set_l3_mode", {"port": port, "src_ipv4": src_ipv4, "dst_ipv4": dst_ipv4}))

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            self.calls.append(("get_port_info", ports))
            return [{"arp": "02:00:00:00:00:04", "src_ipv4": "1.1.1.1"}]

    client = ConfigClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.configure_port_layer(
        port=0,
        mode="L3",
        l2_destination=None,
        l3_source="1.1.1.1",
        l3_destination="2.2.2.2",
        vlan=[100],
    )

    assert result.ok is True
    assert result.data["mode"] == "L3"
    assert result.data["port_info"]["arp"] == "02:00:00:00:00:04"
    assert client.ports[0].service_mode is False
    assert client.calls == [
        ("get_all_ports", None),
        ("acquire", {"ports": [0], "force": False, "sync_streams": True}),
        ("set_service_mode", {"ports": [0], "enabled": True, "filtered": False, "mask": None}),
        ("set_vlan", {"ports": [0], "vlan": [100]}),
        ("set_l3_mode", {"port": 0, "src_ipv4": "1.1.1.1", "dst_ipv4": "2.2.2.2"}),
        ("get_port_info", [0]),
        ("set_service_mode", {"ports": [0], "enabled": False, "filtered": False, "mask": None}),
        ("release", [0]),
    ]


def test_configure_port_layer_rejects_mixed_ip_versions_before_connect(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(None))  # type: ignore[method-assign]

    result = service.configure_port_layer(
        port=0,
        mode="L3",
        l2_destination=None,
        l3_source="1.1.1.1",
        l3_destination="2001:db8::1",
        vlan=None,
    )

    assert result.ok is False
    assert result.blocker == "port_configuration_invalid"
    assert result.error == "source and destination IP versions must match"


def test_configure_port_layer_uses_local_peer_mac_when_arp_fails(tmp_path: Path) -> None:
    class PortObject:
        def __init__(self) -> None:
            self.service_mode = False
            self.calls: list[tuple[str, object]] = []

        def is_service_mode_on(self) -> bool:
            return self.service_mode

        def is_service_filtered_mode_on(self) -> bool:
            return False

        def set_l3_mode(self, src_ipv4: str, dst_ipv4: str, resolved_mac: str) -> bool:
            self.calls.append(
                ("set_l3_mode_with_mac", {"src_ipv4": src_ipv4, "dst_ipv4": dst_ipv4, "resolved_mac": resolved_mac})
            )
            return True

    class PeerClient:
        def __init__(self) -> None:
            self.ports = {0: PortObject(), 1: PortObject()}

        def get_all_ports(self) -> list[int]:
            return [0, 1]

        def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
            return None

        def release(self, ports: list[int]) -> None:
            return None

        def set_service_mode(self, ports: list[int], enabled: bool, filtered: bool, mask: int | None) -> None:
            for port in ports:
                self.ports[port].service_mode = enabled

        def set_l3_mode(self, port: int, src_ipv4: str, dst_ipv4: str) -> None:
            raise RuntimeError("Could not resolve following ports: [0]")

        def get_port_info(self, ports: list[int]) -> list[dict[str, object]]:
            records = {
                0: {"src_ipv4": "1.1.1.1", "src_mac": "02:00:00:00:00:03", "arp": "unresolved"},
                1: {"src_ipv4": "2.2.2.2", "src_mac": "02:00:00:00:00:04", "arp": "02:00:00:00:00:03"},
            }
            return [records[port] for port in ports]

    client = PeerClient()
    service = RealStlClientService(env(tmp_path))
    service._with_client = lambda operation: TrexCallResult(True, data=operation(client))  # type: ignore[method-assign]

    result = service.configure_port_layer(
        port=0,
        mode="L3",
        l2_destination=None,
        l3_source="1.1.1.1",
        l3_destination="2.2.2.2",
        vlan=None,
    )

    assert result.ok is True
    assert result.data["arp_resolution"] == "local_port"
    assert client.ports[0].calls == [
        (
            "set_l3_mode_with_mac",
            {"src_ipv4": "1.1.1.1", "dst_ipv4": "2.2.2.2", "resolved_mac": "02:00:00:00:00:04"},
        )
    ]


def test_workbench_profile_save_and_load_round_trips_gui_yaml(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "latency-stream",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "mode": "continuous",
        "rate_type": "pps",
        "rate_value": 1500,
        "enabled": True,
        "self_start": True,
        "pg_id": 7,
        "flow_stats_enabled": True,
        "latency_enabled": True,
        "ether_dst": "aa:bb:cc:dd:ee:ff",
        "ether_src": "00:11:22:33:44:55",
        "ipv4_src": "198.51.100.10",
        "ipv4_dst": "203.0.113.20",
        "l4_src_port_override": True,
        "l4_src_port": 4000,
        "l4_dst_port_override": True,
        "l4_dst_port": 5000,
        "udp_length_override": True,
        "udp_length": 64,
        "udp_checksum_override": True,
        "udp_checksum": "BEEF",
        "udp_checksum_mode": "Increment",
        "udp_checksum_count": 4,
        "udp_checksum_step": 1,
        "advanced_cache_size_type": "Enable",
        "advanced_cache_value": 42,
    }

    saved = service.save_workbench_profile("unit-profile.yaml", [stream])

    assert saved.ok is True
    assert saved.data["profile"]["relative_path"] == "unit-profile.yaml"
    assert saved.data["streams"] == [
        {
            "index": 1,
            "name": "latency-stream",
            "packet_type": "Ethernet/IPv4/UDP",
            "length": 128,
            "mode": "continuous",
            "rate": "1500 pps",
            "next_stream": "-",
        }
    ]
    assert "packet:" in saved.data["content"]
    assert "cache_size: 42" in saved.data["content"]
    preview = saved.data["packet_previews"][0]
    assert preview["wire_length"] == 128
    assert preview["layers"][0]["fields"]["destination"] == "aa:bb:cc:dd:ee:ff"
    assert preview["layers"][0]["fields"]["source"] == "00:11:22:33:44:55"
    assert preview["layers"][1]["fields"]["source"] == "198.51.100.10"
    assert preview["layers"][1]["fields"]["destination"] == "203.0.113.20"
    assert preview["layers"][2]["name"] == "UDP"
    assert preview["layers"][2]["fields"]["source_port"] == 4000
    assert preview["layers"][2]["fields"]["destination_port"] == 5000
    assert preview["layers"][2]["fields"]["length"] == 64
    assert preview["layers"][2]["fields"]["checksum"] == "BEEF"
    assert preview["layers"][2]["fields"]["checksum_override"] is True
    assert preview["layers"][2]["fields"]["checksum_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["checksum_count"] == 4
    assert preview["layers"][2]["fields"]["checksum_step"] == 1
    packet = base64.b64decode(preview["binary_base64"])
    assert int.from_bytes(packet[38:40], "big") == 64
    assert int.from_bytes(packet[40:42], "big") == 0xBEEF
    assert preview["hex"].startswith("aabbccddeeff0011223344550800")
    assert (environment.profile_roots[0] / "unit-profile.yaml").exists()

    loaded = service.load_workbench_profile("unit-profile.yaml")

    assert loaded.ok is True
    assert loaded.data["stream_summaries"][0]["name"] == "latency-stream"
    assert loaded.data["streams"][0]["frame_length"] == 128
    assert loaded.data["streams"][0]["pg_id"] == 7
    assert loaded.data["streams"][0]["latency_enabled"] is True
    assert loaded.data["streams"][0]["ether_dst"] == "aa:bb:cc:dd:ee:ff"
    assert loaded.data["streams"][0]["ether_src"] == "00:11:22:33:44:55"
    assert loaded.data["streams"][0]["ipv4_src"] == "198.51.100.10"
    assert loaded.data["streams"][0]["ipv4_dst"] == "203.0.113.20"
    assert loaded.data["streams"][0]["l4_src_port_override"] is True
    assert loaded.data["streams"][0]["l4_src_port"] == 4000
    assert loaded.data["streams"][0]["l4_dst_port_override"] is True
    assert loaded.data["streams"][0]["l4_dst_port"] == 5000
    assert loaded.data["streams"][0]["udp_length_override"] is True
    assert loaded.data["streams"][0]["udp_length"] == 64
    assert loaded.data["streams"][0]["udp_checksum_override"] is True
    assert loaded.data["streams"][0]["udp_checksum"] == "BEEF"
    assert loaded.data["streams"][0]["udp_checksum_mode"] == "Increment"
    assert loaded.data["streams"][0]["udp_checksum_count"] == 4
    assert loaded.data["streams"][0]["udp_checksum_step"] == 1
    assert loaded.data["streams"][0]["tcp_checksum_override"] is False
    assert loaded.data["streams"][0]["tcp_checksum"] == "ABCD"
    assert loaded.data["streams"][0]["advanced_cache_size_type"] == "Enable"
    assert loaded.data["streams"][0]["advanced_cache_value"] == 42
    assert loaded.data["packet_previews"][0]["layers"][2]["fields"]["destination_port"] == 5000


def test_workbench_profile_preserves_original_advanced_mode_packet_model_and_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    packet = bytes.fromhex("aabbccddeeff001122334455ffff") + bytes(range(46))
    packet_binary = base64.b64encode(packet).decode("ascii")
    packet_model = "{\"protocols\":[],\"field_engine\":{\"instructions\":[]}}"
    advanced_vm = {
        "cache_size": 128,
        "split_by_var": "mac_src",
        "instructions": [
            {
                "init_value": 1,
                "max_value": 16,
                "min_value": 1,
                "name": "mac_src",
                "op": "inc",
                "size": 1,
                "step": 1,
                "type": "flow_var",
            }
        ],
    }

    saved = service.save_workbench_profile(
        "advanced-profile.yaml",
        [
            {
                "name": "advanced-stream",
                "packet_type": "Ethernet",
                "frame_length": 64,
                "packet_binary_base64": packet_binary,
                "advanced_mode": True,
                "packet_model": packet_model,
                "advanced_vm": advanced_vm,
            }
        ],
    )

    assert saved.ok is True
    entries = yaml.safe_load(saved.data["content"])
    stream_data = entries[0]["stream"]
    assert stream_data["advanced_mode"] is True
    assert stream_data["packet"]["binary"] == packet_binary
    assert stream_data["packet"]["model"] == packet_model
    assert stream_data["vm"] == advanced_vm
    assert saved.data["packet_previews"][0]["hex"].startswith("aabbccddeeff001122334455ffff")

    loaded = service.load_workbench_profile("advanced-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["advanced_mode"] is True
    assert loaded_stream["packet_binary_base64"] == packet_binary
    assert loaded_stream["packet_model"] == packet_model
    assert loaded_stream["advanced_vm"] == advanced_vm

    exported = service.export_workbench_profile_yaml("advanced-copy.yaml", loaded.data["streams"])

    assert exported.ok is True
    exported_stream = yaml.safe_load(exported.data["content"])[0]["stream"]
    assert exported_stream["advanced_mode"] is True
    assert exported_stream["packet"]["model"] == packet_model
    assert exported_stream["vm"] == advanced_vm


def test_workbench_profile_loads_exported_json_profile(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "json-stream",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 96,
        "mode": "continuous",
        "rate_type": "pps",
        "rate_value": 2500,
        "enabled": True,
        "self_start": True,
        "pg_id": 11,
        "flow_stats_enabled": True,
        "latency_enabled": False,
        "ether_dst": "aa:bb:cc:dd:ee:ff",
        "ether_src": "00:11:22:33:44:55",
        "ipv4_src": "192.0.2.10",
        "ipv4_dst": "198.51.100.20",
        "tcp_sequence_number": 123,
        "tcp_ack_number": 456,
        "tcp_window": 2048,
        "tcp_flag_ack": True,
        "tcp_flag_syn": True,
    }
    exported = service.export_profile_json(
        service.save_workbench_profile("json-source.yaml", [stream]).data["profile"]["relative_path"]
    )
    json_profile = environment.profile_roots[0] / "json-source.json"
    json_profile.write_text(exported.data["content"], encoding="utf-8")

    loaded = service.load_workbench_profile("json-source.json")

    assert loaded.ok is True
    assert loaded.data["profile"]["relative_path"] == "json-source.json"
    assert loaded.data["streams"][0]["name"] == "json-stream"
    assert loaded.data["streams"][0]["packet_type"] == "Ethernet/IPv4/TCP"
    assert loaded.data["streams"][0]["frame_length"] == 96
    assert loaded.data["streams"][0]["rate_value"] == 2500
    assert loaded.data["streams"][0]["pg_id"] == 11
    assert loaded.data["streams"][0]["ipv4_src"] == "192.0.2.10"
    assert loaded.data["streams"][0]["ipv4_dst"] == "198.51.100.20"
    assert loaded.data["streams"][0]["tcp_sequence_number"] == 123
    assert loaded.data["streams"][0]["tcp_flag_ack"] is True
    assert loaded.data["streams"][0]["tcp_flag_syn"] is True
    assert loaded.data["stream_summaries"][0]["rate"] == "2500 pps"
    assert loaded.data["packet_previews"][0]["layers"][2]["name"] == "TCP"


def test_workbench_profile_loads_json_gui_stream_list(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "json-gui-source.yaml",
        [
            {
                "name": "json-gui-stream",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "rate_type": "bps L2",
                "rate_value": 10_000_000,
                "ipv4_src": "203.0.113.1",
                "ipv4_dst": "203.0.113.2",
            }
        ],
    )
    gui_list = yaml.safe_load(saved.data["content"])
    (environment.profile_roots[0] / "json-gui-source.json").write_text(json.dumps(gui_list, indent=2), encoding="utf-8")

    loaded = service.load_workbench_profile("json-gui-source.json")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["name"] == "json-gui-stream"
    assert loaded.data["streams"][0]["packet_type"] == "Ethernet/IPv4/UDP"
    assert loaded.data["streams"][0]["rate_type"] == "bps L2"
    assert loaded.data["streams"][0]["rate_value"] == 10_000_000
    assert loaded.data["streams"][0]["ipv4_src"] == "203.0.113.1"
    assert loaded.data["streams"][0]["ipv4_dst"] == "203.0.113.2"


def test_workbench_profile_rejects_unsupported_json_root(tmp_path: Path) -> None:
    environment = env(tmp_path)
    (environment.profile_roots[0] / "bad-profile.json").write_text('{"streams": "bad"}', encoding="utf-8")

    loaded = RealStlClientService(environment).load_workbench_profile("bad-profile.json")

    assert loaded.ok is False
    assert loaded.blocker == "profile_workbench_unsupported"
    assert loaded.error == "profile JSON root must be an exported workbench object or GUI stream list"


def test_workbench_profile_renders_variable_frame_length_vm(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "variable-length.yaml",
        [
            {
                "name": "variable-stream",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Random",
                "frame_length": 64,
                "frame_length_min": 128,
                "frame_length_max": 256,
                "mode": "continuous",
                "rate_type": "pps",
                "rate_value": 1000,
            }
        ],
    )

    assert saved.ok is True
    assert saved.data["streams"][0]["length"] == 256
    entry = yaml.safe_load(saved.data["content"])[0]
    instructions = entry["stream"]["vm"]["instructions"]
    assert instructions[0] == {
        "init_value": 124,
        "max_value": 252,
        "min_value": 124,
        "name": "pkt_len",
        "op": "random",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    }
    assert instructions[1] == {"name": "pkt_len", "type": "trim_pkt_size"}
    assert instructions[2] == {
        "add_value": -14,
        "is_big_endian": True,
        "name": "pkt_len",
        "pkt_offset": 16,
        "type": "write_flow_var",
    }
    assert instructions[3] == {
        "add_value": -34,
        "is_big_endian": True,
        "name": "pkt_len",
        "pkt_offset": 38,
        "type": "write_flow_var",
    }
    assert instructions[4] == {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["frame_length_type"] == "Random"
    assert packet_meta["protocol_selection"]["min_length"] == "128"
    assert packet_meta["protocol_selection"]["max_length"] == "256"

    loaded = service.load_workbench_profile("variable-length.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["frame_length_type"] == "Random"
    assert loaded.data["streams"][0]["frame_length"] == 256
    assert loaded.data["streams"][0]["frame_length_min"] == 128
    assert loaded.data["streams"][0]["frame_length_max"] == 256


def test_workbench_profile_renders_ethernet_only_packet_fields(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "ethernet-only",
        "packet_type": "Ethernet",
        "frame_length": 64,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "payload_pattern": "a1 b2",
    }

    saved = service.save_workbench_profile("ethernet-only.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert len(packet) == 60
    assert preview["wire_length"] == 64
    assert packet[0:6].hex() == "665544332211"
    assert packet[6:12].hex() == "102030405060"
    assert packet[12:14].hex() == "ffff"
    assert packet[14:22].hex() == "a1b2a1b2a1b2a1b2"
    assert [layer["name"] for layer in preview["layers"]] == ["Ethernet", "Payload"]
    assert preview["layers"][1]["fields"]["bytes"] == 46

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_ipv4_selected"] is False
    assert packet_meta["protocol_selection"]["is_ipv6_selected"] is False
    assert packet_meta["protocol_selection"]["is_tcp_selected"] is False
    assert packet_meta["protocol_selection"]["is_udp_selected"] is False
    assert packet_meta["ethernet"]["type"] == "ffff"
    assert packet_meta["ethernet"]["is_override"] is False

    loaded = service.load_workbench_profile("ethernet-only.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["packet_type"] == "Ethernet"
    assert loaded.data["packet_previews"][0]["layers"][0]["fields"]["type"] == "0xffff"


def test_workbench_profile_renders_ethernet_type_override(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "ether-type",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ether_type_override": True,
        "ether_type": "88b5",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "payload_pattern": "a1 b2",
    }

    saved = service.save_workbench_profile("ether-type.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert packet[12:14].hex() == "88b5"
    assert preview["layers"][0]["fields"]["type"] == "0x88b5"

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ethernet"]["type"] == "88b5"
    assert packet_meta["ethernet"]["is_override"] is True
    assert packet_meta["ethernet"]["override_source"] == "operator"

    loaded = service.load_workbench_profile("ether-type.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ether_type_override"] is True
    assert loaded_stream["ether_type"] == "88b5"
    assert loaded.data["packet_previews"][0]["layers"][0]["fields"]["type"] == "0x88b5"


def test_workbench_profile_loads_legacy_auto_ethernet_type_without_operator_override(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "legacy-auto-ether-type.yaml",
        [
            {
                "name": "legacy-auto",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 64,
                "ether_dst": "66:55:44:33:22:11",
                "ether_src": "10:20:30:40:50:60",
            }
        ],
    )
    assert saved.ok is True

    entries = yaml.safe_load(saved.data["content"])
    meta = yaml.safe_load(base64.b64decode(entries[0]["stream"]["packet"]["meta"]).decode("utf-8"))
    meta["ethernet"]["is_override"] = True
    meta["ethernet"].pop("override_source", None)
    entries[0]["stream"]["packet"]["meta"] = base64.b64encode(
        yaml.safe_dump(meta, sort_keys=True).encode("utf-8")
    ).decode("ascii")
    (environment.profile_roots[0] / "legacy-auto-ether-type.yaml").write_text(
        "---\n" + yaml.safe_dump(entries, sort_keys=False),
        encoding="utf-8",
    )

    loaded = service.load_workbench_profile("legacy-auto-ether-type.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["ether_type"] == "0800"
    assert loaded.data["streams"][0]["ether_type_override"] is False


def test_workbench_profile_renders_ipv4_without_l4_packet_fields(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "ipv4-no-l4",
        "packet_type": "Ethernet/IPv4",
        "frame_length": 64,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "ipv4_dscp": 10,
        "ipv4_ecn": 3,
        "ipv4_id": 3210,
        "ipv4_flag_df": True,
        "ipv4_flag_mf": True,
        "ipv4_fragment_offset": 9,
        "ipv4_ttl": 42,
        "payload_pattern": "a1 b2",
    }

    saved = service.save_workbench_profile("ipv4-no-l4.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert len(packet) == 60
    assert packet[12:14].hex() == "0800"
    assert packet[15] == 43
    assert int.from_bytes(packet[16:18], "big") == 46
    assert int.from_bytes(packet[18:20], "big") == 3210
    assert int.from_bytes(packet[20:22], "big") == 0x6009
    assert packet[22] == 42
    assert packet[23] == 0
    assert packet[26:30] == b"\x0a\x0a\x0a\x01"
    assert packet[30:34] == b"\x0a\x0a\x0a\x02"
    assert packet[34:42].hex() == "a1b2a1b2a1b2a1b2"
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "Payload",
    ]
    assert preview["layers"][1]["fields"]["protocol"] == "None"
    assert preview["layers"][1]["fields"]["dscp"] == 10
    assert preview["layers"][1]["fields"]["ecn"] == 3
    assert preview["layers"][1]["fields"]["identification"] == 3210
    assert preview["layers"][1]["fields"]["flags"] == "DF,MF"
    assert preview["layers"][1]["fields"]["fragment_offset"] == 9
    assert preview["layers"][1]["fields"]["ttl"] == 42
    assert preview["layers"][2]["fields"]["bytes"] == 26

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_ipv4_selected"] is True
    assert packet_meta["protocol_selection"]["is_ipv6_selected"] is False
    assert packet_meta["protocol_selection"]["is_tcp_selected"] is False
    assert packet_meta["protocol_selection"]["is_udp_selected"] is False
    assert packet_meta["ipv4"]["dscp"] == "10"
    assert packet_meta["ipv4"]["ecn"] == "3"
    assert packet_meta["ipv4"]["ecn_mode"] == "Fixed"
    assert packet_meta["ipv4"]["ecn_count"] == "4"
    assert packet_meta["ipv4"]["ecn_step"] == "1"
    assert packet_meta["ipv4"]["tos"] == "43"
    assert packet_meta["ipv4"]["id"] == "3210"
    assert packet_meta["ipv4"]["flag_df"] is True
    assert packet_meta["ipv4"]["flag_mf"] is True
    assert packet_meta["ipv4"]["fragment_offset"] == "9"
    assert packet_meta["ipv4"]["ttl"] == "42"

    loaded = service.load_workbench_profile("ipv4-no-l4.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["packet_type"] == "Ethernet/IPv4"
    assert loaded.data["streams"][0]["ipv4_src"] == "10.10.10.1"
    assert loaded.data["streams"][0]["ipv4_dst"] == "10.10.10.2"
    assert loaded.data["streams"][0]["ipv4_dscp"] == 10
    assert loaded.data["streams"][0]["ipv4_ecn"] == 3
    assert loaded.data["streams"][0]["ipv4_ecn_mode"] == "Fixed"
    assert loaded.data["streams"][0]["ipv4_ecn_count"] == 4
    assert loaded.data["streams"][0]["ipv4_ecn_step"] == 1
    assert loaded.data["streams"][0]["ipv4_id"] == 3210
    assert loaded.data["streams"][0]["ipv4_flag_df"] is True
    assert loaded.data["streams"][0]["ipv4_flag_mf"] is True
    assert loaded.data["streams"][0]["ipv4_fragment_offset"] == 9
    assert loaded.data["streams"][0]["ipv4_ttl"] == 42
    assert loaded.data["streams"][0]["l4_src_port_override"] is False
    assert loaded.data["streams"][0]["l4_dst_port_override"] is False
    assert loaded.data["packet_previews"][0]["layers"][1]["fields"]["protocol"] == "None"


def test_workbench_profile_renders_ipv6_without_l4_packet_fields(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "ipv6-no-l4",
        "packet_type": "Ethernet/IPv6",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv6_src": "2001:db8:1::10",
        "ipv6_dst": "2001:db8:2::20",
        "payload_pattern": "a1 b2",
    }

    saved = service.save_workbench_profile("ipv6-no-l4.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert len(packet) == 92
    assert preview["wire_length"] == 96
    assert packet[12:14].hex() == "86dd"
    assert int.from_bytes(packet[18:20], "big") == 38
    assert packet[20] == 59
    assert str(ipaddress.IPv6Address(packet[22:38])) == "2001:db8:1::10"
    assert str(ipaddress.IPv6Address(packet[38:54])) == "2001:db8:2::20"
    assert packet[54:62].hex() == "a1b2a1b2a1b2a1b2"
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v6",
        "Payload",
    ]
    assert preview["layers"][1]["fields"]["protocol"] == "None"
    assert preview["layers"][2]["fields"]["bytes"] == 38

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_ipv4_selected"] is False
    assert packet_meta["protocol_selection"]["is_ipv6_selected"] is True
    assert packet_meta["protocol_selection"]["is_tcp_selected"] is False
    assert packet_meta["protocol_selection"]["is_udp_selected"] is False

    loaded = service.load_workbench_profile("ipv6-no-l4.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["packet_type"] == "Ethernet/IPv6"
    assert loaded.data["streams"][0]["ipv6_src"] == "2001:db8:1::10"
    assert loaded.data["streams"][0]["ipv6_dst"] == "2001:db8:2::20"
    assert loaded.data["streams"][0]["l4_src_port_override"] is False
    assert loaded.data["streams"][0]["l4_dst_port_override"] is False
    assert loaded.data["packet_previews"][0]["layers"][1]["fields"]["protocol"] == "None"


def test_workbench_profile_renders_l3_l4_none_variable_frame_length_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))

    ethernet = service.render_workbench_profile(
        [
            {
                "name": "ethernet-variable",
                "packet_type": "Ethernet",
                "frame_length_type": "Random",
                "frame_length_min": 64,
                "frame_length_max": 128,
            }
        ]
    )

    assert ethernet.ok is True
    ethernet_entry = yaml.safe_load(ethernet.data["content"])[0]
    assert ethernet_entry["stream"]["vm"]["instructions"] == [
        {
            "init_value": 60,
            "max_value": 124,
            "min_value": 60,
            "name": "pkt_len",
            "op": "random",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
    ]

    ipv4 = service.render_workbench_profile(
        [
            {
                "name": "ipv4-variable",
                "packet_type": "Ethernet/IPv4",
                "frame_length_type": "Increment",
                "frame_length_min": 64,
                "frame_length_max": 128,
            }
        ]
    )

    assert ipv4.ok is True
    ipv4_entry = yaml.safe_load(ipv4.data["content"])[0]
    assert ipv4_entry["stream"]["vm"]["instructions"] == [
        {
            "init_value": 60,
            "max_value": 124,
            "min_value": 60,
            "name": "pkt_len",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
        {
            "add_value": -14,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 16,
            "type": "write_flow_var",
        },
        {"pkt_offset": 14, "type": "fix_checksum_ipv4"},
    ]

    ipv6 = service.render_workbench_profile(
        [
            {
                "name": "ipv6-variable",
                "packet_type": "Ethernet/IPv6",
                "frame_length_type": "Increment",
                "frame_length_min": 128,
                "frame_length_max": 256,
            }
        ]
    )

    assert ipv6.ok is True
    ipv6_entry = yaml.safe_load(ipv6.data["content"])[0]
    assert ipv6_entry["stream"]["vm"]["instructions"] == [
        {
            "init_value": 124,
            "max_value": 252,
            "min_value": 124,
            "name": "pkt_len",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
        {
            "add_value": -54,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 18,
            "type": "write_flow_var",
        },
    ]


def test_workbench_profile_renders_ipv6_variable_frame_length_vm(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "ipv6-variable-length.yaml",
        [
            {
                "name": "ipv6-var-udp",
                "packet_type": "Ethernet/IPv6/UDP",
                "frame_length_type": "Increment",
                "frame_length_min": 128,
                "frame_length_max": 512,
            },
            {
                "name": "ipv6-var-tcp",
                "packet_type": "Ethernet/IPv6/TCP",
                "frame_length_type": "Random",
                "frame_length_min": 128,
                "frame_length_max": 256,
            },
        ],
    )

    assert saved.ok is True
    entries = yaml.safe_load(saved.data["content"])
    udp_instructions = entries[0]["stream"]["vm"]["instructions"]
    assert udp_instructions == [
        {
            "init_value": 124,
            "max_value": 508,
            "min_value": 124,
            "name": "pkt_len",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
        {
            "add_value": -54,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 18,
            "type": "write_flow_var",
        },
        {
            "add_value": -54,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 58,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 40, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    tcp_instructions = entries[1]["stream"]["vm"]["instructions"]
    assert tcp_instructions == [
        {
            "init_value": 124,
            "max_value": 252,
            "min_value": 124,
            "name": "pkt_len",
            "op": "random",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
        {
            "add_value": -54,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 18,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 40, "l4_type": 13, "type": "fix_checksum_hw"},
    ]
    packet_meta = yaml.safe_load(base64.b64decode(entries[0]["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["frame_length_type"] == "Increment"
    assert packet_meta["protocol_selection"]["min_length"] == "128"
    assert packet_meta["protocol_selection"]["max_length"] == "512"

    loaded = service.load_workbench_profile("ipv6-variable-length.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv6/UDP"
    assert loaded_stream["frame_length_type"] == "Increment"
    assert loaded_stream["frame_length"] == 512
    assert loaded_stream["frame_length_min"] == 128
    assert loaded_stream["frame_length_max"] == 512


def test_workbench_profile_forces_unsupported_variable_frame_length_fixed(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))

    saved = service.save_workbench_profile(
        "unsupported-variable-frame-length.yaml",
        [
            {
                "name": "icmp-variable-request",
                "packet_type": "Ethernet/IPv4/ICMP",
                "frame_length_type": "Random",
                "frame_length_min": 128,
                "frame_length_max": 512,
            },
            {
                "name": "sctp-variable-request",
                "packet_type": "Ethernet/IPv6/SCTP",
                "frame_length_type": "Increment",
                "frame_length_min": 128,
                "frame_length_max": 512,
            },
        ]
    )

    assert saved.ok is True
    entries = yaml.safe_load(saved.data["content"])
    assert entries[0]["stream"]["vm"]["instructions"] == []
    assert entries[1]["stream"]["vm"]["instructions"] == []
    icmp_meta = yaml.safe_load(base64.b64decode(entries[0]["stream"]["packet"]["meta"]).decode("utf-8"))
    sctp_meta = yaml.safe_load(base64.b64decode(entries[1]["stream"]["packet"]["meta"]).decode("utf-8"))
    assert icmp_meta["protocol_selection"]["frame_length_type"] == "Fixed"
    assert sctp_meta["protocol_selection"]["frame_length_type"] == "Fixed"

    loaded = service.load_workbench_profile("unsupported-variable-frame-length.yaml")

    assert loaded.ok is True
    assert [stream["frame_length_type"] for stream in loaded.data["streams"]] == ["Fixed", "Fixed"]


def test_workbench_profile_renders_ipv4_field_engine_vm(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "ipv4-field-engine.yaml",
        [
            {
                "name": "ipv4-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_dst": "48.0.0.250",
                "ipv4_dst_mode": "Increment Host",
                "ipv4_dst_count": 16,
                "ipv4_dst_step": 2,
                "ipv4_src": "16.0.0.1",
                "ipv4_src_mode": "Random Host",
                "ipv4_src_count": 4,
                "ipv4_src_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ip_dest"
    assert vm["instructions"] == [
        {
            "init_value": 250,
            "max_value": 265,
            "min_value": 250,
            "name": "ip_dest",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ip_dest",
            "pkt_offset": 32,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "ip_src",
            "op": "random",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ip_src",
            "pkt_offset": 29,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["dst_mode"] == "Increment Host"
    assert packet_meta["ipv4"]["dst_count"] == "16"
    assert packet_meta["ipv4"]["dst_step"] == "2"
    assert packet_meta["ipv4"]["src_mode"] == "Random Host"
    assert packet_meta["ipv4"]["src_count"] == "4"
    assert packet_meta["ipv4"]["src_step"] == "1"

    loaded = service.load_workbench_profile("ipv4-field-engine.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_dst_mode"] == "Increment Host"
    assert loaded_stream["ipv4_dst_count"] == 16
    assert loaded_stream["ipv4_dst_step"] == 2
    assert loaded_stream["ipv4_src_mode"] == "Random Host"
    assert loaded_stream["ipv4_src_count"] == 4
    assert loaded_stream["ipv4_src_step"] == 1


def test_workbench_profile_renders_ipv4_field_engine_unit_counts(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "ipv4-field-engine-units.yaml",
        [
            {
                "name": "ipv4-fe-units",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_dst": "48.0.0.250",
                "ipv4_dst_mode": "Increment Host",
                "ipv4_dst_count": "1.5 K",
                "ipv4_dst_step": 1,
                "ipv4_src": "16.0.0.1",
                "ipv4_src_mode": "Random Host",
                "ipv4_src_count": "2K",
                "ipv4_src_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm_instructions = entry["stream"]["vm"]["instructions"]
    assert vm_instructions[0]["name"] == "ip_dest"
    assert vm_instructions[0]["max_value"] == 1749
    assert vm_instructions[2]["name"] == "ip_src"
    assert vm_instructions[2]["max_value"] == 2000

    loaded = service.load_workbench_profile("ipv4-field-engine-units.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_dst_count"] == 1500
    assert loaded_stream["ipv4_src_count"] == 2000


def test_workbench_profile_loads_ipv4_field_engine_unit_counts_from_meta(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "ipv4-field-engine-meta-units.yaml",
        [
            {
                "name": "ipv4-fe-meta-units",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_dst": "48.0.0.250",
                "ipv4_dst_mode": "Increment Host",
                "ipv4_dst_count": 16,
                "ipv4_dst_step": 1,
                "ipv4_src": "16.0.0.1",
                "ipv4_src_mode": "Random Host",
                "ipv4_src_count": 4,
                "ipv4_src_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = entry["stream"]["packet"]
    packet_meta = yaml.safe_load(base64.b64decode(packet["meta"]).decode("utf-8"))
    packet_meta["ipv4"]["dst_count"] = "1 K"
    packet_meta["ipv4"]["src_count"] = "100 M"
    packet["meta"] = base64.b64encode(
        yaml.safe_dump(packet_meta, sort_keys=False, default_flow_style=False).encode("utf-8")
    ).decode("ascii")
    (environment.profile_roots[0] / "ipv4-field-engine-meta-units.yaml").write_text(
        "---\n" + yaml.safe_dump([entry], sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )

    loaded = service.load_workbench_profile("ipv4-field-engine-meta-units.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_dst_count"] == 1000
    assert loaded_stream["ipv4_src_count"] == 100_000_000


def test_workbench_profile_renders_ipv4_dscp_field_engine(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "ipv4-dscp-fe.yaml",
        [
            {
                "name": "ipv4-dscp-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_dscp": 10,
                "ipv4_dscp_mode": "Increment",
                "ipv4_dscp_count": 4,
                "ipv4_dscp_step": 1,
                "ipv4_ecn": 3,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ip_dscp"
    assert vm["instructions"] == [
        {
            "init_value": 10,
            "max_value": 13,
            "min_value": 10,
            "name": "ip_dscp",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFC,
            "name": "ip_dscp",
            "pkt_cast_size": 1,
            "pkt_offset": 15,
            "shift": 2,
            "type": "write_mask_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[15] == 43
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["dscp"] == "10"
    assert packet_meta["ipv4"]["dscp_mode"] == "Increment"
    assert packet_meta["ipv4"]["dscp_count"] == "4"
    assert packet_meta["ipv4"]["dscp_step"] == "1"
    assert packet_meta["ipv4"]["ecn"] == "3"
    assert packet_meta["ipv4"]["ecn_mode"] == "Fixed"
    assert packet_meta["ipv4"]["ecn_count"] == "4"
    assert packet_meta["ipv4"]["ecn_step"] == "1"
    assert packet_meta["ipv4"]["tos"] == "43"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["dscp"] == 10
    assert preview_fields["dscp_mode"] == "Increment"
    assert preview_fields["dscp_count"] == 4
    assert preview_fields["dscp_step"] == 1
    assert preview_fields["ecn"] == 3
    assert preview_fields["ecn_mode"] == "Fixed"
    assert preview_fields["ecn_count"] == 4
    assert preview_fields["ecn_step"] == 1
    assert preview_fields["tos"] == 43

    loaded = service.load_workbench_profile("ipv4-dscp-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_dscp"] == 10
    assert loaded_stream["ipv4_dscp_mode"] == "Increment"
    assert loaded_stream["ipv4_dscp_count"] == 4
    assert loaded_stream["ipv4_dscp_step"] == 1
    assert loaded_stream["ipv4_ecn"] == 3
    assert loaded_stream["ipv4_ecn_mode"] == "Fixed"
    assert loaded_stream["ipv4_ecn_count"] == 4
    assert loaded_stream["ipv4_ecn_step"] == 1


def test_workbench_profile_renders_ipv4_ecn_field_engine(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "ipv4-ecn-fe.yaml",
        [
            {
                "name": "ipv4-ecn-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_dscp": 10,
                "ipv4_ecn": 0,
                "ipv4_ecn_mode": "Increment",
                "ipv4_ecn_count": 4,
                "ipv4_ecn_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ip_ecn"
    assert vm["instructions"] == [
        {
            "init_value": 0,
            "max_value": 3,
            "min_value": 0,
            "name": "ip_ecn",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x03,
            "name": "ip_ecn",
            "pkt_cast_size": 1,
            "pkt_offset": 15,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[15] == 40
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["dscp"] == "10"
    assert packet_meta["ipv4"]["ecn"] == "0"
    assert packet_meta["ipv4"]["ecn_mode"] == "Increment"
    assert packet_meta["ipv4"]["ecn_count"] == "4"
    assert packet_meta["ipv4"]["ecn_step"] == "1"
    assert packet_meta["ipv4"]["tos"] == "40"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["ecn"] == 0
    assert preview_fields["ecn_mode"] == "Increment"
    assert preview_fields["ecn_count"] == 4
    assert preview_fields["ecn_step"] == 1
    assert preview_fields["tos"] == 40

    loaded = service.load_workbench_profile("ipv4-ecn-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_dscp"] == 10
    assert loaded_stream["ipv4_ecn"] == 0
    assert loaded_stream["ipv4_ecn_mode"] == "Increment"
    assert loaded_stream["ipv4_ecn_count"] == 4
    assert loaded_stream["ipv4_ecn_step"] == 1


def test_workbench_profile_renders_ipv4_identification_field_engine(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "ipv4-id-fe.yaml",
        [
            {
                "name": "ipv4-id-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_id": 100,
                "ipv4_id_mode": "Increment",
                "ipv4_id_count": 4,
                "ipv4_id_step": 1,
                "ipv4_flag_df": True,
                "ipv4_fragment_offset": 7,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ip_id"
    assert vm["instructions"] == [
        {
            "init_value": 100,
            "max_value": 103,
            "min_value": 100,
            "name": "ip_id",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ip_id",
            "pkt_offset": 18,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[18:20], "big") == 100
    assert int.from_bytes(packet[20:22], "big") == 0x4007
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["id"] == "100"
    assert packet_meta["ipv4"]["id_mode"] == "Increment"
    assert packet_meta["ipv4"]["id_count"] == "4"
    assert packet_meta["ipv4"]["id_step"] == "1"
    assert packet_meta["ipv4"]["flag_df"] is True
    assert packet_meta["ipv4"]["fragment_offset"] == "7"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["identification"] == 100
    assert preview_fields["identification_mode"] == "Increment"
    assert preview_fields["fragment_offset"] == 7

    loaded = service.load_workbench_profile("ipv4-id-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_id"] == 100
    assert loaded_stream["ipv4_id_mode"] == "Increment"
    assert loaded_stream["ipv4_id_count"] == 4
    assert loaded_stream["ipv4_id_step"] == 1
    assert loaded_stream["ipv4_flag_df"] is True
    assert loaded_stream["ipv4_fragment_offset"] == 7


def test_workbench_profile_renders_ipv4_fragment_offset_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "ipv4-fragment-offset-fe.yaml",
        [
            {
                "name": "ipv4-fragment-offset-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "ipv4_flag_df": True,
                "ipv4_flag_mf": True,
                "ipv4_fragment_offset": 100,
                "ipv4_fragment_offset_mode": "Increment",
                "ipv4_fragment_offset_count": 4,
                "ipv4_fragment_offset_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ip_fragment_offset"
    assert vm["instructions"] == [
        {
            "init_value": 100,
            "max_value": 103,
            "min_value": 100,
            "name": "ip_fragment_offset",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x1FFF,
            "name": "ip_fragment_offset",
            "pkt_cast_size": 2,
            "pkt_offset": 20,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[20:22], "big") == 0x6064
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["flag_df"] is True
    assert packet_meta["ipv4"]["flag_mf"] is True
    assert packet_meta["ipv4"]["fragment_offset"] == "100"
    assert packet_meta["ipv4"]["fragment_offset_mode"] == "Increment"
    assert packet_meta["ipv4"]["fragment_offset_count"] == "4"
    assert packet_meta["ipv4"]["fragment_offset_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["flags"] == "DF,MF"
    assert preview_fields["fragment_offset"] == 100
    assert preview_fields["fragment_offset_mode"] == "Increment"
    assert preview_fields["fragment_offset_count"] == 4
    assert preview_fields["fragment_offset_step"] == 1

    loaded = service.load_workbench_profile("ipv4-fragment-offset-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_flag_df"] is True
    assert loaded_stream["ipv4_flag_mf"] is True
    assert loaded_stream["ipv4_fragment_offset"] == 100
    assert loaded_stream["ipv4_fragment_offset_mode"] == "Increment"
    assert loaded_stream["ipv4_fragment_offset_count"] == 4
    assert loaded_stream["ipv4_fragment_offset_step"] == 1


def test_workbench_profile_renders_ipv4_ttl_field_engine(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    saved = service.save_workbench_profile(
        "ipv4-ttl-fe.yaml",
        [
            {
                "name": "ipv4-ttl-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "ipv4_ttl": 40,
                "ipv4_ttl_mode": "Increment",
                "ipv4_ttl_count": 4,
                "ipv4_ttl_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ip_ttl"
    assert vm["instructions"] == [
        {
            "init_value": 40,
            "max_value": 43,
            "min_value": 40,
            "name": "ip_ttl",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ip_ttl",
            "pkt_offset": 22,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[22] == 40
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["ttl"] == "40"
    assert packet_meta["ipv4"]["ttl_mode"] == "Increment"
    assert packet_meta["ipv4"]["ttl_count"] == "4"
    assert packet_meta["ipv4"]["ttl_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["ttl"] == 40
    assert preview_fields["ttl_mode"] == "Increment"
    assert preview_fields["ttl_count"] == 4
    assert preview_fields["ttl_step"] == 1

    loaded = service.load_workbench_profile("ipv4-ttl-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv4_ttl"] == 40
    assert loaded_stream["ipv4_ttl_mode"] == "Increment"
    assert loaded_stream["ipv4_ttl_count"] == 4
    assert loaded_stream["ipv4_ttl_step"] == 1


def test_workbench_profile_renders_l4_port_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "l4-port-fe.yaml",
        [
            {
                "name": "l4-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "l4_src_port_override": True,
                "l4_src_port": 4000,
                "l4_src_port_mode": "Increment",
                "l4_src_port_count": 8,
                "l4_src_port_step": 2,
                "l4_dst_port_override": True,
                "l4_dst_port": 5000,
                "l4_dst_port_mode": "Random",
                "l4_dst_port_count": 16,
                "l4_dst_port_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "l4_src_port"
    assert vm["instructions"] == [
        {
            "init_value": 5000,
            "max_value": 5015,
            "min_value": 5000,
            "name": "l4_dest_port",
            "op": "random",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "l4_dest_port",
            "pkt_offset": 36,
            "type": "write_flow_var",
        },
        {
            "init_value": 4000,
            "max_value": 4007,
            "min_value": 4000,
            "name": "l4_src_port",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "l4_src_port",
            "pkt_offset": 34,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["src_port_mode"] == "Increment"
    assert packet_meta["l4"]["src_port_count"] == "8"
    assert packet_meta["l4"]["src_port_step"] == "2"
    assert packet_meta["l4"]["dst_port_mode"] == "Random"
    assert packet_meta["l4"]["dst_port_count"] == "16"
    assert packet_meta["l4"]["dst_port_step"] == "1"

    loaded = service.load_workbench_profile("l4-port-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["l4_src_port_override"] is True
    assert loaded_stream["l4_src_port"] == 4000
    assert loaded_stream["l4_src_port_mode"] == "Increment"
    assert loaded_stream["l4_src_port_count"] == 8
    assert loaded_stream["l4_src_port_step"] == 2
    assert loaded_stream["l4_dst_port_override"] is True
    assert loaded_stream["l4_dst_port"] == 5000
    assert loaded_stream["l4_dst_port_mode"] == "Random"
    assert loaded_stream["l4_dst_port_count"] == 16
    assert loaded_stream["l4_dst_port_step"] == 1


def test_workbench_profile_renders_udp_length_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "udp-length-fe.yaml",
        [
            {
                "name": "udp-length-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "udp_length_override": True,
                "udp_length": 64,
                "udp_length_mode": "Increment",
                "udp_length_count": 4,
                "udp_length_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "udp_length"
    assert vm["instructions"] == [
        {
            "init_value": 64,
            "max_value": 67,
            "min_value": 64,
            "name": "udp_length",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "udp_length",
            "pkt_offset": 38,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[38:40], "big") == 64
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["is_override_length"] is True
    assert packet_meta["l4"]["length"] == "64"
    assert packet_meta["l4"]["length_mode"] == "Increment"
    assert packet_meta["l4"]["length_count"] == "4"
    assert packet_meta["l4"]["length_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["length"] == 64
    assert preview_fields["length_mode"] == "Increment"
    assert preview_fields["length_count"] == 4
    assert preview_fields["length_step"] == 1

    loaded = service.load_workbench_profile("udp-length-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["udp_length_override"] is True
    assert loaded_stream["udp_length"] == 64
    assert loaded_stream["udp_length_mode"] == "Increment"
    assert loaded_stream["udp_length_count"] == 4
    assert loaded_stream["udp_length_step"] == 1


def test_workbench_profile_renders_udp_checksum_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "udp-checksum-fe.yaml",
        [
            {
                "name": "udp-checksum-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "udp_checksum_override": True,
                "udp_checksum": "BEEF",
                "udp_checksum_mode": "Increment",
                "udp_checksum_count": 4,
                "udp_checksum_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "udp_checksum"
    assert vm["instructions"] == [
        {
            "init_value": 0xBEEF,
            "max_value": 0xBEF2,
            "min_value": 0xBEEF,
            "name": "udp_checksum",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "udp_checksum",
            "pkt_offset": 40,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[40:42], "big") == 0xBEEF
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["is_override_checksum"] is True
    assert packet_meta["l4"]["checksum"] == "BEEF"
    assert packet_meta["l4"]["checksum_mode"] == "Increment"
    assert packet_meta["l4"]["checksum_count"] == "4"
    assert packet_meta["l4"]["checksum_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["checksum"] == "BEEF"
    assert preview_fields["checksum_override"] is True
    assert preview_fields["checksum_mode"] == "Increment"
    assert preview_fields["checksum_count"] == 4
    assert preview_fields["checksum_step"] == 1

    loaded = service.load_workbench_profile("udp-checksum-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["udp_checksum_override"] is True
    assert loaded_stream["udp_checksum"] == "BEEF"
    assert loaded_stream["udp_checksum_mode"] == "Increment"
    assert loaded_stream["udp_checksum_count"] == 4
    assert loaded_stream["udp_checksum_step"] == 1


def test_workbench_profile_renders_dns_query_transaction_id_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "dns-query-fe.yaml",
        [
            {
                "name": "dns-query-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 96,
                "l4_dst_port_override": True,
                "l4_dst_port": 53,
                "dns_enabled": True,
                "dns_transaction_id": 0x1234,
                "dns_transaction_id_mode": "Increment",
                "dns_transaction_id_count": 4,
                "dns_transaction_id_step": 1,
                "dns_flags": "0100",
                "dns_flags_mode": "Increment",
                "dns_flags_count": 2,
                "dns_flags_step": 32768,
                "dns_query_name": "example.com",
                "dns_query_type": 1,
                "dns_query_type_mode": "Increment",
                "dns_query_type_count": 2,
                "dns_query_type_step": 27,
                "dns_query_class": 1,
                "dns_query_class_mode": "Increment",
                "dns_query_class_count": 2,
                "dns_query_class_step": 2,
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
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "dns_answer_ipv4"
    assert vm["instructions"] == [
        {
            "init_value": 0x1234,
            "max_value": 0x1237,
            "min_value": 0x1234,
            "name": "dns_transaction_id",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dns_transaction_id",
            "pkt_offset": 42,
            "type": "write_flow_var",
        },
        {
            "init_value": 256,
            "max_value": 33024,
            "min_value": 256,
            "name": "dns_flags",
            "op": "inc",
            "size": 2,
            "step": 32768,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dns_flags",
            "pkt_offset": 44,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 28,
            "min_value": 1,
            "name": "dns_query_type",
            "op": "inc",
            "size": 2,
            "step": 27,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dns_query_type",
            "pkt_offset": 67,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 3,
            "min_value": 1,
            "name": "dns_query_class",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dns_query_class",
            "pkt_offset": 69,
            "type": "write_flow_var",
        },
        {
            "init_value": 60,
            "max_value": 75,
            "min_value": 60,
            "name": "dns_answer_ttl",
            "op": "inc",
            "size": 4,
            "step": 5,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dns_answer_ttl",
            "pkt_offset": 77,
            "type": "write_flow_var",
        },
        {
            "init_value": 10,
            "max_value": 13,
            "min_value": 10,
            "name": "dns_answer_ipv4",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dns_answer_ipv4",
            "pkt_offset": 86,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[34:36], "big") == 1025
    assert int.from_bytes(packet[36:38], "big") == 53
    assert int.from_bytes(packet[38:40], "big") == len(packet) - 34
    dns_payload = packet[42:]
    assert dns_payload[:12] == bytes.fromhex("123401000001000100000000")
    assert dns_payload[12:29] == b"\x07example\x03com\x00\x00\x01\x00\x01"
    assert dns_payload[29:45] == bytes.fromhex("c00c000100010000003c0004c000020a")

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["dns"] == {
        "answer_enabled": True,
        "answer_ipv4": "192.0.2.10",
        "answer_ipv4_count": "4",
        "answer_ipv4_mode": "Increment Host",
        "answer_ipv4_step": "1",
        "answer_ttl": "60",
        "answer_ttl_count": "4",
        "answer_ttl_mode": "Increment",
        "answer_ttl_step": "5",
        "enabled": True,
        "flags": "0100",
        "flags_count": "2",
        "flags_mode": "Increment",
        "flags_step": "32768",
        "query_class": "1",
        "query_class_count": "2",
        "query_class_mode": "Increment",
        "query_class_step": "2",
        "query_name": "example.com",
        "query_type": "1",
        "query_type_count": "2",
        "query_type_mode": "Increment",
        "query_type_step": "27",
        "transaction_id": "4660",
        "transaction_id_count": "4",
        "transaction_id_mode": "Increment",
        "transaction_id_step": "1",
    }
    preview_layers = saved.data["packet_previews"][0]["layers"]
    assert preview_layers[3]["name"] == "Domain Name System"
    assert preview_layers[3]["fields"]["transaction_id"] == 0x1234
    assert preview_layers[3]["fields"]["transaction_id_mode"] == "Increment"
    assert preview_layers[3]["fields"]["flags_mode"] == "Increment"
    assert preview_layers[3]["fields"]["query_name"] == "example.com"
    assert preview_layers[3]["fields"]["query_type_mode"] == "Increment"
    assert preview_layers[3]["fields"]["query_class_mode"] == "Increment"
    assert preview_layers[3]["fields"]["answers"] == 1
    assert preview_layers[3]["fields"]["answer_ttl_mode"] == "Increment"
    assert preview_layers[3]["fields"]["answer_ipv4_mode"] == "Increment Host"

    loaded = service.load_workbench_profile("dns-query-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["dns_enabled"] is True
    assert loaded_stream["dns_transaction_id"] == 0x1234
    assert loaded_stream["dns_transaction_id_mode"] == "Increment"
    assert loaded_stream["dns_transaction_id_count"] == 4
    assert loaded_stream["dns_transaction_id_step"] == 1
    assert loaded_stream["dns_flags"] == "0100"
    assert loaded_stream["dns_flags_mode"] == "Increment"
    assert loaded_stream["dns_flags_count"] == 2
    assert loaded_stream["dns_flags_step"] == 32768
    assert loaded_stream["dns_query_name"] == "example.com"
    assert loaded_stream["dns_query_type"] == 1
    assert loaded_stream["dns_query_type_mode"] == "Increment"
    assert loaded_stream["dns_query_type_count"] == 2
    assert loaded_stream["dns_query_type_step"] == 27
    assert loaded_stream["dns_query_class"] == 1
    assert loaded_stream["dns_query_class_mode"] == "Increment"
    assert loaded_stream["dns_query_class_count"] == 2
    assert loaded_stream["dns_query_class_step"] == 2
    assert loaded_stream["dns_answer_enabled"] is True
    assert loaded_stream["dns_answer_ttl"] == 60
    assert loaded_stream["dns_answer_ttl_mode"] == "Increment"
    assert loaded_stream["dns_answer_ttl_count"] == 4
    assert loaded_stream["dns_answer_ttl_step"] == 5
    assert loaded_stream["dns_answer_ipv4"] == "192.0.2.10"
    assert loaded_stream["dns_answer_ipv4_mode"] == "Increment Host"
    assert loaded_stream["dns_answer_ipv4_count"] == 4
    assert loaded_stream["dns_answer_ipv4_step"] == 1


def test_workbench_export_and_import_pcap_preserves_dns_query_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "dns-query",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 96,
        "l4_dst_port_override": True,
        "l4_dst_port": 53,
        "dns_enabled": True,
        "dns_transaction_id": 0x1234,
        "dns_flags": "0100",
        "dns_query_name": "example.com",
        "dns_query_type": 1,
        "dns_query_class": 1,
        "dns_answer_enabled": True,
        "dns_answer_ttl": 60,
        "dns_answer_ipv4": "192.0.2.10",
    }

    exported = service.export_workbench_stream_pcap(stream, "dns-query.pcap")

    assert exported.ok is True
    imported = service.import_workbench_pcap("dns-query.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/UDP"
    assert imported_stream["l4_dst_port"] == 53
    assert imported_stream["dns_enabled"] is True
    assert imported_stream["dns_transaction_id"] == 0x1234
    assert imported_stream["dns_transaction_id_mode"] == "Fixed"
    assert imported_stream["dns_flags"] == "0100"
    assert imported_stream["dns_flags_mode"] == "Fixed"
    assert imported_stream["dns_flags_count"] == 16
    assert imported_stream["dns_flags_step"] == 1
    assert imported_stream["dns_query_name"] == "example.com"
    assert imported_stream["dns_query_type"] == 1
    assert imported_stream["dns_query_class"] == 1
    assert imported_stream["dns_answer_enabled"] is True
    assert imported_stream["dns_answer_ttl"] == 60
    assert imported_stream["dns_answer_ipv4"] == "192.0.2.10"


def test_workbench_profile_renders_dhcp_message_xid_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "dhcp-message-type-xid-fe.yaml",
        [
            {
                "name": "dhcp-message-type-xid-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 64,
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
                "dhcp_parameter_request_list": "1,3,6,15",
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
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "dhcp_rebinding_time"
    assert vm["instructions"] == [
        {
            "init_value": 1,
            "max_value": 2,
            "min_value": 1,
            "name": "dhcp_operation",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_operation",
            "pkt_offset": 42,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "dhcp_hops",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_hops",
            "pkt_offset": 45,
            "type": "write_flow_var",
        },
        {
            "init_value": 10,
            "max_value": 40,
            "min_value": 10,
            "name": "dhcp_seconds",
            "op": "inc",
            "size": 2,
            "step": 10,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_seconds",
            "pkt_offset": 50,
            "type": "write_flow_var",
        },
        {
            "init_value": 0x3903F326,
            "max_value": 0x3903F329,
            "min_value": 0x3903F326,
            "name": "dhcp_xid",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_xid",
            "pkt_offset": 46,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "dhcp_message_type",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_message_type",
            "pkt_offset": 284,
            "type": "write_flow_var",
        },
        {
            "init_value": 0,
            "max_value": 3,
            "min_value": 0,
            "name": "dhcp_flags",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_flags",
            "pkt_offset": 52,
            "type": "write_flow_var",
        },
        {
            "init_value": 16,
            "max_value": 19,
            "min_value": 16,
            "name": "dhcp_client_mac",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_client_mac",
            "pkt_offset": 75,
            "type": "write_flow_var",
        },
        {
            "init_value": 10,
            "max_value": 13,
            "min_value": 10,
            "name": "dhcp_client_ip",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_client_ip",
            "pkt_offset": 57,
            "type": "write_flow_var",
        },
        {
            "init_value": 20,
            "max_value": 23,
            "min_value": 20,
            "name": "dhcp_your_ip",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_your_ip",
            "pkt_offset": 61,
            "type": "write_flow_var",
        },
        {
            "init_value": 30,
            "max_value": 33,
            "min_value": 30,
            "name": "dhcp_server_ip",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_server_ip",
            "pkt_offset": 65,
            "type": "write_flow_var",
        },
        {
            "init_value": 40,
            "max_value": 43,
            "min_value": 40,
            "name": "dhcp_relay_ip",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_relay_ip",
            "pkt_offset": 69,
            "type": "write_flow_var",
        },
        {
            "init_value": 10,
            "max_value": 13,
            "min_value": 10,
            "name": "dhcp_requested_ip",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_requested_ip",
            "pkt_offset": 308,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "dhcp_server_id",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_server_id",
            "pkt_offset": 314,
            "type": "write_flow_var",
        },
        {
            "init_value": 3600,
            "max_value": 3780,
            "min_value": 3600,
            "name": "dhcp_lease_time",
            "op": "inc",
            "size": 4,
            "step": 60,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_lease_time",
            "pkt_offset": 317,
            "type": "write_flow_var",
        },
        {
            "init_value": 1800,
            "max_value": 1890,
            "min_value": 1800,
            "name": "dhcp_renewal_time",
            "op": "inc",
            "size": 4,
            "step": 30,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_renewal_time",
            "pkt_offset": 323,
            "type": "write_flow_var",
        },
        {
            "init_value": 3150,
            "max_value": 3285,
            "min_value": 3150,
            "name": "dhcp_rebinding_time",
            "op": "inc",
            "size": 4,
            "step": 45,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "dhcp_rebinding_time",
            "pkt_offset": 329,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert len(packet) == 342
    assert int.from_bytes(packet[34:36], "big") == 68
    assert int.from_bytes(packet[36:38], "big") == 67
    assert int.from_bytes(packet[38:40], "big") == 308
    dhcp_payload = packet[42:]
    assert dhcp_payload[:4] == bytes.fromhex("01010601")
    assert int.from_bytes(dhcp_payload[4:8], "big") == 0x3903F326
    assert int.from_bytes(dhcp_payload[8:10], "big") == 10
    assert int.from_bytes(dhcp_payload[10:12], "big") == 0x0000
    assert dhcp_payload[12:16] == bytes.fromhex("0a0a000a")
    assert dhcp_payload[16:20] == bytes.fromhex("0a0a0014")
    assert dhcp_payload[20:24] == bytes.fromhex("0a0a001e")
    assert dhcp_payload[24:28] == bytes.fromhex("0a0a0028")
    assert dhcp_payload[28:34] == bytes.fromhex("001122334410")
    assert dhcp_payload[236:240] == bytes.fromhex("63825363")
    assert bytes.fromhex("350101") in dhcp_payload
    assert bytes.fromhex("37040103060f") in dhcp_payload
    assert bytes.fromhex("32040a00000a") in dhcp_payload
    assert bytes.fromhex("36040a000001") in dhcp_payload
    assert bytes.fromhex("330400000e10") in dhcp_payload
    assert bytes.fromhex("3a0400000708") in dhcp_payload
    assert bytes.fromhex("3b0400000c4e") in dhcp_payload
    assert b"\x0c\x0atrex-webui" in dhcp_payload

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["dhcp"] == {
        "client_ip": "10.10.0.10",
        "client_ip_count": "4",
        "client_ip_mode": "Increment Host",
        "client_ip_step": "1",
        "client_mac": "00:11:22:33:44:10",
        "client_mac_count": "4",
        "client_mac_mode": "Increment",
        "client_mac_step": "1",
        "enabled": True,
        "flags": "0000",
        "flags_count": "4",
        "flags_mode": "Increment",
        "flags_step": "1",
        "hops": "1",
        "hops_count": "4",
        "hops_mode": "Increment",
        "hops_step": "1",
        "hostname": "trex-webui",
        "lease_time": "3600",
        "lease_time_count": "4",
        "lease_time_mode": "Increment",
        "lease_time_step": "60",
        "message_type": "1",
        "message_type_count": "4",
        "message_type_mode": "Increment",
        "message_type_step": "1",
        "operation": "1",
        "operation_count": "2",
        "operation_mode": "Increment",
        "operation_step": "1",
        "parameter_request_list": "1,3,6,15",
        "relay_ip": "10.10.0.40",
        "relay_ip_count": "4",
        "relay_ip_mode": "Increment Host",
        "relay_ip_step": "1",
        "rebinding_time": "3150",
        "rebinding_time_count": "4",
        "rebinding_time_mode": "Increment",
        "rebinding_time_step": "45",
        "renewal_time": "1800",
        "renewal_time_count": "4",
        "renewal_time_mode": "Increment",
        "renewal_time_step": "30",
        "requested_ip": "10.0.0.10",
        "requested_ip_count": "4",
        "requested_ip_mode": "Increment Host",
        "requested_ip_step": "1",
        "server_id": "10.0.0.1",
        "server_id_count": "4",
        "server_id_mode": "Increment Host",
        "server_id_step": "1",
        "server_ip": "10.10.0.30",
        "server_ip_count": "4",
        "server_ip_mode": "Increment Host",
        "server_ip_step": "1",
        "seconds": "10",
        "seconds_count": "4",
        "seconds_mode": "Increment",
        "seconds_step": "10",
        "xid": "956560166",
        "xid_count": "4",
        "xid_mode": "Increment",
        "xid_step": "1",
        "your_ip": "10.10.0.20",
        "your_ip_count": "4",
        "your_ip_mode": "Increment Host",
        "your_ip_step": "1",
    }
    preview_layers = saved.data["packet_previews"][0]["layers"]
    assert preview_layers[3]["name"] == "Dynamic Host Configuration Protocol"
    assert preview_layers[3]["fields"]["operation"] == 1
    assert preview_layers[3]["fields"]["operation_mode"] == "Increment"
    assert preview_layers[3]["fields"]["hops"] == 1
    assert preview_layers[3]["fields"]["hops_mode"] == "Increment"
    assert preview_layers[3]["fields"]["seconds"] == 10
    assert preview_layers[3]["fields"]["seconds_mode"] == "Increment"
    assert preview_layers[3]["fields"]["message_type"] == 1
    assert preview_layers[3]["fields"]["message_type_mode"] == "Increment"
    assert preview_layers[3]["fields"]["xid"] == 0x3903F326
    assert preview_layers[3]["fields"]["xid_mode"] == "Increment"
    assert preview_layers[3]["fields"]["flags"] == "0x0000"
    assert preview_layers[3]["fields"]["flags_mode"] == "Increment"
    assert preview_layers[3]["fields"]["client_ip"] == "10.10.0.10"
    assert preview_layers[3]["fields"]["client_ip_mode"] == "Increment Host"
    assert preview_layers[3]["fields"]["your_ip"] == "10.10.0.20"
    assert preview_layers[3]["fields"]["your_ip_mode"] == "Increment Host"
    assert preview_layers[3]["fields"]["server_ip"] == "10.10.0.30"
    assert preview_layers[3]["fields"]["server_ip_mode"] == "Increment Host"
    assert preview_layers[3]["fields"]["relay_ip"] == "10.10.0.40"
    assert preview_layers[3]["fields"]["relay_ip_mode"] == "Increment Host"
    assert preview_layers[3]["fields"]["client_mac"] == "00:11:22:33:44:10"
    assert preview_layers[3]["fields"]["client_mac_mode"] == "Increment"
    assert preview_layers[3]["fields"]["parameter_request_list"] == "1,3,6,15"
    assert preview_layers[3]["fields"]["lease_time"] == 3600
    assert preview_layers[3]["fields"]["lease_time_mode"] == "Increment"
    assert preview_layers[3]["fields"]["renewal_time"] == 1800
    assert preview_layers[3]["fields"]["renewal_time_mode"] == "Increment"
    assert preview_layers[3]["fields"]["rebinding_time"] == 3150
    assert preview_layers[3]["fields"]["rebinding_time_mode"] == "Increment"
    assert preview_layers[3]["fields"]["requested_ip_mode"] == "Increment Host"
    assert preview_layers[3]["fields"]["server_id_mode"] == "Increment Host"

    loaded = service.load_workbench_profile("dhcp-message-type-xid-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["dhcp_enabled"] is True
    assert loaded_stream["dhcp_operation"] == 1
    assert loaded_stream["dhcp_operation_mode"] == "Increment"
    assert loaded_stream["dhcp_operation_count"] == 2
    assert loaded_stream["dhcp_operation_step"] == 1
    assert loaded_stream["dhcp_hops"] == 1
    assert loaded_stream["dhcp_hops_mode"] == "Increment"
    assert loaded_stream["dhcp_hops_count"] == 4
    assert loaded_stream["dhcp_hops_step"] == 1
    assert loaded_stream["dhcp_seconds"] == 10
    assert loaded_stream["dhcp_seconds_mode"] == "Increment"
    assert loaded_stream["dhcp_seconds_count"] == 4
    assert loaded_stream["dhcp_seconds_step"] == 10
    assert loaded_stream["dhcp_message_type"] == 1
    assert loaded_stream["dhcp_message_type_mode"] == "Increment"
    assert loaded_stream["dhcp_message_type_count"] == 4
    assert loaded_stream["dhcp_message_type_step"] == 1
    assert loaded_stream["dhcp_xid"] == 0x3903F326
    assert loaded_stream["dhcp_xid_mode"] == "Increment"
    assert loaded_stream["dhcp_xid_count"] == 4
    assert loaded_stream["dhcp_xid_step"] == 1
    assert loaded_stream["dhcp_flags"] == "0000"
    assert loaded_stream["dhcp_flags_mode"] == "Increment"
    assert loaded_stream["dhcp_flags_count"] == 4
    assert loaded_stream["dhcp_flags_step"] == 1
    assert loaded_stream["dhcp_client_ip"] == "10.10.0.10"
    assert loaded_stream["dhcp_client_ip_mode"] == "Increment Host"
    assert loaded_stream["dhcp_client_ip_count"] == 4
    assert loaded_stream["dhcp_client_ip_step"] == 1
    assert loaded_stream["dhcp_your_ip"] == "10.10.0.20"
    assert loaded_stream["dhcp_your_ip_mode"] == "Increment Host"
    assert loaded_stream["dhcp_your_ip_count"] == 4
    assert loaded_stream["dhcp_your_ip_step"] == 1
    assert loaded_stream["dhcp_server_ip"] == "10.10.0.30"
    assert loaded_stream["dhcp_server_ip_mode"] == "Increment Host"
    assert loaded_stream["dhcp_server_ip_count"] == 4
    assert loaded_stream["dhcp_server_ip_step"] == 1
    assert loaded_stream["dhcp_relay_ip"] == "10.10.0.40"
    assert loaded_stream["dhcp_relay_ip_mode"] == "Increment Host"
    assert loaded_stream["dhcp_relay_ip_count"] == 4
    assert loaded_stream["dhcp_relay_ip_step"] == 1
    assert loaded_stream["dhcp_client_mac"] == "00:11:22:33:44:10"
    assert loaded_stream["dhcp_client_mac_mode"] == "Increment"
    assert loaded_stream["dhcp_client_mac_count"] == 4
    assert loaded_stream["dhcp_client_mac_step"] == 1
    assert loaded_stream["dhcp_hostname"] == "trex-webui"
    assert loaded_stream["dhcp_requested_ip"] == "10.0.0.10"
    assert loaded_stream["dhcp_requested_ip_mode"] == "Increment Host"
    assert loaded_stream["dhcp_requested_ip_count"] == 4
    assert loaded_stream["dhcp_requested_ip_step"] == 1
    assert loaded_stream["dhcp_server_id"] == "10.0.0.1"
    assert loaded_stream["dhcp_server_id_mode"] == "Increment Host"
    assert loaded_stream["dhcp_server_id_count"] == 4
    assert loaded_stream["dhcp_server_id_step"] == 1
    assert loaded_stream["dhcp_parameter_request_list"] == "1,3,6,15"
    assert loaded_stream["dhcp_lease_time"] == 3600
    assert loaded_stream["dhcp_lease_time_mode"] == "Increment"
    assert loaded_stream["dhcp_lease_time_count"] == 4
    assert loaded_stream["dhcp_lease_time_step"] == 60
    assert loaded_stream["dhcp_renewal_time"] == 1800
    assert loaded_stream["dhcp_renewal_time_mode"] == "Increment"
    assert loaded_stream["dhcp_renewal_time_count"] == 4
    assert loaded_stream["dhcp_renewal_time_step"] == 30
    assert loaded_stream["dhcp_rebinding_time"] == 3150
    assert loaded_stream["dhcp_rebinding_time_mode"] == "Increment"
    assert loaded_stream["dhcp_rebinding_time_count"] == 4
    assert loaded_stream["dhcp_rebinding_time_step"] == 45


def test_workbench_export_and_import_pcap_preserves_dhcp_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "dhcp-discover",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 346,
        "dhcp_enabled": True,
        "dhcp_operation": 2,
        "dhcp_operation_mode": "Fixed",
        "dhcp_operation_count": 2,
        "dhcp_operation_step": 1,
        "dhcp_hops": 3,
        "dhcp_hops_mode": "Fixed",
        "dhcp_hops_count": 16,
        "dhcp_hops_step": 1,
        "dhcp_seconds": 120,
        "dhcp_seconds_mode": "Fixed",
        "dhcp_seconds_count": 16,
        "dhcp_seconds_step": 1,
        "dhcp_message_type": 1,
        "dhcp_xid": 0x3903F326,
        "dhcp_flags": "8000",
        "dhcp_flags_mode": "Fixed",
        "dhcp_flags_count": 16,
        "dhcp_flags_step": 1,
        "dhcp_client_ip": "10.10.0.10",
        "dhcp_client_ip_mode": "Fixed",
        "dhcp_client_ip_count": 16,
        "dhcp_client_ip_step": 1,
        "dhcp_your_ip": "10.10.0.20",
        "dhcp_your_ip_mode": "Fixed",
        "dhcp_your_ip_count": 16,
        "dhcp_your_ip_step": 1,
        "dhcp_server_ip": "10.10.0.30",
        "dhcp_server_ip_mode": "Fixed",
        "dhcp_server_ip_count": 16,
        "dhcp_server_ip_step": 1,
        "dhcp_relay_ip": "10.10.0.40",
        "dhcp_relay_ip_mode": "Fixed",
        "dhcp_relay_ip_count": 16,
        "dhcp_relay_ip_step": 1,
        "dhcp_client_mac": "00:11:22:33:44:55",
        "dhcp_client_mac_mode": "Fixed",
        "dhcp_client_mac_count": 16,
        "dhcp_client_mac_step": 1,
        "dhcp_hostname": "trex-webui",
        "dhcp_requested_ip": "10.0.0.10",
        "dhcp_server_id": "10.0.0.1",
        "dhcp_parameter_request_list": "1,3,6,15",
        "dhcp_lease_time": 3600,
        "dhcp_renewal_time": 1800,
        "dhcp_rebinding_time": 3150,
    }

    exported = service.export_workbench_stream_pcap(stream, "dhcp-discover.pcap")

    assert exported.ok is True
    imported = service.import_workbench_pcap("dhcp-discover.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/UDP"
    assert imported_stream["l4_src_port"] == 68
    assert imported_stream["l4_dst_port"] == 67
    assert imported_stream["dhcp_enabled"] is True
    assert imported_stream["dhcp_operation"] == 2
    assert imported_stream["dhcp_operation_mode"] == "Fixed"
    assert imported_stream["dhcp_operation_count"] == 2
    assert imported_stream["dhcp_operation_step"] == 1
    assert imported_stream["dhcp_hops"] == 3
    assert imported_stream["dhcp_hops_mode"] == "Fixed"
    assert imported_stream["dhcp_hops_count"] == 16
    assert imported_stream["dhcp_hops_step"] == 1
    assert imported_stream["dhcp_seconds"] == 120
    assert imported_stream["dhcp_seconds_mode"] == "Fixed"
    assert imported_stream["dhcp_seconds_count"] == 16
    assert imported_stream["dhcp_seconds_step"] == 1
    assert imported_stream["dhcp_message_type"] == 1
    assert imported_stream["dhcp_message_type_mode"] == "Fixed"
    assert imported_stream["dhcp_message_type_count"] == 16
    assert imported_stream["dhcp_message_type_step"] == 1
    assert imported_stream["dhcp_xid"] == 0x3903F326
    assert imported_stream["dhcp_xid_mode"] == "Fixed"
    assert imported_stream["dhcp_flags"] == "8000"
    assert imported_stream["dhcp_flags_mode"] == "Fixed"
    assert imported_stream["dhcp_flags_count"] == 16
    assert imported_stream["dhcp_flags_step"] == 1
    assert imported_stream["dhcp_client_ip"] == "10.10.0.10"
    assert imported_stream["dhcp_client_ip_mode"] == "Fixed"
    assert imported_stream["dhcp_client_ip_count"] == 16
    assert imported_stream["dhcp_client_ip_step"] == 1
    assert imported_stream["dhcp_your_ip"] == "10.10.0.20"
    assert imported_stream["dhcp_your_ip_mode"] == "Fixed"
    assert imported_stream["dhcp_your_ip_count"] == 16
    assert imported_stream["dhcp_your_ip_step"] == 1
    assert imported_stream["dhcp_server_ip"] == "10.10.0.30"
    assert imported_stream["dhcp_server_ip_mode"] == "Fixed"
    assert imported_stream["dhcp_server_ip_count"] == 16
    assert imported_stream["dhcp_server_ip_step"] == 1
    assert imported_stream["dhcp_relay_ip"] == "10.10.0.40"
    assert imported_stream["dhcp_relay_ip_mode"] == "Fixed"
    assert imported_stream["dhcp_relay_ip_count"] == 16
    assert imported_stream["dhcp_relay_ip_step"] == 1
    assert imported_stream["dhcp_client_mac"] == "00:11:22:33:44:55"
    assert imported_stream["dhcp_client_mac_mode"] == "Fixed"
    assert imported_stream["dhcp_client_mac_count"] == 16
    assert imported_stream["dhcp_client_mac_step"] == 1
    assert imported_stream["dhcp_hostname"] == "trex-webui"
    assert imported_stream["dhcp_requested_ip"] == "10.0.0.10"
    assert imported_stream["dhcp_requested_ip_mode"] == "Fixed"
    assert imported_stream["dhcp_requested_ip_count"] == 16
    assert imported_stream["dhcp_requested_ip_step"] == 1
    assert imported_stream["dhcp_server_id"] == "10.0.0.1"
    assert imported_stream["dhcp_server_id_mode"] == "Fixed"
    assert imported_stream["dhcp_server_id_count"] == 16
    assert imported_stream["dhcp_server_id_step"] == 1
    assert imported_stream["dhcp_parameter_request_list"] == "1,3,6,15"
    assert imported_stream["dhcp_lease_time"] == 3600
    assert imported_stream["dhcp_lease_time_mode"] == "Fixed"
    assert imported_stream["dhcp_lease_time_count"] == 16
    assert imported_stream["dhcp_lease_time_step"] == 1
    assert imported_stream["dhcp_renewal_time"] == 1800
    assert imported_stream["dhcp_renewal_time_mode"] == "Fixed"
    assert imported_stream["dhcp_renewal_time_count"] == 16
    assert imported_stream["dhcp_renewal_time_step"] == 1
    assert imported_stream["dhcp_rebinding_time"] == 3150
    assert imported_stream["dhcp_rebinding_time_mode"] == "Fixed"
    assert imported_stream["dhcp_rebinding_time_count"] == 16
    assert imported_stream["dhcp_rebinding_time_step"] == 1


def test_workbench_profile_renders_tcp_checksum_field_engine_after_fixup(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "tcp-checksum-fe.yaml",
        [
            {
                "name": "tcp-checksum-fe",
                "packet_type": "Ethernet/IPv4/TCP",
                "frame_length": 128,
                "tcp_window": 1024,
                "tcp_window_mode": "Increment",
                "tcp_window_count": 4,
                "tcp_window_step": 1,
                "tcp_checksum_override": True,
                "tcp_checksum": "BEEF",
                "tcp_checksum_mode": "Increment",
                "tcp_checksum_count": 4,
                "tcp_checksum_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "tcp_checksum"
    assert vm["instructions"] == [
        {
            "init_value": 1024,
            "max_value": 1027,
            "min_value": 1024,
            "name": "tcp_window",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_window",
            "pkt_offset": 48,
            "type": "write_flow_var",
        },
        {
            "l2_len": 14,
            "l3_len": 20,
            "l4_type": 13,
            "type": "fix_checksum_hw",
        },
        {
            "init_value": 0xBEEF,
            "max_value": 0xBEF2,
            "min_value": 0xBEEF,
            "name": "tcp_checksum",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_checksum",
            "pkt_offset": 50,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[50:52], "big") == 0xBEEF
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["is_override_checksum"] is True
    assert packet_meta["l4"]["checksum"] == "BEEF"
    assert packet_meta["l4"]["checksum_mode"] == "Increment"
    assert packet_meta["l4"]["checksum_count"] == "4"
    assert packet_meta["l4"]["checksum_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["checksum"] == "BEEF"
    assert preview_fields["checksum_override"] is True
    assert preview_fields["checksum_mode"] == "Increment"
    assert preview_fields["checksum_count"] == 4
    assert preview_fields["checksum_step"] == 1

    loaded = service.load_workbench_profile("tcp-checksum-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["tcp_checksum_override"] is True
    assert loaded_stream["tcp_checksum"] == "BEEF"
    assert loaded_stream["tcp_checksum_mode"] == "Increment"
    assert loaded_stream["tcp_checksum_count"] == 4
    assert loaded_stream["tcp_checksum_step"] == 1


def test_workbench_profile_renders_tcp_options_and_mss_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "tcp-options-fe",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 128,
        "tcp_flag_syn": True,
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
    saved = service.save_workbench_profile("tcp-options-fe.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "tcp_option_window_scale"
    assert vm["instructions"] == [
        {
            "init_value": 1460,
            "max_value": 1463,
            "min_value": 1460,
            "name": "tcp_option_mss",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_option_mss",
            "pkt_offset": 56,
            "type": "write_flow_var",
        },
        {
            "init_value": 1000,
            "max_value": 1003,
            "min_value": 1000,
            "name": "tcp_option_sack_left_edge",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_option_sack_left_edge",
            "pkt_offset": 62,
            "type": "write_flow_var",
        },
        {
            "init_value": 2000,
            "max_value": 2003,
            "min_value": 2000,
            "name": "tcp_option_sack_right_edge",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_option_sack_right_edge",
            "pkt_offset": 66,
            "type": "write_flow_var",
        },
        {
            "init_value": 123456,
            "max_value": 123459,
            "min_value": 123456,
            "name": "tcp_option_timestamp_value",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_option_timestamp_value",
            "pkt_offset": 74,
            "type": "write_flow_var",
        },
        {
            "init_value": 654321,
            "max_value": 654324,
            "min_value": 654321,
            "name": "tcp_option_timestamp_echo",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_option_timestamp_echo",
            "pkt_offset": 78,
            "type": "write_flow_var",
        },
        {
            "init_value": 7,
            "max_value": 10,
            "min_value": 7,
            "name": "tcp_option_window_scale",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_option_window_scale",
            "pkt_offset": 85,
            "type": "write_flow_var",
        },
        {
            "l2_len": 14,
            "l3_len": 20,
            "l4_type": 13,
            "type": "fix_checksum_hw",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    tcp_offset = 34
    assert (packet[tcp_offset + 12] >> 4) == 13
    assert packet[tcp_offset + 20 : tcp_offset + 52] == bytes.fromhex(
        "020405b40402050a000003e8000007d00101080a0001e2400009fbf101030307"
    )
    assert int.from_bytes(packet[tcp_offset + 22 : tcp_offset + 24], "big") == 1460
    assert_ipv4_l4_checksums_valid(packet)
    decoded_layers = _capture_decoded_layers(packet)
    assert [layer["name"] for layer in decoded_layers] == ["Ethernet", "IPv4", "TCP"]
    tcp_decode_fields = decoded_layers[2]["fields"]
    assert {"name": "Header Length", "value": "52"} in tcp_decode_fields
    assert {"name": "Option MSS", "value": "1460"} in tcp_decode_fields
    assert {"name": "Option SACK Permitted", "value": "yes"} in tcp_decode_fields
    assert {"name": "Option SACK Left Edge", "value": "1000"} in tcp_decode_fields
    assert {"name": "Option SACK Right Edge", "value": "2000"} in tcp_decode_fields
    assert {"name": "Option Timestamp Value", "value": "123456"} in tcp_decode_fields
    assert {"name": "Option Timestamp Echo", "value": "654321"} in tcp_decode_fields
    assert {"name": "Option Window Scale", "value": "7"} in tcp_decode_fields

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["mss_enabled"] is True
    assert packet_meta["l4"]["mss"] == "1460"
    assert packet_meta["l4"]["mss_mode"] == "Increment"
    assert packet_meta["l4"]["mss_count"] == "4"
    assert packet_meta["l4"]["mss_step"] == "1"
    assert packet_meta["l4"]["window_scale_enabled"] is True
    assert packet_meta["l4"]["window_scale"] == "7"
    assert packet_meta["l4"]["window_scale_mode"] == "Increment"
    assert packet_meta["l4"]["window_scale_count"] == "4"
    assert packet_meta["l4"]["window_scale_step"] == "1"
    assert packet_meta["l4"]["sack_permitted_enabled"] is True
    assert packet_meta["l4"]["sack_blocks_enabled"] is True
    assert packet_meta["l4"]["sack_left_edge"] == "1000"
    assert packet_meta["l4"]["sack_left_edge_mode"] == "Increment"
    assert packet_meta["l4"]["sack_left_edge_count"] == "4"
    assert packet_meta["l4"]["sack_left_edge_step"] == "1"
    assert packet_meta["l4"]["sack_right_edge"] == "2000"
    assert packet_meta["l4"]["sack_right_edge_mode"] == "Increment"
    assert packet_meta["l4"]["sack_right_edge_count"] == "4"
    assert packet_meta["l4"]["sack_right_edge_step"] == "1"
    assert packet_meta["l4"]["timestamp_enabled"] is True
    assert packet_meta["l4"]["timestamp_value"] == "123456"
    assert packet_meta["l4"]["timestamp_value_mode"] == "Increment"
    assert packet_meta["l4"]["timestamp_value_count"] == "4"
    assert packet_meta["l4"]["timestamp_value_step"] == "1"
    assert packet_meta["l4"]["timestamp_echo"] == "654321"
    assert packet_meta["l4"]["timestamp_echo_mode"] == "Increment"
    assert packet_meta["l4"]["timestamp_echo_count"] == "4"
    assert packet_meta["l4"]["timestamp_echo_step"] == "1"
    preview_layers = saved.data["packet_previews"][0]["layers"]
    tcp_fields = preview_layers[2]["fields"]
    assert tcp_fields["header_length"] == 52
    assert tcp_fields["options"] == "MSS=1460, SACK permitted, SACK=1000-2000, TS=123456/654321, WS=7"
    assert preview_layers[3]["name"] == "TCP Options"
    assert preview_layers[3]["fields"]["mss"] == 1460
    assert preview_layers[3]["fields"]["mss_mode"] == "Increment"
    assert preview_layers[3]["fields"]["window_scale"] == 7
    assert preview_layers[3]["fields"]["window_scale_mode"] == "Increment"
    assert preview_layers[3]["fields"]["window_scale_count"] == 4
    assert preview_layers[3]["fields"]["window_scale_step"] == 1
    assert preview_layers[3]["fields"]["sack_permitted"] is True
    assert preview_layers[3]["fields"]["sack_blocks_enabled"] is True
    assert preview_layers[3]["fields"]["sack_left_edge"] == 1000
    assert preview_layers[3]["fields"]["sack_left_edge_mode"] == "Increment"
    assert preview_layers[3]["fields"]["sack_left_edge_count"] == 4
    assert preview_layers[3]["fields"]["sack_left_edge_step"] == 1
    assert preview_layers[3]["fields"]["sack_right_edge"] == 2000
    assert preview_layers[3]["fields"]["sack_right_edge_mode"] == "Increment"
    assert preview_layers[3]["fields"]["sack_right_edge_count"] == 4
    assert preview_layers[3]["fields"]["sack_right_edge_step"] == 1
    assert preview_layers[3]["fields"]["timestamp_value"] == 123456
    assert preview_layers[3]["fields"]["timestamp_value_mode"] == "Increment"
    assert preview_layers[3]["fields"]["timestamp_value_count"] == 4
    assert preview_layers[3]["fields"]["timestamp_value_step"] == 1
    assert preview_layers[3]["fields"]["timestamp_echo_mode"] == "Increment"
    assert preview_layers[3]["fields"]["timestamp_echo_count"] == 4
    assert preview_layers[3]["fields"]["timestamp_echo_step"] == 1

    loaded = service.load_workbench_profile("tcp-options-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["tcp_option_mss_enabled"] is True
    assert loaded_stream["tcp_option_mss"] == 1460
    assert loaded_stream["tcp_option_mss_mode"] == "Increment"
    assert loaded_stream["tcp_option_window_scale_enabled"] is True
    assert loaded_stream["tcp_option_window_scale"] == 7
    assert loaded_stream["tcp_option_window_scale_mode"] == "Increment"
    assert loaded_stream["tcp_option_window_scale_count"] == 4
    assert loaded_stream["tcp_option_window_scale_step"] == 1
    assert loaded_stream["tcp_option_sack_permitted_enabled"] is True
    assert loaded_stream["tcp_option_sack_blocks_enabled"] is True
    assert loaded_stream["tcp_option_sack_left_edge"] == 1000
    assert loaded_stream["tcp_option_sack_left_edge_mode"] == "Increment"
    assert loaded_stream["tcp_option_sack_left_edge_count"] == 4
    assert loaded_stream["tcp_option_sack_left_edge_step"] == 1
    assert loaded_stream["tcp_option_sack_right_edge"] == 2000
    assert loaded_stream["tcp_option_sack_right_edge_mode"] == "Increment"
    assert loaded_stream["tcp_option_sack_right_edge_count"] == 4
    assert loaded_stream["tcp_option_sack_right_edge_step"] == 1
    assert loaded_stream["tcp_option_timestamp_enabled"] is True
    assert loaded_stream["tcp_option_timestamp_value"] == 123456
    assert loaded_stream["tcp_option_timestamp_value_mode"] == "Increment"
    assert loaded_stream["tcp_option_timestamp_value_count"] == 4
    assert loaded_stream["tcp_option_timestamp_value_step"] == 1
    assert loaded_stream["tcp_option_timestamp_echo"] == 654321
    assert loaded_stream["tcp_option_timestamp_echo_mode"] == "Increment"
    assert loaded_stream["tcp_option_timestamp_echo_count"] == 4
    assert loaded_stream["tcp_option_timestamp_echo_step"] == 1

    exported_pcap = service.export_workbench_stream_pcap(stream, "tcp-options-fe.pcap")
    imported = service.import_workbench_pcap("tcp-options-fe.pcap", exported_pcap.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["tcp_option_mss_enabled"] is True
    assert imported_stream["tcp_option_mss"] == 1460
    assert imported_stream["tcp_option_window_scale_enabled"] is True
    assert imported_stream["tcp_option_window_scale"] == 7
    assert imported_stream["tcp_option_window_scale_mode"] == "Fixed"
    assert imported_stream["tcp_option_sack_permitted_enabled"] is True
    assert imported_stream["tcp_option_sack_blocks_enabled"] is True
    assert imported_stream["tcp_option_sack_left_edge"] == 1000
    assert imported_stream["tcp_option_sack_left_edge_mode"] == "Fixed"
    assert imported_stream["tcp_option_sack_right_edge"] == 2000
    assert imported_stream["tcp_option_sack_right_edge_mode"] == "Fixed"
    assert imported_stream["tcp_option_timestamp_enabled"] is True
    assert imported_stream["tcp_option_timestamp_value"] == 123456
    assert imported_stream["tcp_option_timestamp_value_mode"] == "Fixed"
    assert imported_stream["tcp_option_timestamp_echo"] == 654321
    assert imported_stream["tcp_option_timestamp_echo_mode"] == "Fixed"


def test_workbench_profile_renders_arp_request(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "arp-request",
        "packet_type": "Ethernet/ARP",
        "frame_length": 64,
        "ether_dst": "ff:ff:ff:ff:ff:ff",
        "ether_src": "00:11:22:33:44:55",
        "ether_dst_mode": "Fixed",
        "ether_src_mode": "Fixed",
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
        "arp_target_mac": "66:55:44:33:22:10",
        "arp_target_mac_mode": "Random",
        "arp_target_mac_count": 8,
        "arp_target_mac_step": 1,
        "arp_target_ip": "10.0.0.2",
        "arp_target_ip_mode": "Random Host",
        "arp_target_ip_count": 8,
        "arp_target_ip_step": 1,
        "flow_stats_enabled": True,
        "latency_enabled": True,
        "payload_pattern": "CAFE",
    }
    saved = service.save_workbench_profile("arp-request.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    arp_offset = 14
    assert packet[0:6].hex(":") == "ff:ff:ff:ff:ff:ff"
    assert packet[6:12].hex(":") == "00:11:22:33:44:55"
    assert packet[12:14].hex() == "0806"
    assert int.from_bytes(packet[arp_offset : arp_offset + 2], "big") == 1
    assert packet[arp_offset + 2 : arp_offset + 4].hex() == "0800"
    assert packet[arp_offset + 4] == 6
    assert packet[arp_offset + 5] == 4
    assert int.from_bytes(packet[arp_offset + 6 : arp_offset + 8], "big") == 1
    assert packet[arp_offset + 8 : arp_offset + 14].hex(":") == "00:11:22:33:44:55"
    assert packet[arp_offset + 14 : arp_offset + 18] == b"\x0a\x00\x00\x01"
    assert packet[arp_offset + 18 : arp_offset + 24].hex(":") == "66:55:44:33:22:10"
    assert packet[arp_offset + 24 : arp_offset + 28] == b"\x0a\x00\x00\x02"
    assert packet[arp_offset + 28 : arp_offset + 32].hex() == "cafecafe"
    vm = entry["stream"]["vm"]["instructions"]
    assert vm[:6] == [
        {
            "init_value": 1,
            "max_value": 2,
            "min_value": 1,
            "name": "arp_operation",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "arp_operation",
            "pkt_offset": 20,
            "type": "write_flow_var",
        },
        {
            "init_value": 2,
            "max_value": 9,
            "min_value": 2,
            "name": "arp_target_ip",
            "op": "random",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "arp_target_ip",
            "pkt_offset": 41,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "arp_sender_ip",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "arp_sender_ip",
            "pkt_offset": 31,
            "type": "write_flow_var",
        },
    ]
    assert vm[6:10] == [
        {
            "init_value": 16,
            "max_value": 23,
            "min_value": 16,
            "name": "arp_target_mac",
            "op": "random",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "arp_target_mac",
            "pkt_offset": 37,
            "type": "write_flow_var",
        },
        {
            "init_value": 85,
            "max_value": 88,
            "min_value": 85,
            "name": "arp_sender_mac",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "arp_sender_mac",
            "pkt_offset": 27,
            "type": "write_flow_var",
        },
    ]
    assert entry["stream"]["vm"]["split_by_var"] == "arp_sender_mac"

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_arp_selected"] is True
    assert packet_meta["arp"]["operation"] == "1"
    assert packet_meta["arp"]["operation_mode"] == "Increment"
    assert packet_meta["arp"]["operation_count"] == "2"
    assert packet_meta["arp"]["operation_step"] == "1"
    assert packet_meta["arp"]["sender_mac"] == "00:11:22:33:44:55"
    assert packet_meta["arp"]["sender_mac_mode"] == "Increment"
    assert packet_meta["arp"]["sender_mac_count"] == "4"
    assert packet_meta["arp"]["sender_ip"] == "10.0.0.1"
    assert packet_meta["arp"]["sender_ip_mode"] == "Increment Host"
    assert packet_meta["arp"]["sender_ip_count"] == "4"
    assert packet_meta["arp"]["target_mac"] == "66:55:44:33:22:10"
    assert packet_meta["arp"]["target_mac_mode"] == "Random"
    assert packet_meta["arp"]["target_mac_count"] == "8"
    assert packet_meta["arp"]["target_ip"] == "10.0.0.2"
    assert packet_meta["arp"]["target_ip_mode"] == "Random Host"
    assert packet_meta["arp"]["target_ip_count"] == "8"
    preview_layers = saved.data["packet_previews"][0]["layers"]
    assert preview_layers[1]["name"] == "Address Resolution Protocol"
    assert preview_layers[1]["fields"]["protocol_type"] == "0x0800"
    assert preview_layers[1]["fields"]["operation"] == 1
    assert preview_layers[1]["fields"]["operation_mode"] == "Increment"
    assert preview_layers[1]["fields"]["operation_count"] == 2
    assert preview_layers[1]["fields"]["operation_step"] == 1
    assert preview_layers[1]["fields"]["sender_mac"] == "00:11:22:33:44:55"
    assert preview_layers[1]["fields"]["sender_mac_mode"] == "Increment"
    assert preview_layers[1]["fields"]["sender_ip_mode"] == "Increment Host"
    assert preview_layers[1]["fields"]["target_mac"] == "66:55:44:33:22:10"
    assert preview_layers[1]["fields"]["target_mac_mode"] == "Random"
    assert preview_layers[1]["fields"]["target_ip"] == "10.0.0.2"
    assert preview_layers[1]["fields"]["target_ip_mode"] == "Random Host"
    assert preview_layers[2]["name"] == "Payload"
    assert preview_layers[2]["fields"]["bytes"] == 18

    loaded = service.load_workbench_profile("arp-request.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/ARP"
    assert loaded_stream["flow_stats_enabled"] is False
    assert loaded_stream["latency_enabled"] is False
    assert loaded_stream["arp_operation"] == 1
    assert loaded_stream["arp_operation_mode"] == "Increment"
    assert loaded_stream["arp_operation_count"] == 2
    assert loaded_stream["arp_operation_step"] == 1
    assert loaded_stream["arp_sender_mac"] == "00:11:22:33:44:55"
    assert loaded_stream["arp_sender_mac_mode"] == "Increment"
    assert loaded_stream["arp_sender_mac_count"] == 4
    assert loaded_stream["arp_sender_mac_step"] == 1
    assert loaded_stream["arp_sender_ip"] == "10.0.0.1"
    assert loaded_stream["arp_sender_ip_mode"] == "Increment Host"
    assert loaded_stream["arp_sender_ip_count"] == 4
    assert loaded_stream["arp_sender_ip_step"] == 1
    assert loaded_stream["arp_target_mac"] == "66:55:44:33:22:10"
    assert loaded_stream["arp_target_mac_mode"] == "Random"
    assert loaded_stream["arp_target_mac_count"] == 8
    assert loaded_stream["arp_target_mac_step"] == 1
    assert loaded_stream["arp_target_ip"] == "10.0.0.2"
    assert loaded_stream["arp_target_ip_mode"] == "Random Host"
    assert loaded_stream["arp_target_ip_count"] == 8
    assert loaded_stream["arp_target_ip_step"] == 1

    exported_pcap = service.export_workbench_stream_pcap(stream, "arp-request.pcap")
    imported = service.import_workbench_pcap("arp-request.pcap", exported_pcap.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/ARP"
    assert imported_stream["arp_hardware_type"] == 1
    assert imported_stream["arp_protocol_type"] == "0800"
    assert imported_stream["arp_hardware_size"] == 6
    assert imported_stream["arp_protocol_size"] == 4
    assert imported_stream["arp_operation"] == 1
    assert imported_stream["arp_operation_mode"] == "Fixed"
    assert imported_stream["arp_operation_count"] == 4
    assert imported_stream["arp_operation_step"] == 1
    assert imported_stream["arp_sender_mac"] == "00:11:22:33:44:55"
    assert imported_stream["arp_sender_ip"] == "10.0.0.1"
    assert imported_stream["arp_target_mac"] == "66:55:44:33:22:10"
    assert imported_stream["arp_target_ip"] == "10.0.0.2"


def test_workbench_profile_renders_ipv4_icmp_echo(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "icmp-echo",
        "packet_type": "Ethernet/IPv4/ICMP",
        "frame_length": 96,
        "ipv4_src": "10.0.0.1",
        "ipv4_dst": "10.0.0.2",
        "icmp_type": 8,
        "icmp_code": 0,
        "icmp_identifier": 0x1234,
        "icmp_sequence": 7,
        "payload_pattern": "A1B2",
    }
    saved = service.save_workbench_profile("icmp-echo.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    ip_offset = 14
    icmp_offset = 34
    total_length = int.from_bytes(packet[ip_offset + 2 : ip_offset + 4], "big")
    assert packet[12:14].hex() == "0800"
    assert packet[ip_offset + 9] == 1
    assert packet[ip_offset + 12 : ip_offset + 16] == b"\x0a\x00\x00\x01"
    assert packet[ip_offset + 16 : ip_offset + 20] == b"\x0a\x00\x00\x02"
    assert packet[icmp_offset] == 8
    assert packet[icmp_offset + 1] == 0
    assert int.from_bytes(packet[icmp_offset + 4 : icmp_offset + 6], "big") == 0x1234
    assert int.from_bytes(packet[icmp_offset + 6 : icmp_offset + 8], "big") == 7
    assert packet[icmp_offset + 8 : icmp_offset + 12].hex() == "a1b2a1b2"
    assert_ipv4_l4_checksums_valid(packet)
    assert internet_checksum(packet[icmp_offset : ip_offset + total_length]) == 0

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_icmp_selected"] is True
    assert packet_meta["l4"]["icmp_type"] == "8"
    assert packet_meta["l4"]["icmp_code"] == "0"
    assert packet_meta["l4"]["icmp_identifier"] == "4660"
    assert packet_meta["l4"]["icmp_sequence"] == "7"
    assert packet_meta["l4"]["icmp_is_override_checksum"] is False
    assert packet_meta["l4"]["icmp_checksum"] == "0000"
    preview_layers = saved.data["packet_previews"][0]["layers"]
    assert preview_layers[2]["name"] == "ICMP"
    assert preview_layers[2]["fields"]["type"] == 8
    assert preview_layers[2]["fields"]["identifier"] == 0x1234
    assert preview_layers[2]["fields"]["sequence"] == 7
    assert preview_layers[2]["fields"]["checksum"] == "auto"

    loaded = service.load_workbench_profile("icmp-echo.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv4/ICMP"
    assert loaded_stream["icmp_type"] == 8
    assert loaded_stream["icmp_code"] == 0
    assert loaded_stream["icmp_identifier"] == 0x1234
    assert loaded_stream["icmp_sequence"] == 7
    assert loaded_stream["icmp_checksum_override"] is False

    exported_pcap = service.export_workbench_stream_pcap(stream, "icmp-echo.pcap")
    imported = service.import_workbench_pcap("icmp-echo.pcap", exported_pcap.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/ICMP"
    assert imported_stream["icmp_type"] == 8
    assert imported_stream["icmp_code"] == 0
    assert imported_stream["icmp_identifier"] == 0x1234
    assert imported_stream["icmp_sequence"] == 7
    assert imported_stream["icmp_checksum_override"] is True


def test_workbench_profile_keeps_ipv4_icmp_echo_field_engine_fixed_without_l4_checksum_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "icmp-echo-fe",
        "packet_type": "Ethernet/IPv4/ICMP",
        "frame_length": 96,
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "icmp_type": 8,
        "icmp_identifier": 0x1234,
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

    saved = service.save_workbench_profile("icmp-echo-fe.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    assert preview["layers"][2]["name"] == "ICMP"
    assert preview["layers"][2]["fields"]["identifier_mode"] == "Fixed"
    assert preview["layers"][2]["fields"]["identifier_count"] == 4
    assert preview["layers"][2]["fields"]["sequence_mode"] == "Fixed"
    assert preview["layers"][2]["fields"]["sequence_count"] == 4
    assert preview["layers"][2]["fields"]["checksum"] == "BEEF"

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["icmp_identifier_mode"] == "Fixed"
    assert packet_meta["l4"]["icmp_identifier_count"] == "4"
    assert packet_meta["l4"]["icmp_sequence_mode"] == "Fixed"
    assert packet_meta["l4"]["icmp_sequence_count"] == "4"
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == ""
    assert vm["instructions"] == []

    loaded = service.load_workbench_profile("icmp-echo-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["icmp_checksum_override"] is True
    assert loaded_stream["icmp_identifier_mode"] == "Fixed"
    assert loaded_stream["icmp_identifier_count"] == 4
    assert loaded_stream["icmp_identifier_step"] == 1
    assert loaded_stream["icmp_sequence_mode"] == "Fixed"
    assert loaded_stream["icmp_sequence_count"] == 4
    assert loaded_stream["icmp_sequence_step"] == 1


def test_workbench_profile_renders_ipv6_icmpv6_echo(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "icmpv6-echo",
        "packet_type": "Ethernet/IPv6/ICMPv6",
        "frame_length": 96,
        "frame_length_type": "Random",
        "ipv6_src": "2001:db8::1",
        "ipv6_dst": "2001:db8::2",
        "ipv6_src_mode": "Increment Host",
        "ipv6_dst_mode": "Increment Host",
        "icmp_type": 128,
        "icmp_code": 0,
        "icmp_identifier": 0x1234,
        "icmp_sequence": 7,
        "payload_pattern": "A1B2",
    }
    saved = service.save_workbench_profile("icmpv6-echo.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    ip_offset = 14
    icmp_offset = 54
    payload_length = int.from_bytes(packet[ip_offset + 4 : ip_offset + 6], "big")
    assert packet[12:14].hex() == "86dd"
    assert packet[ip_offset] >> 4 == 6
    assert packet[ip_offset + 6] == 58
    assert packet[ip_offset + 8 : ip_offset + 24] == ipaddress.IPv6Address("2001:db8::1").packed
    assert packet[ip_offset + 24 : ip_offset + 40] == ipaddress.IPv6Address("2001:db8::2").packed
    assert packet[icmp_offset] == 128
    assert packet[icmp_offset + 1] == 0
    assert int.from_bytes(packet[icmp_offset + 4 : icmp_offset + 6], "big") == 0x1234
    assert int.from_bytes(packet[icmp_offset + 6 : icmp_offset + 8], "big") == 7
    assert packet[icmp_offset + 8 : icmp_offset + 12].hex() == "a1b2a1b2"
    pseudo_header = (
        packet[ip_offset + 8 : ip_offset + 24]
        + packet[ip_offset + 24 : ip_offset + 40]
        + struct.pack("!I3xB", payload_length, 58)
    )
    assert internet_checksum(pseudo_header + packet[icmp_offset : icmp_offset + payload_length]) == 0

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_ipv6_selected"] is True
    assert packet_meta["protocol_selection"]["is_icmp_selected"] is True
    assert packet_meta["protocol_selection"]["is_icmpv6_selected"] is True
    assert packet_meta["l4"]["icmp_type"] == "128"
    assert packet_meta["l4"]["icmp_code"] == "0"
    assert packet_meta["l4"]["icmp_identifier"] == "4660"
    assert packet_meta["l4"]["icmp_sequence"] == "7"
    assert packet_meta["l4"]["icmp_is_override_checksum"] is False
    preview_layers = saved.data["packet_previews"][0]["layers"]
    assert preview_layers[1]["name"] == "Internet Protocol v6"
    assert preview_layers[1]["fields"]["protocol"] == "ICMPv6"
    assert preview_layers[2]["name"] == "ICMPv6"
    assert preview_layers[2]["fields"]["type"] == 128
    assert preview_layers[2]["fields"]["identifier"] == 0x1234
    assert preview_layers[2]["fields"]["sequence"] == 7
    assert preview_layers[2]["fields"]["checksum"] == "auto"

    loaded = service.load_workbench_profile("icmpv6-echo.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert loaded_stream["frame_length_type"] == "Fixed"
    assert loaded_stream["ipv6_src_mode"] == "Fixed"
    assert loaded_stream["ipv6_dst_mode"] == "Fixed"
    assert loaded_stream["icmp_type"] == 128
    assert loaded_stream["icmp_code"] == 0
    assert loaded_stream["icmp_identifier"] == 0x1234
    assert loaded_stream["icmp_sequence"] == 7
    assert loaded_stream["icmp_checksum_override"] is False

    exported_pcap = service.export_workbench_stream_pcap(stream, "icmpv6-echo.pcap")
    imported = service.import_workbench_pcap("icmpv6-echo.pcap", exported_pcap.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert imported_stream["icmp_type"] == 128
    assert imported_stream["icmp_code"] == 0
    assert imported_stream["icmp_identifier"] == 0x1234
    assert imported_stream["icmp_sequence"] == 7
    assert imported_stream["icmp_checksum_override"] is True


def test_workbench_profile_renders_icmpv6_echo_identifier_sequence_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "icmpv6-echo-fe",
        "packet_type": "Ethernet/IPv6/ICMPv6",
        "frame_length": 96,
        "ipv6_src": "2001:db8::1",
        "ipv6_dst": "2001:db8::2",
        "icmp_type": 128,
        "icmp_identifier": 0x1234,
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

    saved = service.save_workbench_profile("icmpv6-echo-fe.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    assert preview["layers"][2]["fields"]["identifier_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["identifier_count"] == 4
    assert preview["layers"][2]["fields"]["sequence_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["sequence_count"] == 4
    assert preview["layers"][2]["fields"]["checksum"] == "auto"

    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "icmp_sequence"
    assert {
        "init_value": 0x1234,
        "max_value": 0x1237,
        "min_value": 0x1234,
        "name": "icmp_identifier",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "icmp_identifier",
        "pkt_offset": 58,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 7,
        "max_value": 10,
        "min_value": 7,
        "name": "icmp_sequence",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "icmp_sequence",
        "pkt_offset": 60,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 14, "l3_len": 40, "type": "fix_checksum_icmpv6"}

    loaded = service.load_workbench_profile("icmpv6-echo-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["icmp_checksum_override"] is False
    assert loaded_stream["icmp_identifier_mode"] == "Increment"
    assert loaded_stream["icmp_identifier_count"] == 4
    assert loaded_stream["icmp_identifier_step"] == 1
    assert loaded_stream["icmp_sequence_mode"] == "Increment"
    assert loaded_stream["icmp_sequence_count"] == 4
    assert loaded_stream["icmp_sequence_step"] == 1


def test_workbench_profile_renders_icmpv6_echo_type_code_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "icmpv6-type-code-fe",
        "packet_type": "Ethernet/IPv6/ICMPv6",
        "frame_length": 96,
        "ipv6_src": "2001:db8::1",
        "ipv6_dst": "2001:db8::2",
        "icmp_type": 128,
        "icmp_type_mode": "Increment",
        "icmp_type_count": 2,
        "icmp_type_step": 1,
        "icmp_code": 0,
        "icmp_code_mode": "Increment",
        "icmp_code_count": 4,
        "icmp_code_step": 1,
        "icmp_checksum_override": True,
        "icmp_checksum": "BEEF",
    }

    saved = service.save_workbench_profile("icmpv6-type-code-fe.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    assert preview["layers"][2]["fields"]["type_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["type_count"] == 2
    assert preview["layers"][2]["fields"]["code_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["code_count"] == 4
    assert preview["layers"][2]["fields"]["checksum"] == "auto"

    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "icmp_code"
    assert {
        "init_value": 128,
        "max_value": 129,
        "min_value": 128,
        "name": "icmp_type",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "icmp_type",
        "pkt_offset": 54,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 0,
        "max_value": 3,
        "min_value": 0,
        "name": "icmp_code",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "icmp_code",
        "pkt_offset": 55,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 14, "l3_len": 40, "type": "fix_checksum_icmpv6"}

    loaded = service.load_workbench_profile("icmpv6-type-code-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["icmp_checksum_override"] is False
    assert loaded_stream["icmp_type_mode"] == "Increment"
    assert loaded_stream["icmp_type_count"] == 2
    assert loaded_stream["icmp_type_step"] == 1
    assert loaded_stream["icmp_code_mode"] == "Increment"
    assert loaded_stream["icmp_code_count"] == 4
    assert loaded_stream["icmp_code_step"] == 1


def test_workbench_profile_renders_ipv6_icmpv6_neighbor_discovery(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    streams = [
        {
            "name": "icmpv6-ns",
            "packet_type": "Ethernet/IPv6/ICMPv6",
            "frame_length": 64,
            "ipv6_src": "2001:db8::1",
            "ipv6_dst": "ff02::1:ff00:2",
            "ipv6_hop_limit": 255,
            "icmp_type": 135,
            "icmp_code": 99,
            "icmpv6_nd_target": "2001:db8::2",
            "icmpv6_nd_option_mac": "00:11:22:33:44:55",
            "payload_enabled": False,
        },
        {
            "name": "icmpv6-na",
            "packet_type": "Ethernet/IPv6/ICMPv6",
            "frame_length": 90,
            "ipv6_src": "2001:db8::2",
            "ipv6_dst": "2001:db8::1",
            "ipv6_hop_limit": 255,
            "icmp_type": 136,
            "icmp_code": 0,
            "icmpv6_nd_target": "2001:db8::2",
            "icmpv6_nd_option_mac": "66:55:44:33:22:11",
            "icmpv6_nd_na_router": True,
            "icmpv6_nd_na_solicited": True,
            "icmpv6_nd_na_override": False,
            "payload_enabled": False,
        },
    ]
    saved = service.save_workbench_profile("icmpv6-nd.yaml", streams)

    assert saved.ok is True
    entries = yaml.safe_load(saved.data["content"])
    ns_packet = base64.b64decode(entries[0]["stream"]["packet"]["binary"])
    na_packet = base64.b64decode(entries[1]["stream"]["packet"]["binary"])
    ip_offset = 14
    icmp_offset = 54
    ns_payload_length = int.from_bytes(ns_packet[ip_offset + 4 : ip_offset + 6], "big")
    ns_pseudo_header = (
        ns_packet[ip_offset + 8 : ip_offset + 24]
        + ns_packet[ip_offset + 24 : ip_offset + 40]
        + struct.pack("!I3xB", ns_payload_length, 58)
    )

    assert len(ns_packet) == 86
    assert ns_packet[ip_offset + 6] == 58
    assert ns_packet[ip_offset + 7] == 255
    assert ns_packet[icmp_offset] == 135
    assert ns_packet[icmp_offset + 1] == 0
    assert ns_packet[icmp_offset + 4 : icmp_offset + 8] == b"\x00\x00\x00\x00"
    assert ns_packet[icmp_offset + 8 : icmp_offset + 24] == ipaddress.IPv6Address("2001:db8::2").packed
    assert ns_packet[icmp_offset + 24 : icmp_offset + 32] == bytes.fromhex("0101001122334455")
    assert internet_checksum(ns_pseudo_header + ns_packet[icmp_offset : icmp_offset + ns_payload_length]) == 0

    na_payload_length = int.from_bytes(na_packet[ip_offset + 4 : ip_offset + 6], "big")
    na_pseudo_header = (
        na_packet[ip_offset + 8 : ip_offset + 24]
        + na_packet[ip_offset + 24 : ip_offset + 40]
        + struct.pack("!I3xB", na_payload_length, 58)
    )
    assert len(na_packet) == 86
    assert na_packet[icmp_offset] == 136
    assert na_packet[icmp_offset + 4] == 0xC0
    assert na_packet[icmp_offset + 8 : icmp_offset + 24] == ipaddress.IPv6Address("2001:db8::2").packed
    assert na_packet[icmp_offset + 24 : icmp_offset + 32] == bytes.fromhex("0201665544332211")
    assert internet_checksum(na_pseudo_header + na_packet[icmp_offset : icmp_offset + na_payload_length]) == 0

    packet_meta = yaml.safe_load(base64.b64decode(entries[0]["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["icmp_type"] == "135"
    assert packet_meta["l4"]["icmp_code"] == "0"
    assert packet_meta["l4"]["icmpv6_nd_target"] == "2001:db8::2"
    assert packet_meta["l4"]["icmpv6_nd_include_option"] is True
    assert packet_meta["l4"]["icmpv6_nd_option_mac"] == "00:11:22:33:44:55"
    preview_layers = saved.data["packet_previews"]
    assert preview_layers[0]["frame_length"] == 90
    assert preview_layers[0]["layers"][2]["fields"]["message"] == "Neighbor Solicitation"
    assert preview_layers[0]["layers"][2]["fields"]["target"] == "2001:db8::2"
    assert preview_layers[0]["layers"][2]["fields"]["option_type"] == "source link-layer address"
    assert preview_layers[0]["layers"][3]["fields"]["bytes"] == 0
    assert preview_layers[1]["layers"][2]["fields"]["message"] == "Neighbor Advertisement"
    assert preview_layers[1]["layers"][2]["fields"]["router"] is True
    assert preview_layers[1]["layers"][2]["fields"]["solicited"] is True
    assert preview_layers[1]["layers"][2]["fields"]["override"] is False

    loaded = service.load_workbench_profile("icmpv6-nd.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert loaded_stream["frame_length"] == 90
    assert loaded_stream["icmp_type"] == 135
    assert loaded_stream["icmp_code"] == 0
    assert loaded_stream["icmpv6_nd_target"] == "2001:db8::2"
    assert loaded_stream["icmpv6_nd_include_option"] is True
    assert loaded_stream["icmpv6_nd_option_mac"] == "00:11:22:33:44:55"

    exported_pcap = service.export_workbench_stream_pcap(streams[0], "icmpv6-ns.pcap")
    imported = service.import_workbench_pcap("icmpv6-ns.pcap", exported_pcap.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert imported_stream["frame_length"] == 90
    assert imported_stream["icmp_type"] == 135
    assert imported_stream["icmp_code"] == 0
    assert imported_stream["icmpv6_nd_target"] == "2001:db8::2"
    assert imported_stream["icmpv6_nd_include_option"] is True
    assert imported_stream["icmpv6_nd_option_mac"] == "00:11:22:33:44:55"


def test_workbench_profile_renders_ipv6_icmpv6_router_discovery(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    streams = [
        {
            "name": "icmpv6-rs",
            "packet_type": "Ethernet/IPv6/ICMPv6",
            "frame_length": 64,
            "ipv6_src": "fe80::1",
            "ipv6_dst": "ff02::2",
            "icmp_type": 133,
            "icmp_code": 7,
            "icmpv6_rs_slla_mac": "00:11:22:33:44:55",
            "payload_enabled": False,
        },
        {
            "name": "icmpv6-ra",
            "packet_type": "Ethernet/IPv6/ICMPv6",
            "frame_length": 64,
            "ipv6_src": "fe80::1",
            "ipv6_dst": "ff02::1",
            "icmp_type": 134,
            "icmp_code": 9,
            "icmpv6_ra_cur_hop_limit": 42,
            "icmpv6_ra_managed": True,
            "icmpv6_ra_other": True,
            "icmpv6_ra_router_lifetime": 900,
            "icmpv6_ra_reachable_time": 1234,
            "icmpv6_ra_retrans_timer": 5678,
            "icmpv6_ra_slla_mac": "66:55:44:33:22:11",
            "icmpv6_ra_prefix": "2001:db8:100::",
            "icmpv6_ra_prefix_length": 64,
            "icmpv6_ra_prefix_on_link": True,
            "icmpv6_ra_prefix_autonomous": False,
            "icmpv6_ra_prefix_valid_lifetime": 3600,
            "icmpv6_ra_prefix_preferred_lifetime": 1800,
            "payload_enabled": False,
        },
    ]
    saved = service.save_workbench_profile("icmpv6-router.yaml", streams)

    assert saved.ok is True
    entries = yaml.safe_load(saved.data["content"])
    rs_packet = base64.b64decode(entries[0]["stream"]["packet"]["binary"])
    ra_packet = base64.b64decode(entries[1]["stream"]["packet"]["binary"])
    ip_offset = 14
    icmp_offset = 54

    rs_payload_length = int.from_bytes(rs_packet[ip_offset + 4 : ip_offset + 6], "big")
    rs_pseudo_header = (
        rs_packet[ip_offset + 8 : ip_offset + 24]
        + rs_packet[ip_offset + 24 : ip_offset + 40]
        + struct.pack("!I3xB", rs_payload_length, 58)
    )
    assert len(rs_packet) == 70
    assert rs_packet[ip_offset + 6] == 58
    assert rs_packet[ip_offset + 7] == 255
    assert rs_packet[icmp_offset] == 133
    assert rs_packet[icmp_offset + 1] == 0
    assert rs_packet[icmp_offset + 4 : icmp_offset + 8] == b"\x00\x00\x00\x00"
    assert rs_packet[icmp_offset + 8 : icmp_offset + 16] == bytes.fromhex("0101001122334455")
    assert internet_checksum(rs_pseudo_header + rs_packet[icmp_offset : icmp_offset + rs_payload_length]) == 0

    ra_payload_length = int.from_bytes(ra_packet[ip_offset + 4 : ip_offset + 6], "big")
    ra_pseudo_header = (
        ra_packet[ip_offset + 8 : ip_offset + 24]
        + ra_packet[ip_offset + 24 : ip_offset + 40]
        + struct.pack("!I3xB", ra_payload_length, 58)
    )
    assert len(ra_packet) == 110
    assert ra_packet[ip_offset + 7] == 255
    assert ra_packet[icmp_offset] == 134
    assert ra_packet[icmp_offset + 1] == 0
    assert ra_packet[icmp_offset + 4] == 42
    assert ra_packet[icmp_offset + 5] == 0xC0
    assert int.from_bytes(ra_packet[icmp_offset + 6 : icmp_offset + 8], "big") == 900
    assert int.from_bytes(ra_packet[icmp_offset + 8 : icmp_offset + 12], "big") == 1234
    assert int.from_bytes(ra_packet[icmp_offset + 12 : icmp_offset + 16], "big") == 5678
    assert ra_packet[icmp_offset + 16 : icmp_offset + 24] == bytes.fromhex("0101665544332211")
    prefix_option = ra_packet[icmp_offset + 24 : icmp_offset + 56]
    assert prefix_option[:4] == bytes([3, 4, 64, 0x80])
    assert int.from_bytes(prefix_option[4:8], "big") == 3600
    assert int.from_bytes(prefix_option[8:12], "big") == 1800
    assert prefix_option[12:16] == b"\x00\x00\x00\x00"
    assert prefix_option[16:32] == ipaddress.IPv6Address("2001:db8:100::").packed
    assert internet_checksum(ra_pseudo_header + ra_packet[icmp_offset : icmp_offset + ra_payload_length]) == 0

    packet_meta = yaml.safe_load(base64.b64decode(entries[1]["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["icmp_type"] == "134"
    assert packet_meta["l4"]["icmp_code"] == "0"
    assert packet_meta["l4"]["icmpv6_ra_cur_hop_limit"] == "42"
    assert packet_meta["l4"]["icmpv6_ra_managed"] is True
    assert packet_meta["l4"]["icmpv6_ra_other"] is True
    assert packet_meta["l4"]["icmpv6_ra_prefix"] == "2001:db8:100::"

    preview_layers = saved.data["packet_previews"]
    assert preview_layers[0]["frame_length"] == 74
    assert preview_layers[0]["layers"][2]["fields"]["message"] == "Router Solicitation"
    assert preview_layers[0]["layers"][2]["fields"]["source_link_layer_mac"] == "00:11:22:33:44:55"
    assert preview_layers[1]["frame_length"] == 114
    assert preview_layers[1]["layers"][2]["fields"]["message"] == "Router Advertisement"
    assert preview_layers[1]["layers"][2]["fields"]["current_hop_limit"] == 42
    assert preview_layers[1]["layers"][2]["fields"]["prefix"] == "2001:db8:100::"

    loaded = service.load_workbench_profile("icmpv6-router.yaml")

    assert loaded.ok is True
    loaded_ra = loaded.data["streams"][1]
    assert loaded_ra["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert loaded_ra["frame_length"] == 114
    assert loaded_ra["ipv6_hop_limit"] == 255
    assert loaded_ra["icmp_type"] == 134
    assert loaded_ra["icmp_code"] == 0
    assert loaded_ra["icmpv6_ra_cur_hop_limit"] == 42
    assert loaded_ra["icmpv6_ra_managed"] is True
    assert loaded_ra["icmpv6_ra_other"] is True
    assert loaded_ra["icmpv6_ra_slla_mac"] == "66:55:44:33:22:11"
    assert loaded_ra["icmpv6_ra_prefix"] == "2001:db8:100::"
    assert loaded_ra["icmpv6_ra_prefix_autonomous"] is False

    exported_pcap = service.export_workbench_stream_pcap(streams[1], "icmpv6-ra.pcap")
    imported = service.import_workbench_pcap("icmpv6-ra.pcap", exported_pcap.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv6/ICMPv6"
    assert imported_stream["frame_length"] == 114
    assert imported_stream["ipv6_hop_limit"] == 255
    assert imported_stream["icmp_type"] == 134
    assert imported_stream["icmp_code"] == 0
    assert imported_stream["icmpv6_ra_cur_hop_limit"] == 42
    assert imported_stream["icmpv6_ra_router_lifetime"] == 900
    assert imported_stream["icmpv6_ra_reachable_time"] == 1234
    assert imported_stream["icmpv6_ra_retrans_timer"] == 5678
    assert imported_stream["icmpv6_ra_include_slla"] is True
    assert imported_stream["icmpv6_ra_slla_mac"] == "66:55:44:33:22:11"
    assert imported_stream["icmpv6_ra_include_prefix"] is True
    assert imported_stream["icmpv6_ra_prefix"] == "2001:db8:100::"
    assert imported_stream["icmpv6_ra_prefix_length"] == 64


def test_workbench_profile_renders_ipv6_field_engine_vm(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "ipv6-field-engine.yaml",
        [
            {
                "name": "ipv6-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "ipv6_dst": "2001:db8::12f8",
                "ipv6_dst_mode": "Increment Host",
                "ipv6_dst_count": 16,
                "ipv6_dst_step": 2,
                "ipv6_src": "2001:db8::1",
                "ipv6_src_mode": "Random Host",
                "ipv6_src_count": 4,
                "ipv6_src_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ipv6_dest"
    assert vm["instructions"] == [
        {
            "init_value": 4856,
            "max_value": 4871,
            "min_value": 4856,
            "name": "ipv6_dest",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ipv6_dest",
            "pkt_offset": 52,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "ipv6_src",
            "op": "random",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ipv6_src",
            "pkt_offset": 37,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 40, "l4_type": 11, "type": "fix_checksum_hw"},
    ]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv6"]["dst_mode"] == "Increment Host"
    assert packet_meta["ipv6"]["dst_count"] == "16"
    assert packet_meta["ipv6"]["dst_step"] == "2"
    assert packet_meta["ipv6"]["src_mode"] == "Random Host"
    assert packet_meta["ipv6"]["src_count"] == "4"
    assert packet_meta["ipv6"]["src_step"] == "1"

    loaded = service.load_workbench_profile("ipv6-field-engine.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv6_dst_mode"] == "Increment Host"
    assert loaded_stream["ipv6_dst_count"] == 16
    assert loaded_stream["ipv6_dst_step"] == 2
    assert loaded_stream["ipv6_src_mode"] == "Random Host"
    assert loaded_stream["ipv6_src_count"] == 4
    assert loaded_stream["ipv6_src_step"] == 1


def test_workbench_profile_renders_ipv6_flow_label_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "ipv6-flow-label-fe.yaml",
        [
            {
                "name": "ipv6-flow-label-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "ipv6_flow_label": 100,
                "ipv6_flow_label_mode": "Increment",
                "ipv6_flow_label_count": 4,
                "ipv6_flow_label_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ipv6_flow_label"
    assert vm["instructions"] == [
        {
            "init_value": 100,
            "max_value": 103,
            "min_value": 100,
            "name": "ipv6_flow_label",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x000FFFFF,
            "name": "ipv6_flow_label",
            "pkt_cast_size": 4,
            "pkt_offset": 14,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[14:18], "big") & 0x000FFFFF == 100
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv6"]["flow_label"] == "100"
    assert packet_meta["ipv6"]["flow_label_mode"] == "Increment"
    assert packet_meta["ipv6"]["flow_label_count"] == "4"
    assert packet_meta["ipv6"]["flow_label_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["flow_label"] == 100
    assert preview_fields["flow_label_mode"] == "Increment"
    assert preview_fields["flow_label_count"] == 4
    assert preview_fields["flow_label_step"] == 1

    loaded = service.load_workbench_profile("ipv6-flow-label-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv6_flow_label"] == 100
    assert loaded_stream["ipv6_flow_label_mode"] == "Increment"
    assert loaded_stream["ipv6_flow_label_count"] == 4
    assert loaded_stream["ipv6_flow_label_step"] == 1


def test_workbench_profile_renders_ipv6_traffic_class_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "ipv6-traffic-class-fe.yaml",
        [
            {
                "name": "ipv6-traffic-class-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "ipv6_traffic_class": 10,
                "ipv6_traffic_class_mode": "Increment",
                "ipv6_traffic_class_count": 4,
                "ipv6_traffic_class_step": 1,
                "ipv6_flow_label": 100,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ipv6_traffic_class"
    assert vm["instructions"] == [
        {
            "init_value": 10,
            "max_value": 13,
            "min_value": 10,
            "name": "ipv6_traffic_class",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x0FF00000,
            "name": "ipv6_traffic_class",
            "pkt_cast_size": 4,
            "pkt_offset": 14,
            "shift": 20,
            "type": "write_mask_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    word = int.from_bytes(packet[14:18], "big")
    assert (word >> 28) == 6
    assert ((word >> 20) & 0xFF) == 10
    assert (word & 0x000FFFFF) == 100
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv6"]["traffic_class"] == "10"
    assert packet_meta["ipv6"]["traffic_class_mode"] == "Increment"
    assert packet_meta["ipv6"]["traffic_class_count"] == "4"
    assert packet_meta["ipv6"]["traffic_class_step"] == "1"
    assert packet_meta["ipv6"]["flow_label"] == "100"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["traffic_class"] == 10
    assert preview_fields["traffic_class_mode"] == "Increment"
    assert preview_fields["traffic_class_count"] == 4
    assert preview_fields["traffic_class_step"] == 1
    assert preview_fields["flow_label"] == 100

    loaded = service.load_workbench_profile("ipv6-traffic-class-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv6_traffic_class"] == 10
    assert loaded_stream["ipv6_traffic_class_mode"] == "Increment"
    assert loaded_stream["ipv6_traffic_class_count"] == 4
    assert loaded_stream["ipv6_traffic_class_step"] == 1
    assert loaded_stream["ipv6_flow_label"] == 100


def test_workbench_profile_renders_ipv6_hop_limit_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "ipv6-hop-limit-fe.yaml",
        [
            {
                "name": "ipv6-hop-limit-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "ipv6_traffic_class": 10,
                "ipv6_flow_label": 100,
                "ipv6_hop_limit": 40,
                "ipv6_hop_limit_mode": "Increment",
                "ipv6_hop_limit_count": 4,
                "ipv6_hop_limit_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "ipv6_hop_limit"
    assert vm["instructions"] == [
        {
            "init_value": 40,
            "max_value": 43,
            "min_value": 40,
            "name": "ipv6_hop_limit",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ipv6_hop_limit",
            "pkt_offset": 21,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    word = int.from_bytes(packet[14:18], "big")
    assert (word >> 28) == 6
    assert ((word >> 20) & 0xFF) == 10
    assert (word & 0x000FFFFF) == 100
    assert packet[21] == 40
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv6"]["hop_limit"] == "40"
    assert packet_meta["ipv6"]["hop_limit_mode"] == "Increment"
    assert packet_meta["ipv6"]["hop_limit_count"] == "4"
    assert packet_meta["ipv6"]["hop_limit_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["traffic_class"] == 10
    assert preview_fields["flow_label"] == 100
    assert preview_fields["hop_limit"] == 40
    assert preview_fields["hop_limit_mode"] == "Increment"
    assert preview_fields["hop_limit_count"] == 4
    assert preview_fields["hop_limit_step"] == 1

    loaded = service.load_workbench_profile("ipv6-hop-limit-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ipv6_hop_limit"] == 40
    assert loaded_stream["ipv6_hop_limit_mode"] == "Increment"
    assert loaded_stream["ipv6_hop_limit_count"] == 4
    assert loaded_stream["ipv6_hop_limit_step"] == 1
    assert loaded_stream["ipv6_traffic_class"] == 10
    assert loaded_stream["ipv6_flow_label"] == 100


def test_workbench_profile_renders_mac_field_engine_vm(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)

    saved = service.save_workbench_profile(
        "mac-field-engine.yaml",
        [
            {
                "name": "mac-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "ether_dst": "00:00:00:00:00:f0",
                "ether_dst_mode": "Increment",
                "ether_dst_count": 16,
                "ether_dst_step": 2,
                "ether_src": "00:11:22:33:44:01",
                "ether_src_mode": "Decrement",
                "ether_src_count": 4,
                "ether_src_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "mac_src"
    assert vm["instructions"] == [
        {
            "init_value": 240,
            "max_value": 255,
            "min_value": 240,
            "name": "mac_dest",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "mac_dest",
            "pkt_offset": 4,
            "type": "write_flow_var",
        },
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "mac_src",
            "op": "dec",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "mac_src",
            "pkt_offset": 11,
            "type": "write_flow_var",
        },
    ]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["mac"]["destination"]["mode"] == "Increment"
    assert packet_meta["mac"]["destination"]["count"] == "16"
    assert packet_meta["mac"]["destination"]["step"] == "2"
    assert packet_meta["mac"]["source"]["mode"] == "Decrement"
    assert packet_meta["mac"]["source"]["count"] == "4"
    assert packet_meta["mac"]["source"]["step"] == "1"

    loaded = service.load_workbench_profile("mac-field-engine.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["ether_dst_mode"] == "Increment"
    assert loaded_stream["ether_dst_count"] == 16
    assert loaded_stream["ether_dst_step"] == 2
    assert loaded_stream["ether_src_mode"] == "Decrement"
    assert loaded_stream["ether_src_count"] == 4
    assert loaded_stream["ether_src_step"] == 1


def test_workbench_profile_round_trips_next_stream(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    streams = [
        {
            "name": "first-stream",
            "mode": "burst",
            "next_stream_id": 2,
            "action_count": 3,
        },
        {
            "name": "second-stream",
        },
    ]

    saved = service.save_workbench_profile("next-stream.yaml", streams)

    assert saved.ok is True
    assert saved.data["streams"][0]["next_stream"] == "second-stream"
    assert "next: second-stream" in saved.data["content"]
    assert "action_count: 3" in saved.data["content"]
    assert "next: '-1'" not in saved.data["content"]

    loaded = service.load_workbench_profile("next-stream.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["next_stream_id"] == 2
    assert loaded.data["streams"][0]["action_count"] == 3
    assert loaded.data["stream_summaries"][0]["next_stream"] == "second-stream"
    assert loaded.data["streams"][1]["next_stream_id"] is None
    assert loaded.data["streams"][1]["action_count"] == 0


def test_workbench_render_packet_preview_uses_tcp_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "tcp-preview",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port_override": True,
        "l4_src_port": 12345,
        "l4_dst_port_override": True,
        "l4_dst_port": 443,
        "tcp_sequence_number": 129018,
        "tcp_ack_number": 42,
        "tcp_window": 2048,
        "tcp_checksum_override": True,
        "tcp_checksum": "B3E3",
        "tcp_checksum_mode": "Increment",
        "tcp_checksum_count": 4,
        "tcp_checksum_step": 1,
        "tcp_urgent_pointer": 7,
        "tcp_flag_ack": True,
        "tcp_flag_syn": True,
        "payload_pattern": "a1 b2",
    }
    result = service.render_workbench_profile([stream])

    assert result.ok is True
    preview = result.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["name"] == "tcp-preview"
    assert preview["wire_length"] == 96
    assert preview["layers"][1]["fields"]["protocol"] == "TCP"
    assert preview["layers"][2]["name"] == "TCP"
    assert preview["layers"][2]["fields"]["source_port"] == 12345
    assert preview["layers"][2]["fields"]["destination_port"] == 443
    assert preview["layers"][2]["fields"]["sequence_number"] == 129018
    assert preview["layers"][2]["fields"]["acknowledge_number"] == 42
    assert preview["layers"][2]["fields"]["window"] == 2048
    assert preview["layers"][2]["fields"]["checksum"] == "B3E3"
    assert preview["layers"][2]["fields"]["checksum_override"] is True
    assert preview["layers"][2]["fields"]["checksum_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["checksum_count"] == 4
    assert preview["layers"][2]["fields"]["checksum_step"] == 1
    assert preview["layers"][2]["fields"]["urgent_pointer"] == 7
    assert preview["layers"][2]["fields"]["flags"] == "ACK,SYN"
    assert preview["layers"][3]["fields"]["pattern"] == "A1B2"
    assert preview["hex"].startswith("6655443322111020304050600800")
    assert int.from_bytes(packet[38:42], "big") == 129018
    assert int.from_bytes(packet[42:46], "big") == 42
    assert int.from_bytes(packet[46:48], "big") == 0x5012
    assert int.from_bytes(packet[48:50], "big") == 2048
    assert int.from_bytes(packet[50:52], "big") == 0xB3E3
    assert int.from_bytes(packet[52:54], "big") == 7
    assert preview["hex"].endswith("a1b2")

    saved = service.save_workbench_profile("tcp-fields.yaml", [stream])
    loaded = service.load_workbench_profile("tcp-fields.yaml")

    assert saved.ok is True
    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["l4_src_port_override"] is True
    assert loaded_stream["l4_dst_port_override"] is True
    assert loaded_stream["tcp_sequence_number"] == 129018
    assert loaded_stream["tcp_ack_number"] == 42
    assert loaded_stream["tcp_window"] == 2048
    assert loaded_stream["tcp_checksum_override"] is True
    assert loaded_stream["tcp_checksum"] == "B3E3"
    assert loaded_stream["tcp_checksum_mode"] == "Increment"
    assert loaded_stream["tcp_checksum_count"] == 4
    assert loaded_stream["tcp_checksum_step"] == 1
    assert loaded_stream["tcp_urgent_pointer"] == 7
    assert loaded_stream["tcp_flag_ack"] is True
    assert loaded_stream["tcp_flag_syn"] is True


def test_workbench_render_packet_preview_auto_fills_ipv4_tcp_checksum(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "tcp-auto-checksum",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "l4_src_port_override": True,
        "l4_src_port": 1025,
        "l4_dst_port_override": True,
        "l4_dst_port": 80,
        "tcp_checksum_override": False,
        "payload_pattern": "aa bb cc dd",
    }

    result = service.render_workbench_profile([stream])

    assert result.ok is True
    preview = result.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["layers"][2]["fields"]["checksum"] == "auto"
    assert int.from_bytes(packet[50:52], "big") != 0
    assert_ipv4_l4_checksums_valid(packet)


def test_workbench_render_packet_preview_uses_ipv4_checksum_override(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "ipv4-checksum",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "ipv4_checksum_override": True,
        "ipv4_checksum": "1A2B",
        "payload_pattern": "aa bb",
    }

    saved = service.save_workbench_profile("ipv4-checksum.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["layers"][1]["fields"]["checksum"] == "1A2B"
    assert preview["layers"][1]["fields"]["checksum_override"] is True
    assert int.from_bytes(packet[24:26], "big") == 0x1A2B
    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["ipv4"]["is_override_checksum"] is True
    assert packet_meta["ipv4"]["checksum"] == "1A2B"

    loaded = service.load_workbench_profile("ipv4-checksum.yaml")
    exported = service.export_workbench_stream_pcap(stream)

    assert loaded.ok is True
    assert exported.ok is True
    imported = service.import_workbench_pcap("ipv4-checksum.pcap", exported.data["content_base64"])
    assert loaded.data["streams"][0]["ipv4_checksum_override"] is True
    assert loaded.data["streams"][0]["ipv4_checksum"] == "1A2B"
    assert imported.ok is True
    assert imported.data["streams"][0]["ipv4_checksum_override"] is True
    assert imported.data["streams"][0]["ipv4_checksum"] == "1A2B"


def test_workbench_profile_renders_tcp_sequence_ack_field_engine(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "tcp-seq-ack-fe",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 128,
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "l4_src_port_override": True,
        "l4_src_port": 1025,
        "l4_dst_port_override": True,
        "l4_dst_port": 80,
        "tcp_sequence_number": 1000,
        "tcp_sequence_mode": "Increment",
        "tcp_sequence_count": 4,
        "tcp_sequence_step": 1,
        "tcp_ack_number": 2000,
        "tcp_ack_mode": "Increment",
        "tcp_ack_count": 4,
        "tcp_ack_step": 1,
        "tcp_flag_ack": True,
    }

    saved = service.save_workbench_profile("tcp-seq-ack-fe.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "tcp_sequence"
    assert vm["instructions"] == [
        {
            "init_value": 2000,
            "max_value": 2003,
            "min_value": 2000,
            "name": "tcp_ack",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_ack",
            "pkt_offset": 42,
            "type": "write_flow_var",
        },
        {
            "init_value": 1000,
            "max_value": 1003,
            "min_value": 1000,
            "name": "tcp_sequence",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_sequence",
            "pkt_offset": 38,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 13, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[38:42], "big") == 1000
    assert int.from_bytes(packet[42:46], "big") == 2000
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["sequence_mode"] == "Increment"
    assert packet_meta["l4"]["sequence_count"] == "4"
    assert packet_meta["l4"]["sequence_step"] == "1"
    assert packet_meta["l4"]["ack_mode"] == "Increment"
    assert packet_meta["l4"]["ack_count"] == "4"
    assert packet_meta["l4"]["ack_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["sequence_mode"] == "Increment"
    assert preview_fields["sequence_count"] == 4
    assert preview_fields["acknowledge_mode"] == "Increment"
    assert preview_fields["acknowledge_count"] == 4

    loaded = service.load_workbench_profile("tcp-seq-ack-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["tcp_sequence_mode"] == "Increment"
    assert loaded_stream["tcp_sequence_count"] == 4
    assert loaded_stream["tcp_sequence_step"] == 1
    assert loaded_stream["tcp_ack_mode"] == "Increment"
    assert loaded_stream["tcp_ack_count"] == 4
    assert loaded_stream["tcp_ack_step"] == 1


def test_workbench_profile_renders_tcp_window_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "tcp-window-fe",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 128,
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "l4_src_port_override": True,
        "l4_src_port": 1025,
        "l4_dst_port_override": True,
        "l4_dst_port": 80,
        "tcp_window": 1024,
        "tcp_window_mode": "Increment",
        "tcp_window_count": 4,
        "tcp_window_step": 1,
        "tcp_flag_ack": True,
    }

    saved = service.save_workbench_profile("tcp-window-fe.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "tcp_window"
    assert vm["instructions"] == [
        {
            "init_value": 1024,
            "max_value": 1027,
            "min_value": 1024,
            "name": "tcp_window",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_window",
            "pkt_offset": 48,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 13, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[48:50], "big") == 1024
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["window"] == "1024"
    assert packet_meta["l4"]["window_mode"] == "Increment"
    assert packet_meta["l4"]["window_count"] == "4"
    assert packet_meta["l4"]["window_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["window"] == 1024
    assert preview_fields["window_mode"] == "Increment"
    assert preview_fields["window_count"] == 4
    assert preview_fields["window_step"] == 1

    loaded = service.load_workbench_profile("tcp-window-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["tcp_window"] == 1024
    assert loaded_stream["tcp_window_mode"] == "Increment"
    assert loaded_stream["tcp_window_count"] == 4
    assert loaded_stream["tcp_window_step"] == 1


def test_workbench_profile_renders_tcp_urgent_pointer_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "tcp-urgent-fe",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 128,
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "l4_src_port_override": True,
        "l4_src_port": 1025,
        "l4_dst_port_override": True,
        "l4_dst_port": 80,
        "tcp_urgent_pointer": 20,
        "tcp_urgent_pointer_mode": "Increment",
        "tcp_urgent_pointer_count": 4,
        "tcp_urgent_pointer_step": 1,
        "tcp_flag_urg": True,
        "tcp_flag_ack": True,
    }

    saved = service.save_workbench_profile("tcp-urgent-fe.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "tcp_urgent_pointer"
    assert vm["instructions"] == [
        {
            "init_value": 20,
            "max_value": 23,
            "min_value": 20,
            "name": "tcp_urgent_pointer",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "tcp_urgent_pointer",
            "pkt_offset": 52,
            "type": "write_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 13, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[46:48], "big") == 0x5030
    assert int.from_bytes(packet[52:54], "big") == 20
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["urgent_pointer"] == "20"
    assert packet_meta["l4"]["urgent_pointer_mode"] == "Increment"
    assert packet_meta["l4"]["urgent_pointer_count"] == "4"
    assert packet_meta["l4"]["urgent_pointer_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["urgent_pointer"] == 20
    assert preview_fields["urgent_pointer_mode"] == "Increment"
    assert preview_fields["urgent_pointer_count"] == 4
    assert preview_fields["urgent_pointer_step"] == 1

    loaded = service.load_workbench_profile("tcp-urgent-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["tcp_urgent_pointer"] == 20
    assert loaded_stream["tcp_urgent_pointer_mode"] == "Increment"
    assert loaded_stream["tcp_urgent_pointer_count"] == 4
    assert loaded_stream["tcp_urgent_pointer_step"] == 1
    assert loaded_stream["tcp_flag_urg"] is True


def test_workbench_profile_renders_tcp_flags_field_engine(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "tcp-flags-fe",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 128,
        "ipv4_src": "16.0.0.1",
        "ipv4_dst": "48.0.0.1",
        "l4_src_port_override": True,
        "l4_src_port": 1025,
        "l4_dst_port_override": True,
        "l4_dst_port": 80,
        "tcp_flag_syn": True,
        "tcp_flags_mode": "Increment",
        "tcp_flags_count": 4,
        "tcp_flags_step": 1,
    }

    saved = service.save_workbench_profile("tcp-flags-fe.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "tcp_flags"
    assert vm["instructions"] == [
        {
            "init_value": 2,
            "max_value": 5,
            "min_value": 2,
            "name": "tcp_flags",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x3F,
            "name": "tcp_flags",
            "pkt_cast_size": 1,
            "pkt_offset": 47,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
        {"l2_len": 14, "l3_len": 20, "l4_type": 13, "type": "fix_checksum_hw"},
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[46:48], "big") == 0x5002
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["l4"]["is_sync"] is True
    assert packet_meta["l4"]["flags_mode"] == "Increment"
    assert packet_meta["l4"]["flags_count"] == "4"
    assert packet_meta["l4"]["flags_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["flags"] == "SYN"
    assert preview_fields["flags_mode"] == "Increment"
    assert preview_fields["flags_count"] == 4
    assert preview_fields["flags_step"] == 1

    loaded = service.load_workbench_profile("tcp-flags-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["tcp_flag_syn"] is True
    assert loaded_stream["tcp_flags_mode"] == "Increment"
    assert loaded_stream["tcp_flags_count"] == 4
    assert loaded_stream["tcp_flags_step"] == 1


def test_workbench_profile_renders_ipv6_udp_and_loads_gui_yaml(tmp_path: Path) -> None:
    environment = env(tmp_path)
    service = RealStlClientService(environment)
    stream = {
        "name": "ipv6-udp",
        "packet_type": "Ethernet/IPv6/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv6_src": "2001:db8:1::10",
        "ipv6_dst": "2001:db8:2::20",
        "ipv6_traffic_class": 171,
        "ipv6_flow_label": 703710,
        "ipv6_hop_limit": 42,
        "l4_src_port_override": True,
        "l4_src_port": 12345,
        "l4_dst_port_override": True,
        "l4_dst_port": 5000,
        "payload_pattern": "aabb",
    }

    saved = service.save_workbench_profile("ipv6-profile.yaml", [stream])

    assert saved.ok is True
    assert saved.data["streams"][0]["packet_type"] == "Ethernet/IPv6/UDP"
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["layers"][1]["name"] == "Internet Protocol v6"
    assert preview["layers"][1]["fields"]["source"] == "2001:db8:1::10"
    assert preview["layers"][1]["fields"]["destination"] == "2001:db8:2::20"
    assert preview["layers"][1]["fields"]["traffic_class"] == 171
    assert preview["layers"][1]["fields"]["flow_label"] == 703710
    assert preview["layers"][1]["fields"]["hop_limit"] == 42
    assert preview["layers"][2]["name"] == "UDP"
    assert preview["hex"].startswith("66554433221110203040506086dd")
    assert packet[14] >> 4 == 6
    assert ((packet[14] & 0x0F) << 4) | (packet[15] >> 4) == 171
    assert int.from_bytes(packet[14:18], "big") & 0x000FFFFF == 703710
    assert int.from_bytes(packet[18:20], "big") == len(packet) - 14 - 40
    assert packet[20] == 17
    assert packet[21] == 42
    assert str(ipaddress.IPv6Address(packet[22:38])) == "2001:db8:1::10"
    assert str(ipaddress.IPv6Address(packet[38:54])) == "2001:db8:2::20"
    assert int.from_bytes(packet[54:56], "big") == 12345
    assert int.from_bytes(packet[56:58], "big") == 5000
    assert int.from_bytes(packet[58:60], "big") == len(packet) - 14 - 40
    assert int.from_bytes(packet[60:62], "big") != 0

    loaded = service.load_workbench_profile("ipv6-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv6/UDP"
    assert loaded_stream["ipv6_src"] == "2001:db8:1::10"
    assert loaded_stream["ipv6_dst"] == "2001:db8:2::20"
    assert loaded_stream["ipv6_traffic_class"] == 171
    assert loaded_stream["ipv6_flow_label"] == 703710
    assert loaded_stream["ipv6_hop_limit"] == 42
    assert loaded.data["packet_previews"][0]["layers"][1]["name"] == "Internet Protocol v6"


def test_workbench_profile_round_trips_vlan_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "vlan-preview",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "aa:bb:cc:dd:ee:ff",
        "ether_src": "00:11:22:33:44:55",
        "vlan_enabled": True,
        "vlan_priority": 5,
        "vlan_cfi": 1,
        "vlan_id": 123,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 5000,
    }

    saved = service.save_workbench_profile("vlan-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert packet[12:14] == b"\x81\x00"
    assert int.from_bytes(packet[14:16], "big") == ((5 << 13) | (1 << 12) | 123)
    assert packet[16:18] == b"\x08\x00"
    assert preview["layers"][0]["fields"]["type"] == "0x8100"
    assert preview["layers"][1]["name"] == "802.1Q VLAN"
    assert preview["layers"][1]["fields"]["priority"] == 5
    assert preview["layers"][1]["fields"]["cfi_dei"] == 1
    assert preview["layers"][1]["fields"]["vlan"] == 123
    assert preview["layers"][2]["fields"]["destination"] == "10.10.10.2"
    assert preview["layers"][3]["fields"]["destination_port"] == 5000

    loaded = service.load_workbench_profile("vlan-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vlan_enabled"] is True
    assert loaded_stream["vlan_tpid_override"] is False
    assert loaded_stream["vlan_tpid"] == "8100"
    assert loaded_stream["vlan_priority"] == 5
    assert loaded_stream["vlan_priority_mode"] == "Fixed"
    assert loaded_stream["vlan_priority_count"] == 4
    assert loaded_stream["vlan_priority_step"] == 1
    assert loaded_stream["vlan_cfi"] == 1
    assert loaded_stream["vlan_id"] == 123
    assert loaded_stream["vlan_id_mode"] == "Fixed"
    assert loaded_stream["vlan_id_count"] == 16
    assert loaded_stream["vlan_id_step"] == 1
    assert loaded_stream["ipv4_src"] == "10.10.10.1"
    assert loaded_stream["ipv4_dst"] == "10.10.10.2"
    assert loaded_stream["l4_src_port"] == 12345
    assert loaded_stream["l4_dst_port"] == 5000
    assert loaded.data["packet_previews"][0]["hex"].startswith("aabbccddeeff0011223344558100")


def test_workbench_profile_round_trips_qinq_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "qinq-preview",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "aa:bb:cc:dd:ee:ff",
        "ether_src": "00:11:22:33:44:55",
        "vlan_enabled": True,
        "vlan_tpid_override": True,
        "vlan_tpid": "88a8",
        "vlan_priority": 5,
        "vlan_cfi": 1,
        "vlan_id": 100,
        "vlan2_enabled": True,
        "vlan2_priority": 3,
        "vlan2_cfi": 0,
        "vlan2_id": 200,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 5000,
    }

    saved = service.save_workbench_profile("qinq-profile.yaml", [stream])

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[12:14] == b"\x88\xa8"
    assert int.from_bytes(packet[14:16], "big") == ((5 << 13) | (1 << 12) | 100)
    assert packet[16:18] == b"\x81\x00"
    assert int.from_bytes(packet[18:20], "big") == ((3 << 13) | 200)
    assert packet[20:22] == b"\x08\x00"
    assert packet[22] >> 4 == 4
    assert int.from_bytes(packet[42:44], "big") == 12345
    assert int.from_bytes(packet[44:46], "big") == 5000

    preview = saved.data["packet_previews"][0]
    assert [layer["name"] for layer in preview["layers"][:5]] == [
        "Ethernet",
        "802.1Q VLAN",
        "802.1Q VLAN Inner",
        "Internet Protocol v4",
        "UDP",
    ]
    assert preview["layers"][1]["fields"]["tpid"] == "0x88a8"
    assert preview["layers"][1]["fields"]["type"] == "0x8100"
    assert preview["layers"][2]["fields"]["vlan"] == 200
    assert preview["layers"][2]["fields"]["type"] == "0x0800"
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vlan"]["tags"][0]["tp_id"] == "88a8"
    assert packet_meta["vlan"]["tags"][1]["v_id"] == "200"

    loaded = service.load_workbench_profile("qinq-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vlan_enabled"] is True
    assert loaded_stream["vlan_tpid_override"] is True
    assert loaded_stream["vlan_tpid"] == "88a8"
    assert loaded_stream["vlan_priority"] == 5
    assert loaded_stream["vlan_cfi"] == 1
    assert loaded_stream["vlan_id"] == 100
    assert loaded_stream["vlan2_enabled"] is True
    assert loaded_stream["vlan2_tpid_override"] is False
    assert loaded_stream["vlan2_tpid"] == "8100"
    assert loaded_stream["vlan2_priority"] == 3
    assert loaded_stream["vlan2_cfi"] == 0
    assert loaded_stream["vlan2_id"] == 200
    assert loaded_stream["ipv4_src"] == "10.10.10.1"
    assert loaded_stream["ipv4_dst"] == "10.10.10.2"
    assert loaded_stream["l4_src_port"] == 12345
    assert loaded_stream["l4_dst_port"] == 5000


def test_workbench_profile_renders_vlan_id_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "vlan-id-fe.yaml",
        [
            {
                "name": "vlan-id-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "vlan_enabled": True,
                "vlan_priority": 5,
                "vlan_cfi": 1,
                "vlan_id": 100,
                "vlan_id_mode": "Increment",
                "vlan_id_count": 4,
                "vlan_id_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "vlan_id"
    assert vm["instructions"] == [
        {
            "init_value": 100,
            "max_value": 103,
            "min_value": 100,
            "name": "vlan_id",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x0FFF,
            "name": "vlan_id",
            "pkt_cast_size": 2,
            "pkt_offset": 14,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[14:16], "big") == ((5 << 13) | (1 << 12) | 100)
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vlan"]["v_id_mode"] == "Increment"
    assert packet_meta["vlan"]["v_id_count"] == "4"
    assert packet_meta["vlan"]["v_id_step"] == "1"
    assert saved.data["packet_previews"][0]["layers"][1]["fields"]["vlan_mode"] == "Increment"

    loaded = service.load_workbench_profile("vlan-id-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vlan_enabled"] is True
    assert loaded_stream["vlan_id"] == 100
    assert loaded_stream["vlan_id_mode"] == "Increment"
    assert loaded_stream["vlan_id_count"] == 4
    assert loaded_stream["vlan_id_step"] == 1


def test_workbench_profile_renders_vlan_priority_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "vlan-priority-fe.yaml",
        [
            {
                "name": "vlan-priority-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "vlan_enabled": True,
                "vlan_priority": 1,
                "vlan_priority_mode": "Increment",
                "vlan_priority_count": 4,
                "vlan_priority_step": 1,
                "vlan_cfi": 1,
                "vlan_id": 100,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "vlan_priority"
    assert vm["instructions"] == [
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "vlan_priority",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xE000,
            "name": "vlan_priority",
            "pkt_cast_size": 2,
            "pkt_offset": 14,
            "shift": 13,
            "type": "write_mask_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[14:16], "big") == ((1 << 13) | (1 << 12) | 100)
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vlan"]["priority_mode"] == "Increment"
    assert packet_meta["vlan"]["priority_count"] == "4"
    assert packet_meta["vlan"]["priority_step"] == "1"
    assert saved.data["packet_previews"][0]["layers"][1]["fields"]["priority_mode"] == "Increment"
    assert saved.data["packet_previews"][0]["layers"][1]["fields"]["priority_count"] == 4

    loaded = service.load_workbench_profile("vlan-priority-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vlan_enabled"] is True
    assert loaded_stream["vlan_priority"] == 1
    assert loaded_stream["vlan_priority_mode"] == "Increment"
    assert loaded_stream["vlan_priority_count"] == 4
    assert loaded_stream["vlan_priority_step"] == 1
    assert loaded_stream["vlan_id"] == 100


def test_workbench_profile_renders_qinq_inner_vlan_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "qinq-inner-fe.yaml",
        [
            {
                "name": "qinq-inner-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "vlan_enabled": True,
                "vlan_tpid_override": True,
                "vlan_tpid": "88a8",
                "vlan_priority": 5,
                "vlan_cfi": 1,
                "vlan_id": 100,
                "vlan2_enabled": True,
                "vlan2_priority": 1,
                "vlan2_priority_mode": "Increment",
                "vlan2_priority_count": 4,
                "vlan2_priority_step": 1,
                "vlan2_id": 200,
                "vlan2_id_mode": "Increment",
                "vlan2_id_count": 4,
                "vlan2_id_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "vlan2_id"
    assert vm["instructions"] == [
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "vlan2_priority",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xE000,
            "name": "vlan2_priority",
            "pkt_cast_size": 2,
            "pkt_offset": 18,
            "shift": 13,
            "type": "write_mask_flow_var",
        },
        {
            "init_value": 200,
            "max_value": 203,
            "min_value": 200,
            "name": "vlan2_id",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x0FFF,
            "name": "vlan2_id",
            "pkt_cast_size": 2,
            "pkt_offset": 18,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[18:20], "big") == ((1 << 13) | 200)
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vlan"]["tags"][1]["priority_mode"] == "Increment"
    assert packet_meta["vlan"]["tags"][1]["v_id_mode"] == "Increment"
    preview = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview["priority_mode"] == "Increment"
    assert preview["vlan_mode"] == "Increment"

    loaded = service.load_workbench_profile("qinq-inner-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vlan2_enabled"] is True
    assert loaded_stream["vlan2_priority"] == 1
    assert loaded_stream["vlan2_priority_mode"] == "Increment"
    assert loaded_stream["vlan2_priority_count"] == 4
    assert loaded_stream["vlan2_priority_step"] == 1
    assert loaded_stream["vlan2_id"] == 200
    assert loaded_stream["vlan2_id_mode"] == "Increment"
    assert loaded_stream["vlan2_id_count"] == 4
    assert loaded_stream["vlan2_id_step"] == 1


def test_workbench_profile_renders_mpls_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "mpls-preview",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "aa:bb:cc:dd:ee:ff",
        "ether_src": "00:11:22:33:44:55",
        "mpls_enabled": True,
        "mpls_label": 17,
        "mpls_tc": 1,
        "mpls_ttl": 64,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "48.0.0.250",
        "ipv4_dst_mode": "Increment Host",
        "ipv4_dst_count": 16,
        "ipv4_dst_step": 2,
    }

    saved = service.save_workbench_profile("mpls-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    mpls_word = int.from_bytes(packet[14:18], "big")
    assert packet[12:14] == b"\x88\x47"
    assert (mpls_word >> 12) & 0xFFFFF == 17
    assert (mpls_word >> 9) & 0x7 == 1
    assert (mpls_word >> 8) & 0x1 == 1
    assert mpls_word & 0xFF == 64
    assert packet[18] >> 4 == 4
    assert preview["layers"][0]["fields"]["type"] == "0x8847"
    assert preview["layers"][1]["name"] == "MPLS"
    assert preview["layers"][1]["fields"]["label"] == 17
    assert preview["layers"][1]["fields"]["traffic_class"] == 1
    assert preview["layers"][1]["fields"]["bottom_of_stack"] == 1
    assert preview["layers"][1]["fields"]["ttl"] == 64
    assert preview["layers"][2]["name"] == "Internet Protocol v4"

    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["instructions"][1]["pkt_offset"] == 36
    assert vm["instructions"][-1] == {"l2_len": 18, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_mpls_selected"] is True
    assert packet_meta["ethernet"]["type"] == "8847"
    assert packet_meta["mpls"] == {
        "bottom_of_stack": "1",
        "label": "17",
        "label_count": "16",
        "label_mode": "Fixed",
        "label_step": "1",
        "labels": [
            {
                "bottom_of_stack": "1",
                "label": "17",
                "label_count": "16",
                "label_mode": "Fixed",
                "label_step": "1",
                "traffic_class": "1",
                "traffic_class_count": "4",
                "traffic_class_mode": "Fixed",
                "traffic_class_step": "1",
                "ttl": "64",
                "ttl_count": "16",
                "ttl_mode": "Fixed",
                "ttl_step": "1",
            }
        ],
        "traffic_class": "1",
        "traffic_class_count": "4",
        "traffic_class_mode": "Fixed",
        "traffic_class_step": "1",
        "ttl": "64",
        "ttl_count": "16",
        "ttl_mode": "Fixed",
        "ttl_step": "1",
    }

    loaded = service.load_workbench_profile("mpls-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["mpls_enabled"] is True
    assert loaded_stream["mpls_label"] == 17
    assert loaded_stream["mpls_label_mode"] == "Fixed"
    assert loaded_stream["mpls_label_count"] == 16
    assert loaded_stream["mpls_label_step"] == 1
    assert loaded_stream["mpls_tc"] == 1
    assert loaded_stream["mpls_tc_mode"] == "Fixed"
    assert loaded_stream["mpls_tc_count"] == 4
    assert loaded_stream["mpls_tc_step"] == 1
    assert loaded_stream["mpls_ttl"] == 64
    assert loaded_stream["mpls_ttl_mode"] == "Fixed"
    assert loaded_stream["mpls_ttl_count"] == 16
    assert loaded_stream["mpls_ttl_step"] == 1
    assert loaded_stream["ipv4_dst_mode"] == "Increment Host"


def test_workbench_profile_renders_mpls_label_stack(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "mpls-stack",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "aa:bb:cc:dd:ee:ff",
        "ether_src": "00:11:22:33:44:55",
        "mpls_enabled": True,
        "mpls_label": 17,
        "mpls_tc": 1,
        "mpls_ttl": 64,
        "mpls_label2_enabled": True,
        "mpls_label2": 200,
        "mpls_label2_tc": 2,
        "mpls_label2_ttl": 63,
        "mpls_label3_enabled": True,
        "mpls_label3": 300,
        "mpls_label3_tc": 3,
        "mpls_label3_ttl": 62,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "48.0.0.250",
        "ipv4_dst_mode": "Increment Host",
        "ipv4_dst_count": 16,
        "ipv4_dst_step": 2,
    }

    saved = service.save_workbench_profile("mpls-stack.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    label_words = [int.from_bytes(packet[offset : offset + 4], "big") for offset in (14, 18, 22)]
    assert packet[12:14] == b"\x88\x47"
    assert [(word >> 12) & 0xFFFFF for word in label_words] == [17, 200, 300]
    assert [(word >> 9) & 0x7 for word in label_words] == [1, 2, 3]
    assert [(word >> 8) & 0x1 for word in label_words] == [0, 0, 1]
    assert [word & 0xFF for word in label_words] == [64, 63, 62]
    assert packet[26] >> 4 == 4
    assert [layer["name"] for layer in preview["layers"][:5]] == [
        "Ethernet",
        "MPLS",
        "MPLS",
        "MPLS",
        "Internet Protocol v4",
    ]
    assert preview["layers"][1]["fields"]["bottom_of_stack"] == 0
    assert preview["layers"][2]["fields"]["bottom_of_stack"] == 0
    assert preview["layers"][3]["fields"]["bottom_of_stack"] == 1

    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["instructions"][1]["pkt_offset"] == 44
    assert vm["instructions"][-1] == {"l2_len": 26, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["mpls"]["bottom_of_stack"] == "0"
    assert packet_meta["mpls"]["labels"] == [
        {
            "bottom_of_stack": "0",
            "label": "17",
            "label_count": "16",
            "label_mode": "Fixed",
            "label_step": "1",
            "traffic_class": "1",
            "traffic_class_count": "4",
            "traffic_class_mode": "Fixed",
            "traffic_class_step": "1",
            "ttl": "64",
            "ttl_count": "16",
            "ttl_mode": "Fixed",
            "ttl_step": "1",
        },
        {
            "bottom_of_stack": "0",
            "label": "200",
            "label_count": "16",
            "label_mode": "Fixed",
            "label_step": "1",
            "traffic_class": "2",
            "traffic_class_count": "4",
            "traffic_class_mode": "Fixed",
            "traffic_class_step": "1",
            "ttl": "63",
            "ttl_count": "16",
            "ttl_mode": "Fixed",
            "ttl_step": "1",
        },
        {
            "bottom_of_stack": "1",
            "label": "300",
            "label_count": "16",
            "label_mode": "Fixed",
            "label_step": "1",
            "traffic_class": "3",
            "traffic_class_count": "4",
            "traffic_class_mode": "Fixed",
            "traffic_class_step": "1",
            "ttl": "62",
            "ttl_count": "16",
            "ttl_mode": "Fixed",
            "ttl_step": "1",
        },
    ]

    loaded = service.load_workbench_profile("mpls-stack.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["mpls_label2_enabled"] is True
    assert loaded_stream["mpls_label2"] == 200
    assert loaded_stream["mpls_label2_tc"] == 2
    assert loaded_stream["mpls_label2_ttl"] == 63
    assert loaded_stream["mpls_label3_enabled"] is True
    assert loaded_stream["mpls_label3"] == 300
    assert loaded_stream["mpls_label3_tc"] == 3
    assert loaded_stream["mpls_label3_ttl"] == 62


def test_workbench_profile_renders_vxlan_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "vxlan-preview",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "vxlan_enabled": True,
        "vxlan_vni": 4096,
        "vxlan_inner_ether_dst": "aa:bb:cc:dd:ee:ff",
        "vxlan_inner_ether_src": "00:11:22:33:44:55",
        "vxlan_inner_ipv4_src": "10.1.0.10",
        "vxlan_inner_ipv4_dst": "10.1.0.20",
        "vxlan_inner_ipv4_ttl": 42,
        "vxlan_inner_l4_src_port": 32000,
        "vxlan_inner_l4_dst_port": 4789,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("vxlan-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 128
    assert packet[12:14] == b"\x08\x00"
    assert packet[23] == 17
    assert packet[26:30] == ipaddress.IPv4Address("172.16.0.1").packed
    assert packet[30:34] == ipaddress.IPv4Address("172.16.0.2").packed
    assert int.from_bytes(packet[34:36], "big") == 1337
    assert int.from_bytes(packet[36:38], "big") == 4789
    assert int.from_bytes(packet[38:40], "big") == 90
    assert packet[42] == 0x08
    assert int.from_bytes(packet[46:49], "big") == 4096
    assert packet[50:56] == bytes.fromhex("aabbccddeeff")
    assert packet[56:62] == bytes.fromhex("001122334455")
    assert packet[62:64] == b"\x08\x00"
    assert packet[72] == 42
    assert packet[73] == 17
    assert packet[76:80] == ipaddress.IPv4Address("10.1.0.10").packed
    assert packet[80:84] == ipaddress.IPv4Address("10.1.0.20").packed
    assert int.from_bytes(packet[84:86], "big") == 32000
    assert int.from_bytes(packet[86:88], "big") == 4789
    assert int.from_bytes(packet[88:90], "big") == 40
    assert packet[92:96] == bytes.fromhex("a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "UDP",
        "VXLAN",
        "Inner Ethernet",
        "Inner Internet Protocol v4",
        "Inner UDP",
        "Payload",
    ]
    assert preview["layers"][3]["fields"] == {
        "flags": "0x08",
        "vni": 4096,
        "vni_mode": "Fixed",
        "vni_count": 16,
        "vni_step": 1,
    }
    assert preview["layers"][6]["fields"]["source_port"] == 32000
    assert preview["layers"][7]["fields"]["bytes"] == 32

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_vxlan_selected"] is True
    assert packet_meta["vxlan"] == {
        "inner_ethernet": {"dst": "aa:bb:cc:dd:ee:ff", "src": "00:11:22:33:44:55"},
        "inner_ip_version": "IPv4",
        "inner_ipv4": {
            "dst": "10.1.0.20",
            "dst_count": "16",
            "dst_mode": "Fixed",
            "dst_step": "1",
            "src": "10.1.0.10",
            "src_count": "16",
            "src_mode": "Fixed",
            "src_step": "1",
            "ttl": "42",
            "ttl_count": "16",
            "ttl_mode": "Fixed",
            "ttl_step": "1",
        },
        "inner_ipv6": {
            "dst": "2001:db8:50::2",
            "dst_count": "16",
            "dst_mode": "Fixed",
            "dst_step": "1",
            "hop_limit": "64",
            "hop_limit_count": "16",
            "hop_limit_mode": "Fixed",
            "hop_limit_step": "1",
            "src": "2001:db8:50::1",
            "src_count": "16",
            "src_mode": "Fixed",
            "src_step": "1",
        },
        "inner_udp": {
            "dst_port": 4789,
            "dst_port_count": "16",
            "dst_port_mode": "Fixed",
            "dst_port_step": "1",
            "src_port": 32000,
            "src_port_count": "16",
            "src_port_mode": "Fixed",
            "src_port_step": "1",
        },
        "vni": "4096",
        "vni_mode": "Fixed",
        "vni_count": "16",
        "vni_step": "1",
    }

    loaded = service.load_workbench_profile("vxlan-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vxlan_enabled"] is True
    assert loaded_stream["vxlan_vni"] == 4096
    assert loaded_stream["vxlan_vni_mode"] == "Fixed"
    assert loaded_stream["vxlan_vni_count"] == 16
    assert loaded_stream["vxlan_vni_step"] == 1
    assert loaded_stream["vxlan_inner_ether_dst"] == "aa:bb:cc:dd:ee:ff"
    assert loaded_stream["vxlan_inner_ether_src"] == "00:11:22:33:44:55"
    assert loaded_stream["vxlan_inner_ipv4_src"] == "10.1.0.10"
    assert loaded_stream["vxlan_inner_ipv4_dst"] == "10.1.0.20"
    assert loaded_stream["vxlan_inner_ipv4_ttl"] == 42
    assert loaded_stream["vxlan_inner_l4_src_port"] == 32000
    assert loaded_stream["vxlan_inner_l4_dst_port"] == 4789
    assert loaded_stream["l4_src_port"] == 1337
    assert loaded_stream["l4_dst_port"] == 4789


def test_workbench_profile_renders_vxlan_inner_ipv6_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "vxlan-inner-ipv6",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "vxlan_enabled": True,
        "vxlan_vni": 4096,
        "vxlan_inner_ether_dst": "aa:bb:cc:dd:ee:ff",
        "vxlan_inner_ether_src": "00:11:22:33:44:55",
        "vxlan_inner_ip_version": "IPv6",
        "vxlan_inner_ipv6_src": "2001:db8:50::10",
        "vxlan_inner_ipv6_dst": "2001:db8:50::20",
        "vxlan_inner_ipv6_hop_limit": 42,
        "vxlan_inner_l4_src_port": 32000,
        "vxlan_inner_l4_dst_port": 32100,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("vxlan-inner-ipv6.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 128
    assert packet[42:50] == bytes.fromhex("0800000000100000")
    assert packet[50:56] == bytes.fromhex("aabbccddeeff")
    assert packet[56:62] == bytes.fromhex("001122334455")
    assert packet[62:64] == b"\x86\xdd"
    inner_ipv6_offset = 64
    inner_udp_offset = inner_ipv6_offset + 40
    assert packet[inner_ipv6_offset] >> 4 == 6
    assert int.from_bytes(packet[inner_ipv6_offset + 4 : inner_ipv6_offset + 6], "big") == 20
    assert packet[inner_ipv6_offset + 6] == 17
    assert packet[inner_ipv6_offset + 7] == 42
    assert packet[inner_ipv6_offset + 8 : inner_ipv6_offset + 24] == ipaddress.IPv6Address("2001:db8:50::10").packed
    assert packet[inner_ipv6_offset + 24 : inner_ipv6_offset + 40] == ipaddress.IPv6Address("2001:db8:50::20").packed
    assert int.from_bytes(packet[inner_udp_offset : inner_udp_offset + 2], "big") == 32000
    assert int.from_bytes(packet[inner_udp_offset + 2 : inner_udp_offset + 4], "big") == 32100
    assert int.from_bytes(packet[inner_udp_offset + 4 : inner_udp_offset + 6], "big") == 20
    assert int.from_bytes(packet[inner_udp_offset + 6 : inner_udp_offset + 8], "big") != 0
    pseudo_header = (
        packet[inner_ipv6_offset + 8 : inner_ipv6_offset + 24]
        + packet[inner_ipv6_offset + 24 : inner_ipv6_offset + 40]
        + struct.pack("!I3xB", 20, 17)
    )
    assert internet_checksum(pseudo_header + packet[inner_udp_offset : inner_udp_offset + 20]) == 0
    assert packet[inner_udp_offset + 8 : inner_udp_offset + 16] == bytes.fromhex("a1b2a1b2a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "UDP",
        "VXLAN",
        "Inner Ethernet",
        "Inner Internet Protocol v6",
        "Inner UDP",
        "Payload",
    ]
    assert preview["layers"][4]["fields"]["type"] == "0x86dd"
    assert preview["layers"][5]["fields"] == {
        "source": "2001:db8:50::10",
        "source_mode": "Fixed",
        "source_count": 16,
        "source_step": 1,
        "destination": "2001:db8:50::20",
        "destination_mode": "Fixed",
        "destination_count": 16,
        "destination_step": 1,
        "hop_limit": 42,
        "hop_limit_mode": "Fixed",
        "hop_limit_count": 16,
        "hop_limit_step": 1,
        "next_header": "UDP",
    }
    assert preview["layers"][6]["fields"]["checksum"] == "calculated"
    assert preview["layers"][7]["fields"]["bytes"] == 12

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vxlan"]["inner_ip_version"] == "IPv6"
    assert packet_meta["vxlan"]["inner_ipv6"] == {
        "dst": "2001:db8:50::20",
        "dst_count": "16",
        "dst_mode": "Fixed",
        "dst_step": "1",
        "hop_limit": "42",
        "hop_limit_count": "16",
        "hop_limit_mode": "Fixed",
        "hop_limit_step": "1",
        "src": "2001:db8:50::10",
        "src_count": "16",
        "src_mode": "Fixed",
        "src_step": "1",
    }

    loaded = service.load_workbench_profile("vxlan-inner-ipv6.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vxlan_inner_ip_version"] == "IPv6"
    assert loaded_stream["vxlan_inner_ipv6_src"] == "2001:db8:50::10"
    assert loaded_stream["vxlan_inner_ipv6_src_mode"] == "Fixed"
    assert loaded_stream["vxlan_inner_ipv6_dst"] == "2001:db8:50::20"
    assert loaded_stream["vxlan_inner_ipv6_dst_mode"] == "Fixed"
    assert loaded_stream["vxlan_inner_ipv6_hop_limit"] == 42
    assert loaded_stream["vxlan_inner_l4_src_port"] == 32000
    assert loaded_stream["vxlan_inner_l4_dst_port"] == 32100

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("vxlan-inner-ipv6.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["vxlan_inner_ip_version"] == "IPv6"
    assert imported_stream["vxlan_inner_ipv6_src"] == "2001:db8:50::10"
    assert imported_stream["vxlan_inner_ipv6_dst"] == "2001:db8:50::20"
    assert imported_stream["vxlan_inner_ipv6_hop_limit"] == 42
    assert imported_stream["vxlan_inner_l4_src_port"] == 32000
    assert imported_stream["vxlan_inner_l4_dst_port"] == 32100


def test_workbench_profile_renders_gtpu_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "gtpu-preview",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gtpu_enabled": True,
        "gtpu_message_type": 255,
        "gtpu_teid": 0xABCDEF01,
        "gtpu_inner_ipv4_src": "10.9.0.1",
        "gtpu_inner_ipv4_dst": "10.9.0.2",
        "gtpu_inner_ipv4_ttl": 63,
        "gtpu_inner_l4_src_port": 5000,
        "gtpu_inner_l4_dst_port": 6000,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("gtpu-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 96
    assert packet[12:14] == b"\x08\x00"
    assert packet[23] == 17
    assert packet[26:30] == ipaddress.IPv4Address("172.16.0.1").packed
    assert packet[30:34] == ipaddress.IPv4Address("172.16.0.2").packed
    assert int.from_bytes(packet[34:36], "big") == 2152
    assert int.from_bytes(packet[36:38], "big") == 2152
    assert int.from_bytes(packet[38:40], "big") == 58
    assert packet[42:50] == bytes.fromhex("30ff002aabcdef01")
    assert packet[50] >> 4 == 4
    assert int.from_bytes(packet[52:54], "big") == 42
    assert packet[58] == 63
    assert packet[59] == 17
    assert packet[62:66] == ipaddress.IPv4Address("10.9.0.1").packed
    assert packet[66:70] == ipaddress.IPv4Address("10.9.0.2").packed
    assert int.from_bytes(packet[70:72], "big") == 5000
    assert int.from_bytes(packet[72:74], "big") == 6000
    assert int.from_bytes(packet[74:76], "big") == 22
    assert packet[78:86] == bytes.fromhex("a1b2a1b2a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "UDP",
        "GPRS Tunneling Protocol User Plane",
        "Inner Internet Protocol v4",
        "Inner UDP",
        "Payload",
    ]
    assert preview["layers"][3]["fields"] == {
        "flags": "0x30",
        "message_type": 255,
        "length": 42,
        "n_pdu_count": 16,
        "n_pdu_enabled": False,
        "n_pdu_mode": "Fixed",
        "n_pdu_number": 0,
        "n_pdu_step": 1,
        "extension_enabled": False,
        "extension_type": "None",
        "extension_udp_port": 2152,
        "extension_udp_port_mode": "Fixed",
        "extension_udp_port_count": 16,
        "extension_udp_port_step": 1,
        "inner_ip_version": "IPv4",
        "next_extension_header": "0x00",
        "sequence": 0,
        "sequence_count": 16,
        "sequence_enabled": False,
        "sequence_mode": "Fixed",
        "sequence_step": 1,
        "teid": 0xABCDEF01,
        "teid_mode": "Fixed",
        "teid_count": 16,
        "teid_step": 1,
    }
    assert preview["layers"][4]["fields"]["source"] == "10.9.0.1"
    assert preview["layers"][5]["fields"]["destination_port"] == 6000
    assert preview["layers"][6]["fields"]["bytes"] == 14

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_gtpu_selected"] is True
    assert packet_meta["protocol_selection"]["is_vxlan_selected"] is False
    assert packet_meta["gtpu"] == {
        "enabled": True,
        "inner_ip_version": "IPv4",
        "inner_ipv4": {
            "dst": "10.9.0.2",
            "dst_count": "16",
            "dst_mode": "Fixed",
            "dst_step": "1",
            "src": "10.9.0.1",
            "src_count": "16",
            "src_mode": "Fixed",
            "src_step": "1",
            "ttl": "63",
            "ttl_count": "16",
            "ttl_mode": "Fixed",
            "ttl_step": "1",
        },
        "inner_ipv6": {
            "dst": "2001:db8:30::2",
            "dst_count": "16",
            "dst_mode": "Fixed",
            "dst_step": "1",
            "hop_limit": "64",
            "hop_limit_count": "16",
            "hop_limit_mode": "Fixed",
            "hop_limit_step": "1",
            "src": "2001:db8:30::1",
            "src_count": "16",
            "src_mode": "Fixed",
            "src_step": "1",
        },
        "inner_udp": {
            "dst_port": 6000,
            "dst_port_count": "16",
            "dst_port_mode": "Fixed",
            "dst_port_step": "1",
            "src_port": 5000,
            "src_port_count": "16",
            "src_port_mode": "Fixed",
            "src_port_step": "1",
        },
        "message_type": "255",
        "n_pdu_count": "16",
        "n_pdu_enabled": False,
        "n_pdu_mode": "Fixed",
        "n_pdu_number": "0",
        "n_pdu_step": "1",
        "extension_enabled": False,
        "extension_type": "none",
        "extension_udp_port": "2152",
        "extension_udp_port_mode": "Fixed",
        "extension_udp_port_count": "16",
        "extension_udp_port_step": "1",
        "next_extension_header": "00",
        "sequence": "0",
        "sequence_count": "16",
        "sequence_enabled": False,
        "sequence_mode": "Fixed",
        "sequence_step": "1",
        "teid": str(0xABCDEF01),
        "teid_count": "16",
        "teid_mode": "Fixed",
        "teid_step": "1",
    }

    loaded = service.load_workbench_profile("gtpu-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv4/UDP"
    assert loaded_stream["gtpu_enabled"] is True
    assert loaded_stream["gtpu_message_type"] == 255
    assert loaded_stream["gtpu_teid"] == 0xABCDEF01
    assert loaded_stream["gtpu_teid_mode"] == "Fixed"
    assert loaded_stream["gtpu_teid_count"] == 16
    assert loaded_stream["gtpu_teid_step"] == 1
    assert loaded_stream["gtpu_sequence_enabled"] is False
    assert loaded_stream["gtpu_sequence"] == 0
    assert loaded_stream["gtpu_sequence_mode"] == "Fixed"
    assert loaded_stream["gtpu_npdu_enabled"] is False
    assert loaded_stream["gtpu_npdu"] == 0
    assert loaded_stream["gtpu_npdu_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_ip_version"] == "IPv4"
    assert loaded_stream["gtpu_inner_ipv4_src"] == "10.9.0.1"
    assert loaded_stream["gtpu_inner_ipv4_src_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_ipv4_dst"] == "10.9.0.2"
    assert loaded_stream["gtpu_inner_ipv4_dst_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_ipv4_ttl"] == 63
    assert loaded_stream["gtpu_inner_l4_src_port"] == 5000
    assert loaded_stream["gtpu_inner_l4_src_port_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_l4_dst_port"] == 6000
    assert loaded_stream["gtpu_inner_l4_dst_port_mode"] == "Fixed"
    assert loaded_stream["l4_src_port"] == 2152
    assert loaded_stream["l4_dst_port"] == 2152


def test_workbench_profile_renders_gtpu_inner_ipv6_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "gtpu-inner-ipv6",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gtpu_enabled": True,
        "gtpu_message_type": 255,
        "gtpu_teid": 0xABCDEF01,
        "gtpu_inner_ip_version": "IPv6",
        "gtpu_inner_ipv6_src": "2001:db8:10::1",
        "gtpu_inner_ipv6_dst": "2001:db8:20::2",
        "gtpu_inner_ipv6_hop_limit": 42,
        "gtpu_inner_l4_src_port": 33000,
        "gtpu_inner_l4_dst_port": 33100,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("gtpu-inner-ipv6.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 128
    assert packet[42:50] == bytes.fromhex("30ff004aabcdef01")
    inner_ipv6_offset = 50
    inner_udp_offset = inner_ipv6_offset + 40
    assert packet[inner_ipv6_offset] >> 4 == 6
    assert int.from_bytes(packet[inner_ipv6_offset + 4 : inner_ipv6_offset + 6], "big") == 34
    assert packet[inner_ipv6_offset + 6] == 17
    assert packet[inner_ipv6_offset + 7] == 42
    assert packet[inner_ipv6_offset + 8 : inner_ipv6_offset + 24] == ipaddress.IPv6Address("2001:db8:10::1").packed
    assert packet[inner_ipv6_offset + 24 : inner_ipv6_offset + 40] == ipaddress.IPv6Address("2001:db8:20::2").packed
    assert int.from_bytes(packet[inner_udp_offset : inner_udp_offset + 2], "big") == 33000
    assert int.from_bytes(packet[inner_udp_offset + 2 : inner_udp_offset + 4], "big") == 33100
    assert int.from_bytes(packet[inner_udp_offset + 4 : inner_udp_offset + 6], "big") == 34
    assert int.from_bytes(packet[inner_udp_offset + 6 : inner_udp_offset + 8], "big") != 0
    pseudo_header = (
        packet[inner_ipv6_offset + 8 : inner_ipv6_offset + 24]
        + packet[inner_ipv6_offset + 24 : inner_ipv6_offset + 40]
        + struct.pack("!I3xB", 34, 17)
    )
    assert internet_checksum(pseudo_header + packet[inner_udp_offset : inner_udp_offset + 34]) == 0
    assert packet[inner_udp_offset + 8 : inner_udp_offset + 16] == bytes.fromhex("a1b2a1b2a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "UDP",
        "GPRS Tunneling Protocol User Plane",
        "Inner Internet Protocol v6",
        "Inner UDP",
        "Payload",
    ]
    assert preview["layers"][3]["fields"]["inner_ip_version"] == "IPv6"
    assert preview["layers"][4]["fields"] == {
        "source": "2001:db8:10::1",
        "source_mode": "Fixed",
        "source_count": 16,
        "source_step": 1,
        "destination": "2001:db8:20::2",
        "destination_mode": "Fixed",
        "destination_count": 16,
        "destination_step": 1,
        "hop_limit": 42,
        "hop_limit_mode": "Fixed",
        "hop_limit_count": 16,
        "hop_limit_step": 1,
        "next_header": "UDP",
    }
    assert preview["layers"][5]["fields"]["checksum"] == "calculated"

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["inner_ip_version"] == "IPv6"
    assert packet_meta["gtpu"]["inner_ipv6"] == {
        "dst": "2001:db8:20::2",
        "dst_mode": "Fixed",
        "dst_count": "16",
        "dst_step": "1",
        "hop_limit": "42",
        "hop_limit_mode": "Fixed",
        "hop_limit_count": "16",
        "hop_limit_step": "1",
        "src": "2001:db8:10::1",
        "src_mode": "Fixed",
        "src_count": "16",
        "src_step": "1",
    }

    loaded = service.load_workbench_profile("gtpu-inner-ipv6.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_inner_ip_version"] == "IPv6"
    assert loaded_stream["gtpu_inner_ipv6_src"] == "2001:db8:10::1"
    assert loaded_stream["gtpu_inner_ipv6_src_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_ipv6_dst"] == "2001:db8:20::2"
    assert loaded_stream["gtpu_inner_ipv6_dst_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_ipv6_hop_limit"] == 42
    assert loaded_stream["gtpu_inner_l4_src_port"] == 33000
    assert loaded_stream["gtpu_inner_l4_dst_port"] == 33100
    assert loaded_stream["gtpu_inner_l4_src_port_mode"] == "Fixed"
    assert loaded_stream["gtpu_inner_l4_dst_port_mode"] == "Fixed"

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("gtpu-inner-ipv6.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["gtpu_enabled"] is True
    assert imported_stream["gtpu_inner_ip_version"] == "IPv6"
    assert imported_stream["gtpu_inner_ipv6_src"] == "2001:db8:10::1"
    assert imported_stream["gtpu_inner_ipv6_src_mode"] == "Fixed"
    assert imported_stream["gtpu_inner_ipv6_dst"] == "2001:db8:20::2"
    assert imported_stream["gtpu_inner_ipv6_dst_mode"] == "Fixed"
    assert imported_stream["gtpu_inner_ipv6_hop_limit"] == 42
    assert imported_stream["gtpu_inner_l4_src_port"] == 33000
    assert imported_stream["gtpu_inner_l4_dst_port"] == 33100
    assert imported.data["packet_previews"][0]["layers"][4]["name"] == "Inner Internet Protocol v6"


def test_workbench_profile_renders_gtpu_inner_ipv6_hop_limit_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-inner-ipv6-hop-limit-fe.yaml",
        [
            {
                "name": "gtpu-inner-ipv6-hop-limit-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "gtpu_enabled": True,
                "gtpu_inner_ip_version": "IPv6",
                "gtpu_inner_ipv6_src": "2001:db8:10::1",
                "gtpu_inner_ipv6_dst": "2001:db8:20::2",
                "gtpu_inner_ipv6_hop_limit": 40,
                "gtpu_inner_ipv6_hop_limit_mode": "Increment",
                "gtpu_inner_ipv6_hop_limit_count": 4,
                "gtpu_inner_ipv6_hop_limit_step": 1,
                "gtpu_inner_l4_src_port": 33000,
                "gtpu_inner_l4_dst_port": 33100,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "gtpu_inner_ipv6_hop_limit"
    assert {
        "init_value": 40,
        "max_value": 43,
        "min_value": 40,
        "name": "gtpu_inner_ipv6_hop_limit",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv6_hop_limit",
        "pkt_offset": 57,
        "type": "write_flow_var",
    } in instructions
    assert {"l2_len": 50, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"} not in instructions

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["inner_ipv6"]["hop_limit_mode"] == "Increment"
    assert packet_meta["gtpu"]["inner_ipv6"]["hop_limit_count"] == "4"
    assert packet_meta["gtpu"]["inner_ipv6"]["hop_limit_step"] == "1"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[4]["fields"]["hop_limit_mode"] == "Increment"
    assert layers[4]["fields"]["hop_limit_count"] == 4
    assert layers[4]["fields"]["hop_limit_step"] == 1

    loaded = service.load_workbench_profile("gtpu-inner-ipv6-hop-limit-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_inner_ip_version"] == "IPv6"
    assert loaded_stream["gtpu_inner_ipv6_hop_limit_mode"] == "Increment"
    assert loaded_stream["gtpu_inner_ipv6_hop_limit_count"] == 4
    assert loaded_stream["gtpu_inner_ipv6_hop_limit_step"] == 1


def test_workbench_profile_renders_gtpu_inner_ipv6_udp_port_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-inner-ipv6-udp-fe.yaml",
        [
            {
                "name": "gtpu-inner-ipv6-udp-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "gtpu_enabled": True,
                "gtpu_inner_ip_version": "IPv6",
                "gtpu_inner_ipv6_src": "2001:db8:10::1",
                "gtpu_inner_ipv6_dst": "2001:db8:20::2",
                "gtpu_inner_ipv6_hop_limit": 40,
                "gtpu_inner_l4_src_port": 33000,
                "gtpu_inner_l4_src_port_mode": "Increment",
                "gtpu_inner_l4_src_port_count": 4,
                "gtpu_inner_l4_src_port_step": 1,
                "gtpu_inner_l4_dst_port": 33100,
                "gtpu_inner_l4_dst_port_mode": "Increment",
                "gtpu_inner_l4_dst_port_count": 4,
                "gtpu_inner_l4_dst_port_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "gtpu_inner_udp_src"
    assert {
        "init_value": 33100,
        "max_value": 33103,
        "min_value": 33100,
        "name": "gtpu_inner_udp_dst",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_udp_dst",
        "pkt_offset": 92,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 33000,
        "max_value": 33003,
        "min_value": 33000,
        "name": "gtpu_inner_udp_src",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_udp_src",
        "pkt_offset": 90,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 50, "l3_len": 40, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["inner_ip_version"] == "IPv6"
    assert packet_meta["gtpu"]["inner_udp"]["src_port_mode"] == "Increment"
    assert packet_meta["gtpu"]["inner_udp"]["dst_port_mode"] == "Increment"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[5]["name"] == "Inner UDP"
    assert layers[5]["fields"]["source_port_mode"] == "Increment"
    assert layers[5]["fields"]["destination_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("gtpu-inner-ipv6-udp-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_inner_ip_version"] == "IPv6"
    assert loaded_stream["gtpu_inner_l4_src_port_mode"] == "Increment"
    assert loaded_stream["gtpu_inner_l4_src_port_count"] == 4
    assert loaded_stream["gtpu_inner_l4_src_port_step"] == 1
    assert loaded_stream["gtpu_inner_l4_dst_port_mode"] == "Increment"
    assert loaded_stream["gtpu_inner_l4_dst_port_count"] == 4
    assert loaded_stream["gtpu_inner_l4_dst_port_step"] == 1


def test_workbench_profile_renders_gtpu_inner_ipv6_address_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-inner-ipv6-address-fe.yaml",
        [
            {
                "name": "gtpu-inner-ipv6-address-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "gtpu_enabled": True,
                "gtpu_inner_ip_version": "IPv6",
                "gtpu_inner_ipv6_src": "2001:db8:10::1",
                "gtpu_inner_ipv6_src_mode": "Increment Host",
                "gtpu_inner_ipv6_src_count": 4,
                "gtpu_inner_ipv6_src_step": 1,
                "gtpu_inner_ipv6_dst": "2001:db8:20::2",
                "gtpu_inner_ipv6_dst_mode": "Increment Host",
                "gtpu_inner_ipv6_dst_count": 4,
                "gtpu_inner_ipv6_dst_step": 1,
                "gtpu_inner_ipv6_hop_limit": 40,
                "gtpu_inner_l4_src_port": 33000,
                "gtpu_inner_l4_dst_port": 33100,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "gtpu_inner_ipv6_src"
    assert {
        "init_value": 2,
        "max_value": 5,
        "min_value": 2,
        "name": "gtpu_inner_ipv6_dst",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv6_dst",
        "pkt_offset": 89,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 1,
        "max_value": 4,
        "min_value": 1,
        "name": "gtpu_inner_ipv6_src",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv6_src",
        "pkt_offset": 73,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 50, "l3_len": 40, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["inner_ip_version"] == "IPv6"
    assert packet_meta["gtpu"]["inner_ipv6"]["src_mode"] == "Increment Host"
    assert packet_meta["gtpu"]["inner_ipv6"]["src_count"] == "4"
    assert packet_meta["gtpu"]["inner_ipv6"]["src_step"] == "1"
    assert packet_meta["gtpu"]["inner_ipv6"]["dst_mode"] == "Increment Host"
    assert packet_meta["gtpu"]["inner_ipv6"]["dst_count"] == "4"
    assert packet_meta["gtpu"]["inner_ipv6"]["dst_step"] == "1"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[4]["name"] == "Inner Internet Protocol v6"
    assert layers[4]["fields"]["source_mode"] == "Increment Host"
    assert layers[4]["fields"]["source_count"] == 4
    assert layers[4]["fields"]["destination_mode"] == "Increment Host"
    assert layers[4]["fields"]["destination_count"] == 4

    loaded = service.load_workbench_profile("gtpu-inner-ipv6-address-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_inner_ip_version"] == "IPv6"
    assert loaded_stream["gtpu_inner_ipv6_src_mode"] == "Increment Host"
    assert loaded_stream["gtpu_inner_ipv6_src_count"] == 4
    assert loaded_stream["gtpu_inner_ipv6_src_step"] == 1
    assert loaded_stream["gtpu_inner_ipv6_dst_mode"] == "Increment Host"
    assert loaded_stream["gtpu_inner_ipv6_dst_count"] == 4
    assert loaded_stream["gtpu_inner_ipv6_dst_step"] == 1


def test_workbench_profile_renders_ipv4_gre_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "gre-preview",
        "packet_type": "Ethernet/IPv4/GRE",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gre_checksum_present": True,
        "gre_checksum_override": False,
        "gre_key_present": True,
        "gre_key": 0x12345678,
        "gre_sequence_present": True,
        "gre_sequence": 7,
        "gre_inner_ipv4_src": "10.2.0.10",
        "gre_inner_ipv4_dst": "10.2.0.20",
        "gre_inner_ipv4_ttl": 42,
        "gre_inner_l4_src_port": 32000,
        "gre_inner_l4_dst_port": 32100,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("gre-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 128
    assert packet[12:14] == b"\x08\x00"
    assert packet[23] == 47
    assert packet[26:30] == ipaddress.IPv4Address("172.16.0.1").packed
    assert packet[30:34] == ipaddress.IPv4Address("172.16.0.2").packed
    assert int.from_bytes(packet[34:36], "big") == 0xB000
    assert int.from_bytes(packet[36:38], "big") == 0x0800
    assert int.from_bytes(packet[38:40], "big") != 0
    assert packet[40:42] == b"\x00\x00"
    assert int.from_bytes(packet[42:46], "big") == 0x12345678
    assert int.from_bytes(packet[46:50], "big") == 7
    assert internet_checksum(packet[34:50] + packet[50:]) == 0
    assert packet[50] >> 4 == 4
    assert packet[58] == 42
    assert packet[59] == 17
    assert packet[62:66] == ipaddress.IPv4Address("10.2.0.10").packed
    assert packet[66:70] == ipaddress.IPv4Address("10.2.0.20").packed
    assert int.from_bytes(packet[70:72], "big") == 32000
    assert int.from_bytes(packet[72:74], "big") == 32100
    assert int.from_bytes(packet[74:76], "big") == 54
    assert packet[78:82] == bytes.fromhex("a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "GRE",
        "Inner Internet Protocol v4",
        "Inner UDP",
        "Payload",
    ]
    assert preview["layers"][2]["fields"] == {
        "checksum_present": True,
        "checksum": "auto",
        "checksum_override": False,
        "key_present": True,
        "key": 0x12345678,
        "key_mode": "Fixed",
        "key_count": 16,
        "key_step": 1,
        "sequence_present": True,
        "sequence": 7,
        "sequence_mode": "Fixed",
        "sequence_count": 16,
        "sequence_step": 1,
        "protocol_type": "0x0800",
    }
    assert preview["layers"][3]["fields"]["source"] == "10.2.0.10"
    assert preview["layers"][4]["fields"]["destination_port"] == 32100

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_gre_selected"] is True
    assert packet_meta["gre"] == {
        "checksum_present": True,
        "checksum": "0000",
        "inner_ip_version": "IPv4",
        "inner_ipv4": {
            "dst": "10.2.0.20",
            "dst_count": "16",
            "dst_mode": "Fixed",
            "dst_step": "1",
            "src": "10.2.0.10",
            "src_count": "16",
            "src_mode": "Fixed",
            "src_step": "1",
            "ttl": "42",
            "ttl_count": "16",
            "ttl_mode": "Fixed",
            "ttl_step": "1",
        },
            "inner_ipv6": {
                "dst": "2001:db8:40::2",
                "dst_count": "16",
                "dst_mode": "Fixed",
                "dst_step": "1",
                "hop_limit": "64",
                "hop_limit_count": "16",
                "hop_limit_mode": "Fixed",
                "hop_limit_step": "1",
                "src": "2001:db8:40::1",
                "src_count": "16",
                "src_mode": "Fixed",
                "src_step": "1",
            },
        "inner_udp": {
            "dst_port": 32100,
            "dst_port_count": "16",
            "dst_port_mode": "Fixed",
            "dst_port_step": "1",
            "src_port": 32000,
            "src_port_count": "16",
            "src_port_mode": "Fixed",
            "src_port_step": "1",
        },
        "is_override_checksum": False,
        "key": "305419896",
        "key_count": "16",
        "key_mode": "Fixed",
        "key_present": True,
        "key_step": "1",
        "protocol_type": "0800",
        "sequence": "7",
        "sequence_count": "16",
        "sequence_mode": "Fixed",
        "sequence_present": True,
        "sequence_step": "1",
    }

    loaded = service.load_workbench_profile("gre-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv4/GRE"
    assert loaded_stream["gre_checksum_present"] is True
    assert loaded_stream["gre_checksum_override"] is False
    assert loaded_stream["gre_key_present"] is True
    assert loaded_stream["gre_key"] == 0x12345678
    assert loaded_stream["gre_key_mode"] == "Fixed"
    assert loaded_stream["gre_sequence_present"] is True
    assert loaded_stream["gre_sequence"] == 7
    assert loaded_stream["gre_sequence_mode"] == "Fixed"
    assert loaded_stream["gre_inner_ipv4_src"] == "10.2.0.10"
    assert loaded_stream["gre_inner_ipv4_src_mode"] == "Fixed"
    assert loaded_stream["gre_inner_ipv4_dst"] == "10.2.0.20"
    assert loaded_stream["gre_inner_ipv4_dst_mode"] == "Fixed"
    assert loaded_stream["gre_inner_ipv4_ttl"] == 42
    assert loaded_stream["gre_inner_ipv4_ttl_mode"] == "Fixed"
    assert loaded_stream["gre_inner_l4_src_port"] == 32000
    assert loaded_stream["gre_inner_l4_src_port_mode"] == "Fixed"
    assert loaded_stream["gre_inner_l4_dst_port"] == 32100
    assert loaded_stream["gre_inner_l4_dst_port_mode"] == "Fixed"


def test_workbench_profile_renders_gre_inner_ipv6_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "gre-inner-ipv6-preview",
        "packet_type": "Ethernet/IPv4/GRE",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gre_key_present": True,
        "gre_key": 0x12345678,
        "gre_sequence_present": True,
        "gre_sequence": 7,
        "gre_inner_ip_version": "IPv6",
        "gre_inner_ipv6_src": "2001:db8:40::10",
        "gre_inner_ipv6_dst": "2001:db8:40::20",
        "gre_inner_ipv6_hop_limit": 42,
        "gre_inner_l4_src_port": 32000,
        "gre_inner_l4_dst_port": 32100,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("gre-inner-ipv6.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 128
    assert packet[12:14] == b"\x08\x00"
    assert packet[23] == 47
    assert int.from_bytes(packet[34:36], "big") == 0x3000
    assert int.from_bytes(packet[36:38], "big") == 0x86DD
    assert int.from_bytes(packet[38:42], "big") == 0x12345678
    assert int.from_bytes(packet[42:46], "big") == 7
    inner_ipv6_offset = 46
    inner_udp_offset = inner_ipv6_offset + 40
    assert packet[inner_ipv6_offset] >> 4 == 6
    assert int.from_bytes(packet[inner_ipv6_offset + 4 : inner_ipv6_offset + 6], "big") == 38
    assert packet[inner_ipv6_offset + 6] == 17
    assert packet[inner_ipv6_offset + 7] == 42
    assert packet[inner_ipv6_offset + 8 : inner_ipv6_offset + 24] == ipaddress.IPv6Address("2001:db8:40::10").packed
    assert packet[inner_ipv6_offset + 24 : inner_ipv6_offset + 40] == ipaddress.IPv6Address("2001:db8:40::20").packed
    assert int.from_bytes(packet[inner_udp_offset : inner_udp_offset + 2], "big") == 32000
    assert int.from_bytes(packet[inner_udp_offset + 2 : inner_udp_offset + 4], "big") == 32100
    assert int.from_bytes(packet[inner_udp_offset + 4 : inner_udp_offset + 6], "big") == 38
    assert int.from_bytes(packet[inner_udp_offset + 6 : inner_udp_offset + 8], "big") != 0
    pseudo_header = (
        packet[inner_ipv6_offset + 8 : inner_ipv6_offset + 24]
        + packet[inner_ipv6_offset + 24 : inner_ipv6_offset + 40]
        + struct.pack("!I3xB", 38, 17)
    )
    assert internet_checksum(pseudo_header + packet[inner_udp_offset : inner_udp_offset + 38]) == 0
    assert packet[inner_udp_offset + 8 : inner_udp_offset + 16] == bytes.fromhex("a1b2a1b2a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "GRE",
        "Inner Internet Protocol v6",
        "Inner UDP",
        "Payload",
    ]
    assert preview["layers"][2]["fields"]["protocol_type"] == "0x86dd"
    assert preview["layers"][3]["fields"]["source"] == "2001:db8:40::10"
    assert preview["layers"][3]["fields"]["destination"] == "2001:db8:40::20"
    assert preview["layers"][3]["fields"]["hop_limit"] == 42
    assert preview["layers"][3]["fields"]["next_header"] == "UDP"
    assert preview["layers"][3]["fields"]["source_mode"] == "Fixed"
    assert preview["layers"][3]["fields"]["destination_mode"] == "Fixed"
    assert preview["layers"][3]["fields"]["hop_limit_mode"] == "Fixed"
    assert preview["layers"][4]["fields"]["checksum"] == "calculated"

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gre"]["protocol_type"] == "86DD"
    assert packet_meta["gre"]["inner_ip_version"] == "IPv6"
    assert packet_meta["gre"]["inner_ipv6"] == {
        "dst": "2001:db8:40::20",
        "dst_count": "16",
        "dst_mode": "Fixed",
        "dst_step": "1",
        "hop_limit": "42",
        "hop_limit_count": "16",
        "hop_limit_mode": "Fixed",
        "hop_limit_step": "1",
        "src": "2001:db8:40::10",
        "src_count": "16",
        "src_mode": "Fixed",
        "src_step": "1",
    }

    loaded = service.load_workbench_profile("gre-inner-ipv6.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv4/GRE"
    assert loaded_stream["gre_protocol_type"] == "86DD"
    assert loaded_stream["gre_inner_ip_version"] == "IPv6"
    assert loaded_stream["gre_inner_ipv6_src"] == "2001:db8:40::10"
    assert loaded_stream["gre_inner_ipv6_dst"] == "2001:db8:40::20"
    assert loaded_stream["gre_inner_ipv6_hop_limit"] == 42
    assert loaded_stream["gre_inner_l4_src_port"] == 32000
    assert loaded_stream["gre_inner_l4_src_port_mode"] == "Fixed"
    assert loaded_stream["gre_inner_l4_dst_port"] == 32100
    assert loaded_stream["gre_inner_l4_dst_port_mode"] == "Fixed"

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("gre-inner-ipv6.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/GRE"
    assert imported_stream["gre_protocol_type"] == "86DD"
    assert imported_stream["gre_inner_ip_version"] == "IPv6"
    assert imported_stream["gre_inner_ipv6_src"] == "2001:db8:40::10"
    assert imported_stream["gre_inner_ipv6_dst"] == "2001:db8:40::20"
    assert imported_stream["gre_inner_ipv6_hop_limit"] == 42
    assert imported_stream["gre_inner_l4_src_port"] == 32000
    assert imported_stream["gre_inner_l4_dst_port"] == 32100
    assert imported.data["packet_previews"][0]["layers"][3]["name"] == "Inner Internet Protocol v6"


def test_workbench_profile_renders_gre_inner_ipv6_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gre-inner-ipv6-fe.yaml",
        [
            {
                "name": "gre-inner-ipv6-fe",
                "packet_type": "Ethernet/IPv4/GRE",
                "frame_length": 128,
                "ipv4_src": "172.16.0.1",
                "ipv4_dst": "172.16.0.2",
                "gre_checksum_present": True,
                "gre_checksum_override": True,
                "gre_checksum": "BEEF",
                "gre_key_present": True,
                "gre_key": 0x12345678,
                "gre_sequence_present": True,
                "gre_sequence": 7,
                "gre_inner_ip_version": "IPv6",
                "gre_inner_ipv6_src": "2001:db8:40::10",
                "gre_inner_ipv6_src_mode": "Increment Host",
                "gre_inner_ipv6_src_count": 4,
                "gre_inner_ipv6_src_step": 1,
                "gre_inner_ipv6_dst": "2001:db8:40::20",
                "gre_inner_ipv6_dst_mode": "Increment Host",
                "gre_inner_ipv6_dst_count": 4,
                "gre_inner_ipv6_dst_step": 1,
                "gre_inner_ipv6_hop_limit": 40,
                "gre_inner_ipv6_hop_limit_mode": "Increment",
                "gre_inner_ipv6_hop_limit_count": 4,
                "gre_inner_ipv6_hop_limit_step": 1,
                "gre_inner_l4_src_port": 32000,
                "gre_inner_l4_src_port_mode": "Increment",
                "gre_inner_l4_src_port_count": 4,
                "gre_inner_l4_src_port_step": 1,
                "gre_inner_l4_dst_port": 32100,
                "gre_inner_l4_dst_port_mode": "Increment",
                "gre_inner_l4_dst_port_count": 4,
                "gre_inner_l4_dst_port_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "gre_inner_udp_src"
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[34:36], "big") == 0x3000
    assert int.from_bytes(packet[36:38], "big") == 0x86DD
    assert int.from_bytes(packet[38:42], "big") == 0x12345678
    assert int.from_bytes(packet[42:46], "big") == 7
    assert packet[53] == 40
    assert packet[52] == 17
    assert packet[54:70] == ipaddress.IPv6Address("2001:db8:40::10").packed
    assert packet[70:86] == ipaddress.IPv6Address("2001:db8:40::20").packed
    assert int.from_bytes(packet[86:88], "big") == 32000
    assert int.from_bytes(packet[88:90], "big") == 32100
    assert {
        "init_value": 32,
        "max_value": 35,
        "min_value": 32,
        "name": "gre_inner_ipv6_dst",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_ipv6_dst",
        "pkt_offset": 85,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 16,
        "max_value": 19,
        "min_value": 16,
        "name": "gre_inner_ipv6_src",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_ipv6_src",
        "pkt_offset": 69,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 40,
        "max_value": 43,
        "min_value": 40,
        "name": "gre_inner_ipv6_hop_limit",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_ipv6_hop_limit",
        "pkt_offset": 53,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32100,
        "max_value": 32103,
        "min_value": 32100,
        "name": "gre_inner_udp_dst",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_udp_dst",
        "pkt_offset": 88,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32000,
        "max_value": 32003,
        "min_value": 32000,
        "name": "gre_inner_udp_src",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_udp_src",
        "pkt_offset": 86,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 46, "l3_len": 40, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gre"]["checksum_present"] is False
    assert packet_meta["gre"]["inner_ip_version"] == "IPv6"
    assert packet_meta["gre"]["inner_ipv6"]["src_mode"] == "Increment Host"
    assert packet_meta["gre"]["inner_ipv6"]["src_count"] == "4"
    assert packet_meta["gre"]["inner_ipv6"]["dst_mode"] == "Increment Host"
    assert packet_meta["gre"]["inner_ipv6"]["hop_limit_mode"] == "Increment"
    assert packet_meta["gre"]["inner_udp"]["src_port_mode"] == "Increment"
    assert packet_meta["gre"]["inner_udp"]["dst_port_mode"] == "Increment"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[3]["fields"]["source_mode"] == "Increment Host"
    assert layers[3]["fields"]["destination_mode"] == "Increment Host"
    assert layers[3]["fields"]["hop_limit_mode"] == "Increment"
    assert layers[4]["fields"]["source_port_mode"] == "Increment"
    assert layers[4]["fields"]["destination_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("gre-inner-ipv6-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gre_checksum_present"] is False
    assert loaded_stream["gre_checksum_override"] is False
    assert loaded_stream["gre_inner_ip_version"] == "IPv6"
    assert loaded_stream["gre_inner_ipv6_src_mode"] == "Increment Host"
    assert loaded_stream["gre_inner_ipv6_src_count"] == 4
    assert loaded_stream["gre_inner_ipv6_src_step"] == 1
    assert loaded_stream["gre_inner_ipv6_dst_mode"] == "Increment Host"
    assert loaded_stream["gre_inner_ipv6_dst_count"] == 4
    assert loaded_stream["gre_inner_ipv6_dst_step"] == 1
    assert loaded_stream["gre_inner_ipv6_hop_limit_mode"] == "Increment"
    assert loaded_stream["gre_inner_ipv6_hop_limit_count"] == 4
    assert loaded_stream["gre_inner_ipv6_hop_limit_step"] == 1
    assert loaded_stream["gre_inner_l4_src_port_mode"] == "Increment"
    assert loaded_stream["gre_inner_l4_src_port_count"] == 4
    assert loaded_stream["gre_inner_l4_dst_port_mode"] == "Increment"
    assert loaded_stream["gre_inner_l4_dst_port_count"] == 4


def test_workbench_profile_renders_gre_key_sequence_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "gre-fe",
        "packet_type": "Ethernet/IPv4/GRE",
        "frame_length": 128,
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gre_checksum_present": True,
        "gre_checksum_override": True,
        "gre_checksum": "BEEF",
        "gre_key_present": True,
        "gre_key": 0x12345678,
        "gre_key_mode": "Increment",
        "gre_key_count": 4,
        "gre_key_step": 1,
        "gre_sequence_present": True,
        "gre_sequence": 7,
        "gre_sequence_mode": "Increment",
        "gre_sequence_count": 4,
        "gre_sequence_step": 1,
        "gre_inner_ipv4_src": "10.2.0.10",
        "gre_inner_ipv4_dst": "10.2.0.20",
        "gre_inner_l4_src_port": 32000,
        "gre_inner_l4_dst_port": 32100,
    }

    saved = service.save_workbench_profile("gre-fe.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert int.from_bytes(packet[34:36], "big") == 0x3000
    assert int.from_bytes(packet[36:38], "big") == 0x0800
    assert int.from_bytes(packet[38:42], "big") == 0x12345678
    assert int.from_bytes(packet[42:46], "big") == 7
    assert preview["layers"][2]["fields"]["checksum_present"] is False
    assert preview["layers"][2]["fields"]["key_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["key_count"] == 4
    assert preview["layers"][2]["fields"]["sequence_mode"] == "Increment"
    assert preview["layers"][2]["fields"]["sequence_count"] == 4

    entry = yaml.safe_load(saved.data["content"])[0]
    instructions = entry["stream"]["vm"]["instructions"]
    assert entry["stream"]["vm"]["split_by_var"] == "gre_sequence"
    assert {
        "init_value": 0x12345678,
        "max_value": 0x1234567B,
        "min_value": 0x12345678,
        "name": "gre_key",
        "op": "inc",
        "size": 4,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_key",
        "pkt_offset": 38,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 7,
        "max_value": 10,
        "min_value": 7,
        "name": "gre_sequence",
        "op": "inc",
        "size": 4,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_sequence",
        "pkt_offset": 42,
        "type": "write_flow_var",
    } in instructions

    loaded = service.load_workbench_profile("gre-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gre_checksum_present"] is False
    assert loaded_stream["gre_checksum_override"] is False
    assert loaded_stream["gre_key_present"] is True
    assert loaded_stream["gre_key_mode"] == "Increment"
    assert loaded_stream["gre_key_count"] == 4
    assert loaded_stream["gre_key_step"] == 1
    assert loaded_stream["gre_sequence_present"] is True
    assert loaded_stream["gre_sequence_mode"] == "Increment"
    assert loaded_stream["gre_sequence_count"] == 4
    assert loaded_stream["gre_sequence_step"] == 1


def test_workbench_profile_renders_gre_inner_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gre-inner-fe.yaml",
        [
            {
                "name": "gre-inner-fe",
                "packet_type": "Ethernet/IPv4/GRE",
                "frame_length": 128,
                "ipv4_src": "172.16.0.1",
                "ipv4_dst": "172.16.0.2",
                "gre_checksum_present": True,
                "gre_checksum_override": True,
                "gre_checksum": "BEEF",
                "gre_key_present": True,
                "gre_key": 0x12345678,
                "gre_sequence_present": True,
                "gre_sequence": 7,
                "gre_inner_ipv4_src": "10.2.0.10",
                "gre_inner_ipv4_src_mode": "Increment Host",
                "gre_inner_ipv4_src_count": 4,
                "gre_inner_ipv4_src_step": 1,
                "gre_inner_ipv4_dst": "10.2.0.20",
                "gre_inner_ipv4_dst_mode": "Increment Host",
                "gre_inner_ipv4_dst_count": 4,
                "gre_inner_ipv4_dst_step": 1,
                "gre_inner_ipv4_ttl": 40,
                "gre_inner_ipv4_ttl_mode": "Increment",
                "gre_inner_ipv4_ttl_count": 4,
                "gre_inner_ipv4_ttl_step": 1,
                "gre_inner_l4_src_port": 32000,
                "gre_inner_l4_src_port_mode": "Increment",
                "gre_inner_l4_src_port_count": 4,
                "gre_inner_l4_src_port_step": 1,
                "gre_inner_l4_dst_port": 32100,
                "gre_inner_l4_dst_port_mode": "Increment",
                "gre_inner_l4_dst_port_count": 4,
                "gre_inner_l4_dst_port_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "gre_inner_udp_src"
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[34:36], "big") == 0x3000
    assert int.from_bytes(packet[38:42], "big") == 0x12345678
    assert int.from_bytes(packet[42:46], "big") == 7
    assert packet[54] == 40
    assert packet[58:62] == ipaddress.IPv4Address("10.2.0.10").packed
    assert packet[62:66] == ipaddress.IPv4Address("10.2.0.20").packed
    assert int.from_bytes(packet[66:68], "big") == 32000
    assert int.from_bytes(packet[68:70], "big") == 32100
    assert {
        "init_value": 20,
        "max_value": 23,
        "min_value": 20,
        "name": "gre_inner_ipv4_dst",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_ipv4_dst",
        "pkt_offset": 65,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 10,
        "max_value": 13,
        "min_value": 10,
        "name": "gre_inner_ipv4_src",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_ipv4_src",
        "pkt_offset": 61,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 40,
        "max_value": 43,
        "min_value": 40,
        "name": "gre_inner_ipv4_ttl",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_ipv4_ttl",
        "pkt_offset": 54,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32100,
        "max_value": 32103,
        "min_value": 32100,
        "name": "gre_inner_udp_dst",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_udp_dst",
        "pkt_offset": 68,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32000,
        "max_value": 32003,
        "min_value": 32000,
        "name": "gre_inner_udp_src",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gre_inner_udp_src",
        "pkt_offset": 66,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 46, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gre"]["checksum_present"] is False
    assert packet_meta["gre"]["inner_ipv4"]["src_mode"] == "Increment Host"
    assert packet_meta["gre"]["inner_ipv4"]["dst_mode"] == "Increment Host"
    assert packet_meta["gre"]["inner_ipv4"]["ttl_mode"] == "Increment"
    assert packet_meta["gre"]["inner_udp"]["src_port_mode"] == "Increment"
    assert packet_meta["gre"]["inner_udp"]["dst_port_mode"] == "Increment"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[3]["fields"]["source_mode"] == "Increment Host"
    assert layers[3]["fields"]["ttl_mode"] == "Increment"
    assert layers[4]["fields"]["destination_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("gre-inner-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gre_checksum_present"] is False
    assert loaded_stream["gre_checksum_override"] is False
    assert loaded_stream["gre_inner_ipv4_src_mode"] == "Increment Host"
    assert loaded_stream["gre_inner_ipv4_src_count"] == 4
    assert loaded_stream["gre_inner_ipv4_src_step"] == 1
    assert loaded_stream["gre_inner_ipv4_dst_mode"] == "Increment Host"
    assert loaded_stream["gre_inner_ipv4_dst_count"] == 4
    assert loaded_stream["gre_inner_ipv4_dst_step"] == 1
    assert loaded_stream["gre_inner_ipv4_ttl_mode"] == "Increment"
    assert loaded_stream["gre_inner_ipv4_ttl_count"] == 4
    assert loaded_stream["gre_inner_ipv4_ttl_step"] == 1
    assert loaded_stream["gre_inner_l4_src_port_mode"] == "Increment"
    assert loaded_stream["gre_inner_l4_src_port_count"] == 4
    assert loaded_stream["gre_inner_l4_src_port_step"] == 1
    assert loaded_stream["gre_inner_l4_dst_port_mode"] == "Increment"
    assert loaded_stream["gre_inner_l4_dst_port_count"] == 4
    assert loaded_stream["gre_inner_l4_dst_port_step"] == 1


def test_workbench_profile_renders_ipv6_gre_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "gre-ipv6-preview",
        "packet_type": "Ethernet/IPv6/GRE",
        "frame_length": 160,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv6_src": "2001:db8::10",
        "ipv6_dst": "2001:db8::20",
        "ipv6_hop_limit": 42,
        "gre_key_present": True,
        "gre_key": 0x10203040,
        "gre_inner_ipv4_src": "10.2.1.10",
        "gre_inner_ipv4_dst": "10.2.1.20",
        "gre_inner_l4_src_port": 30000,
        "gre_inner_l4_dst_port": 30001,
        "payload_pattern": "cafe",
    }

    saved = service.save_workbench_profile("gre-ipv6-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    assert preview["wire_length"] == 160
    assert packet[12:14] == b"\x86\xdd"
    assert packet[14] >> 4 == 6
    assert packet[20] == 47
    assert packet[21] == 42
    assert packet[22:38] == ipaddress.IPv6Address("2001:db8::10").packed
    assert packet[38:54] == ipaddress.IPv6Address("2001:db8::20").packed
    assert int.from_bytes(packet[54:56], "big") == 0x2000
    assert int.from_bytes(packet[56:58], "big") == 0x0800
    assert int.from_bytes(packet[58:62], "big") == 0x10203040
    assert packet[62] >> 4 == 4
    assert packet[70] == 64
    assert packet[71] == 17
    assert packet[74:78] == ipaddress.IPv4Address("10.2.1.10").packed
    assert packet[78:82] == ipaddress.IPv4Address("10.2.1.20").packed
    assert int.from_bytes(packet[82:84], "big") == 30000
    assert int.from_bytes(packet[84:86], "big") == 30001
    assert packet[90:94] == bytes.fromhex("cafecafe")
    assert [layer["name"] for layer in preview["layers"][:5]] == [
        "Ethernet",
        "Internet Protocol v6",
        "GRE",
        "Inner Internet Protocol v4",
        "Inner UDP",
    ]
    assert preview["layers"][2]["fields"]["key"] == 0x10203040


def test_workbench_profile_renders_sctp_packet_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "sctp-preview",
        "packet_type": "Ethernet/IPv4/SCTP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port_override": True,
        "l4_src_port": 2905,
        "l4_dst_port_override": True,
        "l4_dst_port": 2906,
        "sctp_verification_tag": 0x10203040,
        "sctp_data_flags": 3,
        "sctp_tsn": 0xABCDEF01,
        "sctp_stream_id": 7,
        "sctp_stream_sequence": 9,
        "sctp_payload_protocol_id": 0x11223344,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("sctp-profile.yaml", [stream])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    ip_offset = 14
    l4_offset = ip_offset + 20
    ip_total_length = int.from_bytes(packet[ip_offset + 2 : ip_offset + 4], "big")
    sctp_segment = packet[l4_offset : l4_offset + ip_total_length - 20]
    checksum = int.from_bytes(sctp_segment[8:12], "little")
    zeroed_segment = sctp_segment[:8] + b"\x00\x00\x00\x00" + sctp_segment[12:]

    assert preview["wire_length"] == 96
    assert packet[12:14] == b"\x08\x00"
    assert packet[ip_offset + 9] == 132
    assert packet[ip_offset + 12 : ip_offset + 16] == ipaddress.IPv4Address("10.10.10.1").packed
    assert packet[ip_offset + 16 : ip_offset + 20] == ipaddress.IPv4Address("10.10.10.2").packed
    assert int.from_bytes(sctp_segment[0:2], "big") == 2905
    assert int.from_bytes(sctp_segment[2:4], "big") == 2906
    assert int.from_bytes(sctp_segment[4:8], "big") == 0x10203040
    assert checksum == _sctp_crc32c(zeroed_segment)
    assert sctp_segment[12] == 0
    assert sctp_segment[13] == 3
    assert int.from_bytes(sctp_segment[14:16], "big") == len(sctp_segment) - 12
    assert int.from_bytes(sctp_segment[16:20], "big") == 0xABCDEF01
    assert int.from_bytes(sctp_segment[20:22], "big") == 7
    assert int.from_bytes(sctp_segment[22:24], "big") == 9
    assert int.from_bytes(sctp_segment[24:28], "big") == 0x11223344
    assert sctp_segment[28:36] == bytes.fromhex("a1b2a1b2a1b2a1b2")
    assert [layer["name"] for layer in preview["layers"][:4]] == [
        "Ethernet",
        "Internet Protocol v4",
        "SCTP",
        "Payload",
    ]
    assert preview["layers"][2]["fields"]["source_port"] == 2905
    assert preview["layers"][2]["fields"]["verification_tag"] == 0x10203040
    assert preview["layers"][2]["fields"]["checksum"] == "auto"
    assert preview["layers"][2]["fields"]["tsn"] == 0xABCDEF01
    assert preview["layers"][2]["fields"]["payload_protocol_id"] == 0x11223344

    entry = yaml.safe_load(saved.data["content"])[0]
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["protocol_selection"]["is_sctp_selected"] is True
    assert packet_meta["sctp"]["verification_tag"] == str(0x10203040)
    assert packet_meta["sctp"]["tsn"] == str(0xABCDEF01)
    assert packet_meta["sctp"]["stream_id"] == "7"
    assert packet_meta["sctp"]["payload_protocol_id"] == str(0x11223344)

    loaded = service.load_workbench_profile("sctp-profile.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["packet_type"] == "Ethernet/IPv4/SCTP"
    assert loaded_stream["sctp_verification_tag"] == 0x10203040
    assert loaded_stream["sctp_tsn"] == 0xABCDEF01
    assert loaded_stream["sctp_stream_id"] == 7
    assert loaded_stream["sctp_stream_sequence"] == 9
    assert loaded_stream["sctp_payload_protocol_id"] == 0x11223344


def test_workbench_profile_renders_sctp_tsn_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "sctp-tsn-fe.yaml",
        [
            {
                "name": "sctp-tsn-fe",
                "packet_type": "Ethernet/IPv4/SCTP",
                "frame_length": 96,
                "l4_src_port_override": True,
                "l4_src_port": 2905,
                "l4_dst_port_override": True,
                "l4_dst_port": 2906,
                "sctp_tsn": 100,
                "sctp_tsn_mode": "Increment",
                "sctp_tsn_count": 4,
                "sctp_tsn_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "sctp_tsn"
    assert vm["instructions"] == [
        {
            "init_value": 100,
            "max_value": 103,
            "min_value": 100,
            "name": "sctp_tsn",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "sctp_tsn",
            "pkt_offset": 50,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[50:54], "big") == 100
    assert int.from_bytes(packet[42:46], "little") == 0
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["sctp"]["is_override_checksum"] is True
    assert packet_meta["sctp"]["checksum"] == "00000000"
    assert packet_meta["sctp"]["tsn_mode"] == "Increment"
    assert packet_meta["sctp"]["tsn_count"] == "4"
    assert packet_meta["sctp"]["tsn_step"] == "1"
    assert saved.data["packet_previews"][0]["layers"][2]["fields"]["checksum_override"] is True
    assert saved.data["packet_previews"][0]["layers"][2]["fields"]["checksum"] == "00000000"
    assert saved.data["packet_previews"][0]["layers"][2]["fields"]["tsn_mode"] == "Increment"

    loaded = service.load_workbench_profile("sctp-tsn-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["sctp_checksum_override"] is True
    assert loaded_stream["sctp_checksum"] == "00000000"
    assert loaded_stream["sctp_tsn_mode"] == "Increment"
    assert loaded_stream["sctp_tsn_count"] == 4
    assert loaded_stream["sctp_tsn_step"] == 1


def test_workbench_profile_renders_sctp_common_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "sctp-common-fe.yaml",
        [
            {
                "name": "sctp-common-fe",
                "packet_type": "Ethernet/IPv4/SCTP",
                "frame_length": 96,
                "l4_src_port_override": True,
                "l4_src_port": 2905,
                "l4_dst_port_override": True,
                "l4_dst_port": 2906,
                "sctp_verification_tag": 0x10203040,
                "sctp_verification_tag_mode": "Increment",
                "sctp_verification_tag_count": 4,
                "sctp_verification_tag_step": 1,
                "sctp_data_flags": 3,
                "sctp_data_flags_mode": "Increment",
                "sctp_data_flags_count": 4,
                "sctp_data_flags_step": 1,
                "sctp_tsn": 100,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "sctp_data_flags"
    assert vm["instructions"] == [
        {
            "init_value": 0x10203040,
            "max_value": 0x10203043,
            "min_value": 0x10203040,
            "name": "sctp_verification_tag",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "sctp_verification_tag",
            "pkt_offset": 38,
            "type": "write_flow_var",
        },
        {
            "init_value": 3,
            "max_value": 6,
            "min_value": 3,
            "name": "sctp_data_flags",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "sctp_data_flags",
            "pkt_offset": 47,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[38:42], "big") == 0x10203040
    assert int.from_bytes(packet[42:46], "little") == 0
    assert packet[47] == 3
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["sctp"]["is_override_checksum"] is True
    assert packet_meta["sctp"]["checksum"] == "00000000"
    assert packet_meta["sctp"]["verification_tag_mode"] == "Increment"
    assert packet_meta["sctp"]["verification_tag_count"] == "4"
    assert packet_meta["sctp"]["verification_tag_step"] == "1"
    assert packet_meta["sctp"]["data_flags_mode"] == "Increment"
    assert packet_meta["sctp"]["data_flags_count"] == "4"
    assert packet_meta["sctp"]["data_flags_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["checksum_override"] is True
    assert preview_fields["checksum"] == "00000000"
    assert preview_fields["verification_tag_mode"] == "Increment"
    assert preview_fields["data_flags_mode"] == "Increment"

    loaded = service.load_workbench_profile("sctp-common-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["sctp_checksum_override"] is True
    assert loaded_stream["sctp_checksum"] == "00000000"
    assert loaded_stream["sctp_verification_tag_mode"] == "Increment"
    assert loaded_stream["sctp_verification_tag_count"] == 4
    assert loaded_stream["sctp_verification_tag_step"] == 1
    assert loaded_stream["sctp_data_flags_mode"] == "Increment"
    assert loaded_stream["sctp_data_flags_count"] == 4
    assert loaded_stream["sctp_data_flags_step"] == 1


def test_workbench_profile_renders_sctp_data_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "sctp-data-fe.yaml",
        [
            {
                "name": "sctp-data-fe",
                "packet_type": "Ethernet/IPv4/SCTP",
                "frame_length": 96,
                "l4_src_port_override": True,
                "l4_src_port": 2905,
                "l4_dst_port_override": True,
                "l4_dst_port": 2906,
                "sctp_tsn": 100,
                "sctp_stream_id": 7,
                "sctp_stream_id_mode": "Increment",
                "sctp_stream_id_count": 4,
                "sctp_stream_id_step": 1,
                "sctp_stream_sequence": 9,
                "sctp_stream_sequence_mode": "Increment",
                "sctp_stream_sequence_count": 4,
                "sctp_stream_sequence_step": 1,
                "sctp_payload_protocol_id": 0x11223344,
                "sctp_payload_protocol_id_mode": "Increment",
                "sctp_payload_protocol_id_count": 4,
                "sctp_payload_protocol_id_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "sctp_payload_protocol_id"
    assert vm["instructions"] == [
        {
            "init_value": 7,
            "max_value": 10,
            "min_value": 7,
            "name": "sctp_stream_id",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "sctp_stream_id",
            "pkt_offset": 54,
            "type": "write_flow_var",
        },
        {
            "init_value": 9,
            "max_value": 12,
            "min_value": 9,
            "name": "sctp_stream_sequence",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "sctp_stream_sequence",
            "pkt_offset": 56,
            "type": "write_flow_var",
        },
        {
            "init_value": 0x11223344,
            "max_value": 0x11223347,
            "min_value": 0x11223344,
            "name": "sctp_payload_protocol_id",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "sctp_payload_protocol_id",
            "pkt_offset": 58,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[50:54], "big") == 100
    assert int.from_bytes(packet[54:56], "big") == 7
    assert int.from_bytes(packet[56:58], "big") == 9
    assert int.from_bytes(packet[58:62], "big") == 0x11223344
    assert int.from_bytes(packet[42:46], "little") == 0
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["sctp"]["is_override_checksum"] is True
    assert packet_meta["sctp"]["checksum"] == "00000000"
    assert packet_meta["sctp"]["stream_id_mode"] == "Increment"
    assert packet_meta["sctp"]["stream_id_count"] == "4"
    assert packet_meta["sctp"]["stream_id_step"] == "1"
    assert packet_meta["sctp"]["stream_sequence_mode"] == "Increment"
    assert packet_meta["sctp"]["stream_sequence_count"] == "4"
    assert packet_meta["sctp"]["stream_sequence_step"] == "1"
    assert packet_meta["sctp"]["payload_protocol_id_mode"] == "Increment"
    assert packet_meta["sctp"]["payload_protocol_id_count"] == "4"
    assert packet_meta["sctp"]["payload_protocol_id_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][2]["fields"]
    assert preview_fields["checksum_override"] is True
    assert preview_fields["checksum"] == "00000000"
    assert preview_fields["stream_id_mode"] == "Increment"
    assert preview_fields["stream_sequence_mode"] == "Increment"
    assert preview_fields["payload_protocol_id_mode"] == "Increment"

    loaded = service.load_workbench_profile("sctp-data-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["sctp_checksum_override"] is True
    assert loaded_stream["sctp_checksum"] == "00000000"
    assert loaded_stream["sctp_stream_id_mode"] == "Increment"
    assert loaded_stream["sctp_stream_id_count"] == 4
    assert loaded_stream["sctp_stream_id_step"] == 1
    assert loaded_stream["sctp_stream_sequence_mode"] == "Increment"
    assert loaded_stream["sctp_stream_sequence_count"] == 4
    assert loaded_stream["sctp_stream_sequence_step"] == 1
    assert loaded_stream["sctp_payload_protocol_id_mode"] == "Increment"
    assert loaded_stream["sctp_payload_protocol_id_count"] == 4
    assert loaded_stream["sctp_payload_protocol_id_step"] == 1


def test_workbench_profile_renders_ipv6_sctp_packet_fields_and_pcap_roundtrip(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "ipv6-sctp-preview",
        "packet_type": "Ethernet/IPv6/SCTP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv6_src": "2001:db8::10",
        "ipv6_dst": "2001:db8::20",
        "ipv6_traffic_class": 0xAB,
        "ipv6_flow_label": 0x12345,
        "ipv6_hop_limit": 42,
        "l4_src_port_override": True,
        "l4_src_port": 2905,
        "l4_dst_port_override": True,
        "l4_dst_port": 2906,
        "sctp_verification_tag": 0x10203040,
        "sctp_data_flags": 3,
        "sctp_tsn": 0xABCDEF01,
        "sctp_stream_id": 7,
        "sctp_stream_sequence": 9,
        "sctp_payload_protocol_id": 0x11223344,
        "payload_pattern": "a1b2",
    }

    saved = service.save_workbench_profile("ipv6-sctp-profile.yaml", [stream])
    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("ipv6-sctp.pcap", exported.data["content_base64"])

    assert saved.ok is True
    preview = saved.data["packet_previews"][0]
    packet = base64.b64decode(preview["binary_base64"])
    ip_offset = 14
    l4_offset = ip_offset + 40
    ipv6_payload_length = int.from_bytes(packet[ip_offset + 4 : ip_offset + 6], "big")
    sctp_segment = packet[l4_offset : l4_offset + ipv6_payload_length]
    checksum = int.from_bytes(sctp_segment[8:12], "little")
    zeroed_segment = sctp_segment[:8] + b"\x00\x00\x00\x00" + sctp_segment[12:]

    assert preview["wire_length"] == 128
    assert packet[12:14] == b"\x86\xdd"
    assert packet[ip_offset + 6] == 132
    assert packet[ip_offset + 7] == 42
    assert packet[ip_offset + 8 : ip_offset + 24] == ipaddress.IPv6Address("2001:db8::10").packed
    assert packet[ip_offset + 24 : ip_offset + 40] == ipaddress.IPv6Address("2001:db8::20").packed
    assert int.from_bytes(sctp_segment[0:2], "big") == 2905
    assert int.from_bytes(sctp_segment[2:4], "big") == 2906
    assert int.from_bytes(sctp_segment[4:8], "big") == 0x10203040
    assert checksum == _sctp_crc32c(zeroed_segment)
    assert int.from_bytes(sctp_segment[16:20], "big") == 0xABCDEF01
    assert int.from_bytes(sctp_segment[20:22], "big") == 7
    assert int.from_bytes(sctp_segment[22:24], "big") == 9
    assert int.from_bytes(sctp_segment[24:28], "big") == 0x11223344
    assert [layer["name"] for layer in preview["layers"][:4]] == [
        "Ethernet",
        "Internet Protocol v6",
        "SCTP",
        "Payload",
    ]
    assert preview["layers"][2]["fields"]["tsn"] == 0xABCDEF01

    loaded = service.load_workbench_profile("ipv6-sctp-profile.yaml")

    assert loaded.ok is True
    assert loaded.data["streams"][0]["packet_type"] == "Ethernet/IPv6/SCTP"
    assert loaded.data["streams"][0]["sctp_verification_tag"] == 0x10203040
    assert exported.ok is True
    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv6/SCTP"
    assert imported_stream["ipv6_src"] == "2001:db8::10"
    assert imported_stream["ipv6_dst"] == "2001:db8::20"
    assert imported_stream["l4_src_port"] == 2905
    assert imported_stream["l4_dst_port"] == 2906
    assert imported_stream["sctp_tsn"] == 0xABCDEF01
    assert imported.data["packet_previews"][0]["layers"][2]["name"] == "SCTP"


def test_workbench_profile_renders_ipv6_sctp_tsn_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "ipv6-sctp-tsn-fe.yaml",
        [
            {
                "name": "ipv6-sctp-tsn-fe",
                "packet_type": "Ethernet/IPv6/SCTP",
                "frame_length": 128,
                "l4_src_port_override": True,
                "l4_src_port": 2905,
                "l4_dst_port_override": True,
                "l4_dst_port": 2906,
                "sctp_tsn": 100,
                "sctp_tsn_mode": "Increment",
                "sctp_tsn_count": 4,
                "sctp_tsn_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "sctp_tsn"
    assert vm["instructions"][1] == {
        "add_value": 0,
        "is_big_endian": True,
        "name": "sctp_tsn",
        "pkt_offset": 70,
        "type": "write_flow_var",
    }
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[70:74], "big") == 100
    assert int.from_bytes(packet[62:66], "little") == 0


def test_workbench_profile_renders_vxlan_vni_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "vxlan-vni-fe.yaml",
        [
            {
                "name": "vxlan-vni-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "vxlan_enabled": True,
                "vxlan_vni": 4096,
                "vxlan_vni_mode": "Increment",
                "vxlan_vni_count": 4,
                "vxlan_vni_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "vxlan_vni"
    assert vm["instructions"] == [
        {
            "init_value": 4096,
            "max_value": 4099,
            "min_value": 4096,
            "name": "vxlan_vni",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFFFFFF00,
            "name": "vxlan_vni",
            "pkt_cast_size": 4,
            "pkt_offset": 46,
            "shift": 8,
            "type": "write_mask_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert int.from_bytes(packet[46:49], "big") == 4096
    assert packet[49] == 0
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vxlan"]["vni_mode"] == "Increment"
    assert packet_meta["vxlan"]["vni_count"] == "4"
    assert packet_meta["vxlan"]["vni_step"] == "1"
    assert saved.data["packet_previews"][0]["layers"][3]["fields"]["vni_mode"] == "Increment"

    loaded = service.load_workbench_profile("vxlan-vni-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vxlan_enabled"] is True
    assert loaded_stream["vxlan_vni"] == 4096
    assert loaded_stream["vxlan_vni_mode"] == "Increment"
    assert loaded_stream["vxlan_vni_count"] == 4
    assert loaded_stream["vxlan_vni_step"] == 1


def test_workbench_profile_renders_vxlan_inner_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "vxlan-inner-fe.yaml",
        [
            {
                "name": "vxlan-inner-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "vxlan_enabled": True,
                "vxlan_vni": 4096,
                "vxlan_inner_ipv4_src": "10.1.0.10",
                "vxlan_inner_ipv4_src_mode": "Increment Host",
                "vxlan_inner_ipv4_src_count": 4,
                "vxlan_inner_ipv4_src_step": 1,
                "vxlan_inner_ipv4_dst": "10.1.0.20",
                "vxlan_inner_ipv4_dst_mode": "Increment Host",
                "vxlan_inner_ipv4_dst_count": 4,
                "vxlan_inner_ipv4_dst_step": 1,
                "vxlan_inner_ipv4_ttl": 40,
                "vxlan_inner_ipv4_ttl_mode": "Increment",
                "vxlan_inner_ipv4_ttl_count": 4,
                "vxlan_inner_ipv4_ttl_step": 1,
                "vxlan_inner_l4_src_port": 32000,
                "vxlan_inner_l4_src_port_mode": "Increment",
                "vxlan_inner_l4_src_port_count": 4,
                "vxlan_inner_l4_src_port_step": 1,
                "vxlan_inner_l4_dst_port": 32100,
                "vxlan_inner_l4_dst_port_mode": "Increment",
                "vxlan_inner_l4_dst_port_count": 4,
                "vxlan_inner_l4_dst_port_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "vxlan_inner_udp_src"
    assert {
        "init_value": 20,
        "max_value": 23,
        "min_value": 20,
        "name": "vxlan_inner_ipv4_dst",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_ipv4_dst",
        "pkt_offset": 83,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 10,
        "max_value": 13,
        "min_value": 10,
        "name": "vxlan_inner_ipv4_src",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_ipv4_src",
        "pkt_offset": 79,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 40,
        "max_value": 43,
        "min_value": 40,
        "name": "vxlan_inner_ipv4_ttl",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_ipv4_ttl",
        "pkt_offset": 72,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32100,
        "max_value": 32103,
        "min_value": 32100,
        "name": "vxlan_inner_udp_dst",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_udp_dst",
        "pkt_offset": 86,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32000,
        "max_value": 32003,
        "min_value": 32000,
        "name": "vxlan_inner_udp_src",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_udp_src",
        "pkt_offset": 84,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 64, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vxlan"]["inner_ipv4"]["src_mode"] == "Increment Host"
    assert packet_meta["vxlan"]["inner_ipv4"]["dst_mode"] == "Increment Host"
    assert packet_meta["vxlan"]["inner_ipv4"]["ttl_mode"] == "Increment"
    assert packet_meta["vxlan"]["inner_udp"]["src_port_mode"] == "Increment"
    assert packet_meta["vxlan"]["inner_udp"]["dst_port_mode"] == "Increment"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[5]["fields"]["source_mode"] == "Increment Host"
    assert layers[5]["fields"]["ttl_mode"] == "Increment"
    assert layers[6]["fields"]["destination_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("vxlan-inner-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vxlan_inner_ipv4_src_mode"] == "Increment Host"
    assert loaded_stream["vxlan_inner_ipv4_src_count"] == 4
    assert loaded_stream["vxlan_inner_ipv4_src_step"] == 1
    assert loaded_stream["vxlan_inner_ipv4_dst_mode"] == "Increment Host"
    assert loaded_stream["vxlan_inner_ipv4_dst_count"] == 4
    assert loaded_stream["vxlan_inner_ipv4_dst_step"] == 1
    assert loaded_stream["vxlan_inner_ipv4_ttl_mode"] == "Increment"
    assert loaded_stream["vxlan_inner_ipv4_ttl_count"] == 4
    assert loaded_stream["vxlan_inner_ipv4_ttl_step"] == 1
    assert loaded_stream["vxlan_inner_l4_src_port_mode"] == "Increment"
    assert loaded_stream["vxlan_inner_l4_src_port_count"] == 4
    assert loaded_stream["vxlan_inner_l4_src_port_step"] == 1
    assert loaded_stream["vxlan_inner_l4_dst_port_mode"] == "Increment"
    assert loaded_stream["vxlan_inner_l4_dst_port_count"] == 4
    assert loaded_stream["vxlan_inner_l4_dst_port_step"] == 1


def test_workbench_profile_renders_vxlan_inner_ipv6_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "vxlan-inner-ipv6-fe.yaml",
        [
            {
                "name": "vxlan-inner-ipv6-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "vxlan_enabled": True,
                "vxlan_vni": 4096,
                "vxlan_inner_ip_version": "IPv6",
                "vxlan_inner_ipv6_src": "2001:db8:50::10",
                "vxlan_inner_ipv6_src_mode": "Increment Host",
                "vxlan_inner_ipv6_src_count": 4,
                "vxlan_inner_ipv6_src_step": 1,
                "vxlan_inner_ipv6_dst": "2001:db8:50::20",
                "vxlan_inner_ipv6_dst_mode": "Increment Host",
                "vxlan_inner_ipv6_dst_count": 4,
                "vxlan_inner_ipv6_dst_step": 1,
                "vxlan_inner_ipv6_hop_limit": 40,
                "vxlan_inner_ipv6_hop_limit_mode": "Increment",
                "vxlan_inner_ipv6_hop_limit_count": 4,
                "vxlan_inner_ipv6_hop_limit_step": 1,
                "vxlan_inner_l4_src_port": 32000,
                "vxlan_inner_l4_src_port_mode": "Increment",
                "vxlan_inner_l4_src_port_count": 4,
                "vxlan_inner_l4_src_port_step": 1,
                "vxlan_inner_l4_dst_port": 32100,
                "vxlan_inner_l4_dst_port_mode": "Increment",
                "vxlan_inner_l4_dst_port_count": 4,
                "vxlan_inner_l4_dst_port_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "vxlan_inner_udp_src"
    assert {
        "init_value": 32,
        "max_value": 35,
        "min_value": 32,
        "name": "vxlan_inner_ipv6_dst",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_ipv6_dst",
        "pkt_offset": 103,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 16,
        "max_value": 19,
        "min_value": 16,
        "name": "vxlan_inner_ipv6_src",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_ipv6_src",
        "pkt_offset": 87,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 40,
        "max_value": 43,
        "min_value": 40,
        "name": "vxlan_inner_ipv6_hop_limit",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_ipv6_hop_limit",
        "pkt_offset": 71,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32100,
        "max_value": 32103,
        "min_value": 32100,
        "name": "vxlan_inner_udp_dst",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_udp_dst",
        "pkt_offset": 106,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 32000,
        "max_value": 32003,
        "min_value": 32000,
        "name": "vxlan_inner_udp_src",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "vxlan_inner_udp_src",
        "pkt_offset": 104,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 64, "l3_len": 40, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["vxlan"]["inner_ip_version"] == "IPv6"
    assert packet_meta["vxlan"]["inner_ipv6"]["src_mode"] == "Increment Host"
    assert packet_meta["vxlan"]["inner_ipv6"]["src_count"] == "4"
    assert packet_meta["vxlan"]["inner_ipv6"]["src_step"] == "1"
    assert packet_meta["vxlan"]["inner_ipv6"]["dst_mode"] == "Increment Host"
    assert packet_meta["vxlan"]["inner_ipv6"]["dst_count"] == "4"
    assert packet_meta["vxlan"]["inner_ipv6"]["dst_step"] == "1"
    assert packet_meta["vxlan"]["inner_ipv6"]["hop_limit_mode"] == "Increment"
    assert packet_meta["vxlan"]["inner_ipv6"]["hop_limit_count"] == "4"
    assert packet_meta["vxlan"]["inner_ipv6"]["hop_limit_step"] == "1"
    assert packet_meta["vxlan"]["inner_udp"]["src_port_mode"] == "Increment"
    assert packet_meta["vxlan"]["inner_udp"]["dst_port_mode"] == "Increment"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[5]["name"] == "Inner Internet Protocol v6"
    assert layers[5]["fields"]["source_mode"] == "Increment Host"
    assert layers[5]["fields"]["destination_mode"] == "Increment Host"
    assert layers[5]["fields"]["hop_limit_mode"] == "Increment"
    assert layers[6]["fields"]["source_port_mode"] == "Increment"
    assert layers[6]["fields"]["destination_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("vxlan-inner-ipv6-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["vxlan_inner_ip_version"] == "IPv6"
    assert loaded_stream["vxlan_inner_ipv6_src_mode"] == "Increment Host"
    assert loaded_stream["vxlan_inner_ipv6_src_count"] == 4
    assert loaded_stream["vxlan_inner_ipv6_src_step"] == 1
    assert loaded_stream["vxlan_inner_ipv6_dst_mode"] == "Increment Host"
    assert loaded_stream["vxlan_inner_ipv6_dst_count"] == 4
    assert loaded_stream["vxlan_inner_ipv6_dst_step"] == 1
    assert loaded_stream["vxlan_inner_ipv6_hop_limit_mode"] == "Increment"
    assert loaded_stream["vxlan_inner_ipv6_hop_limit_count"] == 4
    assert loaded_stream["vxlan_inner_ipv6_hop_limit_step"] == 1
    assert loaded_stream["vxlan_inner_l4_src_port_mode"] == "Increment"
    assert loaded_stream["vxlan_inner_l4_src_port_count"] == 4
    assert loaded_stream["vxlan_inner_l4_src_port_step"] == 1
    assert loaded_stream["vxlan_inner_l4_dst_port_mode"] == "Increment"
    assert loaded_stream["vxlan_inner_l4_dst_port_count"] == 4
    assert loaded_stream["vxlan_inner_l4_dst_port_step"] == 1


def test_workbench_profile_renders_gtpu_teid_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-teid-fe.yaml",
        [
            {
                "name": "gtpu-teid-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 96,
                "gtpu_enabled": True,
                "gtpu_teid": 0xABCDEF01,
                "gtpu_teid_mode": "Increment",
                "gtpu_teid_count": 4,
                "gtpu_teid_step": 1,
                "gtpu_inner_ipv4_src": "10.9.0.1",
                "gtpu_inner_ipv4_dst": "10.9.0.2",
                "gtpu_inner_l4_src_port": 5000,
                "gtpu_inner_l4_dst_port": 6000,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "gtpu_teid"
    assert vm["instructions"] == [
        {
            "init_value": 0xABCDEF01,
            "max_value": 0xABCDEF04,
            "min_value": 0xABCDEF01,
            "name": "gtpu_teid",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "gtpu_teid",
            "pkt_offset": 46,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[42:46] == bytes.fromhex("30ff002a")
    assert int.from_bytes(packet[46:50], "big") == 0xABCDEF01
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["teid_mode"] == "Increment"
    assert packet_meta["gtpu"]["teid_count"] == "4"
    assert packet_meta["gtpu"]["teid_step"] == "1"
    assert saved.data["packet_previews"][0]["layers"][3]["fields"]["teid_mode"] == "Increment"

    loaded = service.load_workbench_profile("gtpu-teid-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_enabled"] is True
    assert loaded_stream["gtpu_teid"] == 0xABCDEF01
    assert loaded_stream["gtpu_teid_mode"] == "Increment"
    assert loaded_stream["gtpu_teid_count"] == 4
    assert loaded_stream["gtpu_teid_step"] == 1


def test_workbench_profile_renders_gtpu_inner_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-inner-fe.yaml",
        [
            {
                "name": "gtpu-inner-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 96,
                "gtpu_enabled": True,
                "gtpu_teid": 0xABCDEF01,
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
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert vm["split_by_var"] == "gtpu_inner_udp_src"
    assert {
        "init_value": 2,
        "max_value": 5,
        "min_value": 2,
        "name": "gtpu_inner_ipv4_dst",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv4_dst",
        "pkt_offset": 69,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 1,
        "max_value": 4,
        "min_value": 1,
        "name": "gtpu_inner_ipv4_src",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv4_src",
        "pkt_offset": 65,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 40,
        "max_value": 43,
        "min_value": 40,
        "name": "gtpu_inner_ipv4_ttl",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv4_ttl",
        "pkt_offset": 58,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 6000,
        "max_value": 6003,
        "min_value": 6000,
        "name": "gtpu_inner_udp_dst",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_udp_dst",
        "pkt_offset": 72,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 5000,
        "max_value": 5003,
        "min_value": 5000,
        "name": "gtpu_inner_udp_src",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_udp_src",
        "pkt_offset": 70,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 50, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["inner_ipv4"]["src_mode"] == "Increment Host"
    assert packet_meta["gtpu"]["inner_ipv4"]["dst_mode"] == "Increment Host"
    assert packet_meta["gtpu"]["inner_ipv4"]["ttl_mode"] == "Increment"
    assert packet_meta["gtpu"]["inner_udp"]["src_port_mode"] == "Increment"
    assert packet_meta["gtpu"]["inner_udp"]["dst_port_mode"] == "Increment"
    layers = saved.data["packet_previews"][0]["layers"]
    assert layers[4]["fields"]["source_mode"] == "Increment Host"
    assert layers[4]["fields"]["ttl_mode"] == "Increment"
    assert layers[5]["fields"]["destination_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("gtpu-inner-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_inner_ipv4_src_mode"] == "Increment Host"
    assert loaded_stream["gtpu_inner_ipv4_src_count"] == 4
    assert loaded_stream["gtpu_inner_ipv4_src_step"] == 1
    assert loaded_stream["gtpu_inner_ipv4_dst_mode"] == "Increment Host"
    assert loaded_stream["gtpu_inner_ipv4_dst_count"] == 4
    assert loaded_stream["gtpu_inner_ipv4_dst_step"] == 1
    assert loaded_stream["gtpu_inner_ipv4_ttl_mode"] == "Increment"
    assert loaded_stream["gtpu_inner_ipv4_ttl_count"] == 4
    assert loaded_stream["gtpu_inner_ipv4_ttl_step"] == 1
    assert loaded_stream["gtpu_inner_l4_src_port_mode"] == "Increment"
    assert loaded_stream["gtpu_inner_l4_src_port_count"] == 4
    assert loaded_stream["gtpu_inner_l4_src_port_step"] == 1
    assert loaded_stream["gtpu_inner_l4_dst_port_mode"] == "Increment"
    assert loaded_stream["gtpu_inner_l4_dst_port_count"] == 4
    assert loaded_stream["gtpu_inner_l4_dst_port_step"] == 1


def test_workbench_profile_renders_gtpu_optional_header_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-optional-fe.yaml",
        [
            {
                "name": "gtpu-optional-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 100,
                "gtpu_enabled": True,
                "gtpu_teid": 0xABCDEF01,
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
                "gtpu_inner_ipv4_src": "10.9.0.1",
                "gtpu_inner_ipv4_dst": "10.9.0.2",
                "gtpu_inner_ipv4_ttl": 40,
                "gtpu_inner_ipv4_ttl_mode": "Increment",
                "gtpu_inner_ipv4_ttl_count": 4,
                "gtpu_inner_ipv4_ttl_step": 1,
                "gtpu_inner_l4_src_port": 5000,
                "gtpu_inner_l4_dst_port": 6000,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[42] == 0x33
    assert packet[43] == 0xFF
    assert int.from_bytes(packet[46:50], "big") == 0xABCDEF01
    assert int.from_bytes(packet[50:52], "big") == 7
    assert packet[52] == 3
    assert packet[53] == 0
    assert packet[54] >> 4 == 4
    assert packet[62] == 40
    assert packet[66:70] == ipaddress.IPv4Address("10.9.0.1").packed
    assert packet[70:74] == ipaddress.IPv4Address("10.9.0.2").packed
    assert int.from_bytes(packet[74:76], "big") == 5000
    assert int.from_bytes(packet[76:78], "big") == 6000

    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert {
        "init_value": 7,
        "max_value": 10,
        "min_value": 7,
        "name": "gtpu_sequence",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_sequence",
        "pkt_offset": 50,
        "type": "write_flow_var",
    } in instructions
    assert {
        "init_value": 3,
        "max_value": 6,
        "min_value": 3,
        "name": "gtpu_npdu",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_npdu",
        "pkt_offset": 52,
        "type": "write_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv4_ttl",
        "pkt_offset": 62,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 54, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["sequence_enabled"] is True
    assert packet_meta["gtpu"]["sequence"] == "7"
    assert packet_meta["gtpu"]["sequence_mode"] == "Increment"
    assert packet_meta["gtpu"]["n_pdu_enabled"] is True
    assert packet_meta["gtpu"]["n_pdu_number"] == "3"
    assert packet_meta["gtpu"]["n_pdu_mode"] == "Increment"
    fields = saved.data["packet_previews"][0]["layers"][3]["fields"]
    assert fields["flags"] == "0x33"
    assert fields["sequence_enabled"] is True
    assert fields["sequence_mode"] == "Increment"
    assert fields["n_pdu_enabled"] is True
    assert fields["n_pdu_mode"] == "Increment"

    loaded = service.load_workbench_profile("gtpu-optional-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_sequence_enabled"] is True
    assert loaded_stream["gtpu_sequence"] == 7
    assert loaded_stream["gtpu_sequence_mode"] == "Increment"
    assert loaded_stream["gtpu_sequence_count"] == 4
    assert loaded_stream["gtpu_npdu_enabled"] is True
    assert loaded_stream["gtpu_npdu"] == 3
    assert loaded_stream["gtpu_npdu_mode"] == "Increment"
    assert loaded_stream["gtpu_npdu_count"] == 4


def test_workbench_profile_renders_gtpu_udp_port_extension_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "gtpu-extension-fe.yaml",
        [
            {
                "name": "gtpu-extension-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 108,
                "gtpu_enabled": True,
                "gtpu_teid": 0xABCDEF01,
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
                "gtpu_inner_ipv4_src": "10.9.0.1",
                "gtpu_inner_ipv4_dst": "10.9.0.2",
                "gtpu_inner_ipv4_ttl": 40,
                "gtpu_inner_ipv4_ttl_mode": "Increment",
                "gtpu_inner_ipv4_ttl_count": 4,
                "gtpu_inner_ipv4_ttl_step": 1,
                "gtpu_inner_l4_src_port": 5000,
                "gtpu_inner_l4_dst_port": 6000,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    assert packet[42] == 0x37
    assert packet[43] == 0xFF
    assert int.from_bytes(packet[46:50], "big") == 0xABCDEF01
    assert int.from_bytes(packet[50:52], "big") == 7
    assert packet[52] == 3
    assert packet[53] == 0x40
    assert packet[54] == 1
    assert int.from_bytes(packet[55:57], "big") == 65000
    assert packet[57] == 0
    assert packet[58] >> 4 == 4
    assert packet[66] == 40
    assert packet[70:74] == ipaddress.IPv4Address("10.9.0.1").packed
    assert packet[74:78] == ipaddress.IPv4Address("10.9.0.2").packed
    assert int.from_bytes(packet[78:80], "big") == 5000
    assert int.from_bytes(packet[80:82], "big") == 6000

    vm = entry["stream"]["vm"]
    instructions = vm["instructions"]
    assert {
        "init_value": 65000,
        "max_value": 65003,
        "min_value": 65000,
        "name": "gtpu_extension_udp_port",
        "op": "inc",
        "size": 2,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_extension_udp_port",
        "pkt_offset": 55,
        "type": "write_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "gtpu_inner_ipv4_ttl",
        "pkt_offset": 66,
        "type": "write_flow_var",
    } in instructions
    assert instructions[-1] == {"l2_len": 58, "l3_len": 20, "l4_type": 11, "type": "fix_checksum_hw"}

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["gtpu"]["extension_enabled"] is True
    assert packet_meta["gtpu"]["extension_type"] == "udp_port"
    assert packet_meta["gtpu"]["extension_udp_port"] == "65000"
    assert packet_meta["gtpu"]["extension_udp_port_mode"] == "Increment"
    fields = saved.data["packet_previews"][0]["layers"][3]["fields"]
    assert fields["flags"] == "0x37"
    assert fields["next_extension_header"] == "0x40"
    assert fields["extension_enabled"] is True
    assert fields["extension_type"] == "UDP Port"
    assert fields["extension_udp_port"] == 65000
    assert fields["extension_udp_port_mode"] == "Increment"

    loaded = service.load_workbench_profile("gtpu-extension-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["gtpu_extension_enabled"] is True
    assert loaded_stream["gtpu_extension_udp_port"] == 65000
    assert loaded_stream["gtpu_extension_udp_port_mode"] == "Increment"
    assert loaded_stream["gtpu_extension_udp_port_count"] == 4


def test_workbench_profile_renders_mpls_label_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "mpls-label-fe.yaml",
        [
            {
                "name": "mpls-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "mpls_enabled": True,
                "mpls_label": 17,
                "mpls_label_mode": "Increment",
                "mpls_label_count": 2000,
                "mpls_label_step": 2,
                "mpls_tc": 1,
                "mpls_ttl": 64,
            },
            {
                "name": "vlan-mpls-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "vlan_enabled": True,
                "vlan_id": 100,
                "mpls_enabled": True,
                "mpls_label": 1024,
                "mpls_label_mode": "Random",
                "mpls_label_count": 16,
                "mpls_label_step": 1,
            },
        ],
    )

    assert saved.ok is True
    entries = yaml.safe_load(saved.data["content"])
    vm = entries[0]["stream"]["vm"]
    assert vm["split_by_var"] == "mpls_label"
    assert vm["instructions"] == [
        {
            "init_value": 17,
            "max_value": 2016,
            "min_value": 17,
            "name": "mpls_label",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFFFFF000,
            "name": "mpls_label",
            "pkt_cast_size": 4,
            "pkt_offset": 14,
            "shift": 12,
            "type": "write_mask_flow_var",
        },
    ]
    packet_meta = yaml.safe_load(base64.b64decode(entries[0]["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["mpls"]["label_mode"] == "Increment"
    assert packet_meta["mpls"]["label_count"] == "2000"
    assert packet_meta["mpls"]["label_step"] == "2"

    vlan_vm = entries[1]["stream"]["vm"]
    assert vlan_vm["split_by_var"] == ""
    assert vlan_vm["instructions"][1] == {
        "add_value": 0,
        "is_big_endian": True,
        "mask": 0xFFFFF000,
        "name": "mpls_label",
        "pkt_cast_size": 4,
        "pkt_offset": 18,
        "shift": 12,
        "type": "write_mask_flow_var",
    }

    loaded = service.load_workbench_profile("mpls-label-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["mpls_label_mode"] == "Increment"
    assert loaded_stream["mpls_label_count"] == 2000
    assert loaded_stream["mpls_label_step"] == 2


def test_workbench_profile_renders_mpls_tc_ttl_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "mpls-tc-ttl-fe.yaml",
        [
            {
                "name": "mpls-tc-ttl-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "mpls_enabled": True,
                "mpls_label": 100,
                "mpls_tc": 1,
                "mpls_tc_mode": "Increment",
                "mpls_tc_count": 4,
                "mpls_tc_step": 1,
                "mpls_ttl": 40,
                "mpls_ttl_mode": "Increment",
                "mpls_ttl_count": 4,
                "mpls_ttl_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    vm = entry["stream"]["vm"]
    assert vm["split_by_var"] == "mpls_ttl"
    assert vm["instructions"] == [
        {
            "init_value": 1,
            "max_value": 4,
            "min_value": 1,
            "name": "mpls_tc",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x00000E00,
            "name": "mpls_tc",
            "pkt_cast_size": 4,
            "pkt_offset": 14,
            "shift": 9,
            "type": "write_mask_flow_var",
        },
        {
            "init_value": 40,
            "max_value": 43,
            "min_value": 40,
            "name": "mpls_ttl",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "mpls_ttl",
            "pkt_offset": 17,
            "type": "write_flow_var",
        },
    ]
    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    mpls_word = int.from_bytes(packet[14:18], "big")
    assert (mpls_word >> 12) & 0xFFFFF == 100
    assert (mpls_word >> 9) & 0x7 == 1
    assert (mpls_word >> 8) & 0x1 == 1
    assert mpls_word & 0xFF == 40
    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["mpls"]["traffic_class"] == "1"
    assert packet_meta["mpls"]["traffic_class_mode"] == "Increment"
    assert packet_meta["mpls"]["traffic_class_count"] == "4"
    assert packet_meta["mpls"]["traffic_class_step"] == "1"
    assert packet_meta["mpls"]["ttl"] == "40"
    assert packet_meta["mpls"]["ttl_mode"] == "Increment"
    assert packet_meta["mpls"]["ttl_count"] == "4"
    assert packet_meta["mpls"]["ttl_step"] == "1"
    preview_fields = saved.data["packet_previews"][0]["layers"][1]["fields"]
    assert preview_fields["label"] == 100
    assert preview_fields["traffic_class"] == 1
    assert preview_fields["traffic_class_mode"] == "Increment"
    assert preview_fields["traffic_class_count"] == 4
    assert preview_fields["traffic_class_step"] == 1
    assert preview_fields["ttl"] == 40
    assert preview_fields["ttl_mode"] == "Increment"
    assert preview_fields["ttl_count"] == 4
    assert preview_fields["ttl_step"] == 1

    loaded = service.load_workbench_profile("mpls-tc-ttl-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["mpls_enabled"] is True
    assert loaded_stream["mpls_label"] == 100
    assert loaded_stream["mpls_tc"] == 1
    assert loaded_stream["mpls_tc_mode"] == "Increment"
    assert loaded_stream["mpls_tc_count"] == 4
    assert loaded_stream["mpls_tc_step"] == 1
    assert loaded_stream["mpls_ttl"] == 40
    assert loaded_stream["mpls_ttl_mode"] == "Increment"
    assert loaded_stream["mpls_ttl_count"] == 4
    assert loaded_stream["mpls_ttl_step"] == 1


def test_workbench_profile_renders_mpls_label_stack_field_engine_vm(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    saved = service.save_workbench_profile(
        "mpls-stack-fe.yaml",
        [
            {
                "name": "mpls-stack-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 128,
                "mpls_enabled": True,
                "mpls_label": 100,
                "mpls_tc": 1,
                "mpls_ttl": 40,
                "mpls_label2_enabled": True,
                "mpls_label2": 200,
                "mpls_label2_mode": "Increment",
                "mpls_label2_count": 4,
                "mpls_label2_step": 1,
                "mpls_label2_tc": 2,
                "mpls_label2_tc_mode": "Increment",
                "mpls_label2_tc_count": 4,
                "mpls_label2_tc_step": 1,
                "mpls_label2_ttl": 50,
                "mpls_label2_ttl_mode": "Increment",
                "mpls_label2_ttl_count": 4,
                "mpls_label2_ttl_step": 1,
                "mpls_label3_enabled": True,
                "mpls_label3": 300,
                "mpls_label3_mode": "Increment",
                "mpls_label3_count": 4,
                "mpls_label3_step": 1,
                "mpls_label3_tc": 3,
                "mpls_label3_tc_mode": "Increment",
                "mpls_label3_tc_count": 4,
                "mpls_label3_tc_step": 1,
                "mpls_label3_ttl": 60,
                "mpls_label3_ttl_mode": "Increment",
                "mpls_label3_ttl_count": 4,
                "mpls_label3_ttl_step": 1,
            }
        ],
    )

    assert saved.ok is True
    entry = yaml.safe_load(saved.data["content"])[0]
    instructions = entry["stream"]["vm"]["instructions"]
    assert entry["stream"]["vm"]["split_by_var"] == "mpls_label3_ttl"
    assert {
        "init_value": 200,
        "max_value": 203,
        "min_value": 200,
        "name": "mpls_label2",
        "op": "inc",
        "size": 1,
        "step": 1,
        "type": "flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "mask": 0xFFFFF000,
        "name": "mpls_label2",
        "pkt_cast_size": 4,
        "pkt_offset": 18,
        "shift": 12,
        "type": "write_mask_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "mask": 0x00000E00,
        "name": "mpls_label2_tc",
        "pkt_cast_size": 4,
        "pkt_offset": 18,
        "shift": 9,
        "type": "write_mask_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "mpls_label2_ttl",
        "pkt_offset": 21,
        "type": "write_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "mask": 0xFFFFF000,
        "name": "mpls_label3",
        "pkt_cast_size": 4,
        "pkt_offset": 22,
        "shift": 12,
        "type": "write_mask_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "mask": 0x00000E00,
        "name": "mpls_label3_tc",
        "pkt_cast_size": 4,
        "pkt_offset": 22,
        "shift": 9,
        "type": "write_mask_flow_var",
    } in instructions
    assert {
        "add_value": 0,
        "is_big_endian": True,
        "name": "mpls_label3_ttl",
        "pkt_offset": 25,
        "type": "write_flow_var",
    } in instructions

    packet = base64.b64decode(entry["stream"]["packet"]["binary"])
    label_words = [int.from_bytes(packet[offset : offset + 4], "big") for offset in (14, 18, 22)]
    assert [(word >> 12) & 0xFFFFF for word in label_words] == [100, 200, 300]
    assert [(word >> 9) & 0x7 for word in label_words] == [1, 2, 3]
    assert [(word >> 8) & 0x1 for word in label_words] == [0, 0, 1]
    assert [word & 0xFF for word in label_words] == [40, 50, 60]

    packet_meta = yaml.safe_load(base64.b64decode(entry["stream"]["packet"]["meta"]).decode("utf-8"))
    assert packet_meta["mpls"]["labels"][1]["label_mode"] == "Increment"
    assert packet_meta["mpls"]["labels"][1]["traffic_class_mode"] == "Increment"
    assert packet_meta["mpls"]["labels"][1]["ttl_mode"] == "Increment"
    assert packet_meta["mpls"]["labels"][2]["label_mode"] == "Increment"
    assert packet_meta["mpls"]["labels"][2]["traffic_class_mode"] == "Increment"
    assert packet_meta["mpls"]["labels"][2]["ttl_mode"] == "Increment"
    preview_layers = saved.data["packet_previews"][0]["layers"]
    assert preview_layers[2]["fields"]["label_mode"] == "Increment"
    assert preview_layers[2]["fields"]["traffic_class_mode"] == "Increment"
    assert preview_layers[2]["fields"]["ttl_mode"] == "Increment"
    assert preview_layers[3]["fields"]["label_mode"] == "Increment"
    assert preview_layers[3]["fields"]["traffic_class_mode"] == "Increment"
    assert preview_layers[3]["fields"]["ttl_mode"] == "Increment"

    loaded = service.load_workbench_profile("mpls-stack-fe.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["mpls_label2_mode"] == "Increment"
    assert loaded_stream["mpls_label2_count"] == 4
    assert loaded_stream["mpls_label2_step"] == 1
    assert loaded_stream["mpls_label2_tc_mode"] == "Increment"
    assert loaded_stream["mpls_label2_tc_count"] == 4
    assert loaded_stream["mpls_label2_tc_step"] == 1
    assert loaded_stream["mpls_label2_ttl_mode"] == "Increment"
    assert loaded_stream["mpls_label2_ttl_count"] == 4
    assert loaded_stream["mpls_label2_ttl_step"] == 1
    assert loaded_stream["mpls_label3_mode"] == "Increment"
    assert loaded_stream["mpls_label3_count"] == 4
    assert loaded_stream["mpls_label3_step"] == 1
    assert loaded_stream["mpls_label3_tc_mode"] == "Increment"
    assert loaded_stream["mpls_label3_tc_count"] == 4
    assert loaded_stream["mpls_label3_tc_step"] == 1
    assert loaded_stream["mpls_label3_ttl_mode"] == "Increment"
    assert loaded_stream["mpls_label3_ttl_count"] == 4
    assert loaded_stream["mpls_label3_ttl_step"] == 1


def test_workbench_render_rejects_malformed_payload_pattern(tmp_path: Path) -> None:
    result = RealStlClientService(env(tmp_path)).render_workbench_profile(
        [{"name": "bad-payload", "payload_pattern": "abc"}]
    )

    assert result.ok is False
    assert result.blocker == "profile_payload_pattern_invalid"
    assert result.error == "payload pattern must contain whole hex bytes"


def test_workbench_profile_renders_original_payload_modes(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))

    increment = service.save_workbench_profile(
        "payload-increment.yaml",
        [
            {
                "name": "payload-inc",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 80,
                "payload_type": "Increment Byte",
                "payload_pattern": "abc",
            }
        ],
    )

    assert increment.ok is True
    packet = base64.b64decode(increment.data["packet_previews"][0]["binary_base64"])
    assert packet[42:50] == bytes(range(1, 9))
    payload_layer = increment.data["packet_previews"][0]["layers"][-1]["fields"]
    assert payload_layer["enabled"] is True
    assert payload_layer["type"] == "Increment Byte"
    assert payload_layer["pattern"] == "00"
    packet_meta = yaml.safe_load(
        base64.b64decode(yaml.safe_load(increment.data["content"])[0]["stream"]["packet"]["meta"]).decode("utf-8")
    )
    assert packet_meta["protocol_selection"]["is_pattern_selected"] is True
    assert packet_meta["payload"]["type"] == "Increment Byte"

    loaded = service.load_workbench_profile("payload-increment.yaml")

    assert loaded.ok is True
    loaded_stream = loaded.data["streams"][0]
    assert loaded_stream["payload_enabled"] is True
    assert loaded_stream["payload_type"] == "Increment Byte"

    disabled = service.render_workbench_profile(
        [
            {
                "name": "payload-none",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length": 80,
                "payload_enabled": False,
                "payload_type": "Random",
                "payload_pattern": "abc",
            }
        ]
    )

    assert disabled.ok is True
    disabled_packet = base64.b64decode(disabled.data["packet_previews"][0]["binary_base64"])
    assert set(disabled_packet[42:]) == {0}
    assert disabled.data["packet_previews"][0]["layers"][-1]["fields"]["enabled"] is False


def test_workbench_export_and_import_pcap_round_trips_packet_binary(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-stream",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 443,
    }

    exported = service.export_workbench_stream_pcap(stream)

    assert exported.ok is True
    assert exported.data["file_name"] == "pcap-stream.pcap"
    pcap_bytes = base64.b64decode(exported.data["content_base64"])
    assert pcap_bytes[:4] == b"\xd4\xc3\xb2\xa1"
    assert struct.unpack("<I", pcap_bytes[20:24])[0] == 1

    imported = service.import_workbench_pcap("pcap-stream.pcap", exported.data["content_base64"])

    assert imported.ok is True
    assert imported.data["packet_count"] == 1
    imported_stream = imported.data["streams"][0]
    assert imported_stream["name"] == "packet_1"
    assert imported_stream["packet_type"] == "Ethernet/IPv4/TCP"
    assert imported_stream["ether_dst"] == "66:55:44:33:22:11"
    assert imported_stream["ether_src"] == "10:20:30:40:50:60"
    assert imported_stream["vlan_enabled"] is False
    assert imported_stream["vlan_tpid"] == "8100"
    assert imported_stream["ipv4_src"] == "10.10.10.1"
    assert imported_stream["ipv4_dst"] == "10.10.10.2"
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 12345
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 443
    assert imported_stream["udp_length_override"] is False
    assert imported_stream["udp_length"] == 26
    assert imported_stream["udp_checksum_override"] is False
    assert imported_stream["udp_checksum"] == "0000"
    assert imported_stream["udp_checksum_mode"] == "Fixed"
    assert imported_stream["udp_checksum_count"] == 16
    assert imported_stream["udp_checksum_step"] == 1
    assert imported_stream["packet_binary_base64"] == exported.data["packet_preview"]["binary_base64"]
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050600800")


def test_workbench_export_and_import_pcap_preserves_sctp_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-sctp",
        "packet_type": "Ethernet/IPv4/SCTP",
        "frame_length": 96,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port_override": True,
        "l4_src_port": 2905,
        "l4_dst_port_override": True,
        "l4_dst_port": 2906,
        "sctp_verification_tag": 0x10203040,
        "sctp_checksum_override": True,
        "sctp_checksum": "11223344",
        "sctp_data_flags": 3,
        "sctp_tsn": 0xABCDEF01,
        "sctp_stream_id": 7,
        "sctp_stream_sequence": 9,
        "sctp_payload_protocol_id": 0x11223344,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-sctp.pcap", exported.data["content_base64"])

    assert exported.ok is True
    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/SCTP"
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 2905
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 2906
    assert imported_stream["sctp_verification_tag"] == 0x10203040
    assert imported_stream["sctp_checksum_override"] is True
    assert imported_stream["sctp_checksum"] == "11223344"
    assert imported_stream["sctp_data_flags"] == 3
    assert imported_stream["sctp_tsn"] == 0xABCDEF01
    assert imported_stream["sctp_stream_id"] == 7
    assert imported_stream["sctp_stream_sequence"] == 9
    assert imported_stream["sctp_payload_protocol_id"] == 0x11223344
    assert imported.data["packet_previews"][0]["layers"][2]["name"] == "SCTP"
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050600800")


def test_workbench_import_pcap_options_build_original_gui_burst_chain(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    forward = {
        "name": "pcap-stream",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 443,
    }
    reverse = {
        **forward,
        "ether_dst": "10:20:30:40:50:60",
        "ether_src": "66:55:44:33:22:11",
        "ipv4_src": "10.10.10.2",
        "ipv4_dst": "10.10.10.1",
        "l4_src_port": 443,
        "l4_dst_port": 12345,
    }

    forward_export = service.export_workbench_stream_pcap(forward)
    reverse_export = service.export_workbench_stream_pcap(reverse)
    packets = [
        base64.b64decode(forward_export.data["packet_preview"]["binary_base64"]),
        base64.b64decode(reverse_export.data["packet_preview"]["binary_base64"]),
    ]
    pcap_bytes = struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65_535, 1)
    for timestamp, packet in zip((0.0, 0.2), packets):
        seconds = int(timestamp)
        microseconds = int((timestamp - seconds) * 1_000_000)
        pcap_bytes += struct.pack("<IIII", seconds, microseconds, len(packet), len(packet)) + packet

    imported = service.import_workbench_pcap(
        "trace.pcap",
        base64.b64encode(pcap_bytes).decode("ascii"),
        options={
            "name_prefix": "trace",
            "rewrite_src_enabled": True,
            "src_address": "20.0.0.1",
            "src_mode": "Increment Host",
            "src_count": 32,
            "rewrite_dst_enabled": True,
            "dst_address": "30.0.0.1",
            "dst_mode": "Random Host",
            "dst_count": 64,
            "rate_mode": "speedup",
            "speedup": 2,
            "ipg": 1,
            "loop_count": 3,
        },
    )

    assert imported.ok is True
    assert imported.data["import_options"] == {
        "name_prefix": "trace",
        "rewrite_src_enabled": True,
        "src_address": "20.0.0.1",
        "src_mode": "Increment Host",
        "src_count": 32,
        "rewrite_dst_enabled": True,
        "dst_address": "30.0.0.1",
        "dst_mode": "Random Host",
        "dst_count": 64,
        "rate_mode": "speedup",
        "speedup": 2.0,
        "ipg": 1.0,
        "loop_count": 3,
    }
    streams = imported.data["streams"]
    assert [stream["name"] for stream in streams] == ["trace_packet_1", "trace_packet_2"]
    assert streams[0]["ipv4_src"] == "20.0.0.1"
    assert streams[0]["ipv4_dst"] == "30.0.0.1"
    assert streams[0]["ipv4_src_mode"] == "Increment Host"
    assert streams[0]["ipv4_src_count"] == 32
    assert streams[0]["ipv4_dst_mode"] == "Random Host"
    assert streams[0]["ipv4_dst_count"] == 64
    assert streams[0]["mode"] == "burst"
    assert streams[0]["self_start"] is True
    assert streams[0]["next_stream_id"] == 2
    assert streams[0]["action_count"] == 0
    assert streams[0]["isg"] == 1.0
    assert streams[0]["rate_value"] == 1.0
    assert streams[1]["ipv4_src"] == "30.0.0.1"
    assert streams[1]["ipv4_dst"] == "20.0.0.1"
    assert streams[1]["ipv4_src_mode"] == "Random Host"
    assert streams[1]["ipv4_src_count"] == 64
    assert streams[1]["ipv4_dst_mode"] == "Increment Host"
    assert streams[1]["ipv4_dst_count"] == 32
    assert streams[1]["mode"] == "burst"
    assert streams[1]["self_start"] is False
    assert streams[1]["next_stream_id"] == 1
    assert streams[1]["action_count"] == 3
    assert abs(streams[1]["isg"] - 0.1) < 0.000001
    assert abs(streams[1]["rate_value"] - 10.0) < 0.000001
    assert imported.data["stream_summaries"][0]["next_stream"] == "trace_packet_2"
    assert imported.data["stream_summaries"][1]["next_stream"] == "trace_packet_1"
    assert base64.b64decode(streams[0]["packet_binary_base64"])[26:34] == bytes([20, 0, 0, 1, 30, 0, 0, 1])
    assert base64.b64decode(streams[1]["packet_binary_base64"])[26:34] == bytes([30, 0, 0, 1, 20, 0, 0, 1])
    assert_ipv4_l4_checksums_valid(base64.b64decode(streams[0]["packet_binary_base64"]))
    assert_ipv4_l4_checksums_valid(base64.b64decode(streams[1]["packet_binary_base64"]))


def test_workbench_export_and_import_pcap_round_trips_l3_l4_none_packets(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    ethernet = {
        "name": "pcap-ethernet",
        "packet_type": "Ethernet",
        "frame_length": 64,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "payload_pattern": "a1 b2",
    }
    ipv4 = {
        "name": "pcap-ipv4",
        "packet_type": "Ethernet/IPv4",
        "frame_length": 64,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "payload_pattern": "a1 b2",
    }

    exported_ethernet = service.export_workbench_stream_pcap(ethernet)
    assert exported_ethernet.ok is True
    imported_ethernet = service.import_workbench_pcap("pcap-ethernet.pcap", exported_ethernet.data["content_base64"])

    assert imported_ethernet.ok is True
    ethernet_stream = imported_ethernet.data["streams"][0]
    assert ethernet_stream["packet_type"] == "Ethernet"
    assert ethernet_stream["ether_dst"] == "66:55:44:33:22:11"
    assert ethernet_stream["ether_src"] == "10:20:30:40:50:60"
    assert ethernet_stream["l4_src_port_override"] is False
    assert ethernet_stream["l4_dst_port_override"] is False
    assert imported_ethernet.data["packet_previews"][0]["layers"][0]["fields"]["type"] == "0xffff"
    assert [layer["name"] for layer in imported_ethernet.data["packet_previews"][0]["layers"]] == [
        "Ethernet",
        "Payload",
    ]

    exported_ipv4 = service.export_workbench_stream_pcap(ipv4)
    assert exported_ipv4.ok is True
    imported_ipv4 = service.import_workbench_pcap("pcap-ipv4.pcap", exported_ipv4.data["content_base64"])

    assert imported_ipv4.ok is True
    ipv4_stream = imported_ipv4.data["streams"][0]
    assert ipv4_stream["packet_type"] == "Ethernet/IPv4"
    assert ipv4_stream["ipv4_src"] == "10.10.10.1"
    assert ipv4_stream["ipv4_dst"] == "10.10.10.2"
    assert ipv4_stream["l4_src_port_override"] is False
    assert ipv4_stream["l4_dst_port_override"] is False
    assert imported_ipv4.data["packet_previews"][0]["layers"][1]["fields"]["protocol"] == "None"
    assert [layer["name"] for layer in imported_ipv4.data["packet_previews"][0]["layers"]] == [
        "Ethernet",
        "Internet Protocol v4",
        "Payload",
    ]


def test_workbench_export_and_import_pcap_round_trips_ipv6_packet(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-ipv6",
        "packet_type": "Ethernet/IPv6/TCP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv6_src": "2001:db8:10::1",
        "ipv6_dst": "2001:db8:20::2",
        "l4_src_port": 12345,
        "l4_dst_port": 443,
        "tcp_flag_syn": True,
    }

    exported = service.export_workbench_stream_pcap(stream)

    assert exported.ok is True
    pcap_bytes = base64.b64decode(exported.data["content_base64"])
    assert pcap_bytes[:4] == b"\xd4\xc3\xb2\xa1"

    imported = service.import_workbench_pcap("pcap-ipv6.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv6/TCP"
    assert imported_stream["ipv6_src"] == "2001:db8:10::1"
    assert imported_stream["ipv6_dst"] == "2001:db8:20::2"
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 12345
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 443
    assert imported_stream["tcp_flag_syn"] is True
    assert imported.data["packet_previews"][0]["layers"][1]["name"] == "Internet Protocol v6"
    assert imported.data["packet_previews"][0]["hex"].startswith("66554433221110203040506086dd")


def test_workbench_export_and_import_pcap_preserves_vlan_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-vlan",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "vlan_enabled": True,
        "vlan_priority": 3,
        "vlan_cfi": 1,
        "vlan_id": 4094,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 5000,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-vlan.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["vlan_enabled"] is True
    assert imported_stream["vlan_tpid_override"] is False
    assert imported_stream["vlan_tpid"] == "8100"
    assert imported_stream["vlan_priority"] == 3
    assert imported_stream["vlan_cfi"] == 1
    assert imported_stream["vlan_id"] == 4094
    assert imported_stream["ipv4_src"] == "10.10.10.1"
    assert imported_stream["ipv4_dst"] == "10.10.10.2"
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 12345
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 5000
    assert imported_stream["udp_length_override"] is True
    assert imported_stream["udp_length"] == int.from_bytes(
        base64.b64decode(imported_stream["packet_binary_base64"])[42:44], "big"
    )
    assert imported_stream["udp_checksum_override"] is True
    assert imported_stream["udp_checksum"] == "0000"
    assert imported_stream["udp_checksum_mode"] == "Fixed"
    assert imported_stream["udp_checksum_count"] == 16
    assert imported_stream["udp_checksum_step"] == 1
    assert imported.data["packet_previews"][0]["layers"][1]["name"] == "802.1Q VLAN"
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050608100")


def test_workbench_export_and_import_pcap_preserves_qinq_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-qinq",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "vlan_enabled": True,
        "vlan_tpid_override": True,
        "vlan_tpid": "88a8",
        "vlan_priority": 3,
        "vlan_cfi": 1,
        "vlan_id": 100,
        "vlan2_enabled": True,
        "vlan2_priority": 4,
        "vlan2_cfi": 0,
        "vlan2_id": 200,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 5000,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-qinq.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["vlan_enabled"] is True
    assert imported_stream["vlan_tpid_override"] is True
    assert imported_stream["vlan_tpid"] == "88a8"
    assert imported_stream["vlan_priority"] == 3
    assert imported_stream["vlan_cfi"] == 1
    assert imported_stream["vlan_id"] == 100
    assert imported_stream["vlan2_enabled"] is True
    assert imported_stream["vlan2_tpid_override"] is False
    assert imported_stream["vlan2_tpid"] == "8100"
    assert imported_stream["vlan2_priority"] == 4
    assert imported_stream["vlan2_cfi"] == 0
    assert imported_stream["vlan2_id"] == 200
    assert imported_stream["ipv4_src"] == "10.10.10.1"
    assert imported_stream["ipv4_dst"] == "10.10.10.2"
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 12345
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 5000
    packet = base64.b64decode(imported_stream["packet_binary_base64"])
    assert imported_stream["udp_length"] == int.from_bytes(packet[46:48], "big")
    assert [layer["name"] for layer in imported.data["packet_previews"][0]["layers"][:3]] == [
        "Ethernet",
        "802.1Q VLAN",
        "802.1Q VLAN Inner",
    ]
    assert imported.data["packet_previews"][0]["hex"].startswith("66554433221110203040506088a8")


def test_workbench_export_and_import_pcap_preserves_mpls_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-mpls",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "vlan_enabled": True,
        "vlan_priority": 3,
        "vlan_cfi": 1,
        "vlan_id": 4094,
        "mpls_enabled": True,
        "mpls_label": 1024,
        "mpls_tc": 5,
        "mpls_ttl": 42,
        "mpls_label2_enabled": True,
        "mpls_label2": 2048,
        "mpls_label2_tc": 4,
        "mpls_label2_ttl": 41,
        "mpls_label3_enabled": True,
        "mpls_label3": 4096,
        "mpls_label3_tc": 3,
        "mpls_label3_ttl": 40,
        "ipv4_src": "10.10.10.1",
        "ipv4_dst": "10.10.10.2",
        "l4_src_port": 12345,
        "l4_dst_port": 5000,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-mpls.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["vlan_enabled"] is True
    assert imported_stream["vlan_id"] == 4094
    assert imported_stream["mpls_enabled"] is True
    assert imported_stream["mpls_label"] == 1024
    assert imported_stream["mpls_label_mode"] == "Fixed"
    assert imported_stream["mpls_label_count"] == 16
    assert imported_stream["mpls_label_step"] == 1
    assert imported_stream["mpls_tc"] == 5
    assert imported_stream["mpls_ttl"] == 42
    assert imported_stream["mpls_label2_enabled"] is True
    assert imported_stream["mpls_label2"] == 2048
    assert imported_stream["mpls_label2_tc"] == 4
    assert imported_stream["mpls_label2_ttl"] == 41
    assert imported_stream["mpls_label3_enabled"] is True
    assert imported_stream["mpls_label3"] == 4096
    assert imported_stream["mpls_label3_tc"] == 3
    assert imported_stream["mpls_label3_ttl"] == 40
    assert imported_stream["ipv4_src"] == "10.10.10.1"
    assert imported_stream["ipv4_dst"] == "10.10.10.2"
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 12345
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 5000
    assert imported.data["packet_previews"][0]["layers"][1]["name"] == "802.1Q VLAN"
    assert imported.data["packet_previews"][0]["layers"][1]["fields"]["type"] == "0x8847"
    assert imported.data["packet_previews"][0]["layers"][2]["name"] == "MPLS"
    assert imported.data["packet_previews"][0]["layers"][2]["fields"]["bottom_of_stack"] == 0
    assert imported.data["packet_previews"][0]["layers"][3]["name"] == "MPLS"
    assert imported.data["packet_previews"][0]["layers"][4]["fields"]["bottom_of_stack"] == 1
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050608100")


def test_workbench_export_and_import_pcap_preserves_vxlan_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-vxlan",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "vxlan_enabled": True,
        "vxlan_vni": 5000,
        "vxlan_inner_ether_dst": "aa:bb:cc:dd:ee:ff",
        "vxlan_inner_ether_src": "00:11:22:33:44:55",
        "vxlan_inner_ipv4_src": "10.1.0.10",
        "vxlan_inner_ipv4_dst": "10.1.0.20",
        "vxlan_inner_ipv4_ttl": 42,
        "vxlan_inner_l4_src_port": 32000,
        "vxlan_inner_l4_dst_port": 32100,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-vxlan.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["vxlan_enabled"] is True
    assert imported_stream["vxlan_vni"] == 5000
    assert imported_stream["vxlan_inner_ether_dst"] == "aa:bb:cc:dd:ee:ff"
    assert imported_stream["vxlan_inner_ether_src"] == "00:11:22:33:44:55"
    assert imported_stream["vxlan_inner_ipv4_src"] == "10.1.0.10"
    assert imported_stream["vxlan_inner_ipv4_dst"] == "10.1.0.20"
    assert imported_stream["vxlan_inner_ipv4_ttl"] == 42
    assert imported_stream["vxlan_inner_l4_src_port"] == 32000
    assert imported_stream["vxlan_inner_l4_dst_port"] == 32100
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 1337
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 4789
    assert imported_stream["udp_length_override"] is True
    assert imported_stream["udp_checksum_override"] is True
    assert imported_stream["udp_checksum"] == "0000"
    assert imported_stream["udp_checksum_mode"] == "Fixed"
    assert imported_stream["udp_checksum_count"] == 16
    assert imported_stream["udp_checksum_step"] == 1
    assert imported.data["packet_previews"][0]["layers"][3]["name"] == "VXLAN"
    assert imported.data["packet_previews"][0]["layers"][6]["name"] == "Inner UDP"
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050600800")


def test_workbench_export_and_import_pcap_preserves_gtpu_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-gtpu",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length": 104,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gtpu_enabled": True,
        "gtpu_message_type": 255,
        "gtpu_teid": 0xABCDEF01,
        "gtpu_sequence_enabled": True,
        "gtpu_sequence": 7,
        "gtpu_npdu_enabled": True,
        "gtpu_npdu": 3,
        "gtpu_extension_enabled": True,
        "gtpu_extension_udp_port": 65000,
        "gtpu_inner_ipv4_src": "10.9.0.1",
        "gtpu_inner_ipv4_dst": "10.9.0.2",
        "gtpu_inner_ipv4_ttl": 63,
        "gtpu_inner_l4_src_port": 5000,
        "gtpu_inner_l4_dst_port": 6000,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-gtpu.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/UDP"
    assert imported_stream["gtpu_enabled"] is True
    assert imported_stream["gtpu_message_type"] == 255
    assert imported_stream["gtpu_teid"] == 0xABCDEF01
    assert imported_stream["gtpu_teid_mode"] == "Fixed"
    assert imported_stream["gtpu_teid_count"] == 16
    assert imported_stream["gtpu_teid_step"] == 1
    assert imported_stream["gtpu_sequence_enabled"] is True
    assert imported_stream["gtpu_sequence"] == 7
    assert imported_stream["gtpu_sequence_mode"] == "Fixed"
    assert imported_stream["gtpu_npdu_enabled"] is True
    assert imported_stream["gtpu_npdu"] == 3
    assert imported_stream["gtpu_npdu_mode"] == "Fixed"
    assert imported_stream["gtpu_extension_enabled"] is True
    assert imported_stream["gtpu_extension_udp_port"] == 65000
    assert imported_stream["gtpu_extension_udp_port_mode"] == "Fixed"
    assert imported_stream["gtpu_inner_ipv4_src"] == "10.9.0.1"
    assert imported_stream["gtpu_inner_ipv4_dst"] == "10.9.0.2"
    assert imported_stream["gtpu_inner_ipv4_ttl"] == 63
    assert imported_stream["gtpu_inner_l4_src_port"] == 5000
    assert imported_stream["gtpu_inner_l4_dst_port"] == 6000
    assert imported_stream["l4_src_port_override"] is True
    assert imported_stream["l4_src_port"] == 2152
    assert imported_stream["l4_dst_port_override"] is True
    assert imported_stream["l4_dst_port"] == 2152
    assert imported_stream["udp_length_override"] is False
    assert imported_stream["udp_checksum_override"] is False
    assert imported.data["packet_previews"][0]["layers"][3]["name"] == "GPRS Tunneling Protocol User Plane"
    assert imported.data["packet_previews"][0]["layers"][4]["name"] == "Inner Internet Protocol v4"
    assert imported.data["packet_previews"][0]["layers"][5]["name"] == "Inner UDP"
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050600800")


def test_workbench_export_and_import_pcap_preserves_gre_fields(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    stream = {
        "name": "pcap-gre",
        "packet_type": "Ethernet/IPv4/GRE",
        "frame_length": 128,
        "ether_dst": "66:55:44:33:22:11",
        "ether_src": "10:20:30:40:50:60",
        "ipv4_src": "172.16.0.1",
        "ipv4_dst": "172.16.0.2",
        "gre_checksum_present": True,
        "gre_checksum_override": True,
        "gre_checksum": "BEEF",
        "gre_key_present": True,
        "gre_key": 5000,
        "gre_sequence_present": True,
        "gre_sequence": 9,
        "gre_inner_ipv4_src": "10.2.0.10",
        "gre_inner_ipv4_dst": "10.2.0.20",
        "gre_inner_ipv4_ttl": 55,
        "gre_inner_l4_src_port": 32000,
        "gre_inner_l4_dst_port": 32100,
    }

    exported = service.export_workbench_stream_pcap(stream)
    imported = service.import_workbench_pcap("pcap-gre.pcap", exported.data["content_base64"])

    assert imported.ok is True
    imported_stream = imported.data["streams"][0]
    assert imported_stream["packet_type"] == "Ethernet/IPv4/GRE"
    assert imported_stream["ipv4_src"] == "172.16.0.1"
    assert imported_stream["ipv4_dst"] == "172.16.0.2"
    assert imported_stream["gre_checksum_present"] is True
    assert imported_stream["gre_checksum_override"] is True
    assert imported_stream["gre_checksum"] == "BEEF"
    assert imported_stream["gre_key_present"] is True
    assert imported_stream["gre_key"] == 5000
    assert imported_stream["gre_sequence_present"] is True
    assert imported_stream["gre_sequence"] == 9
    assert imported_stream["gre_protocol_type"] == "0800"
    assert imported_stream["gre_inner_ipv4_src"] == "10.2.0.10"
    assert imported_stream["gre_inner_ipv4_dst"] == "10.2.0.20"
    assert imported_stream["gre_inner_ipv4_ttl"] == 55
    assert imported_stream["gre_inner_l4_src_port"] == 32000
    assert imported_stream["gre_inner_l4_dst_port"] == 32100
    assert imported.data["packet_previews"][0]["layers"][2]["name"] == "GRE"
    assert imported.data["packet_previews"][0]["layers"][3]["name"] == "Inner Internet Protocol v4"
    assert imported.data["packet_previews"][0]["layers"][4]["name"] == "Inner UDP"
    assert imported.data["packet_previews"][0]["hex"].startswith("6655443322111020304050600800")


def test_workbench_import_pcap_rejects_mixed_vxlan_inner_flows(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    first = service.export_workbench_stream_pcap(
        {
            "name": "vxlan-a",
            "packet_type": "Ethernet/IPv4/UDP",
            "frame_length": 128,
            "ipv4_src": "172.16.0.1",
            "ipv4_dst": "172.16.0.2",
            "vxlan_enabled": True,
            "vxlan_vni": 5000,
            "vxlan_inner_ipv4_src": "10.1.0.10",
            "vxlan_inner_ipv4_dst": "10.1.0.20",
        }
    )
    second = service.export_workbench_stream_pcap(
        {
            "name": "vxlan-b",
            "packet_type": "Ethernet/IPv4/UDP",
            "frame_length": 128,
            "ipv4_src": "172.16.0.1",
            "ipv4_dst": "172.16.0.2",
            "vxlan_enabled": True,
            "vxlan_vni": 5001,
            "vxlan_inner_ipv4_src": "10.1.0.10",
            "vxlan_inner_ipv4_dst": "10.1.0.30",
        }
    )
    assert first.ok is True
    assert second.ok is True
    first_packet = base64.b64decode(first.data["packet_preview"]["binary_base64"])
    second_packet = base64.b64decode(second.data["packet_preview"]["binary_base64"])
    mixed_pcap = (
        struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65_535, 1)
        + struct.pack("<IIII", 0, 0, len(first_packet), len(first_packet))
        + first_packet
        + struct.pack("<IIII", 0, 1, len(second_packet), len(second_packet))
        + second_packet
    )

    result = service.import_workbench_pcap("mixed-vxlan.pcap", base64.b64encode(mixed_pcap).decode("ascii"))

    assert result.ok is False
    assert result.blocker == "profile_pcap_flow_unsupported"


def test_workbench_import_pcap_rejects_mixed_flows(tmp_path: Path) -> None:
    service = RealStlClientService(env(tmp_path))
    first = service.export_workbench_stream_pcap(
        {
            "name": "flow-a",
            "packet_type": "Ethernet/IPv4/UDP",
            "ipv4_src": "10.0.0.1",
            "ipv4_dst": "10.0.0.2",
            "l4_src_port": 1000,
            "l4_dst_port": 2000,
        }
    )
    second = service.export_workbench_stream_pcap(
        {
            "name": "flow-b",
            "packet_type": "Ethernet/IPv4/UDP",
            "ipv4_src": "10.0.0.3",
            "ipv4_dst": "10.0.0.4",
            "l4_src_port": 3000,
            "l4_dst_port": 4000,
        }
    )
    assert first.ok is True
    assert second.ok is True
    first_packet = base64.b64decode(first.data["packet_preview"]["binary_base64"])
    second_packet = base64.b64decode(second.data["packet_preview"]["binary_base64"])
    mixed_pcap = (
        struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65_535, 1)
        + struct.pack("<IIII", 0, 0, len(first_packet), len(first_packet))
        + first_packet
        + struct.pack("<IIII", 0, 1, len(second_packet), len(second_packet))
        + second_packet
    )

    result = service.import_workbench_pcap("mixed.pcap", base64.b64encode(mixed_pcap).decode("ascii"))

    assert result.ok is False
    assert result.blocker == "profile_pcap_flow_unsupported"


def test_workbench_profile_save_rejects_dirty_file_name(tmp_path: Path) -> None:
    result = RealStlClientService(env(tmp_path)).save_workbench_profile("../escape.yaml", [{"name": "s"}])

    assert result.ok is False
    assert result.blocker == "profile_name_invalid"
