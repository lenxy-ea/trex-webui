from __future__ import annotations

import hashlib
import json
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import pytest
import yaml

from app.core.settings import TrexEnvironment
from app.main import ConnectTrexRequest, app, connect_trex
from app.trex import traffic_runtime as traffic_runtime_module
from app.trex.api_contracts import TrafficStartResultResponse
from app.trex.profile_operations import resolve_profile_path
from app.trex.result import TrexCallResult
from app.trex.runtime_state import (
    CaptureLeaseState,
    RuntimeAuthorityIdentity,
    RuntimeStateDocument,
    RuntimeStateError,
    RuntimeStateStore,
    TrafficSessionGroupState,
    TrafficSessionState,
)
from app.trex.traffic_runtime import TrafficRuntimeAuthority


class FakePort:
    def __init__(self, state: str = "stopped", link: str = "UP") -> None:
        self.state = state
        self.link = link
        self.streams: dict[int, object] = {}

    def sync(self) -> bool:
        return True

    def sync_streams(self) -> bool:
        return True

    def get_all_streams(self) -> dict[int, object]:
        return self.streams

    def is_paused(self) -> bool:
        return self.state == "paused"

    def is_transmitting(self) -> bool:
        return self.state == "running"

    def is_active(self) -> bool:
        return self.state in {"running", "paused", "unknown"}

    def get_port_state_name(self) -> str:
        return {
            "stopped": "IDLE",
            "running": "TRANSMITTING",
            "paused": "PAUSE",
        }.get(self.state, "UNKNOWN")


class FakeTrafficClient:
    def __init__(self, port_count: int = 6) -> None:
        self.ports = {port: FakePort() for port in range(port_count)}
        self.acquired: set[int] = set()
        self.calls: list[tuple[str, Any]] = []
        self.next_stream_id = 1

    def get_all_ports(self) -> list[int]:
        return sorted(self.ports)

    def get_acquired_ports(self) -> list[int]:
        return sorted(self.acquired)

    def get_port_info(self, ports: list[int]) -> list[dict[str, str]]:
        return [{"link": self.ports[port].link} for port in ports]

    def acquire(self, ports: list[int], force: bool, sync_streams: bool) -> None:
        self.calls.append(("acquire", ports))
        self.acquired.update(ports)

    def release(self, ports: list[int]) -> None:
        self.calls.append(("release", ports))
        self.acquired.difference_update(ports)

    def remove_all_streams(self, ports: list[int] | None) -> None:
        self.calls.append(("remove_all_streams", ports))
        target = self.get_all_ports() if ports is None else ports
        for port in target:
            self.ports[port].streams.clear()

    def add_profile(self, profile_path: str, ports: list[int] | None, **tunables: Any) -> list[int]:
        self.calls.append(("add_profile", {"path": profile_path, "ports": ports, "tunables": tunables}))
        target = self.get_all_ports() if ports is None else ports
        stream_id = self.next_stream_id
        self.next_stream_id += 1
        for port in target:
            self.ports[port].streams[stream_id] = object()
        return [stream_id]

    def remove_streams(
        self,
        stream_ids: list[int],
        ports: list[int] | None,
    ) -> None:
        target = self.get_all_ports() if ports is None else ports
        self.calls.append(
            ("remove_streams", {"stream_ids": stream_ids, "ports": target})
        )
        for port in target:
            for stream_id in stream_ids:
                self.ports[port].streams.pop(stream_id, None)

    def start(
        self,
        ports: list[int] | None,
        mult: str,
        duration: float,
        force: bool,
        total: bool,
        synchronized: bool,
    ) -> str:
        target = self.get_all_ports() if ports is None else ports
        self.calls.append(("start", target))
        for port in target:
            self.ports[port].state = "running"
        return "started"

    def stop(self, ports: list[int] | None) -> str:
        target = self.get_all_ports() if ports is None else ports
        self.calls.append(("stop", target))
        for port in target:
            self.ports[port].state = "stopped"
        return "stopped"

    def pause(self, ports: list[int] | None) -> str:
        target = self.get_all_ports() if ports is None else ports
        self.calls.append(("pause", target))
        for port in target:
            self.ports[port].state = "paused"
        return "paused"

    def resume(self, ports: list[int] | None) -> str:
        target = self.get_all_ports() if ports is None else ports
        self.calls.append(("resume", target))
        for port in target:
            self.ports[port].state = "running"
        return "resumed"

    def update(self, ports: list[int] | None, mult: str, force: bool, total: bool) -> str:
        target = self.get_all_ports() if ports is None else ports
        self.calls.append(("update", {"ports": target, "mult": mult}))
        return "updated"


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


class MutableUtcClock:
    def __init__(self, current: datetime) -> None:
        if current.tzinfo is None or current.utcoffset() != timedelta(0):
            raise ValueError("test clock must use UTC")
        self.current = current.astimezone(timezone.utc)

    def __call__(self) -> datetime:
        return self.current

    def advance(self, seconds: float) -> None:
        self.current += timedelta(seconds=seconds)

    def deadline(self, seconds: float) -> str:
        return (
            (self.current + timedelta(seconds=seconds))
            .isoformat()
            .replace("+00:00", "Z")
        )


def environment(tmp_path: Path, *, supervisor: str = "systemd") -> TrexEnvironment:
    scripts_dir = tmp_path / "scripts"
    profile_root = tmp_path / "profiles"
    scripts_dir.mkdir()
    profile_root.mkdir()
    (profile_root / "udp_1pkt_simple.py").write_text("profile", encoding="utf-8")
    config_path = tmp_path / "trex_cfg.yaml"
    config_path.write_text(
        yaml.safe_dump(
            [
                {
                    "version": 2,
                    "port_limit": 6,
                    "interfaces": [
                        "0000:01:00.0",
                        "0000:01:00.1",
                        "0000:01:00.2",
                        "0000:01:00.3",
                        "0000:02:00.0",
                        "0000:02:00.1",
                    ],
                    "port_bandwidth_gb": 1,
                }
            ],
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    generation_path = tmp_path / "daemon-generation"
    if supervisor == "systemd":
        generation_path.write_text(
            "11111111-1111-4111-8111-111111111111\n",
            encoding="ascii",
        )
        generation_path.chmod(0o644)
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
        require_confirmation=False,
        daemon_supervisor=supervisor,
        runtime_state_path=tmp_path / "runtime-state.json",
        daemon_generation_path=generation_path,
    )


def authority(
    env: TrexEnvironment,
    client: FakeTrafficClient,
    *,
    store: RuntimeStateStore | None = None,
    clock: Callable[[], datetime] | None = None,
) -> TrafficRuntimeAuthority:
    def with_client(operation: Callable[[Any], Any]) -> TrexCallResult:
        try:
            return TrexCallResult(True, data=operation(client))
        except Exception as exc:
            return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))

    kwargs: dict[str, Any] = {}
    if clock is not None:
        kwargs["clock"] = clock
    return TrafficRuntimeAuthority(
        env,
        lambda path: resolve_profile_path(env, path),
        with_client,
        store=store,
        runtime_authority=_TestRuntimeAuthorityProvider(env),  # type: ignore[arg-type]
        **kwargs,
    )


def test_empty_runtime_builds_three_pairs_from_six_port_config(tmp_path: Path) -> None:
    env = environment(tmp_path)
    result = authority(env, FakeTrafficClient()).snapshot()

    assert result.ok is True
    assert result.data["live_state_sampled"] is True
    assert result.data["plan_revision"] == 1
    assert result.data["session"] is None
    assert result.data["authority"] == {
        "host": "127.0.0.1",
        "sync_port": 4501,
        "async_port": 4500,
        "scapy_port": 4507,
        "daemon_supervisor": "systemd",
        "generation": "11111111-1111-4111-8111-111111111111",
    }
    assert [group["id"] for group in result.data["groups"]] == ["pair-0", "pair-1", "pair-2"]
    assert [group["ports"] for group in result.data["groups"]] == [[0, 1], [2, 3], [4, 5]]
    assert result.data["config"] == {
        "path": str(env.config_path),
        "port_limit": 6,
        "interfaces": [
            "0000:01:00.0",
            "0000:01:00.1",
            "0000:01:00.2",
            "0000:01:00.3",
            "0000:02:00.0",
            "0000:02:00.1",
        ],
    }


