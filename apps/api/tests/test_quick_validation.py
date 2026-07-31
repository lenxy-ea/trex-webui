from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.settings import TrexEnvironment
from app.main import app
from app.trex.dependencies import get_stl_service
from app.trex.quick_validation import (
    QuickValidationAuthority,
    QuickValidationStartRequest,
    QuickValidationStateError,
    QuickValidationStateStore,
)
from app.trex.result import TrexCallResult


SESSION_ID = "11111111-1111-4111-8111-111111111111"
STOP_NONCE = "22222222-2222-4222-8222-222222222222"
OTHER_NONCE = "33333333-3333-4333-8333-333333333333"
PROCESS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PROCESS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PROFILE_SHA256 = "a" * 64


class MutableClock:
    def __init__(self) -> None:
        self.value = datetime(2026, 7, 31, 0, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += timedelta(seconds=seconds)


def environment(tmp_path: Path, *, timeout: int = 1) -> TrexEnvironment:
    scripts = tmp_path / "scripts"
    profiles = tmp_path / "profiles"
    scripts.mkdir()
    profiles.mkdir()
    return TrexEnvironment(
        host="127.0.0.1",
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=scripts,
        daemon_bin=scripts / "trex_daemon_server",
        config_path=tmp_path / "trex_cfg.yaml",
        daemon_log=tmp_path / "trex.log",
        profile_roots=[profiles],
        command_timeout_seconds=3,
        require_confirmation=False,
        daemon_supervisor="systemd",
        runtime_state_path=tmp_path / "runtime-state.json",
        daemon_generation_path=tmp_path / "daemon-generation",
        connect_timeout_seconds=timeout,
    )


class FakeQuickValidationService:
    def __init__(self, env: TrexEnvironment, clock: MutableClock) -> None:
        self.env = env
        self.clock = clock
        self.plan_revision = 7
        self.plan_duration = -1.0
        self.ports = [0, 1]
        self.counters = {
            0: {"opackets": 0.0, "ipackets": 0.0},
            1: {"opackets": 0.0, "ipackets": 0.0},
        }
        self.session: dict[str, Any] | None = None
        self.mutation_intent: dict[str, Any] | None = None
        self.runtime_failure: TrexCallResult | None = None
        self.start_failure: TrexCallResult | None = None
        self.stop_failure: TrexCallResult | None = None
        self.start_delay_seconds = 0.0
        self.counters_after_start: dict[int, dict[str, float]] | None = None
        self.counters_after_stop: dict[int, dict[str, float]] | None = None
        self.acquired_states = {0: False, 1: False}
        self.port_owners: dict[int, object] = {0: None, 1: None}
        self.omit_acquired_ports: set[int] = set()
        self.omit_owner_ports: set[int] = set()
        self.link_states = {0: "UP", 1: "UP"}
        self.port_statuses = {0: "IDLE", 1: "IDLE"}
        self.start_calls: list[dict[str, Any]] = []
        self.stop_calls: list[dict[str, Any]] = []

    def _timestamp(self) -> str:
        return self.clock().isoformat().replace("+00:00", "Z")

    def _start_evidence(self) -> dict[str, Any]:
        timestamp = self._timestamp()
        return {
            "intent_nonce": SESSION_ID,
            "operation": "start",
            "completion_mode": "direct",
            "ports": list(self.ports),
            "baseline_port_states": {0: "stopped", 1: "stopped"},
            "desired_port_states": {0: "running", 1: "running"},
            "baseline_acquired_ports": [],
            "prepared_at": timestamp,
            "completed_at": timestamp,
            "acquisition_restored": True,
            "wal_cleared": True,
        }

    def _running_group(self, hard_stop_at: str) -> dict[str, Any]:
        evidence = self._start_evidence()
        return {
            "group_id": "pair-0",
            "run_id": SESSION_ID,
            "source": "plan",
            "plan_revision": self.plan_revision,
            "ports": list(self.ports),
            "profile_path": "/profiles/udp.py",
            "profile_sha256": PROFILE_SHA256,
            "start_multiplier": "1kpps",
            "multiplier": "1kpps",
            "duration": -1.0,
            "start_force": False,
            "start_total": False,
            "start_synchronized": True,
            "start_clear_existing": True,
            "started_at": self._timestamp(),
            "ended_at": None,
            "hard_stop_at": hard_stop_at,
            "tunables": {"size": 64},
            "start_evidence": evidence,
            "cleanup_evidence": None,
            "state": "running",
            "port_states": {0: "running", 1: "running"},
            "updated_at": self._timestamp(),
        }

    def _runtime(self) -> dict[str, Any]:
        active = self.session is not None and self.session["state"] != "stopped"
        return {
            "plan_revision": self.plan_revision,
            "groups": [
                {
                    "id": "pair-0",
                    "name": "P0 ↔ P1",
                    "ports": list(self.ports),
                    "profile_path": "/profiles/udp.py",
                    "multiplier": "1kpps",
                    "duration": self.plan_duration,
                    "force": False,
                    "total": False,
                    "synchronized": True,
                    "clear_existing": True,
                    "tunables": {"size": 64},
                }
            ],
            "session": self.session,
            "mutation_intent": self.mutation_intent,
            "config": {
                "path": "/etc/trex_cfg.yaml",
                "port_limit": 2,
                "interfaces": ["0000:01:00.0", "0000:01:00.1"],
            },
            "available_ports": list(self.ports),
            "port_states": [
                {
                    "port": port,
                    "state": "running" if active else "stopped",
                    "ownership": "managed" if active else "none",
                }
                for port in self.ports
            ],
            "live_state_sampled": True,
            "reconciliation": "fake live runtime",
        }

    def traffic_runtime_snapshot(self) -> TrexCallResult:
        if self.runtime_failure is not None:
            return self.runtime_failure
        return TrexCallResult(True, data=self._runtime())

    def snapshot(self) -> TrexCallResult:
        port_records: list[dict[str, Any]] = []
        for port in self.ports:
            info: dict[str, Any] = {
                "link": self.link_states[port],
                "status": self.port_statuses[port],
                "owner": self.port_owners[port],
            }
            if port in self.omit_owner_ports:
                info.pop("owner")
            record: dict[str, Any] = {
                "id": port,
                "acquired": self.acquired_states[port],
                "info": info,
            }
            if port in self.omit_acquired_ports:
                record.pop("acquired")
            port_records.append(record)
        return TrexCallResult(
            True,
            data={
                "port_ids": list(self.ports),
                "ports": port_records,
            },
        )

    def start_traffic_group(
        self,
        group_id: str,
        expected_revision: int,
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        self.start_calls.append(
            {
                "group_id": group_id,
                "expected_revision": expected_revision,
                "expected_session_id": expected_session_id,
                "hard_stop_at": hard_stop_at,
            }
        )
        if self.start_failure is not None:
            return self.start_failure
        assert hard_stop_at is not None
        if self.start_delay_seconds:
            self.clock.advance(self.start_delay_seconds)
        if self.counters_after_start is not None:
            self.counters = {
                port: dict(counters)
                for port, counters in self.counters_after_start.items()
            }
        group = self._running_group(hard_stop_at)
        self.session = {
            "id": SESSION_ID,
            "revision": 1,
            "evidence_version": 1,
            "state": "running",
            "started_at": self._timestamp(),
            "updated_at": self._timestamp(),
            "ended_at": None,
            "groups": [group],
            "completed_groups": [],
            "mutation_evidence": [group["start_evidence"]],
            "reconciliation": "started",
        }
        return TrexCallResult(True, data={"accepted": True, "session": self.session})

    def traffic_action(
        self,
        action: str,
        ports: list[int] | None,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        self.stop_calls.append(
            {
                "action": action,
                "ports": ports,
                "expected_session_id": expected_session_id,
            }
        )
        if self.stop_failure is not None:
            return self.stop_failure
        assert action == "stop"
        assert ports == self.ports
        assert expected_session_id == SESSION_ID
        assert self.session is not None
        if self.counters_after_stop is not None:
            self.counters = {
                port: dict(counters)
                for port, counters in self.counters_after_stop.items()
            }
        timestamp = self._timestamp()
        stop_evidence = {
            "intent_nonce": STOP_NONCE,
            "operation": "stop",
            "completion_mode": "direct",
            "ports": list(self.ports),
            "baseline_port_states": {0: "running", 1: "running"},
            "desired_port_states": {0: "stopped", 1: "stopped"},
            "baseline_acquired_ports": list(self.ports),
            "prepared_at": timestamp,
            "completed_at": timestamp,
            "acquisition_restored": True,
            "wal_cleared": True,
        }
        group = self.session["groups"][0]
        group.update(
            {
                "state": "stopped",
                "port_states": {0: "stopped", 1: "stopped"},
                "hard_stop_at": None,
                "ended_at": timestamp,
                "updated_at": timestamp,
                "cleanup_evidence": {
                    "completion": "operator_stop",
                    "completed_at": timestamp,
                    "final_port_states": {0: "stopped", 1: "stopped"},
                    "intent_nonce": STOP_NONCE,
                    "acquisition_restored": True,
                    "wal_cleared": True,
                },
            }
        )
        self.session.update(
            {
                "revision": self.session["revision"] + 1,
                "state": "stopped",
                "updated_at": timestamp,
                "ended_at": timestamp,
            }
        )
        self.session["mutation_evidence"].append(stop_evidence)
        return TrexCallResult(
            True,
            data={
                "accepted": True,
                "action": "stop",
                "ports": list(self.ports),
                "state_persisted": True,
                "session": self.session,
            },
        )

    def stats(self, ports: list[int] | None = None) -> TrexCallResult:
        assert ports == self.ports
        return TrexCallResult(
            True,
            data={str(port): dict(self.counters[port]) for port in self.ports},
        )

    def stop_as_observed(self) -> None:
        assert self.session is not None
        timestamp = self._timestamp()
        group = self.session["groups"][0]
        group.update(
            {
                "state": "stopped",
                "port_states": {0: "stopped", 1: "stopped"},
                "hard_stop_at": None,
                "ended_at": timestamp,
                "updated_at": timestamp,
                "cleanup_evidence": {
                    "completion": "observed",
                    "completed_at": timestamp,
                    "final_port_states": {0: "stopped", 1: "stopped"},
                    "intent_nonce": None,
                    "acquisition_restored": None,
                    "wal_cleared": True,
                },
            }
        )
        self.session.update(
            {
                "revision": self.session["revision"] + 1,
                "state": "stopped",
                "updated_at": timestamp,
                "ended_at": timestamp,
            }
        )

    def stop_as_hard_stop(self) -> None:
        result = self.traffic_action(
            "stop",
            list(self.ports),
            expected_session_id=SESSION_ID,
        )
        assert result.ok is True
        assert self.session is not None
        group = self.session["groups"][0]
        group["cleanup_evidence"]["completion"] = "hard_stop"
        self.session["mutation_evidence"][-1]["completion_mode"] = "hard_stop"


def authority(
    tmp_path: Path,
    clock: MutableClock,
    *,
    process_id: str = PROCESS_A,
) -> tuple[QuickValidationAuthority, FakeQuickValidationService, QuickValidationStateStore]:
    env = environment(tmp_path)
    service = FakeQuickValidationService(env, clock)
    store = QuickValidationStateStore(
        tmp_path / "quick-validation.json",
        clock=clock,
    )
    return (
        QuickValidationAuthority(
            service,
            store=store,
            clock=clock,
            process_instance_id=process_id,
        ),
        service,
        store,
    )


def start_run(runtime: QuickValidationAuthority) -> dict[str, Any]:
    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )
    assert result.ok is True, result
    assert isinstance(result.data, dict)
    return result.data


def prepare_reconciled_stopped_session(
    runtime: QuickValidationAuthority,
    service: FakeQuickValidationService,
    clock: MutableClock,
) -> None:
    start_run(runtime)
    assert service.session is not None
    service.session["revision"] = 2
    reconciled = runtime.status()
    assert reconciled.data["run"]["traffic_session_revision"] == 2

    service.counters[0] = {"opackets": 100, "ipackets": 100}
    service.counters[1] = {"opackets": 100, "ipackets": 100}
    clock.advance(2)
    stopped = service.traffic_action(
        "stop",
        [0, 1],
        expected_session_id=SESSION_ID,
    )
    assert stopped.ok is True
    assert service.session is not None
    service.session["revision"] = 4
    service.session = json.loads(json.dumps(service.session))


def test_quick_validation_passes_only_after_exact_stop_and_idle(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)

    started = start_run(runtime)

    run = started["run"]
    assert run["phase"] == "running"
    assert run["traffic_session_id"] == SESSION_ID
    assert run["group"]["profile_sha256"] == PROFILE_SHA256
    assert service.start_calls[0]["expected_session_id"] is None
    watchdog = datetime.fromisoformat(
        service.start_calls[0]["hard_stop_at"].replace("Z", "+00:00")
    )
    assert watchdog > clock() + timedelta(seconds=2)
    assert watchdog <= clock() + timedelta(seconds=300)

    service.counters[0] = {"opackets": 100, "ipackets": 100}
    service.counters[1] = {"opackets": 100, "ipackets": 100}
    clock.advance(2)
    result = runtime.status()

    assert result.ok is True
    run = result.data["run"]
    assert run["phase"] == "pass"
    assert run["idle_verified"] is True
    assert run["cleanup"]["mode"] == "operator_stop"
    assert run["cleanup"]["intent_nonce"] == STOP_NONCE
    assert run["cleanup"]["wal_cleared"] is True
    assert run["samples"][-1]["total_loss_packets"] == 0
    assert datetime.fromisoformat(
        run["samples"][-1]["sampled_at"].replace("Z", "+00:00")
    ) >= datetime.fromisoformat(run["deadline_at"].replace("Z", "+00:00"))
    assert service.stop_calls == [
        {
            "action": "stop",
            "ports": [0, 1],
            "expected_session_id": SESSION_ID,
        }
    ]
    assert store.load().run == runtime.store.load().run


def test_cleanup_accepts_json_port_keys_and_forward_reconciliation_revision(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    prepare_reconciled_stopped_session(runtime, service, clock)
    assert service.session is not None
    stop_evidence = service.session["mutation_evidence"][-1]
    assert stop_evidence["desired_port_states"] == {
        "0": "stopped",
        "1": "stopped",
    }

    result = runtime.status()

    run = result.data["run"]
    assert run["phase"] == "pass"
    assert run["recovery_required"] is False
    assert run["traffic_session_revision"] == 4
    assert run["cleanup"]["traffic_session_revision"] == 4
    assert run["cleanup"]["intent_nonce"] == STOP_NONCE


@pytest.mark.parametrize(
    ("tamper", "expected_detail"),
    [
        ("revision_rollback", "revision moved backwards"),
        ("session_id", "session changed"),
        ("group_run_id", "group run changed"),
        ("cleanup_nonce", "exactly one stop mutation nonce"),
        ("duplicate_stop_nonce", "exactly one stop mutation nonce"),
        ("duplicate_stop_ports", "must not contain duplicates"),
        ("reordered_stop_ports", "ports do not match the guided run"),
        ("extra_desired_port", "desired port states do not match the guided run"),
        ("duplicate_desired_port_key", "duplicate normalized port keys"),
        ("cleanup_timestamp", "differs from the guided group end time"),
        ("final_state", "must report every target port as stopped"),
        ("group_state", "must report every target port as stopped"),
        ("acquisition", "has not restored acquisition and cleared WAL"),
        ("wal", "has not restored acquisition and cleared WAL"),
    ],
)
def test_cleanup_rejects_drift_from_saved_run_and_exact_stop_evidence(
    tmp_path: Path,
    tamper: str,
    expected_detail: str,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    prepare_reconciled_stopped_session(runtime, service, clock)
    assert service.session is not None
    session = service.session
    group = session["groups"][0]
    cleanup = group["cleanup_evidence"]
    stop_evidence = session["mutation_evidence"][-1]

    if tamper == "revision_rollback":
        session["revision"] = 1
    elif tamper == "session_id":
        session["id"] = OTHER_NONCE
    elif tamper == "group_run_id":
        group["run_id"] = OTHER_NONCE
    elif tamper == "cleanup_nonce":
        cleanup["intent_nonce"] = OTHER_NONCE
    elif tamper == "duplicate_stop_nonce":
        session["mutation_evidence"].append(dict(stop_evidence))
    elif tamper == "duplicate_stop_ports":
        stop_evidence["ports"] = [0, 1, 1]
    elif tamper == "reordered_stop_ports":
        stop_evidence["ports"] = [1, 0]
    elif tamper == "extra_desired_port":
        stop_evidence["desired_port_states"]["2"] = "stopped"
    elif tamper == "duplicate_desired_port_key":
        stop_evidence["desired_port_states"][0] = "stopped"
    elif tamper == "cleanup_timestamp":
        cleanup["completed_at"] = "2026-07-31T00:00:03Z"
    elif tamper == "final_state":
        cleanup["final_port_states"]["1"] = "running"
    elif tamper == "group_state":
        group["port_states"]["1"] = "running"
    elif tamper == "acquisition":
        stop_evidence["acquisition_restored"] = False
    elif tamper == "wal":
        stop_evidence["wal_cleared"] = False
    else:  # pragma: no cover - parametrization is exhaustive
        raise AssertionError(f"unknown cleanup tamper case: {tamper}")

    result = runtime.status()

    run = result.data["run"]
    assert run["phase"] == "stopping"
    assert run["recovery_required"] is True
    assert run["phase"] != "pass"
    assert expected_detail in run["failure_detail"]


def test_duration_window_starts_at_canonical_traffic_start(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    service.start_delay_seconds = 3
    service.counters_after_start = {
        0: {"opackets": 10, "ipackets": 10},
        1: {"opackets": 10, "ipackets": 10},
    }

    started = start_run(runtime)

    run = started["run"]
    assert run["phase"] == "running"
    started_at = datetime.fromisoformat(run["started_at"].replace("Z", "+00:00"))
    deadline_at = datetime.fromisoformat(run["deadline_at"].replace("Z", "+00:00"))
    assert deadline_at == started_at + timedelta(seconds=2)
    assert service.stop_calls == []

    service.counters[0] = {"opackets": 100, "ipackets": 100}
    service.counters[1] = {"opackets": 100, "ipackets": 100}
    clock.advance(2)
    completed = runtime.status()

    assert completed.data["run"]["phase"] == "pass"
    assert completed.data["run"]["cleanup"]["mode"] == "operator_stop"


def test_start_without_a_full_window_before_watchdog_cleans_up_and_fails(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    service.start_delay_seconds = 15
    service.counters_after_start = {
        0: {"opackets": 10, "ipackets": 10},
        1: {"opackets": 10, "ipackets": 10},
    }

    result = start_run(runtime)

    run = result["run"]
    assert run["phase"] == "fail"
    assert run["failure_code"] == "quick_validation_duration_window_unavailable"
    assert run["cleanup"]["mode"] == "operator_stop"
    assert run["idle_verified"] is True
    assert datetime.fromisoformat(run["deadline_at"].replace("Z", "+00:00")) >= (
        datetime.fromisoformat(run["watchdog_at"].replace("Z", "+00:00"))
    )


def test_early_canonical_stop_polled_after_deadline_cannot_pass(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    service.counters_after_start = {
        0: {"opackets": 10, "ipackets": 10},
        1: {"opackets": 10, "ipackets": 10},
    }
    start_run(runtime)
    clock.advance(0.5)
    service.traffic_action("stop", [0, 1], expected_session_id=SESSION_ID)
    clock.advance(2)

    result = runtime.status()

    run = result.data["run"]
    assert run["phase"] == "fail"
    assert run["failure_code"] == "quick_validation_traffic_stopped_early"
    assert run["cleanup"]["mode"] == "operator_stop"
    assert datetime.fromisoformat(
        service.session["groups"][0]["ended_at"].replace("Z", "+00:00")
    ) < datetime.fromisoformat(run["deadline_at"].replace("Z", "+00:00"))


def test_hard_stop_uses_final_counters_and_never_certifies_pass(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    service.counters_after_start = {
        0: {"opackets": 10, "ipackets": 10},
        1: {"opackets": 10, "ipackets": 10},
    }
    started = start_run(runtime)
    assert started["run"]["samples"][-1]["total_loss_packets"] == 0
    clock.advance(2)
    service.counters[0] = {"opackets": 100, "ipackets": 90}
    service.counters[1] = {"opackets": 100, "ipackets": 90}
    service.stop_as_hard_stop()

    result = runtime.status()

    run = result.data["run"]
    assert run["phase"] == "fail"
    assert run["failure_code"] == "quick_validation_hard_stop_triggered"
    assert run["cleanup"]["mode"] == "hard_stop"
    assert run["samples"][-1]["total_tx_packets"] == 200
    assert run["samples"][-1]["total_rx_packets"] == 180
    assert run["samples"][-1]["total_loss_packets"] == 20
    assert datetime.fromisoformat(
        run["samples"][-1]["sampled_at"].replace("Z", "+00:00")
    ) >= datetime.fromisoformat(run["deadline_at"].replace("Z", "+00:00"))


def test_operator_stop_samples_counters_again_after_stop_before_pass(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    start_run(runtime)
    service.counters[0] = {"opackets": 100, "ipackets": 100}
    service.counters[1] = {"opackets": 100, "ipackets": 100}
    service.counters_after_stop = {
        0: {"opackets": 101, "ipackets": 100},
        1: {"opackets": 100, "ipackets": 100},
    }
    clock.advance(2)

    result = runtime.status()

    run = result.data["run"]
    assert run["phase"] == "fail"
    assert run["failure_code"] == "quick_validation_packet_loss"
    assert run["cleanup"]["mode"] == "operator_stop"
    assert run["samples"][-2]["total_loss_packets"] == 0
    assert run["samples"][-1]["total_loss_packets"] == 1


def test_packet_loss_turns_requested_pass_into_verified_fail(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    start_run(runtime)
    service.counters[0] = {"opackets": 100, "ipackets": 90}
    service.counters[1] = {"opackets": 100, "ipackets": 90}
    clock.advance(2)

    result = runtime.status()

    assert result.data["run"]["phase"] == "fail"
    assert result.data["run"]["failure_code"] == "quick_validation_packet_loss"
    assert result.data["run"]["cleanup"]["mode"] == "operator_stop"
    assert result.data["run"]["idle_verified"] is True


def test_cancel_requires_exact_run_revision_and_verifies_cleanup(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    started = start_run(runtime)
    run = started["run"]

    stale = runtime.cancel(run_id=run["id"], run_revision=run["revision"] - 1)
    assert stale.ok is False
    assert stale.blocker == "quick_validation_run_conflict"
    assert service.stop_calls == []

    cancelled = runtime.cancel(
        run_id=run["id"],
        run_revision=run["revision"],
    )
    assert cancelled.ok is True
    assert cancelled.data["run"]["phase"] == "cancelled"
    assert cancelled.data["run"]["cleanup"]["mode"] == "operator_stop"
    assert cancelled.data["run"]["idle_verified"] is True


def test_api_restart_is_fail_closed_until_supervisor_cleanup_is_available(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    first, service, store = authority(tmp_path, clock, process_id=PROCESS_A)
    start_run(first)
    service.runtime_failure = TrexCallResult(
        False,
        blocker="trex_unavailable",
        error="restart in progress",
    )
    restarted = QuickValidationAuthority(
        service,
        store=store,
        clock=clock,
        process_instance_id=PROCESS_B,
    )

    pending = restarted.status()

    assert pending.ok is True
    run = pending.data["run"]
    assert run["phase"] == "stopping"
    assert run["recovery_required"] is True
    assert run["phase"] != "pass"
    assert service.stop_calls == []

    service.runtime_failure = None
    recovered = restarted.status()

    assert recovered.data["run"]["phase"] == "fail"
    assert recovered.data["run"]["idle_verified"] is True
    assert recovered.data["run"]["cleanup"]["mode"] == "operator_stop"


def test_observed_idle_never_becomes_a_terminal_or_passing_run(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    start_run(runtime)
    service.counters[0] = {"opackets": 100, "ipackets": 100}
    service.counters[1] = {"opackets": 100, "ipackets": 100}
    clock.advance(2)
    service.stop_as_observed()

    result = runtime.status()

    run = result.data["run"]
    assert run["phase"] == "stopping"
    assert run["recovery_required"] is True
    assert run["failure_code"] == "quick_validation_cleanup_evidence_invalid"
    assert run["phase"] != "pass"


def test_start_failure_never_claims_running_and_finishes_idle_fail(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    service.start_failure = TrexCallResult(
        False,
        blocker="traffic_profile_load_failed",
        error="profile rejected",
    )

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=5,
    )

    assert result.ok is False
    assert result.blocker == "traffic_profile_load_failed"
    assert result.data["run"]["phase"] == "fail"
    assert result.data["run"]["cleanup"]["mode"] == "not_started"
    assert result.data["run"]["idle_verified"] is True


def test_start_failure_does_not_bind_an_older_matching_stopped_session(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    service.start_traffic_group(
        "pair-0",
        7,
        None,
        (clock() + timedelta(seconds=30)).isoformat().replace("+00:00", "Z"),
    )
    service.traffic_action("stop", [0, 1], expected_session_id=SESSION_ID)
    clock.advance(60)
    service.start_failure = TrexCallResult(
        False,
        blocker="traffic_profile_load_failed",
        error="new start rejected",
    )

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=5,
    )

    assert result.ok is False
    run = result.data["run"]
    assert run["phase"] == "fail"
    assert run["traffic_session_id"] is None
    assert run["cleanup"]["mode"] == "not_started"


def test_new_run_replaces_terminal_only_with_exact_nullable_current_cas(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, _ = authority(tmp_path, clock)
    first = start_run(runtime)["run"]
    cancelled = runtime.cancel(
        run_id=first["id"],
        run_revision=first["revision"],
    ).data["run"]

    stale = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )
    assert stale.ok is False
    assert stale.blocker == "quick_validation_run_conflict"

    service.session = None
    second = runtime.start(
        expected_run_id=cancelled["id"],
        expected_run_revision=cancelled["revision"],
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )
    assert second.ok is True
    assert second.data["run"]["id"] != cancelled["id"]


def test_preflight_rejects_finite_plan_duration_without_starting(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)
    service.plan_duration = 1.0

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )

    assert result.ok is False
    assert result.blocker == "quick_validation_preflight_failed"
    assert "duration-disabled" in result.error
    assert service.start_calls == []
    assert store.load().run is None


def test_preflight_rejects_a_down_physical_link_without_starting(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)
    service.link_states[1] = "DOWN"

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )

    assert result.ok is False
    assert result.blocker == "quick_validation_preflight_failed"
    assert "P1 physical link UP" in result.error
    assert service.start_calls == []
    assert store.load().run is None


def test_preflight_rejects_a_port_acquired_by_the_current_client(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)
    service.acquired_states[1] = True

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )

    assert result.ok is False
    assert result.blocker == "quick_validation_preflight_failed"
    assert "P1 explicitly unacquired" in result.error
    assert service.start_calls == []
    assert store.load().run is None


def test_preflight_rejects_an_external_port_owner(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)
    service.port_owners[0] = "other-client"

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )

    assert result.ok is False
    assert result.blocker == "quick_validation_preflight_failed"
    assert "P0 no TRex owner" in result.error
    assert service.start_calls == []
    assert store.load().run is None


@pytest.mark.parametrize("missing_field", ["acquired", "owner"])
def test_preflight_rejects_missing_port_ownership_evidence(
    tmp_path: Path,
    missing_field: str,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)
    if missing_field == "acquired":
        service.omit_acquired_ports.add(0)
    else:
        service.omit_owner_ports.add(0)

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )

    assert result.ok is False
    assert result.blocker == "quick_validation_preflight_failed"
    assert "P0" in result.error
    assert service.start_calls == []
    assert store.load().run is None


def test_preflight_rejects_unknown_owner_marker(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    runtime, service, store = authority(tmp_path, clock)
    service.port_owners[0] = "unknown"

    result = runtime.start(
        expected_run_id=None,
        expected_run_revision=None,
        group_id="pair-0",
        plan_revision=7,
        duration_seconds=2,
    )

    assert result.ok is False
    assert result.blocker == "quick_validation_preflight_failed"
    assert "P0 no TRex owner" in result.error
    assert service.start_calls == []
    assert store.load().run is None


def test_state_store_rejects_symlink(tmp_path: Path) -> None:
    clock = MutableClock()
    target = tmp_path / "target.json"
    target.write_text("{}", encoding="utf-8")
    path = tmp_path / "state.json"
    path.symlink_to(target)

    with pytest.raises(QuickValidationStateError, match="non-symlink"):
        QuickValidationStateStore(path, clock=clock).load()


def test_request_requires_explicit_complete_nullable_cas() -> None:
    with pytest.raises(ValueError, match="expected_run_id"):
        QuickValidationStartRequest.model_validate(
            {
                "group_id": "pair-0",
                "plan_revision": 7,
                "duration_seconds": 2,
            }
        )
    with pytest.raises(ValueError, match="supplied together"):
        QuickValidationStartRequest.model_validate(
            {
                "expected_run_id": str(uuid.uuid4()),
                "expected_run_revision": None,
                "group_id": "pair-0",
                "plan_revision": 7,
                "duration_seconds": 2,
            }
        )


def test_http_contract_rejects_missing_quick_cas_and_zero_report_revision(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    _runtime, service, _store = authority(tmp_path, clock)
    app.dependency_overrides[get_stl_service] = lambda: service
    client = TestClient(app)
    try:
        missing_cas = client.post(
            "/api/trex/quick-validation/start",
            json={
                "group_id": "pair-0",
                "plan_revision": 7,
                "duration_seconds": 2,
            },
        )
        report_revision_zero = client.post(
            "/api/trex/reports/save",
            json={
                "title": "Report",
                "markdown": "body",
                "payload": {},
                "traffic_session_id": SESSION_ID,
                "traffic_session_revision": 0,
            },
        )
    finally:
        app.dependency_overrides.pop(get_stl_service, None)

    assert missing_cas.status_code == 422
    assert report_revision_zero.status_code == 422


def test_openapi_exposes_typed_quick_validation_contract() -> None:
    paths = app.openapi()["paths"]

    assert paths["/api/trex/quick-validation"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"]
    assert paths["/api/trex/quick-validation/start"]["post"]["responses"][
        "200"
    ]["content"]["application/json"]["schema"]
    assert paths["/api/trex/quick-validation/cancel"]["post"]["responses"][
        "200"
    ]["content"]["application/json"]["schema"]


def test_persisted_state_is_strict_versioned_json(tmp_path: Path) -> None:
    clock = MutableClock()
    runtime, _service, store = authority(tmp_path, clock)
    start_run(runtime)

    payload = json.loads(store.path.read_text(encoding="utf-8"))

    assert payload["version"] == 1
    assert payload["revision"] >= 2
    assert payload["run"]["revision"] >= 2
    assert payload["run"]["phase"] == "running"
