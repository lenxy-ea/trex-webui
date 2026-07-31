from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any
import uuid

import pytest

from app.core.settings import TrexEnvironment
from app.trex import dependencies
from app.trex.capture_runtime import CaptureIdentity
from app.trex.result import TrexCallResult
from app.trex.runtime_state import (
    CaptureLeaseState,
    RuntimeAuthorityIdentity,
    RuntimeStateDocument,
    RuntimeStateError,
    RuntimeStateStore,
)
from app.trex.stl_client import RealStlClientService


def env(
    tmp_path: Path,
    *,
    host: str = "127.0.0.1",
    supervisor: str = "external",
) -> TrexEnvironment:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    profile_root = tmp_path / "profiles"
    profile_root.mkdir(parents=True, exist_ok=True)
    generation_path = tmp_path / "daemon-generation"
    if supervisor == "systemd":
        generation_path.write_text(
            "11111111-1111-4111-8111-111111111111\n",
            encoding="ascii",
        )
        generation_path.chmod(0o644)
    return TrexEnvironment(
        host=host,
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=scripts_dir,
        daemon_bin=scripts_dir / "trex_daemon_server",
        config_path=tmp_path / "trex_cfg.yaml",
        daemon_log=tmp_path / "trex.log",
        profile_roots=[profile_root],
        command_timeout_seconds=3,
        require_confirmation=True,
        daemon_supervisor=supervisor,
        runtime_state_path=tmp_path / "runtime-state.json",
        daemon_generation_path=generation_path,
    )


class LifecycleClient:
    def __init__(self, capture_id: int = 7) -> None:
        self.capture_id = capture_id
        self.status: dict[int, dict[str, object]] = {
            capture_id: {
                "id": capture_id,
                "filter": {"tx": [0], "rx": [], "bpf": ""},
            }
        }
        self.calls: list[tuple[str, object]] = []
        self.remove_failures = 0
        self.restore_failures = 0
        self.release_failures = 0
        self.disconnect_failures = 0
        self.acquired_ports: set[int] = set()

    def connect(self) -> None:
        self.calls.append(("connect", None))

    def get_capture_status(self) -> dict[int, dict[str, object]]:
        self.calls.append(("get_capture_status", None))
        return self.status

    def get_acquired_ports(self) -> list[int]:
        self.calls.append(("get_acquired_ports", None))
        return sorted(self.acquired_ports)

    def acquire(self, *, ports: list[int], force: bool, sync_streams: bool) -> None:
        self.calls.append(
            (
                "acquire",
                {"ports": ports, "force": force, "sync_streams": sync_streams},
            )
        )
        self.acquired_ports.update(ports)

    def remove_capture(self, capture_id: int) -> None:
        self.calls.append(("remove_capture", capture_id))
        if self.remove_failures:
            self.remove_failures -= 1
            raise RuntimeError("remove failed")
        self.status.pop(capture_id, None)

    def set_service_mode(self, *, ports: list[int], enabled: bool, filtered: bool, mask: int | None) -> None:
        self.calls.append(
            (
                "set_service_mode",
                {"ports": ports, "enabled": enabled, "filtered": filtered, "mask": mask},
            )
        )
        if self.restore_failures:
            self.restore_failures -= 1
            raise RuntimeError("restore failed")

    def release(self, *, ports: list[int]) -> None:
        self.calls.append(("release", ports))
        if self.release_failures:
            self.release_failures -= 1
            raise RuntimeError("release failed")
        self.acquired_ports.difference_update(ports)

    def disconnect(self, *, stop_traffic: bool, release_ports: bool) -> None:
        self.calls.append(
            (
                "disconnect",
                {"stop_traffic": stop_traffic, "release_ports": release_ports},
            )
        )
        if self.disconnect_failures:
            self.disconnect_failures -= 1
            raise RuntimeError("disconnect failed")