def test_snapshot_marks_failed_live_sampling_as_not_sampled(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    runtime = authority(env, FakeTrafficClient())
    runtime.with_client = lambda _operation: TrexCallResult(
        False,
        blocker="trex_unavailable",
        error="offline",
    )

    result = runtime.snapshot()

    assert result.ok is True
    assert result.data["live_state_sampled"] is False
    assert all(
        port["state"] == "unknown"
        for port in result.data["port_states"]
    )
    assert "live TRex port state unavailable" in result.data["reconciliation"]


def test_plan_replace_uses_independent_revision_and_rejects_invalid_authority(tmp_path: Path) -> None:
    env = environment(tmp_path)
    runtime = authority(env, FakeTrafficClient())
    assert runtime.snapshot().data["plan_revision"] == 1
    profile_path = str((env.profile_roots[0] / "udp_1pkt_simple.py").resolve())
    valid_group = {
        "id": "left",
        "name": "Left pair",
        "ports": [0, 1],
        "profile_path": profile_path,
        "multiplier": "10%",
        "duration": 30,
        "tunables": {"size": 128},
    }

    conflict = runtime.replace_plan(0, [valid_group])
    assert conflict.blocker == "traffic_plan_revision_conflict"

    updated = runtime.replace_plan(1, [valid_group])
    assert updated.ok is True
    assert updated.data["plan_revision"] == 2
    assert updated.data["groups"][0]["multiplier"] == "10%"
    assert updated.data["groups"][0]["tunables"] == {"size": 128}
    assert updated.data["live_state_sampled"] is False

    overlap = runtime.replace_plan(2, [valid_group, {**valid_group, "id": "right"}])
    assert overlap.blocker == "traffic_plan_invalid"
    assert "overlap" in overlap.error

    unknown_port = runtime.replace_plan(2, [{**valid_group, "ports": [6]}])
    assert unknown_port.blocker == "traffic_plan_invalid"
    assert "unknown ports" in unknown_port.error

    missing_profile = runtime.replace_plan(2, [{**valid_group, "profile_path": "missing.py"}])
    assert missing_profile.blocker == "traffic_plan_invalid"
    assert "profile is invalid" in missing_profile.error


@pytest.mark.parametrize(
    ("session_state", "target_ports"),
    [
        ("running", None),
        ("paused", [0, 1]),
        ("mixed", [0]),
        ("unknown", None),
    ],
)
def test_plan_replace_rejects_every_non_stopped_session_state_atomically(
    tmp_path: Path,
    session_state: str,
    target_ports: list[int] | None,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    snapshot = runtime.snapshot()
    revision = snapshot.data["plan_revision"]
    replacement = [
        {**group, "name": f"{group['name']} replacement"}
        for group in snapshot.data["groups"]
    ]
    started = runtime.start_group("pair-0", revision, None)
    assert started.ok is True
    if target_ports is not None:
        paused = runtime.action(
            "pause",
            target_ports,
            expected_session_id=started.data["session"]["id"],
        )
        assert paused.ok is True
    elif session_state == "unknown":
        store = RuntimeStateStore(env.runtime_state_path)

        def mark_unknown(
            document: RuntimeStateDocument,
        ) -> RuntimeStateDocument:
            assert document.traffic_session is not None
            group = document.traffic_session.groups[0]
            group.port_states[group.ports[0]] = "unknown"
            group.state = "unknown"
            document.traffic_session.state = "unknown"
            return document

        store.update(mark_unknown)

    before = RuntimeStateStore(env.runtime_state_path).load()
    assert before.traffic_session is not None
    assert before.traffic_session.state == session_state

    result = runtime.replace_plan(revision, replacement)
    after = RuntimeStateStore(env.runtime_state_path).load()

    assert result.ok is False
    assert result.blocker == "traffic_plan_runtime_busy"
    assert after.traffic_plan_revision == before.traffic_plan_revision
    assert after.traffic_groups == before.traffic_groups


def test_plan_replace_rejects_pending_mutation_intent_before_session_state(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    snapshot = runtime.snapshot()
    revision = snapshot.data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    assert started.ok is True
    monkeypatch.setattr(
        traffic_runtime_module,
        "execute_update_traffic",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            SystemExit("leave prepared update WAL")
        ),
    )
    with pytest.raises(SystemExit):
        runtime.update(
            [0, 1],
            "25%",
            False,
            False,
            expected_session_id=started.data["session"]["id"],
        )
    replacement = [
        {**group, "name": f"{group['name']} replacement"}
        for group in snapshot.data["groups"]
    ]
    before = RuntimeStateStore(env.runtime_state_path).load()
    assert before.traffic_mutation_intent is not None

    result = runtime.replace_plan(revision, replacement)
    after = RuntimeStateStore(env.runtime_state_path).load()

    assert result.ok is False
    assert result.blocker == "traffic_plan_runtime_busy"
    assert "durable mutation intent" in result.error
    assert after.traffic_plan_revision == before.traffic_plan_revision
    assert after.traffic_groups == before.traffic_groups
    assert after.traffic_mutation_intent == before.traffic_mutation_intent


def test_plan_replace_rejects_stopped_session_with_stale_hard_stop_lease(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    snapshot = runtime.snapshot()
    revision = snapshot.data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    assert started.ok is True
    stopped = runtime.action(
        "stop",
        [0, 1],
        expected_session_id=started.data["session"]["id"],
    )
    assert stopped.ok is True
    store = RuntimeStateStore(env.runtime_state_path)

    def retain_stale_lease(
        document: RuntimeStateDocument,
    ) -> RuntimeStateDocument:
        assert document.traffic_session is not None
        document.traffic_session.groups[0].hard_stop_at = (
            "2026-08-01T00:00:00Z"
        )
        return document

    store.update(retain_stale_lease)
    replacement = [
        {**group, "name": f"{group['name']} replacement"}
        for group in snapshot.data["groups"]
    ]

    result = runtime.replace_plan(revision, replacement)

    assert result.ok is False
    assert result.blocker == "traffic_plan_runtime_busy"
    persisted = store.load()
    assert persisted.traffic_plan_revision == revision
    assert persisted.traffic_session is not None
    assert (
        persisted.traffic_session.groups[0].hard_stop_at
        == "2026-08-01T00:00:00Z"
    )


def test_plan_replace_allows_a_fully_stopped_lease_free_session(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    snapshot = runtime.snapshot()
    revision = snapshot.data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    assert started.ok is True
    stopped = runtime.action(
        "stop",
        [0, 1],
        expected_session_id=started.data["session"]["id"],
    )
    assert stopped.ok
    replacement = [
        {**group, "name": f"{group['name']} replacement"}
        for group in snapshot.data["groups"]
    ]

    result = runtime.replace_plan(revision, replacement)

    assert result.ok is True
    assert result.data["plan_revision"] == revision + 1
    assert result.data["live_state_sampled"] is False
    assert result.data["session"]["revision"] == stopped.data["session"]["revision"]
    assert result.data["session"]["groups"][0]["plan_revision"] == revision


def test_get_then_concurrent_start_prevents_stale_plan_put(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    store = RuntimeStateStore(env.runtime_state_path)
    writer = authority(env, client, store=store)
    starter = authority(env, client, store=store)
    snapshot = writer.snapshot()
    revision = snapshot.data["plan_revision"]
    replacement = [
        {**group, "name": f"{group['name']} replacement"}
        for group in snapshot.data["groups"]
    ]
    start_result: list[TrexCallResult] = []

    thread = threading.Thread(
        target=lambda: start_result.append(
            starter.start_group("pair-0", revision, None)
        )
    )
    thread.start()
    thread.join(timeout=5)
    assert not thread.is_alive()
    assert start_result and start_result[0].ok is True

    put_result = writer.replace_plan(revision, replacement)

    assert put_result.ok is False
    assert put_result.blocker == "traffic_plan_runtime_busy"
    persisted = store.load()
    assert persisted.traffic_plan_revision == revision
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.state == "running"


def test_group_start_uses_persisted_plan_and_records_actions(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    snapshot = runtime.snapshot()

    started = runtime.start_group(
        "pair-0",
        snapshot.data["plan_revision"],
        None,
    )
    assert started.ok is True
    session_id = started.data["session"]["id"]
    assert started.data["ports"] == [0, 1]
    assert started.data["state_persisted"] is True
    started_session = started.data["session"]
    started_group = started_session["groups"][0]
    assert started_session["revision"] == 1
    assert started_session["evidence_version"] == 1
    assert started_group["group_id"] == "pair-0"
    assert started_group["source"] == "plan"
    assert started_group["plan_revision"] == snapshot.data["plan_revision"]
    assert started_group["profile_sha256"] == hashlib.sha256(b"profile").hexdigest()
    assert started_group["start_multiplier"] == "1"
    assert started_group["run_id"] == started_group["start_evidence"]["intent_nonce"]
    assert started_group["start_evidence"]["completion_mode"] == "direct"
    assert started_group["start_evidence"]["acquisition_restored"] is True
    assert started_group["start_evidence"]["wal_cleared"] is True

    paused = runtime.action("pause", [0, 1], expected_session_id=session_id)
    assert paused.ok is True
    assert paused.data["action"] == "pause"
    assert paused.data["ports"] == [0, 1]
    assert paused.data["session"]["state"] == "paused"

    updated = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )
    assert updated.ok is True
    assert updated.data["session"]["groups"][0]["multiplier"] == "25%"
    assert updated.data["session"]["groups"][0]["start_multiplier"] == "1"

    stopped = runtime.action("stop", [0, 1], expected_session_id=session_id)
    assert stopped.ok is True
    assert stopped.data["session"]["state"] == "stopped"
    assert stopped.data["session"]["revision"] == 4
    assert [
        evidence["operation"]
        for evidence in stopped.data["session"]["mutation_evidence"]
    ] == ["start", "pause", "update", "stop"]
    assert stopped.data["session"]["groups"][0]["cleanup_evidence"][
        "completion"
    ] == "operator_stop"
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_session.state == "stopped"  # type: ignore[union-attr]


def test_ad_hoc_start_never_claims_matching_plan_group_identity(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    runtime = authority(env, FakeTrafficClient())
    snapshot = runtime.snapshot()

    started = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1kpps",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert started.ok is True
    group = started.data["session"]["groups"][0]
    assert group["source"] == "ad_hoc"
    assert group["group_id"] is None
    assert group["plan_revision"] is None
    assert group["multiplier"] == "1kpps"
    assert snapshot.data["groups"][0]["id"] == "pair-0"
    assert snapshot.data["groups"][0]["multiplier"] == "1"


def test_legacy_active_session_is_stop_only_and_never_gains_evidence(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    persisted = RuntimeStateStore(env.runtime_state_path).load().traffic_session
    assert persisted is not None
    legacy = TrafficSessionState(
        id=persisted.id,
        authority=persisted.authority,
        state="running",
        started_at=persisted.started_at,
        updated_at=persisted.updated_at,
        groups=[
            TrafficSessionGroupState(
                group_id="pair-0",
                ports=[0, 1],
                profile_path=persisted.groups[0].profile_path,
                multiplier="1",
                duration=-1,
                state="running",
                port_states={0: "running", 1: "running"},
                updated_at=persisted.updated_at,
            )
        ],
    )
    store = RuntimeStateStore(env.runtime_state_path)
    store.update(
        lambda document: document.model_copy(
            update={"traffic_session": legacy},
            deep=True,
        )
    )
    client.calls.clear()

    paused = runtime.action("pause", [0, 1], expected_session_id=session_id)
    updated = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )

    assert paused.blocker == "traffic_session_evidence_unavailable"
    assert updated.blocker == "traffic_session_evidence_unavailable"
    assert client.calls == []
    stopped = runtime.action("stop", [0, 1], expected_session_id=session_id)
    assert stopped.ok is True
    assert stopped.data["session"]["state"] == "stopped"
    assert stopped.data["session"]["evidence_version"] is None
    assert stopped.data["session"]["mutation_evidence"] == []


def test_hard_stop_lease_persists_across_pause_resume_and_clears_on_stop(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    deadline = clock.deadline(60)

    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=deadline,
    )
    assert started.ok is True
    session_id = started.data["session"]["id"]
    assert started.data["session"]["groups"][0]["hard_stop_at"] == deadline
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.groups[0].hard_stop_at == deadline

    paused = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )
    assert paused.ok is True
    assert paused.data["session"]["groups"][0]["hard_stop_at"] == deadline
    resumed = runtime.action(
        "resume",
        [0, 1],
        expected_session_id=session_id,
    )
    assert resumed.ok is True
    assert resumed.data["session"]["groups"][0]["hard_stop_at"] == deadline

    stopped = runtime.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    )
    assert stopped.ok is True
    assert stopped.data["session"]["groups"][0]["hard_stop_at"] is None
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.groups[0].hard_stop_at is None


@pytest.mark.parametrize(
    ("durable_state", "pause_before_failure"),
    [("running", False), ("paused", True)],
)
def test_transient_snapshot_failure_preserves_exact_lease_for_restart_reaper(
    tmp_path: Path,
    durable_state: str,
    pause_before_failure: bool,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    deadline = clock.deadline(60)
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=deadline,
    )
    assert started.ok is True
    if pause_before_failure:
        paused = runtime.action(
            "pause",
            [0, 1],
            expected_session_id=started.data["session"]["id"],
        )
        assert paused.ok is True
    runtime.with_client = lambda _operation: TrexCallResult(
        False,
        blocker="trex_unavailable",
        error="transient sampling failure",
    )

    failed_sample = runtime.snapshot()
    persisted = RuntimeStateStore(env.runtime_state_path).load()

    assert failed_sample.ok is True
    assert failed_sample.data["live_state_sampled"] is False
    assert all(
        port["state"] == "unknown"
        for port in failed_sample.data["port_states"]
    )
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.state == durable_state
    assert persisted.traffic_session.groups[0].state == durable_state
    assert persisted.traffic_session.groups[0].port_states == {
        0: durable_state,
        1: durable_state,
    }
    assert persisted.traffic_session.groups[0].hard_stop_at == deadline

    clock.advance(61)
    restarted = authority(env, client, clock=clock)
    reaped = restarted.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert reaped.data["ports"] == [0, 1]
    assert [client.ports[port].state for port in [0, 1]] == [
        "stopped",
        "stopped",
    ]
    recovered = RuntimeStateStore(env.runtime_state_path).load()
    assert recovered.traffic_session is not None
    assert recovered.traffic_session.state == "stopped"
    assert recovered.traffic_session.groups[0].hard_stop_at is None


def test_pause_rejects_finite_duration_before_any_live_operation(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    started = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1",
        duration=30,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )
    assert started.ok is True
    session_id = started.data["session"]["id"]
    client.calls.clear()

    paused = runtime.action(
        "pause",
        [0],
        expected_session_id=session_id,
    )

    assert paused.ok is False
    assert paused.blocker == "traffic_pause_unsupported_finite_duration"
    assert "duration-disabled" in paused.error
    assert client.calls == []
    assert RuntimeStateStore(
        env.runtime_state_path
    ).load().traffic_mutation_intent is None


def test_lease_rpc_budget_blocks_start_and_non_stop_mutations_before_hardware(
    tmp_path: Path,
) -> None:
    base_env = environment(tmp_path, supervisor="systemd")
    env = replace(base_env, connect_timeout_seconds=3)
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    client.calls.clear()

    too_short = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(30),
    )

    assert too_short.ok is False
    assert too_short.blocker == "traffic_hard_stop_window_insufficient"
    assert too_short.data["rpc_count"] == 12
    assert client.calls == []
    assert RuntimeStateStore(
        env.runtime_state_path
    ).load().traffic_mutation_intent is None

    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(80),
    )
    assert started.ok is True
    session_id = started.data["session"]["id"]
    clock.advance(56)
    client.calls.clear()

    paused = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )
    updated = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )

    assert paused.blocker == "traffic_hard_stop_window_insufficient"
    assert updated.blocker == "traffic_hard_stop_window_insufficient"
    assert client.calls == []
    assert RuntimeStateStore(
        env.runtime_state_path
    ).load().traffic_mutation_intent is None

    stopped = runtime.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    )
    assert stopped.ok is True
    assert ("stop", [0, 1]) in client.calls


