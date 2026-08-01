from __future__ import annotations

import asyncio
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest

from app import main
from app.trex import dependencies
from app.trex.result import TrexCallResult
from app.trex.traffic_hard_stop import (
    TrafficHardStopReaper,
    TrafficHardStopReaperCloseError,
    normalize_hard_stop_at,
)


class RecordingHardStopService:
    def __init__(self) -> None:
        self.calls: list[datetime | None] = []
        self.called = threading.Event()
        self.closed = False

    def reap_expired_traffic_hard_stops(
        self,
        now: datetime | None = None,
    ) -> TrexCallResult:
        self.calls.append(now)
        self.called.set()
        return TrexCallResult(
            True,
            data={"attempted": False, "ports": [], "stopped": False},
        )

    def close(self) -> TrexCallResult:
        self.closed = True
        return TrexCallResult(True, data={"disconnected": True})

    def disconnect(self) -> TrexCallResult:
        return TrexCallResult(True, data={"disconnected": True})


def fake_environment(host: str = "127.0.0.1") -> Any:
    return SimpleNamespace(
        host=host,
        sync_port=4501,
        async_port=4500,
        scapy_port=4507,
        client_name="TestClient",
        connect_timeout_seconds=3,
        daemon_supervisor="systemd",
        runtime_state_path=f"/tmp/{host}-runtime-state.json",
        daemon_generation_path=f"/tmp/{host}-daemon-generation",
        scripts_dir="/tmp/scripts",
        profile_roots=["/tmp/profiles"],
    )


def test_reaper_uses_injected_clock_and_closes_without_hanging() -> None:
    now = datetime(2026, 7, 31, tzinfo=timezone.utc)
    service = RecordingHardStopService()
    reaper = TrafficHardStopReaper(
        lambda: service,
        clock=lambda: now,
        interval_seconds=0.01,
    )

    reaper.start()
    assert service.called.wait(timeout=1)
    reaper.close()

    assert reaper.running is False
    assert service.calls
    assert all(call == now for call in service.calls)
    assert reaper.last_result is not None
    assert reaper.last_error is None


def test_reaper_close_timeout_is_fail_closed_until_worker_exits() -> None:
    entered = threading.Event()
    release = threading.Event()

    class BlockingService(RecordingHardStopService):
        def reap_expired_traffic_hard_stops(
            self,
            now: datetime | None = None,
        ) -> TrexCallResult:
            entered.set()
            release.wait(timeout=2)
            return super().reap_expired_traffic_hard_stops(now)

    service = BlockingService()
    reaper = TrafficHardStopReaper(
        lambda: service,
        interval_seconds=0.001,
        close_timeout_seconds=0.02,
    )
    reaper.start()
    assert entered.wait(timeout=1)

    with pytest.raises(
        TrafficHardStopReaperCloseError,
        match="replacement is blocked",
    ):
        reaper.close()

    assert reaper.closed is True
    assert reaper.running is True
    release.set()
    deadline = time.monotonic() + 1
    while reaper.running and time.monotonic() < deadline:
        time.sleep(0.005)
    reaper.close()
    assert reaper.running is False


def test_reaper_logs_failure_transitions_with_rate_limit_and_recovery(
    caplog: pytest.LogCaptureFixture,
) -> None:
    monotonic = [100.0]

    class SequencedService:
        result = TrexCallResult(
            False,
            blocker="traffic_hard_stop_failed",
            error="stop unavailable",
            data={"session_id": "session-1", "ports": [0, 1]},
        )

        def reap_expired_traffic_hard_stops(
            self,
            _now: datetime | None = None,
        ) -> TrexCallResult:
            return self.result

    service = SequencedService()
    reaper = TrafficHardStopReaper(
        lambda: service,
        monotonic_clock=lambda: monotonic[0],
        failure_log_interval_seconds=60,
    )
    with caplog.at_level(
        logging.INFO,
        logger="app.trex.traffic_hard_stop",
    ):
        reaper.run_once()
        reaper.run_once()
        monotonic[0] += 61
        reaper.run_once()
        service.result = TrexCallResult(
            False,
            blocker="traffic_hard_stop_authority_mismatch",
            error="generation changed",
            data={"session_id": "session-1", "ports": [0, 1]},
        )
        reaper.run_once()
        service.result = TrexCallResult(
            True,
            data={
                "session_id": "session-1",
                "ports": [0, 1],
                "attempted": True,
                "stopped": True,
            },
        )
        reaper.run_once()

    warnings = [
        record
        for record in caplog.records
        if record.levelno == logging.WARNING
    ]
    assert len(warnings) == 3
    assert "session_id=session-1" in warnings[0].getMessage()
    assert "ports=[0, 1]" in warnings[0].getMessage()
    assert any(
        record.levelno == logging.INFO
        and "recovered" in record.getMessage()
        for record in caplog.records
    )