class _TestRuntimeAuthorityProvider:
    def __init__(self, environment: TrexEnvironment) -> None:
        self.environment = environment
        self.external_generation = f"process:{uuid.uuid4()}"

    def current(self) -> RuntimeAuthorityIdentity:
        generation = (
            self.environment.daemon_generation_path.read_text(encoding="ascii").strip()
            if self.environment.daemon_supervisor == "systemd"
            else self.external_generation
        )
        return RuntimeAuthorityIdentity(
            host=self.environment.host,
            sync_port=self.environment.sync_port,
            async_port=self.environment.async_port,
            scapy_port=self.environment.scapy_port,
            daemon_supervisor=self.environment.daemon_supervisor,
            generation=generation,
        )


def persist_capture_lease(environment: TrexEnvironment, capture_id: int = 7) -> None:
    def add_lease(state: RuntimeStateDocument) -> RuntimeStateDocument:
        state.capture_leases = [
            CaptureLeaseState(
                capture_id=capture_id,
                authority=_TestRuntimeAuthorityProvider(environment).current(),
                service_states={0: {"enabled": False, "filtered": False, "mask": None}},
                tx_ports=[0],
                rx_ports=[],
                bpf_filter="",
                ports=[0],
                acquired_ports=[0],
            )
        ]
        return state

    RuntimeStateStore(environment.runtime_state_path).update(add_lease)


def persist_capture_recovery_lease(
    environment: TrexEnvironment,
    *,
    phase: str,
) -> int | str:
    capture_id: int | str = (
        "pending-start:22222222-2222-4222-8222-222222222222"
        if phase == "pending_start"
        else 7
    )

    def add_lease(state: RuntimeStateDocument) -> RuntimeStateDocument:
        state.capture_leases = [
            CaptureLeaseState(
                capture_id=capture_id,
                recovery_phase=phase,  # type: ignore[arg-type]
                baseline_capture_ids=[],
                authority=_TestRuntimeAuthorityProvider(environment).current(),
                service_states={
                    0: {
                        "enabled": False,
                        "filtered": False,
                        "mask": None,
                    }
                },
                tx_ports=[0],
                rx_ports=[],
                bpf_filter="",
                ports=[0],
                acquired_ports=[0],
            )
        ]
        return state

    RuntimeStateStore(environment.runtime_state_path).update(add_lease)
    return capture_id


def managed_service(tmp_path: Path, client: LifecycleClient) -> RealStlClientService:
    service = RealStlClientService(env(tmp_path))
    service._client = client
    client.acquired_ports.add(0)
    service._capture_service_states[client.capture_id] = {
        0: {"enabled": False, "filtered": False, "mask": None}
    }
    service._capture_ports[client.capture_id] = [0]
    service._capture_acquired_ports[client.capture_id] = [0]
    service._capture_identities[client.capture_id] = CaptureIdentity.create([0], [], "")
    service._capture_authorities[client.capture_id] = service._runtime_authority.current()
    service._port_attribute_overrides[0] = {"multicast": True}
    return service


def test_disconnect_cleans_managed_capture_before_non_destructive_sdk_disconnect(tmp_path: Path) -> None:
    client = LifecycleClient()
    service = managed_service(tmp_path, client)

    result = service.disconnect()

    assert result == TrexCallResult(
        True,
        data={"disconnected": True, "client_cached": False},
    )
    assert client.calls == [
        ("get_capture_status", None),
        ("get_acquired_ports", None),
        ("get_capture_status", None),
        ("remove_capture", 7),
        (
            "set_service_mode",
            {"ports": [0], "enabled": False, "filtered": False, "mask": None},
        ),
        ("get_acquired_ports", None),
        ("release", [0]),
        ("disconnect", {"stop_traffic": False, "release_ports": False}),
    ]
    assert service._client is None
    assert service._capture_runtime.managed_capture_ids() == []
    assert service._port_attribute_overrides == {}