def test_earliest_session_lease_guards_other_group_rpcs_and_partial_stop(
    tmp_path: Path,
) -> None:
    base_env = environment(tmp_path, supervisor="systemd")
    env = replace(base_env, connect_timeout_seconds=3)
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    first = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(80),
    )
    session_id = first.data["session"]["id"]
    assert runtime.start_group(
        "pair-1",
        revision,
        session_id,
        hard_stop_at=clock.deadline(200),
    ).ok
    clock.advance(56)
    client.calls.clear()

    paused_other = runtime.action(
        "pause",
        [2, 3],
        expected_session_id=session_id,
    )
    updated_other = runtime.update(
        [2, 3],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )
    start_other = runtime.start_group(
        "pair-2",
        revision,
        session_id,
        hard_stop_at=clock.deadline(100),
    )
    stop_other = runtime.action(
        "stop",
        [2, 3],
        expected_session_id=session_id,
    )

    assert {
        paused_other.blocker,
        updated_other.blocker,
        start_other.blocker,
        stop_other.blocker,
    } == {"traffic_hard_stop_window_insufficient"}
    assert client.calls == []

    stop_expiring = runtime.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    )

    assert stop_expiring.ok is True
    assert client.calls == [
        ("acquire", [0, 1]),
        ("stop", [0, 1]),
        ("release", [0, 1]),
    ]
    assert client.ports[2].state == "running"
    assert client.ports[3].state == "running"


def test_budget_is_rechecked_after_sampling_and_after_wal_fsync(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_env = environment(tmp_path, supervisor="systemd")
    env = replace(base_env, connect_timeout_seconds=3)
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(80),
    )
    session_id = started.data["session"]["id"]
    original_sample = runtime._sample_session_mutation_baseline

    def slow_sample(
        configured_ports: list[int],
        target_ports: list[int],
    ) -> TrexCallResult:
        result = original_sample(configured_ports, target_ports)
        clock.advance(68)
        return result

    monkeypatch.setattr(
        runtime,
        "_sample_session_mutation_baseline",
        slow_sample,
    )
    client.calls.clear()
    blocked_update = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )

    assert blocked_update.blocker == "traffic_hard_stop_window_insufficient"
    assert not any(call[0] == "update" for call in client.calls)
    assert RuntimeStateStore(
        env.runtime_state_path
    ).load().traffic_mutation_intent is None

    # Reset to a fresh session lease and advance only after the prepared WAL
    # has been fsynced; the final boundary check must CAS-clear it without a
    # pause RPC.
    clock.current = datetime(2026, 7, 31, tzinfo=timezone.utc)
    store = RuntimeStateStore(env.runtime_state_path)

    def renew(document: RuntimeStateDocument) -> RuntimeStateDocument:
        assert document.traffic_session is not None
        document.traffic_session.groups[0].hard_stop_at = clock.deadline(80)
        return document

    store.update(renew)
    monkeypatch.setattr(
        runtime,
        "_sample_session_mutation_baseline",
        original_sample,
    )
    original_prepare = runtime._prepare_traffic_mutation_intent

    def slow_prepare(**kwargs: Any) -> Any:
        intent = original_prepare(**kwargs)
        clock.advance(68)
        return intent

    monkeypatch.setattr(
        runtime,
        "_prepare_traffic_mutation_intent",
        slow_prepare,
    )
    client.calls.clear()
    blocked_pause = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )

    assert blocked_pause.blocker == "traffic_hard_stop_window_insufficient"
    assert not any(call[0] == "pause" for call in client.calls)
    assert store.load().traffic_mutation_intent is None


def test_start_stage_budget_recheck_prevents_next_profile_or_start_rpc(
    tmp_path: Path,
) -> None:
    base_env = environment(tmp_path, supervisor="systemd")
    env = replace(base_env, connect_timeout_seconds=3)
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))

    class SlowAcquireClient(FakeTrafficClient):
        def acquire(
            self,
            ports: list[int],
            force: bool,
            sync_streams: bool,
        ) -> None:
            super().acquire(ports, force, sync_streams)
            clock.advance(70)

    client = SlowAcquireClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    client.calls.clear()

    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(80),
    )

    assert started.ok is False
    assert started.blocker == "traffic_mutation_recovery_required"
    assert not any(
        call[0] in {"remove_all_streams", "add_profile", "start"}
        for call in client.calls
    )
    assert client.get_acquired_ports() == []
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is not None
    assert persisted.traffic_mutation_intent.phase == "cleanup_required"


def test_failed_post_budget_wal_clear_never_replays_before_reaper_stop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_env = environment(tmp_path, supervisor="systemd")
    env = replace(base_env, connect_timeout_seconds=3)
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(80),
    )
    session_id = started.data["session"]["id"]
    original_prepare = runtime._prepare_traffic_mutation_intent

    def slow_prepare(**kwargs: Any) -> Any:
        intent = original_prepare(**kwargs)
        clock.advance(68)
        return intent

    monkeypatch.setattr(
        runtime,
        "_prepare_traffic_mutation_intent",
        slow_prepare,
    )
    monkeypatch.setattr(
        runtime,
        "_clear_traffic_mutation_intent",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeStateError("injected clear fsync failure")
        ),
    )
    client.calls.clear()

    paused = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )
    retained = RuntimeStateStore(env.runtime_state_path).load()

    assert paused.blocker == "traffic_mutation_recovery_required"
    assert retained.traffic_mutation_intent is not None
    assert retained.traffic_mutation_intent.phase == "cleanup_required"
    assert not any(call[0] == "pause" for call in client.calls)

    snapshot = runtime.snapshot()

    assert snapshot.ok is True
    assert snapshot.data["live_state_sampled"] is False
    assert "durable-only snapshot" in snapshot.data["reconciliation"]
    assert snapshot.data["mutation_intent"]["phase"] == "cleanup_required"
    assert not any(call[0] == "pause" for call in client.calls)

    monkeypatch.setattr(
        runtime,
        "_clear_traffic_mutation_intent",
        TrafficRuntimeAuthority._clear_traffic_mutation_intent.__get__(
            runtime,
            TrafficRuntimeAuthority,
        ),
    )
    clock.advance(13)
    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert [client.ports[port].state for port in [0, 1]] == [
        "stopped",
        "stopped",
    ]
    assert not any(call[0] == "pause" for call in client.calls)


def test_expired_lease_recovers_lost_start_response_without_replay(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    first = authority(env, client, clock=clock)
    revision = first.snapshot().data["plan_revision"]
    deadline = clock.deadline(60)

    monkeypatch.setattr(
        first,
        "_persist_start",
        lambda **_kwargs: (_ for _ in ()).throw(
            SystemExit("start response lost after live start")
        ),
    )
    with pytest.raises(SystemExit):
        first.start_group(
            "pair-0",
            revision,
            None,
            hard_stop_at=deadline,
        )
    crashed = RuntimeStateStore(env.runtime_state_path).load()
    assert crashed.traffic_session is None
    assert crashed.traffic_mutation_intent is not None
    assert (
        crashed.traffic_mutation_intent.start_group is not None
        and crashed.traffic_mutation_intent.start_group.hard_stop_at == deadline
    )
    assert [client.ports[port].state for port in [0, 1]] == [
        "running",
        "running",
    ]
    start_calls = [call for call in client.calls if call[0] == "start"]

    clock.advance(61)
    restarted = authority(env, client, clock=clock)
    reaped = restarted.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert reaped.data["stopped"] is True
    assert [client.ports[port].state for port in [0, 1]] == [
        "stopped",
        "stopped",
    ]
    assert [call for call in client.calls if call[0] == "start"] == start_calls
    recovered = RuntimeStateStore(env.runtime_state_path).load()
    assert recovered.traffic_mutation_intent is None
    assert recovered.traffic_session is None
    assert client.get_acquired_ports() == []


def test_reaper_stops_paused_lease_after_api_restart_once_and_releases_ports(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    first = authority(env, client, clock=clock)
    revision = first.snapshot().data["plan_revision"]
    deadline = clock.deadline(60)
    started = first.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=deadline,
    )
    session_id = started.data["session"]["id"]
    assert first.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    ).ok
    stop_calls_before = len(
        [call for call in client.calls if call[0] == "stop"]
    )

    clock.advance(61)
    restarted = authority(env, client, clock=clock)
    first_reap = restarted.reap_expired_hard_stops(clock())
    second_reap = restarted.reap_expired_hard_stops(clock())

    assert first_reap.ok is True
    assert first_reap.data["ports"] == [0, 1]
    assert second_reap.ok is True
    assert second_reap.data["attempted"] is False
    assert len([call for call in client.calls if call[0] == "stop"]) == (
        stop_calls_before + 1
    )
    assert client.get_acquired_ports() == []
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.state == "stopped"
    assert persisted.traffic_session.groups[0].hard_stop_at is None