def test_reaper_logs_repeated_exception_once_per_interval(
    caplog: pytest.LogCaptureFixture,
) -> None:
    monotonic = [100.0]

    class ExplodingService:
        def reap_expired_traffic_hard_stops(
            self,
            _now: datetime | None = None,
        ) -> TrexCallResult:
            raise RuntimeError("TRex RPC exploded")

    reaper = TrafficHardStopReaper(
        lambda: ExplodingService(),
        monotonic_clock=lambda: monotonic[0],
        failure_log_interval_seconds=60,
    )
    with caplog.at_level(
        logging.WARNING,
        logger="app.trex.traffic_hard_stop",
    ):
        with pytest.raises(RuntimeError, match="exploded"):
            reaper.run_once()
        with pytest.raises(RuntimeError, match="exploded"):
            reaper.run_once()

    exception_logs = [
        record
        for record in caplog.records
        if "raised an exception" in record.getMessage()
    ]
    assert len(exception_logs) == 1
    assert exception_logs[0].exc_info is not None


def test_hard_stop_normalization_requires_future_bounded_utc() -> None:
    now = datetime(2026, 7, 31, tzinfo=timezone.utc)
    assert normalize_hard_stop_at(
        "2026-07-31T00:01:00+00:00",
        now=now,
    ) == "2026-07-31T00:01:00Z"
    with pytest.raises(ValueError, match="future"):
        normalize_hard_stop_at(
            "2026-07-31T00:00:00Z",
            now=now,
        )
    with pytest.raises(ValueError, match="maximum"):
        normalize_hard_stop_at(
            (now + timedelta(seconds=301)).isoformat(),
            now=now,
        )
    with pytest.raises(ValueError, match="absolute UTC"):
        normalize_hard_stop_at(
            "2026-07-31T00:01:00",
            now=now,
        )


def test_service_replacement_stops_old_reaper_and_starts_one_for_new_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_env = fake_environment()
    new_env = fake_environment("127.0.0.2")
    old_service = RecordingHardStopService()
    created: list[RecordingHardStopService] = []

    def service_factory(_environment: Any) -> RecordingHardStopService:
        service = RecordingHardStopService()
        created.append(service)
        return service

    monkeypatch.setattr(dependencies, "_service", old_service)
    monkeypatch.setattr(
        dependencies,
        "_service_key",
        dependencies._environment_key(old_env),
    )
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(dependencies, "_traffic_hard_stop_reaper", None)
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_enabled",
        False,
    )
    monkeypatch.setattr(dependencies, "get_environment", lambda: old_env)
    monkeypatch.setattr(dependencies, "RealStlClientService", service_factory)

    try:
        old_reaper = dependencies.start_traffic_hard_stop_reaper()
        assert old_reaper.running

        monkeypatch.setattr(dependencies, "get_environment", lambda: new_env)
        replacement = dependencies.get_stl_service()
        new_reaper = dependencies._traffic_hard_stop_reaper

        assert replacement is created[0]
        assert old_service.closed is True
        assert old_reaper.running is False
        assert new_reaper is not None
        assert new_reaper is not old_reaper
        assert new_reaper.running is True

        before_disconnect = dependencies._traffic_hard_stop_reaper
        assert dependencies.disconnect_stl_service().ok
        assert dependencies._traffic_hard_stop_reaper is before_disconnect
        assert before_disconnect is not None and before_disconnect.running

        dependencies.retire_disconnected_stl_service()
        assert before_disconnect.running is False
        assert dependencies._traffic_hard_stop_reaper is None
    finally:
        dependencies.stop_traffic_hard_stop_reaper()