@pytest.mark.parametrize(
    ("failure_attribute", "phase"),
    [
        ("remove_failures", "capture_remove"),
        ("restore_failures", "service_mode_restore"),
        ("release_failures", "capture_port_release"),
    ],
)
def test_disconnect_cleanup_failure_retains_retryable_state(
    tmp_path: Path,
    failure_attribute: str,
    phase: str,
) -> None:
    client = LifecycleClient()
    setattr(client, failure_attribute, 1)
    service = managed_service(tmp_path, client)

    failed = service.disconnect()

    assert failed.ok is False
    assert failed.blocker == "trex_disconnect_cleanup_failed"
    assert failed.data["phase"] == phase
    assert failed.data["remaining_capture_ids"] == [7]
    assert service._client is client
    assert service._capture_runtime.managed_capture_ids() == [7]
    assert service._port_attribute_overrides == {0: {"multicast": True}}
    assert not any(call[0] == "disconnect" for call in client.calls)
    if phase == "capture_remove":
        assert 7 in client.status
        assert 7 in service._capture_service_states
        assert 7 in service._capture_ports
        assert 7 in service._capture_acquired_ports
    elif phase == "service_mode_restore":
        assert client.status == {}
        assert 7 in service._capture_service_states
        assert 7 in service._capture_ports
        assert 7 in service._capture_acquired_ports
    else:
        assert client.status == {}
        assert 7 not in service._capture_service_states
        assert 7 in service._capture_ports
        assert 7 in service._capture_acquired_ports

    retried = service.disconnect()

    assert retried.ok is True
    assert service._client is None
    assert service._capture_runtime.managed_capture_ids() == []
    assert [call for call in client.calls if call[0] == "remove_capture"] == [("remove_capture", 7)] * (
        2 if phase == "capture_remove" else 1
    )


def test_sdk_disconnect_failure_keeps_client_without_replacing_it(tmp_path: Path) -> None:
    client = LifecycleClient()
    client.status = {}
    client.disconnect_failures = 1
    service = RealStlClientService(env(tmp_path))
    service._client = client
    service._port_attribute_overrides[0] = {"led": True}
    service._client_class = lambda: (_ for _ in ()).throw(AssertionError("must not replace cached client"))  # type: ignore[method-assign]

    failed = service.disconnect()

    assert failed.ok is False
    assert failed.blocker == "trex_disconnect_failed"
    assert failed.data == {
        "disconnected": False,
        "client_cached": True,
        "phase": "sdk_disconnect",
    }
    assert service._client is client
    assert service._port_attribute_overrides == {0: {"led": True}}
    assert service._connect_client_locked().data is client

    assert service.disconnect().ok is True
    assert service._client is None


def test_restart_disconnect_reconnects_and_cleans_only_persisted_managed_capture(tmp_path: Path) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    client = LifecycleClient()
    client.status[99] = {"id": 99}
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client_class = lambda: TrexCallResult(True, data=lambda **_kwargs: client)  # type: ignore[method-assign]

    result = service.disconnect()

    assert result.ok is True
    assert client.status == {99: {"id": 99}}
    assert ("remove_capture", 7) in client.calls
    assert ("remove_capture", 99) not in client.calls
    assert (
        "acquire",
        {"ports": [0], "force": False, "sync_streams": True},
    ) in client.calls
    assert client.calls[-1] == (
        "disconnect",
        {"stop_traffic": False, "release_ports": False},
    )
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_restart_disconnect_rejects_reused_capture_id_with_different_identity(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    client = LifecycleClient()
    client.status[7] = {
        "id": 7,
        "filter": {"tx": [2], "rx": [], "bpf": ""},
    }
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client_class = lambda: TrexCallResult(True, data=lambda **_kwargs: client)  # type: ignore[method-assign]

    result = service.disconnect()

    assert result.ok is False
    assert result.blocker == "trex_disconnect_cleanup_failed"
    assert result.data["phase"] == "capture_identity"
    assert result.data["remaining_capture_ids"] == [7]
    assert "does not match the live recorder identity" in result.error
    assert not any(
        call[0] in {"acquire", "remove_capture", "set_service_mode", "release", "disconnect"}
        for call in client.calls
    )
    leases = RuntimeStateStore(environment.runtime_state_path).load().capture_leases
    assert len(leases) == 1
    assert leases[0].capture_id == 7
    assert leases[0].tx_ports == [0]


def test_restart_disconnect_rejects_same_capture_identity_after_daemon_restart(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    environment.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = LifecycleClient()
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client_class = lambda: TrexCallResult(True, data=lambda **_kwargs: client)  # type: ignore[method-assign]

    result = service.disconnect()

    assert result.ok is False
    assert result.blocker == "trex_disconnect_cleanup_failed"
    assert result.data["phase"] == "capture_identity"
    assert "different TRex target or daemon generation" in result.error
    assert not any(
        call[0] in {"acquire", "remove_capture", "set_service_mode", "release", "disconnect"}
        for call in client.calls
    )
    lease = RuntimeStateStore(environment.runtime_state_path).load().capture_leases[0]
    assert lease.authority.generation == "11111111-1111-4111-8111-111111111111"


def test_new_systemd_generation_status_clears_absent_stale_lease_without_rpc_cleanup(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    environment.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = LifecycleClient()
    client.status = {}
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.capture_status()

    assert result.ok is True
    assert result.data["captures"] == []
    assert result.data["service_mode"]["managed_capture_ids"] == []
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases == []
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
        }
        for call in client.calls
    )


def test_new_systemd_generation_remove_absent_stale_id_is_local_only(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    environment.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = LifecycleClient()
    client.status = {}
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.remove_capture(7)

    assert result.ok is True
    assert result.data["removed_ids"] == [7]
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases == []
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
        }
        for call in client.calls
    )