def test_reaper_never_stops_after_authority_generation_changes(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    assert runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    ).ok
    client.calls.clear()
    env.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    clock.advance(61)

    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is False
    assert reaped.blocker == "traffic_hard_stop_authority_mismatch"
    assert not any(call[0] == "stop" for call in client.calls)
    assert [client.ports[port].state for port in [0, 1]] == [
        "running",
        "running",
    ]


def test_confirmed_daemon_termination_retires_cross_generation_session_without_rpc(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = started.data["session"]["id"]
    env.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client.calls.clear()

    retired = runtime.retire_after_trex_termination()

    assert retired.ok is True
    assert retired.data == {
        "retired": True,
        "session_id": session_id,
        "ports": [0, 1],
        "mutation_intent_cleared": False,
    }
    assert client.calls == []
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.state == "stopped"
    assert persisted.traffic_session.revision == 2
    assert persisted.traffic_session.groups[0].hard_stop_at is None
    assert persisted.traffic_session.groups[0].cleanup_evidence is not None
    assert (
        persisted.traffic_session.groups[0].cleanup_evidence.completion
        == "observed"
    )


def test_reaper_session_cas_refuses_replaced_session_without_stop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    original_session_id = started.data["session"]["id"]
    original_action = runtime.action
    client.calls.clear()

    def replace_before_stop(
        action: str,
        ports: list[int] | None,
        *,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        def replace_session(
            document: RuntimeStateDocument,
        ) -> RuntimeStateDocument:
            assert document.traffic_session is not None
            replacement_id = "99999999-9999-4999-8999-999999999999"
            replacement = document.traffic_session.model_copy(deep=True)
            replacement_start = replacement.mutation_evidence[0].model_copy(
                update={"intent_nonce": replacement_id},
                deep=True,
            )
            replacement.id = replacement_id
            replacement.mutation_evidence[0] = replacement_start
            replacement.groups[0].run_id = replacement_id
            replacement.groups[0].start_evidence = (
                replacement_start.model_copy(deep=True)
            )
            document.traffic_session = replacement
            return document

        RuntimeStateStore(env.runtime_state_path).update(replace_session)
        return original_action(
            action,
            ports,
            expected_session_id=expected_session_id,
        )

    monkeypatch.setattr(runtime, "action", replace_before_stop)
    clock.advance(61)
    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is False
    assert reaped.blocker == "traffic_session_id_conflict"
    assert reaped.data["session_id"] == original_session_id
    assert not any(call[0] == "stop" for call in client.calls)


def test_expired_pre_start_wal_is_rolled_back_and_never_replayed(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))

    class CrashBeforeStreamRemovalClient(FakeTrafficClient):
        def __init__(self) -> None:
            super().__init__()
            self.crash_once = True

        def remove_all_streams(self, ports: list[int] | None) -> None:
            if self.crash_once:
                self.crash_once = False
                raise SystemExit("crash before stream removal")
            super().remove_all_streams(ports)

    client = CrashBeforeStreamRemovalClient()
    first = authority(env, client, clock=clock)
    revision = first.snapshot().data["plan_revision"]
    with pytest.raises(SystemExit):
        first.start_group(
            "pair-0",
            revision,
            None,
            hard_stop_at=clock.deadline(60),
        )
    crashed = RuntimeStateStore(env.runtime_state_path).load()
    assert crashed.traffic_mutation_intent is not None
    assert (
        crashed.traffic_mutation_intent.hardware_stage
        == "streams_remove_intent"
    )
    assert not any(call[0] == "start" for call in client.calls)

    clock.advance(61)
    restarted = authority(env, client, clock=clock)
    reaped = restarted.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert not any(call[0] == "start" for call in client.calls)
    assert [client.ports[port].state for port in [0, 1]] == [
        "stopped",
        "stopped",
    ]
    recovered = RuntimeStateStore(env.runtime_state_path).load()
    assert recovered.traffic_mutation_intent is None
    assert recovered.traffic_session is None
    assert client.get_acquired_ports() == []


def test_expired_lease_supersedes_partial_pause_with_fsynced_stop_wal(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    observed_stop_wals: list[Any] = []

    class PartialPauseClient(FakeTrafficClient):
        def pause(self, ports: list[int] | None) -> str:
            target = self.get_all_ports() if ports is None else ports
            self.calls.append(("pause", target))
            self.ports[target[0]].state = "paused"
            raise RuntimeError("pause changed one port before failing")

        def stop(self, ports: list[int] | None) -> str:
            observed_stop_wals.append(
                RuntimeStateStore(
                    env.runtime_state_path
                ).load().traffic_mutation_intent
            )
            return super().stop(ports)

    client = PartialPauseClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = started.data["session"]["id"]
    paused = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )
    assert paused.ok is False
    original = RuntimeStateStore(env.runtime_state_path).load()
    assert original.traffic_mutation_intent is not None
    assert original.traffic_mutation_intent.operation == "pause"
    assert original.traffic_mutation_intent.phase == "cleanup_required"
    original_nonce = original.traffic_mutation_intent.nonce

    clock.advance(61)
    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert observed_stop_wals
    stop_wal = observed_stop_wals[0]
    assert stop_wal is not None
    assert stop_wal.operation == "stop"
    assert stop_wal.superseded_intent_nonce == original_nonce
    assert stop_wal.superseded_intent_operation == "pause"
    assert stop_wal.ports == [0, 1]
    assert [client.ports[port].state for port in range(4)] == [
        "stopped",
        "stopped",
        "stopped",
        "stopped",
    ]
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.groups[0].hard_stop_at is None


def test_expired_lease_supersedes_failed_update_and_restores_acquisition(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))

    class FailedUpdateClient(FakeTrafficClient):
        def update(
            self,
            ports: list[int] | None,
            mult: str,
            force: bool,
            total: bool,
        ) -> str:
            target = self.get_all_ports() if ports is None else ports
            self.calls.append(("update", {"ports": target, "mult": mult}))
            raise RuntimeError("rate outcome is indeterminate")

    client = FailedUpdateClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = started.data["session"]["id"]
    updated = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )
    assert updated.ok is False
    pending = RuntimeStateStore(env.runtime_state_path).load()
    assert pending.traffic_mutation_intent is not None
    assert pending.traffic_mutation_intent.operation == "update"
    assert pending.traffic_mutation_intent.phase == "cleanup_required"

    # Model a strict-release failure left by the failed mutation. The stop WAL
    # must restore the durable pre-update acquisition baseline (empty), not
    # preserve this leaked live ownership.
    client.acquired.update([0, 1])
    clock.advance(61)
    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert client.get_acquired_ports() == []
    assert [client.ports[port].state for port in [0, 1]] == [
        "stopped",
        "stopped",
    ]
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.state == "stopped"


def test_partial_hard_stop_failure_retries_only_remaining_exact_ports(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))

    class PartialStopClient(FakeTrafficClient):
        fail_next_stop = False

        def stop(self, ports: list[int] | None) -> str:
            target = self.get_all_ports() if ports is None else ports
            self.calls.append(("stop", target))
            if self.fail_next_stop:
                self.fail_next_stop = False
                self.ports[target[0]].state = "stopped"
                raise RuntimeError("stop failed after one exact port")
            for port in target:
                self.ports[port].state = "stopped"
            return "stopped"

    client = PartialStopClient()
    client.ports[2].state = "running"
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = started.data["session"]["id"]
    monkeypatch.setattr(
        traffic_runtime_module,
        "execute_update_traffic",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            SystemExit("crash after prepared update WAL")
        ),
    )
    with pytest.raises(SystemExit):
        runtime.update(
            [0, 1],
            "25%",
            False,
            False,
            expected_session_id=session_id,
        )

    client.calls.clear()
    client.fail_next_stop = True
    clock.advance(61)
    first = runtime.reap_expired_hard_stops(clock())
    after_partial = RuntimeStateStore(env.runtime_state_path).load()

    assert first.ok is False
    assert after_partial.traffic_mutation_intent is not None
    assert after_partial.traffic_mutation_intent.operation == "stop"
    assert (
        after_partial.traffic_mutation_intent.superseded_intent_operation
        == "update"
    )
    assert after_partial.traffic_mutation_intent.phase == "cleanup_required"
    assert client.ports[0].state == "stopped"
    assert client.ports[1].state == "running"
    assert client.ports[2].state == "running"

    second = runtime.reap_expired_hard_stops(clock())

    assert second.ok is True
    stop_calls = [call for call in client.calls if call[0] == "stop"]
    assert stop_calls == [("stop", [0, 1]), ("stop", [1])]
    assert client.ports[2].state == "running"
    assert RuntimeStateStore(
        env.runtime_state_path
    ).load().traffic_mutation_intent is None


def test_crash_after_exact_hard_stop_recovers_promotion_idempotently(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    client = FakeTrafficClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = started.data["session"]["id"]
    monkeypatch.setattr(
        traffic_runtime_module,
        "execute_update_traffic",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            SystemExit("crash after prepared update WAL")
        ),
    )
    with pytest.raises(SystemExit):
        runtime.update(
            [0, 1],
            "25%",
            False,
            False,
            expected_session_id=session_id,
        )
    original_persist = runtime._persist_action
    monkeypatch.setattr(
        runtime,
        "_persist_action",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            SystemExit("crash after stop before promotion")
        ),
    )
    clock.advance(61)
    with pytest.raises(SystemExit):
        runtime.reap_expired_hard_stops(clock())
    crashed = RuntimeStateStore(env.runtime_state_path).load()
    assert crashed.traffic_mutation_intent is not None
    assert runtime._is_hard_stop_superseding_intent(
        crashed.traffic_mutation_intent
    )
    assert [client.ports[port].state for port in [0, 1]] == [
        "stopped",
        "stopped",
    ]
    stop_count = len([call for call in client.calls if call[0] == "stop"])

    monkeypatch.setattr(runtime, "_persist_action", original_persist)
    restarted = authority(env, client, clock=clock)
    recovered = restarted.reap_expired_hard_stops(clock())

    assert recovered.ok is True
    assert len([call for call in client.calls if call[0] == "stop"]) == (
        stop_count
    )
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.groups[0].hard_stop_at is None
    assert persisted.traffic_session.mutation_evidence[-1].completion_mode == "hard_stop"
    assert persisted.traffic_session.groups[0].cleanup_evidence is not None
    assert (
        persisted.traffic_session.groups[0].cleanup_evidence.completion
        == "hard_stop"
    )


def test_expired_group_stops_before_disjoint_future_start_wal_replay(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))

    class CrashBeforeSecondProfileClient(FakeTrafficClient):
        crash_next_remove = False

        def remove_all_streams(self, ports: list[int] | None) -> None:
            if self.crash_next_remove:
                self.crash_next_remove = False
                raise SystemExit("leave future start WAL before profile add")
            super().remove_all_streams(ports)

    client = CrashBeforeSecondProfileClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    first = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = first.data["session"]["id"]
    client.crash_next_remove = True
    with pytest.raises(SystemExit):
        runtime.start_group(
            "pair-1",
            revision,
            session_id,
            hard_stop_at=clock.deadline(100),
        )
    client.calls.clear()
    clock.advance(61)

    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    mutation_calls = [
        call
        for call in client.calls
        if call[0] in {"stop", "start", "update"}
    ]
    assert mutation_calls == [("stop", [0, 1])]
    retained = RuntimeStateStore(env.runtime_state_path).load()
    assert retained.traffic_session is not None
    assert retained.traffic_session.groups[0].state == "stopped"
    assert retained.traffic_session.groups[0].hard_stop_at is None
    assert retained.traffic_mutation_intent is not None
    assert retained.traffic_mutation_intent.operation == "start"
    assert retained.traffic_mutation_intent.ports == [2, 3]

    recovered = runtime.snapshot()

    assert recovered.ok is True
    assert client.ports[0].state == "stopped"
    assert client.ports[1].state == "stopped"
    assert client.ports[2].state == "running"
    assert client.ports[3].state == "running"
    assert RuntimeStateStore(
        env.runtime_state_path
    ).load().traffic_mutation_intent is None