def test_explicit_trex_termination_bypasses_hard_stop_disconnect_priority(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class PriorityBlockedService(RecordingHardStopService):
        def __init__(self) -> None:
            super().__init__()
            self.disconnect_calls = 0

        def _hard_stop_rpc_priority_failure(self) -> TrexCallResult:
            return TrexCallResult(
                False,
                blocker="traffic_hard_stop_priority",
                error="supervisor has priority",
            )

        def disconnect(self) -> TrexCallResult:
            self.disconnect_calls += 1
            return TrexCallResult(True, data={"disconnected": True})

    service = PriorityBlockedService()
    monkeypatch.setattr(dependencies, "_service", service)
    monkeypatch.setattr(dependencies, "_stats_sampler", None)

    ordinary = dependencies.disconnect_stl_service()
    terminating = dependencies.disconnect_stl_service_for_trex_termination()

    assert ordinary.ok is False
    assert ordinary.blocker == "traffic_hard_stop_priority"
    assert terminating.ok is True
    assert service.disconnect_calls == 1


def test_blocked_reaper_prevents_service_replacement_without_losing_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_env = fake_environment()
    new_env = fake_environment("127.0.0.2")
    entered = threading.Event()
    release = threading.Event()

    class BlockingService(RecordingHardStopService):
        def __init__(self) -> None:
            super().__init__()
            self.close_calls = 0

        def reap_expired_traffic_hard_stops(
            self,
            now: datetime | None = None,
        ) -> TrexCallResult:
            entered.set()
            release.wait(timeout=2)
            return super().reap_expired_traffic_hard_stops(now)

        def close(self) -> TrexCallResult:
            self.close_calls += 1
            return super().close()

    old_service = BlockingService()
    constructed: list[RecordingHardStopService] = []
    real_reaper = TrafficHardStopReaper
    monkeypatch.setattr(dependencies, "_service", old_service)
    monkeypatch.setattr(
        dependencies,
        "_service_key",
        dependencies._environment_key(old_env),
    )
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(dependencies, "_traffic_hard_stop_reaper", None)
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_service",
        None,
    )
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_enabled",
        False,
    )
    monkeypatch.setattr(dependencies, "get_environment", lambda: old_env)
    monkeypatch.setattr(
        dependencies,
        "TrafficHardStopReaper",
        lambda provider: real_reaper(
            provider,
            interval_seconds=0.001,
            close_timeout_seconds=0.02,
        ),
    )
    monkeypatch.setattr(
        dependencies,
        "RealStlClientService",
        lambda _environment: (
            constructed.append(RecordingHardStopService())
            or constructed[-1]
        ),
    )

    try:
        old_reaper = dependencies.start_traffic_hard_stop_reaper()
        assert entered.wait(timeout=1)
        monkeypatch.setattr(dependencies, "get_environment", lambda: new_env)

        with pytest.raises(TrafficHardStopReaperCloseError):
            dependencies.get_stl_service()

        assert constructed == []
        assert old_service.close_calls == 0
        assert dependencies._service is old_service
        assert dependencies._traffic_hard_stop_reaper is old_reaper
        assert dependencies._traffic_hard_stop_reaper_service is old_service
        assert old_reaper.closed is True
        assert old_reaper.running is True

        release.set()
        deadline = time.monotonic() + 1
        while old_reaper.running and time.monotonic() < deadline:
            time.sleep(0.005)
        replacement = dependencies.get_stl_service()

        assert replacement is constructed[0]
        assert old_service.close_calls == 1
        assert dependencies._traffic_hard_stop_reaper_service is replacement
        assert dependencies._traffic_hard_stop_reaper is not old_reaper
        assert dependencies._traffic_hard_stop_reaper is not None
        assert dependencies._traffic_hard_stop_reaper.running
    finally:
        release.set()
        dependencies.stop_traffic_hard_stop_reaper()


def test_constructor_failure_preserves_old_service_and_restarts_reaper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_env = fake_environment()
    new_env = fake_environment("127.0.0.2")
    old_service = RecordingHardStopService()
    monkeypatch.setattr(dependencies, "_service", old_service)
    monkeypatch.setattr(
        dependencies,
        "_service_key",
        dependencies._environment_key(old_env),
    )
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(dependencies, "_traffic_hard_stop_reaper", None)
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_service",
        None,
    )
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_enabled",
        False,
    )
    monkeypatch.setattr(dependencies, "get_environment", lambda: old_env)
    try:
        old_reaper = dependencies.start_traffic_hard_stop_reaper()
        monkeypatch.setattr(dependencies, "get_environment", lambda: new_env)
        monkeypatch.setattr(
            dependencies,
            "RealStlClientService",
            lambda _environment: (_ for _ in ()).throw(
                RuntimeError("replacement runtime state is invalid")
            ),
        )

        with pytest.raises(RuntimeError, match="runtime state is invalid"):
            dependencies.get_stl_service()

        replacement_reaper = dependencies._traffic_hard_stop_reaper
        assert dependencies._service is old_service
        assert old_service.closed is False
        assert old_reaper.running is False
        assert replacement_reaper is not None
        assert replacement_reaper is not old_reaper
        assert replacement_reaper.running
        assert dependencies._traffic_hard_stop_reaper_service is old_service
    finally:
        dependencies.stop_traffic_hard_stop_reaper()