def test_new_systemd_generation_disconnect_drops_absent_stale_lease_then_disconnects(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    environment.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = LifecycleClient()
    client.status = {}
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client_class = lambda: TrexCallResult(  # type: ignore[method-assign]
        True,
        data=lambda **_kwargs: client,
    )

    result = service.disconnect()

    assert result.ok is True
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases == []
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
        }
        for call in client.calls
    )
    assert client.calls[-1] == (
        "disconnect",
        {"stop_traffic": False, "release_ports": False},
    )


def test_new_systemd_generation_reused_id_is_preserved_and_status_fails_closed(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    environment.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = LifecycleClient()
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.capture_status()

    assert result.ok is False
    assert "id is in use by the current daemon" in result.error
    assert 7 in client.status
    lease = RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0]
    assert lease.capture_id == 7
    assert lease.authority.generation == (
        "11111111-1111-4111-8111-111111111111"
    )
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
            "disconnect",
        }
        for call in client.calls
    )


def test_pending_start_status_lag_blocks_immediate_disconnect_without_cleanup(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    pending_id = persist_capture_recovery_lease(
        environment,
        phase="pending_start",
    )
    client = LifecycleClient()
    client.status = {}
    client.acquired_ports.add(0)
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.disconnect()

    assert result.ok is False
    assert result.blocker == "trex_disconnect_cleanup_failed"
    assert result.data["phase"] == "capture_identity"
    assert result.data["remaining_capture_ids"] == [pending_id]
    assert "still waiting for a uniquely attributable live recorder" in result.error
    lease = RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0]
    assert lease.capture_id == pending_id
    assert lease.recovery_phase == "pending_start"
    assert client.acquired_ports == {0}
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
            "disconnect",
        }
        for call in client.calls
    )


def test_cleanup_required_retries_after_remove_restore_failure_and_api_restart(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_recovery_lease(
        environment,
        phase="pending_start",
    )
    first_client = LifecycleClient()
    first_client.acquired_ports.add(0)
    first_client.restore_failures = 1
    first_service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    first_service._client = first_client

    failed = first_service.capture_status()

    assert failed.ok is False
    assert first_client.status == {}
    assert ("remove_capture", 7) in first_client.calls
    assert not any(call[0] == "release" for call in first_client.calls)
    persisted = RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases
    assert len(persisted) == 1
    assert persisted[0].capture_id == 7
    assert persisted[0].recovery_phase == "cleanup_required"

    # A fresh API process sees that the uniquely owned recorder is already
    # absent. cleanup_required makes service-mode restoration and port release
    # safe to retry without guessing that a pending start never committed.
    second_client = LifecycleClient()
    second_client.status = {}
    second_client.acquired_ports.add(0)
    second_service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    second_service._client = second_client

    recovered = second_service.capture_status()

    assert recovered.ok is True
    assert recovered.data["captures"] == []
    assert not any(
        call[0] == "remove_capture"
        for call in second_client.calls
    )
    assert (
        "set_service_mode",
        {
            "ports": [0],
            "enabled": False,
            "filtered": False,
            "mask": None,
        },
    ) in second_client.calls
    assert ("release", [0]) in second_client.calls
    assert second_client.acquired_ports == set()
    assert RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases == []


def test_cleanup_required_reused_id_in_new_generation_is_preserved(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_recovery_lease(
        environment,
        phase="cleanup_required",
    )
    environment.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = LifecycleClient()
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.capture_status()

    assert result.ok is False
    assert "id is in use by the current daemon" in result.error
    assert 7 in client.status
    lease = RuntimeStateStore(
        environment.runtime_state_path
    ).load().capture_leases[0]
    assert lease.capture_id == 7
    assert lease.recovery_phase == "cleanup_required"
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
        }
        for call in client.calls
    )