def test_cross_group_update_wal_is_retained_consistently_after_one_lease_expires(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    client = FakeTrafficClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    first = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = first.data["session"]["id"]
    assert runtime.start_group(
        "pair-1",
        revision,
        session_id,
        hard_stop_at=clock.deadline(100),
    ).ok
    client.ports[4].state = "running"
    monkeypatch.setattr(
        traffic_runtime_module,
        "execute_update_traffic",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            SystemExit("leave cross-group update WAL prepared")
        ),
    )
    with pytest.raises(SystemExit):
        runtime.update(
            [0, 1, 2, 3],
            "25%",
            False,
            False,
            expected_session_id=session_id,
        )
    client.calls.clear()
    clock.advance(61)

    reaped = runtime.reap_expired_hard_stops(clock())
    second = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert reaped.data["ports"] == [0, 1]
    assert second.ok is True
    assert second.data["attempted"] is False
    assert [call for call in client.calls if call[0] == "stop"] == [
        ("stop", [0, 1])
    ]
    assert not any(call[0] == "update" for call in client.calls)
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_session is not None
    assert [group.state for group in persisted.traffic_session.groups] == [
        "stopped",
        "running",
    ]
    assert persisted.traffic_session.groups[0].hard_stop_at is None
    assert persisted.traffic_session.groups[1].hard_stop_at is not None
    assert persisted.traffic_mutation_intent is not None
    assert persisted.traffic_mutation_intent.operation == "update"
    assert persisted.traffic_mutation_intent.phase == "cleanup_required"
    assert persisted.traffic_mutation_intent.baseline_port_states[0] == (
        "stopped"
    )
    assert persisted.traffic_mutation_intent.desired_port_states[0] == (
        "stopped"
    )
    assert client.ports[2].state == "running"
    assert client.ports[3].state == "running"
    assert client.ports[4].state == "running"

    snapshot = runtime.snapshot()

    assert snapshot.ok is True
    assert snapshot.data["mutation_intent"]["phase"] == "cleanup_required"
    assert not any(call[0] == "update" for call in client.calls)


