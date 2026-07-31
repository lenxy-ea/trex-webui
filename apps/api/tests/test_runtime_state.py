from __future__ import annotations

import json
import stat
from pathlib import Path

import pytest

from app.trex.runtime_state import (
    CaptureLeaseState,
    CaptureRecorderIdentityState,
    RuntimeAuthorityIdentity,
    RuntimeConnectionState,
    RuntimeStateDocument,
    RuntimeStateError,
    RuntimeStateStore,
    TrafficGroupState,
    TrafficMutationIntentState,
    TrafficSessionGroupState,
    TrafficSessionState,
)

MANAGED_AUTHORITY = RuntimeAuthorityIdentity(
    host="127.0.0.1",
    sync_port=4501,
    async_port=4500,
    scapy_port=4507,
    daemon_supervisor="systemd",
    generation="11111111-1111-4111-8111-111111111111",
)


def test_runtime_state_store_round_trips_all_owned_state(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime-state.json"
    store = RuntimeStateStore(state_path)

    def mutate(state: RuntimeStateDocument) -> RuntimeStateDocument:
        state.connection = RuntimeConnectionState(
            host="127.0.0.1",
            sync_port=4501,
            async_port=4500,
            scapy_port=4507,
            client_name="Client1",
            connect_timeout_seconds=3,
            updated_at="2026-07-30T00:00:00Z",
        )
        state.capture_leases = [
            CaptureLeaseState(
                capture_id=7,
                authority=MANAGED_AUTHORITY,
                service_states={0: {"enabled": False, "filtered": False, "mask": None}},
                tx_ports=[0],
                rx_ports=[1],
                bpf_filter="icmp",
                ports=[0, 1],
                acquired_ports=[1],
            )
        ]
        state.traffic_groups = [
            TrafficGroupState(
                id="pair-0",
                name="P0 ↔ P1",
                ports=[0, 1],
                profile_path="udp_1pkt_simple.py",
            )
        ]
        return state

    updated = store.update(mutate)
    loaded = RuntimeStateStore(state_path).load()

    assert updated.revision == 1
    assert loaded == updated
    assert loaded.capture_leases[0].service_states[0]["enabled"] is False
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o640


def test_runtime_state_store_instances_share_one_path_lock(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime-state.json"

    first = RuntimeStateStore(state_path)
    second = RuntimeStateStore(tmp_path / "." / "runtime-state.json")

    assert first._lock is second._lock


def test_runtime_state_noop_does_not_rewrite_or_advance_revision(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime-state.json"
    store = RuntimeStateStore(state_path)
    written = store.update(lambda state: state)
    before = state_path.stat().st_mtime_ns

    loaded = store.update(lambda _state: None)

    assert loaded.revision == written.revision
    assert state_path.stat().st_mtime_ns == before


def test_runtime_state_store_rejects_unknown_or_corrupt_state_without_overwriting_it(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime-state.json"
    original = '{"version":99,"revision":0}\n'
    state_path.write_text(original, encoding="utf-8")

    with pytest.raises(RuntimeStateError, match="runtime state is invalid"):
        RuntimeStateStore(state_path).update(lambda state: state)

    assert state_path.read_text(encoding="utf-8") == original


def test_runtime_state_store_rejects_symlink_target(tmp_path: Path) -> None:
    target = tmp_path / "target.json"
    target.write_text(json.dumps({"version": 1, "revision": 0}), encoding="utf-8")
    state_path = tmp_path / "runtime-state.json"
    state_path.symlink_to(target)

    with pytest.raises(RuntimeStateError, match="non-symlink regular file"):
        RuntimeStateStore(state_path).load()


def test_runtime_state_rejects_overlapping_traffic_groups() -> None:
    with pytest.raises(ValueError, match="must not overlap"):
        RuntimeStateDocument(
            traffic_groups=[
                {
                    "id": "pair-0",
                    "name": "P0 ↔ P1",
                    "ports": [0, 1],
                    "profile_path": "one.py",
                },
                {
                    "id": "pair-1",
                    "name": "P1 ↔ P2",
                    "ports": [1, 2],
                    "profile_path": "two.py",
                },
            ]
        )


def test_runtime_state_rejects_capture_acquisition_outside_lease_ports() -> None:
    with pytest.raises(ValueError, match="subset"):
        CaptureLeaseState(
            capture_id=1,
            authority=MANAGED_AUTHORITY,
            tx_ports=[0],
            rx_ports=[],
            bpf_filter="",
            ports=[0],
            acquired_ports=[1],
        )


def test_runtime_state_rejects_capture_ports_outside_recorder_identity() -> None:
    with pytest.raises(ValueError, match="union of TX and RX"):
        CaptureLeaseState(
            capture_id=1,
            authority=MANAGED_AUTHORITY,
            tx_ports=[0],
            rx_ports=[],
            bpf_filter="",
            ports=[0, 1],
            acquired_ports=[],
        )


def test_runtime_state_round_trips_pending_capture_start_authority(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    store = RuntimeStateStore(state_path)
    pending_id = "pending-start:22222222-2222-4222-8222-222222222222"

    def persist_pending(
        state: RuntimeStateDocument,
    ) -> RuntimeStateDocument:
        state.capture_leases = [
            CaptureLeaseState(
                capture_id=pending_id,
                recovery_phase="pending_start",
                baseline_capture_ids=[3, 7],
                baseline_recorders=[
                    CaptureRecorderIdentityState(
                        capture_id=3,
                        tx_ports=[0],
                        rx_ports=[],
                        bpf_filter="",
                    ),
                    CaptureRecorderIdentityState(
                        capture_id=7,
                        tx_ports=[],
                        rx_ports=[0],
                        bpf_filter="icmp",
                    ),
                ],
                authority=MANAGED_AUTHORITY,
                service_states={
                    0: {
                        "enabled": False,
                        "filtered": False,
                        "mask": None,
                    }
                },
                tx_ports=[0],
                rx_ports=[],
                bpf_filter="icmp",
                ports=[0],
                acquired_ports=[0],
            )
        ]
        return state

    store.update(persist_pending)
    lease = store.load().capture_leases[0]

    assert lease.capture_id == pending_id
    assert lease.recovery_phase == "pending_start"
    assert lease.baseline_capture_ids == [3, 7]


def test_runtime_state_round_trips_cleanup_required_capture_authority(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    store = RuntimeStateStore(state_path)

    def persist_cleanup(
        state: RuntimeStateDocument,
    ) -> RuntimeStateDocument:
        state.capture_leases = [
            CaptureLeaseState(
                capture_id=7,
                recovery_phase="cleanup_required",
                authority=MANAGED_AUTHORITY,
                service_states={
                    0: {
                        "enabled": False,
                        "filtered": False,
                        "mask": None,
                    }
                },
                tx_ports=[0],
                rx_ports=[],
                bpf_filter="icmp",
                ports=[0],
                acquired_ports=[0],
            )
        ]
        return state

    store.update(persist_cleanup)
    lease = store.load().capture_leases[0]

    assert lease.capture_id == 7
    assert lease.recovery_phase == "cleanup_required"
    assert lease.baseline_capture_ids == []


def test_runtime_state_rejects_overlapping_traffic_session_groups() -> None:
    with pytest.raises(ValueError, match="session group ports must not overlap"):
        TrafficSessionState(
            id="session",
            authority=MANAGED_AUTHORITY,
            state="mixed",
            started_at="2026-07-30T00:00:00Z",
            updated_at="2026-07-30T00:00:00Z",
            groups=[
                {
                    "group_id": "pair-0",
                    "ports": [0, 1],
                    "profile_path": "one.py",
                    "multiplier": "1",
                    "duration": -1,
                    "state": "stopped",
                    "port_states": {0: "stopped", 1: "stopped"},
                    "updated_at": "2026-07-30T00:00:00Z",
                },
                {
                    "group_id": "ad-hoc",
                    "ports": [0],
                    "profile_path": "two.py",
                    "multiplier": "1",
                    "duration": -1,
                    "state": "running",
                    "port_states": {0: "running"},
                    "updated_at": "2026-07-30T00:00:00Z",
                },
            ],
        )


def test_runtime_state_requires_exact_per_port_traffic_state() -> None:
    common = {
        "group_id": "pair-0",
        "ports": [0, 1],
        "profile_path": "one.py",
        "multiplier": "1",
        "duration": -1,
        "updated_at": "2026-07-30T00:00:00Z",
    }

    with pytest.raises(ValueError, match="port_states keys must equal ports"):
        TrafficSessionState(
            id="session",
            authority=MANAGED_AUTHORITY,
            state="running",
            started_at="2026-07-30T00:00:00Z",
            updated_at="2026-07-30T00:00:00Z",
            groups=[
                {
                    **common,
                    "state": "running",
                    "port_states": {0: "running"},
                }
            ],
        )

    with pytest.raises(ValueError, match="must aggregate port_states as mixed"):
        TrafficSessionState(
            id="session",
            authority=MANAGED_AUTHORITY,
            state="running",
            started_at="2026-07-30T00:00:00Z",
            updated_at="2026-07-30T00:00:00Z",
            groups=[
                {
                    **common,
                    "state": "running",
                    "port_states": {0: "paused", 1: "running"},
                }
            ],
        )


def test_runtime_state_round_trips_exact_traffic_mutation_wal(
    tmp_path: Path,
) -> None:
    group = TrafficSessionGroupState(
        group_id="pair-0",
        ports=[0, 1],
        profile_path="one.py",
        multiplier="1",
        duration=-1,
        state="running",
        port_states={0: "running", 1: "running"},
        updated_at="2026-07-30T00:00:00Z",
    )
    session = TrafficSessionState(
        id="session-123",
        authority=MANAGED_AUTHORITY,
        state="running",
        started_at="2026-07-30T00:00:00Z",
        updated_at="2026-07-30T00:00:00Z",
        groups=[group],
    )
    intent = TrafficMutationIntentState(
        nonce="22222222-2222-4222-8222-222222222222",
        operation="pause",
        authority=MANAGED_AUTHORITY,
        expected_session_id=session.id,
        ports=[0],
        baseline_port_states={0: "running", 1: "running"},
        desired_port_states={0: "paused"},
        session_before=session,
        prepared_at="2026-07-30T00:00:01Z",
    )
    store = RuntimeStateStore(tmp_path / "runtime-state.json")

    persisted = store.update(
        lambda state: state.model_copy(
            update={
                "traffic_session": session,
                "traffic_mutation_intent": intent,
            },
            deep=True,
        )
    )
    loaded = store.load()

    assert loaded == persisted
    assert loaded.traffic_mutation_intent == intent
    assert loaded.traffic_mutation_intent.session_before == session  # type: ignore[union-attr]

    with pytest.raises(
        ValueError,
        match="must preserve the exact pre-mutation session",
    ):
        RuntimeStateDocument(traffic_mutation_intent=intent)

    with pytest.raises(
        ValueError,
        match="baseline cannot contain unknown",
    ):
        TrafficMutationIntentState(
            nonce="33333333-3333-4333-8333-333333333333",
            operation="start",
            authority=MANAGED_AUTHORITY,
            expected_session_id=None,
            ports=[0],
            baseline_port_states={0: "unknown"},
            desired_port_states={0: "running"},
            start_group=group.model_copy(
                update={
                    "ports": [0],
                    "port_states": {0: "running"},
                }
            ),
            prepared_at="2026-07-30T00:00:01Z",
        )


def test_traffic_session_group_persists_only_canonical_hard_stop_deadline(
    tmp_path: Path,
) -> None:
    deadline = "2026-07-31T00:01:00Z"
    group = TrafficSessionGroupState(
        group_id="pair-0",
        ports=[0, 1],
        profile_path="one.py",
        multiplier="1",
        duration=-1,
        hard_stop_at=deadline,
        state="paused",
        port_states={0: "paused", 1: "paused"},
        updated_at="2026-07-31T00:00:00Z",
    )
    session = TrafficSessionState(
        id="session-lease",
        authority=MANAGED_AUTHORITY,
        state="paused",
        started_at="2026-07-31T00:00:00Z",
        updated_at="2026-07-31T00:00:00Z",
        groups=[group],
    )
    store = RuntimeStateStore(tmp_path / "runtime-state.json")

    persisted = store.update(
        lambda state: state.model_copy(
            update={"traffic_session": session},
            deep=True,
        )
    )

    assert (
        persisted.traffic_session is not None
        and persisted.traffic_session.groups[0].hard_stop_at == deadline
    )
    assert store.load().traffic_session == persisted.traffic_session

    with pytest.raises(ValueError, match="canonical UTC"):
        TrafficSessionGroupState(
            **{
                **group.model_dump(mode="python"),
                "hard_stop_at": "2026-07-31T00:01:00+00:00",
            }
        )


def test_runtime_state_rejects_v1_without_runtime_authority_fail_closed(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    original = '{"version":1,"revision":0,"capture_leases":[]}\n'
    state_path.write_text(original, encoding="utf-8")

    with pytest.raises(RuntimeStateError, match="runtime state is invalid"):
        RuntimeStateStore(state_path).load()

    assert state_path.read_text(encoding="utf-8") == original