def test_target_mismatch_with_absent_id_still_fails_closed(
    tmp_path: Path,
) -> None:
    original_environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(original_environment)
    changed_environment = replace(
        original_environment,
        host="127.0.0.2",
    )
    client = LifecycleClient()
    client.status = {}
    service = RealStlClientService(
        changed_environment,
        runtime_authority=_TestRuntimeAuthorityProvider(changed_environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.capture_status()

    assert result.ok is False
    assert "different TRex target or daemon generation" in result.error
    assert len(
        RuntimeStateStore(
            original_environment.runtime_state_path
        ).load().capture_leases
    ) == 1
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
        }
        for call in client.calls
    )


def test_external_generation_mismatch_with_absent_id_still_fails_closed(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path, supervisor="external")
    persist_capture_lease(environment)
    client = LifecycleClient()
    client.status = {}
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.capture_status()

    assert result.ok is False
    assert "different TRex target or daemon generation" in result.error
    assert len(
        RuntimeStateStore(
            environment.runtime_state_path
        ).load().capture_leases
    ) == 1
    assert not any(
        call[0] in {
            "acquire",
            "remove_capture",
            "set_service_mode",
            "release",
        }
        for call in client.calls
    )


def test_capture_status_reconciles_disappeared_lease_without_claiming_external_recorder(tmp_path: Path) -> None:
    environment = env(tmp_path, supervisor="systemd")
    persist_capture_lease(environment)
    client = LifecycleClient()
    client.status = {99: {"id": 99}}
    service = RealStlClientService(
        environment,
        runtime_authority=_TestRuntimeAuthorityProvider(environment),  # type: ignore[arg-type]
    )
    service._client = client

    result = service.capture_status()

    assert result.ok is True
    assert result.data["captures"] == [{"id": 99}]
    assert result.data["service_mode"]["managed_capture_ids"] == []
    assert not any(call[0] == "remove_capture" for call in client.calls)
    assert (
        "set_service_mode",
        {"ports": [0], "enabled": False, "filtered": False, "mask": None},
    ) in client.calls
    assert not any(call[0] in {"acquire", "release"} for call in client.calls)
    assert RuntimeStateStore(environment.runtime_state_path).load().capture_leases == []


def test_service_rejects_corrupt_runtime_state_without_overwriting_it(tmp_path: Path) -> None:
    environment = env(tmp_path)
    original = (
        '{"version":2,"revision":0,"capture_leases":['
        '{"capture_id":7,"authority":{"host":"127.0.0.1",'
        '"sync_port":4501,"async_port":4500,"scapy_port":4507,'
        '"daemon_supervisor":"external",'
        '"generation":"process:11111111-1111-4111-8111-111111111111"},'
        '"service_states":{"1":{"enabled":false}},'
        '"tx_ports":[0],"rx_ports":[],"bpf_filter":"",'
        '"ports":[0],"acquired_ports":[]}]}'
    )
    environment.runtime_state_path.write_text(original, encoding="utf-8")

    with pytest.raises(RuntimeStateError, match="service state outside its ports"):
        RealStlClientService(environment)

    assert environment.runtime_state_path.read_text(encoding="utf-8") == original