def test_concurrent_fast_path_cannot_rebind_reaper_during_replacement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_env = fake_environment()
    new_env = fake_environment("127.0.0.2")
    old_service = RecordingHardStopService()
    factory_entered = threading.Event()
    release_factory = threading.Event()
    second_done = threading.Event()
    constructed: list[RecordingHardStopService] = []
    results: list[RecordingHardStopService] = []
    errors: list[BaseException] = []

    def service_factory(_environment: Any) -> RecordingHardStopService:
        factory_entered.set()
        release_factory.wait(timeout=2)
        service = RecordingHardStopService()
        constructed.append(service)
        return service

    monkeypatch.setattr(dependencies, "_service", old_service)
    monkeypatch.setattr(
        dependencies,
        "_service_key",
        dependencies._environment_key(old_env),
    )
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(dependencies, "_traffic_hard_stop_reaper", None)
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_service",
        None,
    )
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_enabled",
        False,
    )
    monkeypatch.setattr(dependencies, "get_environment", lambda: old_env)
    monkeypatch.setattr(
        dependencies,
        "RealStlClientService",
        service_factory,
    )

    def lookup(mark_done: bool = False) -> None:
        try:
            results.append(dependencies.get_stl_service())
        except BaseException as exc:
            errors.append(exc)
        finally:
            if mark_done:
                second_done.set()

    try:
        dependencies.start_traffic_hard_stop_reaper()
        monkeypatch.setattr(
            dependencies,
            "get_environment",
            lambda: new_env,
        )
        first = threading.Thread(target=lookup)
        first.start()
        assert factory_entered.wait(timeout=1)

        second = threading.Thread(
            target=lambda: lookup(True),
        )
        second.start()
        assert second_done.wait(timeout=0.03) is False
        release_factory.set()
        first.join(timeout=1)
        second.join(timeout=1)

        assert errors == []
        assert len(constructed) == 1
        assert results == [constructed[0], constructed[0]]
        assert old_service.closed is True
        assert dependencies._service is constructed[0]
        assert (
            dependencies._traffic_hard_stop_reaper_service
            is constructed[0]
        )
        assert dependencies._traffic_hard_stop_reaper is not None
        assert dependencies._traffic_hard_stop_reaper.running
    finally:
        release_factory.set()
        dependencies.stop_traffic_hard_stop_reaper()


def test_dead_worker_is_restarted_for_the_same_exact_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environment = fake_environment()
    service = RecordingHardStopService()
    reaper = TrafficHardStopReaper(
        lambda: service,
        interval_seconds=0.001,
        close_timeout_seconds=0.1,
    )
    dead_thread = threading.Thread(target=lambda: None)
    dead_thread.start()
    dead_thread.join()
    reaper._thread = dead_thread
    monkeypatch.setattr(dependencies, "_service", service)
    monkeypatch.setattr(
        dependencies,
        "_service_key",
        dependencies._environment_key(environment),
    )
    monkeypatch.setattr(dependencies, "_stats_sampler", None)
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper",
        reaper,
    )
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_service",
        service,
    )
    monkeypatch.setattr(
        dependencies,
        "_traffic_hard_stop_reaper_enabled",
        True,
    )
    monkeypatch.setattr(
        dependencies,
        "get_environment",
        lambda: environment,
    )
    try:
        assert reaper.running is False
        assert reaper.closed is False

        restarted = dependencies.start_traffic_hard_stop_reaper()

        assert restarted is reaper
        assert restarted.running
        assert service.called.wait(timeout=1)
    finally:
        dependencies.stop_traffic_hard_stop_reaper()


def test_fastapi_lifespan_starts_and_cleanly_stops_reaper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        main,
        "start_traffic_hard_stop_reaper",
        lambda: calls.append("start"),
    )
    monkeypatch.setattr(
        main,
        "stop_traffic_hard_stop_reaper",
        lambda: calls.append("stop"),
    )

    async def exercise_lifespan() -> None:
        async with main.application_lifespan(main.app):
            assert calls == ["start"]

    asyncio.run(exercise_lifespan())
    assert calls == ["start", "stop"]