def test_promoted_and_pending_start_leases_expire_as_one_exact_union(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    clock = MutableUtcClock(datetime(2026, 7, 31, tzinfo=timezone.utc))
    client = FakeTrafficClient()
    runtime = authority(env, client, clock=clock)
    revision = runtime.snapshot().data["plan_revision"]
    first = runtime.start_group(
        "pair-0",
        revision,
        None,
        hard_stop_at=clock.deadline(60),
    )
    session_id = first.data["session"]["id"]
    original_persist = runtime._persist_start
    monkeypatch.setattr(
        runtime,
        "_persist_start",
        lambda **_kwargs: (_ for _ in ()).throw(
            SystemExit("lose pair-1 start response")
        ),
    )
    with pytest.raises(SystemExit):
        runtime.start_group(
            "pair-1",
            revision,
            session_id,
            hard_stop_at=clock.deadline(60),
        )
    monkeypatch.setattr(runtime, "_persist_start", original_persist)
    start_calls = [call for call in client.calls if call[0] == "start"]
    client.calls.clear()
    clock.advance(61)

    reaped = runtime.reap_expired_hard_stops(clock())

    assert reaped.ok is True
    assert reaped.data["ports"] == [0, 1, 2, 3]
    assert [call for call in client.calls if call[0] == "start"] == []
    assert [client.ports[port].state for port in range(4)] == [
        "stopped",
        "stopped",
        "stopped",
        "stopped",
    ]
    assert len(start_calls) == 2
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert persisted.traffic_session.state == "stopped"
    assert all(
        group.hard_stop_at is None
        for group in persisted.traffic_session.groups
    )


def test_selected_port_pause_resume_persists_exact_states_and_recovers_after_restart(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    first = authority(env, client)
    revision = first.snapshot().data["plan_revision"]
    started = first.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]

    paused_p0 = first.action(
        "pause",
        [0],
        expected_session_id=session_id,
    )
    assert paused_p0.ok is True
    assert paused_p0.data["session"]["state"] == "mixed"
    assert paused_p0.data["session"]["groups"][0]["state"] == "mixed"
    assert paused_p0.data["session"]["groups"][0]["port_states"] == {
        "0": "paused",
        "1": "running",
    }

    restarted = authority(env, client)
    recovered = restarted.snapshot()
    assert recovered.ok is True
    assert recovered.data["session"]["id"] == session_id
    assert recovered.data["session"]["state"] == "mixed"
    assert recovered.data["session"]["groups"][0]["port_states"] == {
        "0": "paused",
        "1": "running",
    }
    assert "authority recovered" in recovered.data["session"]["reconciliation"]

    paused_p1 = restarted.action(
        "pause",
        [1],
        expected_session_id=session_id,
    )
    assert paused_p1.ok is True
    assert paused_p1.data["session"]["state"] == "paused"
    assert paused_p1.data["session"]["groups"][0]["port_states"] == {
        "0": "paused",
        "1": "paused",
    }

    resumed_p0 = restarted.action(
        "resume",
        [0],
        expected_session_id=session_id,
    )
    assert resumed_p0.ok is True
    assert resumed_p0.data["session"]["state"] == "mixed"
    assert resumed_p0.data["session"]["groups"][0]["port_states"] == {
        "0": "running",
        "1": "paused",
    }

    resumed_p1 = restarted.action(
        "resume",
        [1],
        expected_session_id=session_id,
    )
    assert resumed_p1.ok is True
    assert resumed_p1.data["session"]["state"] == "running"
    assert resumed_p1.data["session"]["groups"][0]["port_states"] == {
        "0": "running",
        "1": "running",
    }


def test_traffic_mutations_without_active_owned_session_have_zero_side_effects(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    assert runtime.snapshot().ok is True

    stopped = runtime.action("stop", None)
    updated = runtime.update([0], "2", False, False)

    assert stopped.ok is False
    assert stopped.blocker == "traffic_session_unowned"
    assert "no managed traffic session" in stopped.error
    assert updated.ok is False
    assert updated.blocker == "traffic_session_unowned"
    assert client.calls == []


def test_stopped_session_cannot_mutate_live_ports(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True
    assert runtime.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    ).ok is True
    client.calls.clear()

    result = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )

    assert result.ok is False
    assert result.blocker == "traffic_session_unowned"
    assert "not safely active: stopped" in result.error
    assert client.calls == []


def test_traffic_mutation_rejects_ports_outside_owned_session(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True
    client.calls.clear()

    stopped = runtime.action("stop", [2], expected_session_id=session_id)
    updated = runtime.update(
        [2],
        "2",
        False,
        False,
        expected_session_id=session_id,
    )

    assert stopped.ok is False
    assert stopped.blocker == "traffic_session_unowned"
    assert "not owned by this session: [2]" in stopped.error
    assert updated.ok is False
    assert updated.blocker == "traffic_session_unowned"
    assert client.calls == []


def test_traffic_update_rejects_partial_managed_group_without_live_side_effects(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    original_session = RuntimeStateStore(env.runtime_state_path).load().traffic_session
    assert started.ok is True
    assert original_session is not None
    client.calls.clear()

    result = runtime.update(
        [0],
        "25%",
        False,
        False,
        expected_session_id=original_session.id,
    )

    assert result.ok is False
    assert result.blocker == "traffic_group_partial_update"
    assert "complete managed groups" in result.error
    assert client.calls == []
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_session == original_session


def test_traffic_mutation_session_id_cas_rejects_before_live_side_effects(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session = RuntimeStateStore(env.runtime_state_path).load().traffic_session
    assert started.ok is True
    assert session is not None
    client.calls.clear()
    stale_session_id = str(uuid.uuid4())

    missing_id_pause = runtime.action("pause", [0, 1])
    missing_id_update = runtime.update([0, 1], "25%", False, False)
    paused = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=stale_session_id,
    )
    updated = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=stale_session_id,
    )

    assert missing_id_pause.ok is False
    assert missing_id_pause.blocker == "traffic_session_id_conflict"
    assert missing_id_update.ok is False
    assert missing_id_update.blocker == "traffic_session_id_conflict"
    assert paused.ok is False
    assert paused.blocker == "traffic_session_id_conflict"
    assert updated.ok is False
    assert updated.blocker == "traffic_session_id_conflict"
    assert client.calls == []
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_session == session


def test_start_session_cas_never_merges_or_replaces_a_different_session(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    original = RuntimeStateStore(env.runtime_state_path).load().traffic_session
    assert original is not None
    client.calls.clear()

    missing_cas = runtime.start_group("pair-1", revision, None)
    stale_cas = runtime.start_group("pair-1", revision, str(uuid.uuid4()))

    assert missing_cas.blocker == "traffic_session_id_conflict"
    assert stale_cas.blocker == "traffic_session_id_conflict"
    assert client.calls == []
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_session == original

    appended = runtime.start_group("pair-1", revision, session_id)
    assert appended.ok is True
    assert appended.data["session"]["id"] == session_id
    assert [
        group["group_id"]
        for group in appended.data["session"]["groups"]
    ] == ["pair-0", "pair-1"]

    assert runtime.action(
        "stop",
        None,
        expected_session_id=session_id,
    ).ok is True
    ended = RuntimeStateStore(env.runtime_state_path).load().traffic_session
    assert ended is not None and ended.state == "stopped"
    client.calls.clear()

    ended_cas = runtime.start_group("pair-2", revision, session_id)
    assert ended_cas.blocker == "traffic_session_id_conflict"
    assert client.calls == []
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_session == ended

    fresh = runtime.start_group("pair-2", revision, None)
    fresh_session_id = fresh.data["session"]["id"]
    assert fresh.ok is True
    assert fresh_session_id != session_id
    fresh_session = RuntimeStateStore(env.runtime_state_path).load().traffic_session
    client.calls.clear()

    old_cas = runtime.start_group("pair-0", revision, session_id)
    assert old_cas.blocker == "traffic_session_id_conflict"
    assert client.calls == []
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_session == fresh_session


def test_concurrent_null_session_starts_are_serialized_before_live_mutation(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    first_start_entered = threading.Event()
    allow_first_start = threading.Event()

    class BlockingTrafficClient(FakeTrafficClient):
        def start(
            self,
            ports: list[int] | None,
            mult: str,
            duration: float,
            force: bool,
            total: bool,
            synchronized: bool,
        ) -> str:
            first_start_entered.set()
            if not allow_first_start.wait(timeout=5):
                raise RuntimeError("test did not release first traffic start")
            return super().start(
                ports,
                mult,
                duration,
                force,
                total,
                synchronized,
            )

    client = BlockingTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(
            runtime.start_group,
            "pair-0",
            revision,
            None,
        )
        assert first_start_entered.wait(timeout=2)
        second = executor.submit(
            runtime.start_group,
            "pair-1",
            revision,
            None,
        )
        assert not second.done()
        allow_first_start.set()
        first_result = first.result(timeout=3)
        second_result = second.result(timeout=3)

    assert first_result.ok is True
    assert second_result.blocker == "traffic_session_id_conflict"
    assert [
        call
        for call in client.calls
        if call[0] == "start"
    ] == [("start", [0, 1])]
    persisted = RuntimeStateStore(env.runtime_state_path).load()
    assert persisted.traffic_mutation_intent is None
    assert persisted.traffic_session is not None
    assert [
        group.group_id
        for group in persisted.traffic_session.groups
    ] == ["pair-0"]


def test_start_wal_recovers_systemexit_after_live_rpc_and_allows_exact_stop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    first = authority(env, client)
    revision = first.snapshot().data["plan_revision"]

    def crash_before_promote(**_kwargs: Any) -> None:
        raise SystemExit("simulated SIGKILL boundary")

    monkeypatch.setattr(first, "_persist_start", crash_before_promote)
    with pytest.raises(SystemExit):
        first.start_group("pair-0", revision, None)

    crashed = RuntimeStateStore(env.runtime_state_path).load()
    assert crashed.traffic_session is None
    assert crashed.traffic_mutation_intent is not None
    assert crashed.traffic_mutation_intent.operation == "start"
    assert [client.ports[port].state for port in [0, 1]] == [
        "running",
        "running",
    ]

    restarted = authority(env, client)
    recovered = restarted.snapshot()
    session_id = recovered.data["session"]["id"]

    assert recovered.ok is True
    assert recovered.data["mutation_intent"] is None
    assert recovered.data["session"]["state"] == "running"
    assert recovered.data["session"]["mutation_evidence"][-1][
        "completion_mode"
    ] == "recovered"
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_mutation_intent is None
    stopped = restarted.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    )
    assert stopped.ok is True
    assert stopped.data["session"]["state"] == "stopped"


def test_action_wal_recovers_pause_resume_and_stop_systemexit_boundaries(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]

    def crash_before_action_promote(*_args: Any, **_kwargs: Any) -> None:
        raise SystemExit("simulated action SIGKILL boundary")

    monkeypatch.setattr(runtime, "_persist_action", crash_before_action_promote)
    with pytest.raises(SystemExit):
        runtime.action("pause", [0], expected_session_id=session_id)

    after_pause = authority(env, client)
    paused = after_pause.snapshot()
    assert paused.data["session"]["groups"][0]["port_states"] == {
        "0": "paused",
        "1": "running",
    }
    assert paused.data["session"]["mutation_evidence"][-1][
        "completion_mode"
    ] == "recovered"
    assert paused.data["mutation_intent"] is None

    monkeypatch.setattr(
        after_pause,
        "_persist_action",
        crash_before_action_promote,
    )
    with pytest.raises(SystemExit):
        after_pause.action("resume", [0], expected_session_id=session_id)

    after_resume = authority(env, client)
    resumed = after_resume.snapshot()
    assert resumed.data["session"]["state"] == "running"
    assert resumed.data["session"]["groups"][0]["port_states"] == {
        "0": "running",
        "1": "running",
    }
    assert resumed.data["session"]["mutation_evidence"][-1][
        "completion_mode"
    ] == "recovered"

    monkeypatch.setattr(
        after_resume,
        "_persist_action",
        crash_before_action_promote,
    )
    with pytest.raises(SystemExit):
        after_resume.action("stop", [0, 1], expected_session_id=session_id)

    stopped = authority(env, client).snapshot()
    assert stopped.data["session"]["state"] == "stopped"
    assert stopped.data["session"]["mutation_evidence"][-1][
        "completion_mode"
    ] == "recovered"
    assert stopped.data["mutation_intent"] is None
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_mutation_intent is None


def test_update_wal_replays_idempotently_after_systemexit_before_promotion(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]

    def crash_before_update_promote(*_args: Any, **_kwargs: Any) -> None:
        raise SystemExit("simulated update SIGKILL boundary")

    monkeypatch.setattr(runtime, "_persist_update", crash_before_update_promote)
    with pytest.raises(SystemExit):
        runtime.update(
            [0, 1],
            "25%",
            False,
            False,
            expected_session_id=session_id,
        )

    crashed = RuntimeStateStore(env.runtime_state_path).load()
    assert crashed.traffic_mutation_intent is not None
    assert crashed.traffic_mutation_intent.operation == "update"
    restarted = authority(env, client)
    recovered = restarted.snapshot()

    assert recovered.ok is True
    assert recovered.data["mutation_intent"] is None
    assert recovered.data["session"]["groups"][0]["multiplier"] == "25%"
    assert recovered.data["session"]["mutation_evidence"][-1][
        "completion_mode"
    ] == "replayed"
    assert len(
        [
            call
            for call in client.calls
            if call == (
                "update",
                {"ports": [0, 1], "mult": "25%"},
            )
        ]
    ) == 2


@pytest.mark.parametrize(
    ("boundary", "expected_stage"),
    [
        ("remove_all_streams", "streams_remove_intent"),
        ("add_profile", "profile_add_intent"),
    ],
)
def test_start_wal_rolls_forward_stream_mutation_boundaries(
    tmp_path: Path,
    boundary: str,
    expected_stage: str,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class BoundaryClient(FakeTrafficClient):
        def __init__(self) -> None:
            super().__init__()
            self.crash_once = True

        def remove_all_streams(self, ports: list[int] | None) -> None:
            super().remove_all_streams(ports)
            if boundary == "remove_all_streams" and self.crash_once:
                self.crash_once = False
                raise SystemExit("crash after removing streams")

        def add_profile(
            self,
            profile_path: str,
            ports: list[int] | None,
            **tunables: Any,
        ) -> list[int]:
            stream_ids = super().add_profile(profile_path, ports, **tunables)
            if boundary == "add_profile" and self.crash_once:
                self.crash_once = False
                raise SystemExit("crash after adding streams")
            return stream_ids

    client = BoundaryClient()
    client.ports[0].streams[99] = object()
    client.ports[1].streams[99] = object()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]

    with pytest.raises(SystemExit):
        runtime.start_group("pair-0", revision, None)

    pending = RuntimeStateStore(env.runtime_state_path).load().traffic_mutation_intent
    assert pending is not None
    assert pending.hardware_stage == expected_stage
    assert pending.baseline_stream_ids == {0: [99], 1: [99]}
    assert all(client.ports[port].state == "stopped" for port in [0, 1])

    recovered = authority(env, client).snapshot()

    assert recovered.ok is True
    assert recovered.data["mutation_intent"] is None
    assert recovered.data["session"]["state"] == "running"
    assert all(client.ports[port].streams for port in [0, 1])
    assert len([call for call in client.calls if call[0] == "start"]) == 1


def test_start_intent_with_stopped_ports_remains_fail_closed(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class CompletedBeforeResponseClient(FakeTrafficClient):
        def start(self, *args: Any, **kwargs: Any) -> str:
            result = super().start(*args, **kwargs)
            for port in kwargs["ports"]:
                self.ports[port].state = "stopped"
            raise SystemExit("response lost after a finite run completed")

    client = CompletedBeforeResponseClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]

    with pytest.raises(SystemExit):
        runtime.start(
            expected_session_id=None,
            profile_path="udp_1pkt_simple.py",
            ports=[0, 1],
            multiplier="1",
            duration=0.01,
            force=False,
            total=False,
            synchronized=False,
            clear_existing=True,
            tunables={},
        )

    recovered = authority(env, client).snapshot()

    assert recovered.ok is True
    assert recovered.data["session"] is None
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert recovered.data["mutation_intent"]["hardware_stage"] == "start_intent"
    assert len([call for call in client.calls if call[0] == "start"]) == 1


@pytest.mark.parametrize("multiplier", ["25%", "25%+"])
def test_failed_update_rpc_is_never_replayed_by_snapshot(
    tmp_path: Path,
    multiplier: str,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class FailingUpdateClient(FakeTrafficClient):
        def update(
            self,
            ports: list[int] | None,
            mult: str,
            force: bool,
            total: bool,
        ) -> str:
            super().update(ports, mult, force, total)
            raise RuntimeError("response lost after server update")

    client = FailingUpdateClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    session_id = runtime.start_group("pair-0", revision, None).data["session"]["id"]

    failed = runtime.update(
        [0, 1],
        multiplier,
        False,
        False,
        expected_session_id=session_id,
    )
    recovered = authority(env, client).snapshot()

    assert failed.blocker == "traffic_mutation_recovery_required"
    assert recovered.ok is True
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert recovered.data["session"]["groups"][0]["multiplier"] == "1"
    assert len(
        [
            call
            for call in client.calls
            if call == ("update", {"ports": [0, 1], "mult": multiplier})
        ]
    ) == 1


def test_partially_failed_action_is_never_extended_by_snapshot(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class PartialPauseClient(FakeTrafficClient):
        def pause(self, ports: list[int] | None) -> str:
            target = self.get_all_ports() if ports is None else ports
            self.calls.append(("pause", target))
            self.ports[target[0]].state = "paused"
            raise RuntimeError("pause failed after the first port")

    client = PartialPauseClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    session_id = runtime.start_group("pair-0", revision, None).data["session"]["id"]

    failed = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )
    recovered = authority(env, client).snapshot()

    assert failed.blocker == "traffic_mutation_recovery_required"
    assert recovered.ok is True
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert [client.ports[port].state for port in [0, 1]] == [
        "paused",
        "running",
    ]
    assert len([call for call in client.calls if call[0] == "pause"]) == 1


def test_action_release_failure_keeps_wal_until_control_is_proved(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class ReleaseFailureClient(FakeTrafficClient):
        def __init__(self) -> None:
            super().__init__()
            self.release_failures = 0

        def release(self, ports: list[int]) -> None:
            if self.release_failures:
                self.release_failures -= 1
                self.calls.append(("release", ports))
                raise RuntimeError("release response failed")
            super().release(ports)

    client = ReleaseFailureClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    session_id = runtime.start_group("pair-0", revision, None).data["session"]["id"]
    client.release_failures = 2

    failed = runtime.action(
        "pause",
        [0, 1],
        expected_session_id=session_id,
    )
    first_recovery = authority(env, client).snapshot()

    assert failed.blocker == "traffic_mutation_recovery_required"
    assert first_recovery.data["mutation_intent"]["phase"] == "cleanup_required"
    assert client.acquired == {0, 1}
    assert len([call for call in client.calls if call[0] == "pause"]) == 1

    proved = authority(env, client).snapshot()

    assert proved.data["mutation_intent"] is None
    assert proved.data["session"]["state"] == "paused"
    assert client.acquired == set()
    assert len([call for call in client.calls if call[0] == "pause"]) == 1


def test_update_release_failure_restores_control_without_replaying_update(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class ReleaseFailureClient(FakeTrafficClient):
        def __init__(self) -> None:
            super().__init__()
            self.release_failures = 0

        def release(self, ports: list[int]) -> None:
            if self.release_failures:
                self.release_failures -= 1
                self.calls.append(("release", ports))
                raise RuntimeError("release response failed")
            super().release(ports)

    client = ReleaseFailureClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    session_id = runtime.start_group("pair-0", revision, None).data["session"]["id"]
    client.release_failures = 1

    failed = runtime.update(
        [0, 1],
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )
    recovered = authority(env, client).snapshot()

    assert failed.blocker == "traffic_mutation_recovery_required"
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert recovered.data["session"]["groups"][0]["multiplier"] == "1"
    assert client.acquired == set()
    assert len([call for call in client.calls if call[0] == "update"]) == 1


def test_wal_recovery_uses_fresh_port_sync_instead_of_cached_state(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class ServerBackedPort(FakePort):
        def __init__(self) -> None:
            super().__init__()
            self.server_state = "stopped"

        def sync(self) -> bool:
            self.state = self.server_state
            return True

    class LostPauseResponseClient(FakeTrafficClient):
        def __init__(self) -> None:
            super().__init__()
            self.ports = {
                port: ServerBackedPort()
                for port in range(6)
            }

        def start(self, *args: Any, **kwargs: Any) -> str:
            result = super().start(*args, **kwargs)
            for port in kwargs["ports"]:
                self.ports[port].server_state = "running"
            return result

        def pause(self, ports: list[int] | None) -> str:
            target = self.get_all_ports() if ports is None else ports
            self.calls.append(("pause", target))
            for port in target:
                self.ports[port].server_state = "paused"
            raise SystemExit("pause response lost before cache update")

    client = LostPauseResponseClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    session_id = runtime.start_group("pair-0", revision, None).data["session"]["id"]

    with pytest.raises(SystemExit):
        runtime.action("pause", [0], expected_session_id=session_id)
    assert client.ports[0].state == "running"

    recovered = authority(env, client).snapshot()

    assert recovered.data["mutation_intent"] is None
    assert recovered.data["session"]["groups"][0]["port_states"]["0"] == "paused"
    assert len([call for call in client.calls if call[0] == "pause"]) == 1


def test_new_client_does_not_clear_acquire_intent_while_old_owner_remains(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    server: dict[str, str | None] = {"owner": None}

    class ServerOwnedClient(FakeTrafficClient):
        def __init__(self, session: str, *, crash_on_acquire: bool) -> None:
            super().__init__()
            self.session = session
            self.crash_on_acquire = crash_on_acquire

        def acquire(
            self,
            ports: list[int],
            force: bool,
            sync_streams: bool,
        ) -> None:
            self.calls.append(("acquire", ports))
            if server["owner"] not in {None, self.session}:
                raise RuntimeError("ports remain owned by the old STL session")
            server["owner"] = self.session
            self.acquired.update(ports)
            if self.crash_on_acquire:
                self.crash_on_acquire = False
                raise SystemExit("old process died after server acquisition")

        def release(self, ports: list[int]) -> None:
            super().release(ports)
            if not self.acquired:
                server["owner"] = None

    old_client = ServerOwnedClient("old-session", crash_on_acquire=True)
    runtime = authority(env, old_client)
    revision = runtime.snapshot().data["plan_revision"]

    with pytest.raises(SystemExit):
        runtime.start_group("pair-0", revision, None)
    assert server["owner"] == "old-session"

    new_client = ServerOwnedClient("new-session", crash_on_acquire=False)
    assert new_client.get_acquired_ports() == []
    recovered = authority(env, new_client).snapshot()

    assert recovered.ok is True
    assert recovered.data["session"] is None
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert server["owner"] == "old-session"
    assert not any(
        call[0] in {"remove_all_streams", "add_profile", "start"}
        for call in new_client.calls
    )


def test_changed_profile_digest_blocks_start_replay(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class CrashAfterProfileClient(FakeTrafficClient):
        def add_profile(
            self,
            profile_path: str,
            ports: list[int] | None,
            **tunables: Any,
        ) -> list[int]:
            super().add_profile(profile_path, ports, **tunables)
            raise SystemExit("profile was loaded before process death")

    client = CrashAfterProfileClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]

    with pytest.raises(SystemExit):
        runtime.start_group("pair-0", revision, None)
    profile = env.profile_roots[0] / "udp_1pkt_simple.py"
    profile.write_text("changed profile bytes", encoding="utf-8")

    recovered = authority(env, client).snapshot()

    assert recovered.ok is True
    assert recovered.data["session"] is None
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert len([call for call in client.calls if call[0] == "start"]) == 0


def test_failed_clear_existing_start_with_removed_baseline_streams_stays_closed(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")

    class RejectProfileClient(FakeTrafficClient):
        def add_profile(
            self,
            profile_path: str,
            ports: list[int] | None,
            **tunables: Any,
        ) -> list[int]:
            self.calls.append(("add_profile", {"path": profile_path, "ports": ports}))
            raise RuntimeError("profile rejected")

    client = RejectProfileClient()
    for port in [0, 1]:
        client.ports[port].streams[99] = object()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]

    failed = runtime.start_group("pair-0", revision, None)
    recovered = authority(env, client).snapshot()

    assert failed.blocker == "traffic_mutation_recovery_required"
    assert recovered.ok is True
    assert recovered.data["session"] is None
    assert recovered.data["mutation_intent"]["phase"] == "cleanup_required"
    assert all(client.ports[port].streams == {} for port in [0, 1])


def test_pending_start_intent_is_safely_retired_after_managed_generation_rollover(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]

    monkeypatch.setattr(
        runtime,
        "_persist_start",
        lambda **_kwargs: (_ for _ in ()).throw(SystemExit()),
    )
    with pytest.raises(SystemExit):
        runtime.start_group("pair-0", revision, None)
    assert RuntimeStateStore(env.runtime_state_path).load().traffic_mutation_intent is not None

    env.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    for port in client.ports.values():
        port.state = "stopped"

    restarted = authority(env, client)
    recovered = restarted.snapshot()
    assert recovered.ok is True
    assert recovered.data["mutation_intent"] is None
    assert recovered.data["session"] is None
    assert restarted.start_group("pair-0", revision, None).ok is True


def test_action_intent_retires_old_session_after_managed_generation_rollover(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    old_session_id = started.data["session"]["id"]

    monkeypatch.setattr(
        runtime,
        "_persist_action",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(SystemExit()),
    )
    with pytest.raises(SystemExit):
        runtime.action(
            "pause",
            [0],
            expected_session_id=old_session_id,
        )
    env.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    for port in client.ports.values():
        port.state = "stopped"

    restarted = authority(env, client)
    recovered = restarted.snapshot()
    assert recovered.ok is True
    assert recovered.data["mutation_intent"] is None
    assert recovered.data["session"]["state"] == "stopped"
    assert (
        "different TRex target or daemon generation"
        in recovered.data["session"]["reconciliation"]
    )
    assert restarted.start_group(
        "pair-0",
        revision,
        old_session_id,
    ).blocker == "traffic_session_id_conflict"
    assert restarted.start_group("pair-0", revision, None).ok is True


def test_runtime_fence_blocks_connect_until_traffic_start_is_persisted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path, supervisor="external")
    monkeypatch.setenv(
        "TREX_WEBUI_RUNTIME_STATE_PATH",
        str(env.runtime_state_path),
    )
    monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "external")
    start_entered = threading.Event()
    allow_start = threading.Event()

    class BlockingTrafficClient(FakeTrafficClient):
        def start(
            self,
            ports: list[int] | None,
            mult: str,
            duration: float,
            force: bool,
            total: bool,
            synchronized: bool,
        ) -> str:
            start_entered.set()
            if not allow_start.wait(timeout=5):
                raise RuntimeError("test did not release traffic start")
            return super().start(ports, mult, duration, force, total, synchronized)

    runtime = authority(env, BlockingTrafficClient())
    disconnect_calls: list[bool] = []
    monkeypatch.setattr("app.main.get_environment", lambda: env)
    monkeypatch.setattr(
        "app.main.disconnect_stl_service",
        lambda: disconnect_calls.append(True)
        or TrexCallResult(True, data={"disconnected": True}),
    )
    monkeypatch.setattr(
        "app.main.set_runtime_trex_connection",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("active traffic must block before connection persistence")
        ),
    )
    monkeypatch.setattr(
        "app.main.get_stl_service",
        lambda: (_ for _ in ()).throw(
            AssertionError("active traffic must block before service replacement")
        ),
    )

    request = ConnectTrexRequest(
        host="new.trex",
        sync_port=4511,
        async_port=4510,
        scapy_port=4517,
        client_name="NewClient",
        timeout_seconds=3,
    )
    with ThreadPoolExecutor(max_workers=2) as executor:
        start_future = executor.submit(
            runtime.start,
            expected_session_id=None,
            profile_path="udp_1pkt_simple.py",
            ports=[0, 1],
            multiplier="1",
            duration=-1,
            force=False,
            total=False,
            synchronized=False,
            clear_existing=True,
            tunables={},
        )
        assert start_entered.wait(timeout=2)
        connect_future = executor.submit(connect_trex, request)
        assert not connect_future.done()
        allow_start.set()
        started = start_future.result(timeout=3)
        connected = connect_future.result(timeout=3)

    assert started.ok is True
    assert connected["ok"] is False
    assert connected["blocker"] == "runtime_traffic_active"
    assert disconnect_calls == []


def test_omitted_mutation_ports_resolve_only_to_owned_session_ports(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True
    client.calls.clear()

    paused = runtime.action("pause", None, expected_session_id=session_id)
    updated = runtime.update(
        None,
        "25%",
        False,
        False,
        expected_session_id=session_id,
    )

    assert paused.ok is True
    assert paused.data["ports"] == [0, 1]
    assert updated.ok is True
    assert updated.data["ports"] == [0, 1]
    assert ("pause", [0, 1]) in client.calls
    assert ("update", {"ports": [0, 1], "mult": "25%"}) in client.calls
    assert not any(
        call[1] is None
        for call in client.calls
        if call[0] in {"pause", "update"}
    )


def test_snapshot_does_not_attribute_external_port_to_managed_session(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    assert runtime.start_group("pair-0", revision, None).ok is True
    client.ports[2].state = "running"

    snapshot = runtime.snapshot()

    assert snapshot.data["port_states"][0] == {
        "port": 0,
        "state": "running",
        "ownership": "managed",
    }
    assert snapshot.data["port_states"][2] == {
        "port": 2,
        "state": "unknown",
        "ownership": "external",
    }


def test_systemd_runtime_recovers_matching_session_but_external_mode_does_not(tmp_path: Path) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    first = authority(env, client)
    revision = first.snapshot().data["plan_revision"]
    started = first.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True

    restarted = authority(env, client)
    recovered = restarted.snapshot()
    assert recovered.ok is True
    assert recovered.data["session"]["state"] == "running"
    assert "authority recovered" in recovered.data["session"]["reconciliation"]
    assert [entry["ownership"] for entry in recovered.data["port_states"][:2]] == ["managed", "managed"]

    external_env = replace(env, daemon_supervisor="external")
    external = authority(external_env, client).snapshot()
    assert external.ok is True
    assert external.data["session"]["state"] == "unknown"
    assert [entry["state"] for entry in external.data["port_states"][:2]] == ["unknown", "unknown"]
    assert [entry["ownership"] for entry in external.data["port_states"][:2]] == ["external", "external"]


def test_systemd_runtime_rejects_same_live_state_after_daemon_generation_changes(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    first = authority(env, client)
    revision = first.snapshot().data["plan_revision"]
    started = first.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True
    persisted_generation = (
        RuntimeStateStore(env.runtime_state_path)
        .load()
        .traffic_session.authority.generation  # type: ignore[union-attr]
    )
    env.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    calls_before_restart = list(client.calls)

    restarted = authority(env, client)
    snapshot = restarted.snapshot()

    assert snapshot.ok is True
    assert snapshot.data["session"]["state"] == "unknown"
    assert snapshot.data["session"]["authority"]["generation"] == persisted_generation
    assert "different TRex target or daemon generation" in snapshot.data["session"]["reconciliation"]
    assert [entry["state"] for entry in snapshot.data["port_states"][:2]] == [
        "unknown",
        "unknown",
    ]
    assert [entry["ownership"] for entry in snapshot.data["port_states"][:2]] == [
        "external",
        "external",
    ]
    blocked = restarted.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    )
    assert blocked.ok is False
    assert blocked.blocker == "traffic_session_unowned"
    assert "different TRex target or daemon generation" in blocked.error
    assert client.calls == calls_before_restart


def test_external_runtime_never_recovers_persisted_session_across_process_marker(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="external")
    client = FakeTrafficClient()
    first = authority(env, client)
    revision = first.snapshot().data["plan_revision"]
    assert first.start_group("pair-0", revision, None).ok is True

    restarted = authority(env, client).snapshot()

    assert restarted.ok is True
    assert restarted.data["session"]["state"] == "unknown"
    assert [entry["ownership"] for entry in restarted.data["port_states"][:2]] == [
        "external",
        "external",
    ]


def test_systemd_runtime_recovers_mixed_session_when_every_group_matches_live_state(tmp_path: Path) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    first = authority(env, client)
    revision = first.snapshot().data["plan_revision"]
    started = first.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True
    assert first.start_group("pair-1", revision, session_id).ok is True
    assert first.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    ).ok is True

    recovered = authority(env, client).snapshot()

    assert recovered.ok is True
    assert recovered.data["session"]["state"] == "mixed"
    assert {
        group["group_id"]: group["state"]
        for group in recovered.data["session"]["groups"]
    } == {"pair-0": "stopped", "pair-1": "running"}
    assert "authority recovered" in recovered.data["session"]["reconciliation"]
    assert [entry["ownership"] for entry in recovered.data["port_states"][:4]] == [
        "managed",
        "managed",
        "managed",
        "managed",
    ]


def test_completed_owned_session_cannot_later_claim_external_traffic(tmp_path: Path) -> None:
    env = environment(tmp_path, supervisor="systemd")
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    assert runtime.start_group("pair-0", revision, None).ok is True

    client.ports[0].state = "stopped"
    client.ports[1].state = "stopped"
    completed = runtime.snapshot()
    assert completed.data["session"]["state"] == "stopped"
    assert [entry["ownership"] for entry in completed.data["port_states"][:2]] == ["none", "none"]

    client.ports[0].state = "running"
    external = runtime.snapshot()
    assert external.data["session"]["state"] == "stopped"
    assert external.data["session"]["groups"][0]["cleanup_evidence"][
        "completion"
    ] == "observed"
    assert external.data["port_states"][0] == {
        "port": 0,
        "state": "unknown",
        "ownership": "external",
    }


def test_ad_hoc_start_replaces_any_stopped_session_group_with_overlapping_ports(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    runtime = authority(env, client)
    revision = runtime.snapshot().data["plan_revision"]
    started = runtime.start_group("pair-0", revision, None)
    session_id = started.data["session"]["id"]
    assert started.ok is True
    assert runtime.start_group("pair-1", revision, session_id).ok is True
    assert runtime.action(
        "stop",
        [0, 1],
        expected_session_id=session_id,
    ).ok is True

    started = runtime.start(
        expected_session_id=session_id,
        profile_path="udp_1pkt_simple.py",
        ports=[0],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert started.ok is True
    assert [group["ports"] for group in started.data["session"]["groups"]] == [[2, 3], [0]]
    assert [
        group["ports"]
        for group in started.data["session"]["completed_groups"]
    ] == [[0, 1]]
    assert started.data["session"]["groups"][1]["source"] == "ad_hoc"
    assert started.data["session"]["groups"][1]["group_id"] is None
    snapshot = runtime.snapshot()
    assert snapshot.ok is True
    assert snapshot.data["session"]["state"] == "running"


def test_start_intent_persist_failure_has_zero_live_side_effects(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()

    class FailingStore:
        def load(self) -> RuntimeStateDocument:
            return RuntimeStateDocument()

        def update(self, mutation: Any) -> RuntimeStateDocument:
            raise RuntimeStateError("disk full")

    runtime = authority(env, client, store=FailingStore())  # type: ignore[arg-type]
    result = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert result.blocker == "traffic_state_persist_failed"
    assert "cannot persist traffic start intent" in result.error
    assert client.calls == []


def test_active_port_preflight_fails_without_replacing_live_traffic(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    client.ports[0].state = "running"
    runtime = authority(env, client)

    result = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert "requires known idle ports" in result.error
    assert not any(call[0] == "remove_all_streams" for call in client.calls)


def test_traffic_start_rejects_stale_capture_authority_before_client_mutation(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path, supervisor="systemd")
    original_authority = _TestRuntimeAuthorityProvider(env).current()

    def persist_capture(state: RuntimeStateDocument) -> RuntimeStateDocument:
        state.capture_leases = [
            CaptureLeaseState(
                capture_id=7,
                authority=original_authority,
                tx_ports=[0],
                rx_ports=[],
                bpf_filter="",
                ports=[0],
                acquired_ports=[0],
            )
        ]
        return state

    RuntimeStateStore(env.runtime_state_path).update(persist_capture)
    env.daemon_generation_path.write_text(
        "22222222-2222-4222-8222-222222222222\n",
        encoding="ascii",
    )
    client = FakeTrafficClient()
    runtime = authority(env, client)

    result = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert result.blocker == "traffic_runtime_authority_invalid"
    assert (
        "capture leases belong to a different TRex target or daemon generation"
        in result.error
    )
    assert client.calls == []


def test_down_link_preflight_fails_without_replacing_loaded_streams(tmp_path: Path) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    client.ports[1].link = "DOWN"
    runtime = authority(env, client)

    result = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert result.error == "traffic start requires link-up ports; P1=down"
    assert not any(call[0] == "remove_all_streams" for call in client.calls)


def test_unknown_link_preflight_fails_without_replacing_loaded_streams(
    tmp_path: Path,
) -> None:
    env = environment(tmp_path)
    client = FakeTrafficClient()
    client.ports[0].link = "UNKNOWN"
    runtime = authority(env, client)

    result = runtime.start(
        expected_session_id=None,
        profile_path="udp_1pkt_simple.py",
        ports=[0, 1],
        multiplier="1",
        duration=-1,
        force=False,
        total=False,
        synchronized=False,
        clear_existing=True,
        tunables={},
    )

    assert result.ok is False
    assert result.blocker == "trex_command_failed"
    assert result.error == "traffic start requires link-up ports; P0=unknown"
    assert not any(call[0] == "remove_all_streams" for call in client.calls)


def test_corrupt_runtime_state_fails_closed_without_overwrite(tmp_path: Path) -> None:
    env = environment(tmp_path)
    original = '{"version":999,"revision":0}\n'
    env.runtime_state_path.write_text(original, encoding="utf-8")

    result = authority(env, FakeTrafficClient()).snapshot()

    assert result.blocker == "traffic_runtime_state_invalid"
    assert env.runtime_state_path.read_text(encoding="utf-8") == original


def test_traffic_openapi_contracts_are_strict_and_typed() -> None:
    schema = app.openapi()
    paths = schema["paths"]

    assert paths["/api/trex/traffic/runtime"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert paths["/api/trex/traffic/plan"]["put"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert paths["/api/trex/traffic/group/{group_id}/start"]["post"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    for model_name in (
        "TrafficRuntimeSnapshotResponse",
        "TrafficStartResult",
        "TrafficUpdateResult",
        "TrafficActionResult",
        "TrafficPlanPutRequest",
        "TrafficGroupStartRequest",
    ):
        assert schema["components"]["schemas"][model_name]["additionalProperties"] is False
    assert "expected_session_id" in schema["components"]["schemas"]["TrafficPortsRequest"]["properties"]
    assert "expected_session_id" in schema["components"]["schemas"]["UpdateTrafficRequest"]["properties"]
    assert "expected_session_id" in schema["components"]["schemas"]["StartTrafficRequest"]["properties"]
    assert "expected_session_id" in schema["components"]["schemas"]["TrafficGroupStartRequest"]["properties"]
    assert "expected_session_id" in schema["components"]["schemas"]["TrafficPortsRequest"]["required"]
    assert "expected_session_id" in schema["components"]["schemas"]["UpdateTrafficRequest"]["required"]
    for request_name in ("StartTrafficRequest", "TrafficGroupStartRequest"):
        request_schema = schema["components"]["schemas"][request_name]
        assert "hard_stop_at" in request_schema["properties"]
        assert "expected_session_id" in request_schema["required"]
        expected_session_schema = request_schema["properties"][
            "expected_session_id"
        ]
        assert {"type": "null"} in expected_session_schema["anyOf"]
        string_schema = next(
            candidate
            for candidate in expected_session_schema["anyOf"]
            if candidate.get("type") == "string"
        )
        assert string_schema["minLength"] == 1
        assert string_schema["maxLength"] == 64
    session_group_schema = schema["components"]["schemas"]["TrafficSessionGroupResponse"]
    assert "port_states" in session_group_schema["required"]
    assert "hard_stop_at" in session_group_schema["required"]
    assert "mixed" in session_group_schema["properties"]["state"]["enum"]
    mutation_schema = schema["components"]["schemas"][
        "TrafficMutationIntentResponse"
    ]
    for evidence_field in (
        "superseded_intent_nonce",
        "superseded_intent_operation",
        "superseded_intent_ports",
        "superseded_reason",
    ):
        assert evidence_field in mutation_schema["required"]
    runtime_schema = schema["components"]["schemas"][
        "TrafficRuntimeSnapshotResponse"
    ]
    assert "authority" in runtime_schema["required"]
    assert runtime_schema["properties"]["authority"] == {
        "$ref": "#/components/schemas/RuntimeAuthorityIdentityResponse"
    }
    assert "mutation_intent" in runtime_schema["required"]
    assert "live_state_sampled" in runtime_schema["required"]

    encoded = json.dumps(schema["paths"]["/api/trex/traffic/start"]["post"]["responses"]["200"])
    assert "TrafficStartResultResponse" in encoded