def test_runtime_state_path_change_replaces_cached_service_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_environment = env(tmp_path)
    new_environment = replace(
        old_environment,
        runtime_state_path=tmp_path / "other-runtime-state.json",
    )

    class OldService:
        def __init__(self) -> None:
            self.close_calls = 0

        def close(self) -> TrexCallResult:
            self.close_calls += 1
            return TrexCallResult(True)

    old_service = OldService()
    replacement = object()
    monkeypatch.setattr(dependencies, "_service", old_service)
    monkeypatch.setattr(dependencies, "_service_key", dependencies._environment_key(old_environment))
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(dependencies, "RealStlClientService", lambda environment: replacement)

    result = dependencies._ensure_service_locked(new_environment)

    assert result is replacement
    assert old_service.close_calls == 1
    assert dependencies._service_key == dependencies._environment_key(new_environment)


def test_get_stl_service_fails_closed_when_runtime_authority_is_corrupt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = env(tmp_path)
    original = '{"version":1,"revision":0,"capture_leases":['
    environment.runtime_state_path.write_text(original, encoding="utf-8")
    monkeypatch.setattr(dependencies, "_service", None)
    monkeypatch.setattr(dependencies, "_service_key", None)
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(dependencies, "get_environment", lambda: environment)

    with pytest.raises(RuntimeStateError, match="runtime state is invalid"):
        dependencies.get_stl_service()

    assert dependencies._service is None
    assert dependencies._service_key is None
    assert environment.runtime_state_path.read_text(encoding="utf-8") == original


def test_connect_failure_disposes_partial_client_without_stopping_or_releasing(tmp_path: Path) -> None:
    class FailingConnectClient:
        instances: list["FailingConnectClient"] = []

        def __init__(self, **_kwargs: object) -> None:
            self.disconnect_options: dict[str, bool] | None = None
            FailingConnectClient.instances.append(self)

        def connect(self) -> None:
            raise RuntimeError("connect failed")

        def disconnect(self, *, stop_traffic: bool, release_ports: bool) -> None:
            self.disconnect_options = {
                "stop_traffic": stop_traffic,
                "release_ports": release_ports,
            }

    service = RealStlClientService(env(tmp_path))
    service._client_class = lambda: TrexCallResult(True, data=FailingConnectClient)  # type: ignore[method-assign]

    result = service.snapshot()

    assert result.ok is False
    assert result.blocker == "trex_connect_failed"
    assert result.data == {"connected": False, "partial_client_disposed": True}
    assert service._client is None
    assert FailingConnectClient.instances[0].disconnect_options == {
        "stop_traffic": False,
        "release_ports": False,
    }


def test_service_replacement_failure_preserves_old_service_sampler_and_registry(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_env = env(tmp_path / "old", host="old.trex")
    new_env = env(tmp_path / "new", host="new.trex")
    close_result = TrexCallResult(False, blocker="trex_disconnect_cleanup_failed", error="remove failed")

    class OldService:
        def __init__(self) -> None:
            self.capture_registry = {7: {"port": 0}}
            self.close_calls = 0

        def close(self) -> TrexCallResult:
            self.close_calls += 1
            return close_result

    class Sampler:
        def __init__(self) -> None:
            self.close_calls = 0

        def close(self) -> None:
            self.close_calls += 1

    old_service = OldService()
    sampler = Sampler()
    old_key = dependencies._environment_key(old_env)
    constructed: list[TrexEnvironment] = []
    monkeypatch.setattr(dependencies, "_service", old_service)
    monkeypatch.setattr(dependencies, "_service_key", old_key)
    monkeypatch.setattr(dependencies, "_stats_sampler", sampler)
    monkeypatch.setattr(
        dependencies,
        "RealStlClientService",
        lambda environment: constructed.append(environment),
    )

    with pytest.raises(dependencies.StlServiceReplacementError) as raised:
        dependencies._ensure_service_locked(new_env)

    assert raised.value.result is close_result
    assert raised.value.blocker == "trex_disconnect_cleanup_failed"
    assert dependencies._service is old_service
    assert dependencies._service_key == old_key
    assert dependencies._stats_sampler is sampler
    assert old_service.capture_registry == {7: {"port": 0}}
    assert old_service.close_calls == 1
    assert sampler.close_calls == 0
    # Replacement construction validates the new local runtime state before
    # the usable old service/reaper are retired.
    assert constructed == [new_env]
