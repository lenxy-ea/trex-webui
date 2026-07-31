from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

import pytest

from app.core.settings import TrexEnvironment
from app.main import ConnectTrexRequest, connect_trex
from app.trex import dependencies
from app.trex.result import TrexCallResult
from app.trex.runtime_state import (
    RuntimeConnectionState,
    RuntimeStateDocument,
    RuntimeStateStore,
    utc_now_iso,
)
from app.trex.stats_sampler import TrexStatsSampler
from app.trex.stl_client import RealStlClientService


def environment(tmp_path: Path, *, host: str = "old.trex") -> TrexEnvironment:
    scripts_dir = tmp_path / "scripts"
    profile_root = tmp_path / "profiles"
    scripts_dir.mkdir(parents=True)
    profile_root.mkdir()
    return TrexEnvironment(
        host=host,
        sync_port=4501,
        async_port=4500,
        scapy_port=4507,
        client_name="OldClient",
        connect_timeout_seconds=3,
        daemon_port=8090,
        scripts_dir=scripts_dir,
        daemon_bin=scripts_dir / "trex_daemon_server",
        config_path=tmp_path / "trex_cfg.yaml",
        daemon_log=tmp_path / "trex.log",
        profile_roots=[profile_root],
        command_timeout_seconds=3,
        require_confirmation=False,
        daemon_supervisor="external",
        runtime_state_path=tmp_path / "runtime-state.json",
        daemon_generation_path=tmp_path / "daemon-generation",
    )


def persist_connection(
    store: RuntimeStateStore,
    *,
    host: str,
    sync_port: int,
    async_port: int,
    scapy_port: int,
    client_name: str,
    connect_timeout_seconds: int,
) -> None:
    def persist(document: RuntimeStateDocument) -> RuntimeStateDocument:
        document.connection = RuntimeConnectionState(
            host=host,
            sync_port=sync_port,
            async_port=async_port,
            scapy_port=scapy_port,
            client_name=client_name,
            connect_timeout_seconds=connect_timeout_seconds,
            updated_at=utc_now_iso(),
        )
        return document

    store.update(persist)


class RecordingClient:
    def __init__(self) -> None:
        self.live_calls: list[str] = []
        self.disconnect_calls: list[dict[str, bool]] = []

    def get_all_ports(self) -> list[int]:
        self.live_calls.append("get_all_ports")
        return [0, 1]

    def get_stats(self, *, ports: list[int], sync_now: bool) -> dict[str, object]:
        self.live_calls.append("get_stats")
        return {"ports": ports, "sync_now": sync_now}

    def disconnect(self, *, stop_traffic: bool, release_ports: bool) -> None:
        self.disconnect_calls.append(
            {
                "stop_traffic": stop_traffic,
                "release_ports": release_ports,
            }
        )


def test_stale_service_rejects_live_operation_and_disconnect_before_old_client_touch(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    service = RealStlClientService(env)
    client = RecordingClient()
    service._client = client
    persist_connection(
        RuntimeStateStore(env.runtime_state_path),
        host="new.trex",
        sync_port=4511,
        async_port=4510,
        scapy_port=4517,
        client_name="NewClient",
        connect_timeout_seconds=9,
    )

    live_result = service._with_client(lambda current: current.get_all_ports())
    disconnect_result = service.disconnect()

    assert live_result.ok is False
    assert live_result.blocker == "trex_runtime_connection_changed"
    assert disconnect_result.ok is False
    assert disconnect_result.blocker == "trex_runtime_connection_changed"
    assert client.live_calls == []
    assert client.disconnect_calls == []


def test_connect_does_not_deadlock_with_waiting_sampler_and_stale_sample_is_fenced(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path)
    store = RuntimeStateStore(env.runtime_state_path)
    service = RealStlClientService(env)
    client = RecordingClient()
    service._client = client
    sampler = TrexStatsSampler(service)
    sampler_waiting = threading.Event()
    allow_sampler_to_enter_fence = threading.Event()
    original_with_client = service._with_client

    def delayed_with_client(operation: Callable[[Any], Any]) -> TrexCallResult:
        sampler_waiting.set()
        if not allow_sampler_to_enter_fence.wait(timeout=5):
            return TrexCallResult(False, blocker="test_timeout", error="sampler was not released")
        return original_with_client(operation)

    service._with_client = delayed_with_client  # type: ignore[method-assign]
    sampler_thread = threading.Thread(target=sampler.sample_once, daemon=True)
    sampler._thread = sampler_thread
    sampler_thread.start()
    assert sampler_waiting.wait(timeout=2)

    monkeypatch.setattr(dependencies, "_service", service)
    monkeypatch.setattr(dependencies, "_service_key", dependencies._environment_key(env))
    monkeypatch.setattr(dependencies, "_stats_sampler", sampler)
    monkeypatch.setattr("app.main.get_environment", lambda: env)

    def set_connection(**kwargs: Any) -> TrexEnvironment:
        persist_connection(
            store,
            host=kwargs["host"],
            sync_port=kwargs["sync_port"],
            async_port=kwargs["async_port"],
            scapy_port=kwargs["scapy_port"],
            client_name=kwargs["client_name"],
            connect_timeout_seconds=kwargs["connect_timeout_seconds"],
        )
        return replace(
            env,
            host=kwargs["host"],
            sync_port=kwargs["sync_port"],
            async_port=kwargs["async_port"],
            scapy_port=kwargs["scapy_port"],
            client_name=kwargs["client_name"],
            connect_timeout_seconds=kwargs["connect_timeout_seconds"],
        )

    monkeypatch.setattr("app.main.set_runtime_trex_connection", set_connection)
    monkeypatch.setattr("app.main.build_system_overview", lambda _service: {"ok": True})
    monkeypatch.setattr("app.main.get_stl_service", lambda: object())
    request = ConnectTrexRequest(
        host="new.trex",
        sync_port=4511,
        async_port=4510,
        scapy_port=4517,
        client_name="NewClient",
        timeout_seconds=9,
    )

    started_at = time.monotonic()
    with ThreadPoolExecutor(max_workers=1) as executor:
        connect_future = executor.submit(connect_trex, request)
        time.sleep(0.05)
        allow_sampler_to_enter_fence.set()
        payload = connect_future.result(timeout=4)
    sampler_thread.join(timeout=2)

    assert payload == {"ok": True}
    assert time.monotonic() - started_at < 4
    assert not sampler_thread.is_alive()
    assert client.live_calls == []
    assert client.disconnect_calls == [
        {"stop_traffic": False, "release_ports": False}
    ]
    assert dependencies._service is None
    assert dependencies._service_key is None
