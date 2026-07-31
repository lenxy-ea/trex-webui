from __future__ import annotations

import importlib.util
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "trex_six_port_e2e.py"
SCRIPTS_DIR = SCRIPT_PATH.parent


def load_script_module():
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location("trex_six_port_e2e", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


six_port = load_script_module()
PORTS = list(range(6))
GROUP_IDS = ["pair-0", "pair-1", "pair-2"]
PORTS_BY_GROUP = {
    "pair-0": [0, 1],
    "pair-1": [2, 3],
    "pair-2": [4, 5],
}


def mutation_evidence(
    nonce: str,
    operation: str,
    ports: list[int],
    *,
    completed_at: str,
) -> dict[str, Any]:
    return {
        "intent_nonce": nonce,
        "operation": operation,
        "completion_mode": "direct",
        "ports": ports,
        "baseline_port_states": {
            str(port): "stopped" if operation == "start" else "running"
            for port in ports
        },
        "desired_port_states": {
            str(port): "running" if operation == "start" else "stopped"
            for port in ports
        },
        "baseline_acquired_ports": [],
        "prepared_at": "2026-07-31T12:00:00.000000Z",
        "completed_at": completed_at,
        "acquisition_restored": True,
        "wal_cleared": True,
    }


def canonical_session(
    *,
    session_id: str = "11111111-1111-4111-8111-111111111111",
    revision: int = 5,
    observed_cleanup_group: str | None = None,
) -> dict[str, Any]:
    stop_nonce = "99999999-9999-4999-8999-999999999999"
    stopped_at = "2026-07-31T12:00:03.000000Z"
    groups: list[dict[str, Any]] = []
    starts: list[dict[str, Any]] = []
    for index, group_id in enumerate(GROUP_IDS):
        ports = PORTS_BY_GROUP[group_id]
        run_id = (
            session_id
            if index == 0
            else f"{index + 2:08d}-2222-4222-8222-222222222222"
        )
        start = mutation_evidence(
            run_id,
            "start",
            ports,
            completed_at=f"2026-07-31T12:00:0{index}.500000Z",
        )
        starts.append(start)
        if observed_cleanup_group == group_id:
            cleanup = {
                "completion": "observed",
                "completed_at": stopped_at,
                "final_port_states": {str(port): "stopped" for port in ports},
                "intent_nonce": None,
                "acquisition_restored": None,
                "wal_cleared": True,
            }
        else:
            cleanup = {
                "completion": "operator_stop",
                "completed_at": stopped_at,
                "final_port_states": {str(port): "stopped" for port in ports},
                "intent_nonce": stop_nonce,
                "acquisition_restored": True,
                "wal_cleared": True,
            }
        groups.append(
            {
                "group_id": group_id,
                "run_id": run_id,
                "source": "plan",
                "plan_revision": 7,
                "ports": ports,
                "profile_path": f"profiles/{group_id}.py",
                "profile_sha256": str(index + 1) * 64,
                "start_multiplier": f"{index + 1}kpps",
                "multiplier": f"{index + 1}kpps",
                "duration": -1,
                "start_force": True,
                "start_total": False,
                "start_synchronized": False,
                "start_clear_existing": True,
                "started_at": f"2026-07-31T12:00:0{index}.500000Z",
                "ended_at": stopped_at,
                "hard_stop_at": None,
                "tunables": {},
                "start_evidence": start,
                "cleanup_evidence": cleanup,
                "state": "stopped",
                "port_states": {str(port): "stopped" for port in ports},
                "updated_at": stopped_at,
            }
        )
    return {
        "id": session_id,
        "revision": revision,
        "evidence_version": 1,
        "authority": {
            "host": "127.0.0.1",
            "sync_port": 4501,
            "async_port": 4500,
            "scapy_port": 4507,
            "daemon_supervisor": "systemd",
            "generation": "runtime-1",
        },
        "state": "stopped",
        "started_at": "2026-07-31T12:00:00.500000Z",
        "updated_at": stopped_at,
        "ended_at": stopped_at,
        "groups": groups,
        "completed_groups": [],
        "mutation_evidence": [
            *starts,
            mutation_evidence(stop_nonce, "stop", PORTS, completed_at=stopped_at),
        ],
        "reconciliation": None,
    }


def plan_groups() -> list[dict[str, Any]]:
    return [
        {
            "id": group_id,
            "name": group_id,
            "ports": ports,
            "profile_path": f"profiles/{group_id}.py",
            "multiplier": f"{index + 1}kpps",
            "duration": -1,
            "force": True,
            "total": False,
            "synchronized": False,
            "clear_existing": True,
            "tunables": {},
        }
        for index, (group_id, ports) in enumerate(PORTS_BY_GROUP.items())
    ]


def active_session(
    group_ids: list[str],
    hard_stop_at: dict[str, str],
    *,
    session_id: str = "11111111-1111-4111-8111-111111111111",
    authority_generation: str = "runtime-1",
) -> dict[str, Any]:
    groups: list[dict[str, Any]] = []
    starts: list[dict[str, Any]] = []
    for index, group_id in enumerate(group_ids):
        ports = PORTS_BY_GROUP[group_id]
        run_id = (
            session_id
            if index == 0
            else f"{index + 2:08d}-2222-4222-8222-222222222222"
        )
        start = mutation_evidence(
            run_id,
            "start",
            ports,
            completed_at=f"2026-07-31T12:00:0{index}.500000Z",
        )
        starts.append(start)
        groups.append(
            {
                "group_id": group_id,
                "run_id": run_id,
                "source": "plan",
                "plan_revision": 7,
                "ports": ports,
                "profile_path": f"profiles/{group_id}.py",
                "profile_sha256": str(index + 1) * 64,
                "start_multiplier": f"{index + 1}kpps",
                "multiplier": f"{index + 1}kpps",
                "duration": -1,
                "start_force": True,
                "start_total": False,
                "start_synchronized": False,
                "start_clear_existing": True,
                "started_at": f"2026-07-31T12:00:0{index}.500000Z",
                "ended_at": None,
                "hard_stop_at": hard_stop_at[group_id],
                "tunables": {},
                "start_evidence": start,
                "cleanup_evidence": None,
                "state": "running",
                "port_states": {str(port): "running" for port in ports},
                "updated_at": f"2026-07-31T12:00:0{index}.500000Z",
            }
        )
    return {
        "id": session_id,
        "revision": len(groups),
        "evidence_version": 1,
        "authority": {
            "host": "127.0.0.1",
            "sync_port": 4501,
            "async_port": 4500,
            "scapy_port": 4507,
            "daemon_supervisor": "systemd",
            "generation": authority_generation,
        },
        "state": "running",
        "started_at": "2026-07-31T12:00:00.500000Z",
        "updated_at": "2026-07-31T12:00:02.500000Z",
        "ended_at": None,
        "groups": groups,
        "completed_groups": [],
        "mutation_evidence": starts,
        "reconciliation": None,
    }


def runtime_payload(
    session: dict[str, Any] | None = None,
    *,
    live_active: bool = False,
) -> dict[str, Any]:
    authority = (
        session.get("authority")
        if live_active
        and isinstance(session, dict)
        and isinstance(session.get("authority"), dict)
        else {
            "host": "127.0.0.1",
            "sync_port": 4501,
            "async_port": 4500,
            "scapy_port": 4507,
            "daemon_supervisor": "systemd",
            "generation": "runtime-1",
        }
    )
    active_ports = {
        port
        for group in (
            session.get("groups")
            if live_active and isinstance(session, dict) and isinstance(session.get("groups"), list)
            else []
        )
        if isinstance(group, dict) and group.get("state") == "running"
        for port in group.get("ports", [])
    }
    return {
        "ok": True,
        "data": {
            "plan_revision": 7,
            "groups": plan_groups(),
            "authority": authority,
            "session": session,
            "mutation_intent": None,
            "config": {
                "path": "/etc/trex_cfg.yaml",
                "port_limit": 6,
                "interfaces": [f"0000:03:00.{port}" for port in PORTS],
            },
            "available_ports": list(PORTS),
            "port_states": [
                {
                    "port": port,
                    "state": "running" if port in active_ports else "stopped",
                    "ownership": "managed" if port in active_ports else "none",
                }
                for port in PORTS
            ],
            "live_state_sampled": True,
            "reconciliation": "clean",
        },
    }


def ports_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "data": {
            "port_ids": list(PORTS),
            "ports": [
                {
                    "id": port,
                    "acquired": False,
                    "info": {"status": "IDLE", "link": "UP", "owner": None},
                }
                for port in PORTS
            ],
        },
    }


def stats_payload(value: float, *, idle_port: int | None = None) -> dict[str, Any]:
    return {
        "ok": True,
        "data": {
            str(port): {
                "opackets": value,
                "ipackets": 0 if port == idle_port else value,
            }
            for port in PORTS
        },
    }


def args(tmp_path: Path, **overrides: Any) -> SimpleNamespace:
    values = {
        "base_url": "http://127.0.0.1",
        "output_dir": str(tmp_path),
        "report_prefix": "six-port-test",
        "timeout": 3.0,
        "poll_interval": 0.0,
        "stats_timeout": 0.1,
        "group_ids": list(GROUP_IDS),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeSixPortApi:
    def __init__(
        self,
        *,
        drift_group: str | None = None,
        idle_port: int | None = None,
        final_session: dict[str, Any] | None = None,
        fail_group: str | None = None,
        reject_bound_save: bool = False,
        response_loss_group: str | None = None,
        recovery_authority_generation: str = "runtime-1",
        initial_session: dict[str, Any] | None = None,
        start_field_drift: tuple[str, Any] | None = None,
    ) -> None:
        self.calls: list[tuple[str, str, Any]] = []
        self.session_id = "11111111-1111-4111-8111-111111111111"
        self.drift_group = drift_group
        self.idle_port = idle_port
        self.final_session = final_session or canonical_session()
        self.fail_group = fail_group
        self.reject_bound_save = reject_bound_save
        self.response_loss_group = response_loss_group
        self.recovery_authority_generation = recovery_authority_generation
        self.initial_session = initial_session
        self.start_field_drift = start_field_drift
        self.runtime_reads = 0
        self.stats_reads = 0
        self.saved_documents: dict[str, dict[str, Any]] = {}
        self.save_requests: list[dict[str, Any]] = []
        self.started_group_ids: list[str] = []
        self.hard_stop_at: dict[str, str] = {}
        self.stopped = False

    def __call__(self, base_url, method, path, payload, timeout):
        self.calls.append((method, path, payload))
        if (method, path) == ("GET", "/api/trex/traffic/runtime"):
            self.runtime_reads += 1
            if self.runtime_reads == 1:
                return runtime_payload(self.initial_session)
            if not self.stopped and self.started_group_ids:
                return runtime_payload(
                    active_session(
                        self.started_group_ids,
                        self.hard_stop_at,
                        authority_generation=self.recovery_authority_generation,
                    ),
                    live_active=True,
                )
            return runtime_payload(self.final_session)
        if (method, path) == ("GET", "/api/trex/ports"):
            return ports_payload()
        if (method, path) == ("POST", "/api/trex/stats/clear"):
            return {"ok": True, "data": {"ports": payload["ports"]}}
        if (method, path) == ("GET", "/api/trex/stats"):
            self.stats_reads += 1
            return stats_payload(
                0 if self.stats_reads == 1 else 100,
                idle_port=self.idle_port if self.stats_reads > 1 else None,
            )
        if method == "POST" and path.startswith("/api/trex/traffic/group/"):
            group_id = path.removeprefix("/api/trex/traffic/group/").removesuffix("/start")
            if group_id == self.fail_group:
                return {"ok": False, "blocker": "fixture_group_failure"}
            self.started_group_ids.append(group_id)
            self.hard_stop_at[group_id] = payload["hard_stop_at"]
            persisted = active_session(self.started_group_ids, self.hard_stop_at)
            if self.start_field_drift is not None:
                field, value = self.start_field_drift
                persisted["groups"][-1][field] = value
            if group_id == self.response_loss_group:
                raise six_port.AcceptanceError(
                    f"start {group_id}",
                    "fixture lost the response after persistence",
                )
            observed = (
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                if group_id == self.drift_group
                else self.session_id
            )
            return {
                "ok": True,
                "binary_base64": "fixture omitted from report evidence",
                "data": {
                    "session": {
                        **persisted,
                        "id": observed,
                    }
                },
            }
        if (method, path) == ("POST", "/api/trex/traffic/stop"):
            self.stopped = True
            return {
                "ok": True,
                "data": {"session": self.final_session},
            }
        if (method, path) == ("POST", "/api/trex/capture/remove-all"):
            return {"ok": True, "data": {"removed": []}}
        if (method, path) == ("GET", "/api/trex/capture/status"):
            return {"ok": True, "data": {"captures": []}}
        if (method, path) == ("POST", "/api/trex/reports/save"):
            assert isinstance(payload, dict)
            self.save_requests.append(payload)
            if self.reject_bound_save and "traffic_session_id" in payload:
                return {"ok": False, "blocker": "traffic_session_revision_conflict"}
            report_payload = json.loads(json.dumps(payload["payload"]))
            if "traffic_session_id" in payload:
                report_payload["traffic_session"] = json.loads(json.dumps(self.final_session))
                report_payload["traffic_session_binding"] = {
                    "id": payload["traffic_session_id"],
                    "revision": payload["traffic_session_revision"],
                    "evidence_version": 1,
                }
            document = {
                "version": 2,
                "title": payload["title"],
                "markdown": payload["markdown"],
                "payload": report_payload,
            }
            self.saved_documents[payload["file_name"]] = document
            return {"ok": True, "data": {"file": {"name": payload["file_name"]}}}
        if (method, path) == ("POST", "/api/trex/reports/download"):
            return {
                "ok": True,
                "data": {
                    "file": {
                        "content": json.dumps(self.saved_documents[payload["file_name"]])
                    }
                },
            }
        raise AssertionError(f"unexpected request: {method} {path}")


@pytest.fixture(autouse=True)
def current_identity(monkeypatch):
    monkeypatch.setattr(
        six_port,
        "compute_source_identity",
        lambda _root: {"algorithm": "source", "digest": "1" * 64},
    )
    monkeypatch.setattr(
        six_port,
        "compute_build_identity",
        lambda _root: {"algorithm": "build", "digest": "2" * 64},
    )
    monkeypatch.setattr(
        six_port,
        "local_api_source_summary",
        lambda _root: {"title": "TRex WebUI", "version": "0.1.0"},
    )


def test_happy_path_qualifies_all_three_groups_and_saves_canonical_session(
    monkeypatch, tmp_path: Path
) -> None:
    api = FakeSixPortApi()
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "pass"
    assert run["packet_growth"] == {
        str(port): {"opackets": 100.0, "ipackets": 100.0} for port in PORTS
    }
    start_calls = [
        call for call in api.calls if call[1].startswith("/api/trex/traffic/group/")
    ]
    assert [call[1] for call in start_calls] == [
        f"/api/trex/traffic/group/{group_id}/start" for group_id in GROUP_IDS
    ]
    assert [call[2]["expected_session_id"] for call in start_calls] == [
        None,
        api.session_id,
        api.session_id,
    ]
    assert all(call[2]["plan_revision"] == 7 for call in start_calls)
    assert all(call[2]["confirmation"] == "start-traffic" for call in start_calls)
    deadlines = [
        datetime.fromisoformat(call[2]["hard_stop_at"].replace("Z", "+00:00"))
        for call in start_calls
    ]
    now = datetime.now(timezone.utc)
    assert all(now < deadline <= now + timedelta(seconds=300) for deadline in deadlines)
    assert run["group_hard_stop_at"] == {
        group_id: start_calls[index][2]["hard_stop_at"]
        for index, group_id in enumerate(GROUP_IDS)
    }
    assert run["plan_groups"] == {
        group_id: {
            "ports": PORTS_BY_GROUP[group_id],
            "profile_path": f"profiles/{group_id}.py",
            "multiplier": f"{index + 1}kpps",
            "duration": -1,
            "force": True,
            "total": False,
            "synchronized": False,
            "clear_existing": True,
        }
        for index, group_id in enumerate(GROUP_IDS)
    }
    for index, attempt in enumerate(run["group_start_attempts"]):
        group_id = GROUP_IDS[index]
        assert attempt.keys() >= {
            "group_id",
            "plan_revision",
            "ports",
            "profile_path",
            "multiplier",
            "duration",
            "force",
            "total",
            "synchronized",
            "clear_existing",
            "hard_stop_at",
            "pre_session_id",
            "expected_session_id",
            "pre_authority",
            "start_result",
            "session_id",
            "run_id",
        }
        assert attempt["group_id"] == group_id
        assert attempt["plan_revision"] == 7
        assert attempt["ports"] == PORTS_BY_GROUP[group_id]
        assert attempt["profile_path"] == f"profiles/{group_id}.py"
        assert attempt["multiplier"] == f"{index + 1}kpps"
        assert attempt["duration"] == -1
        assert attempt["force"] is True
        assert attempt["total"] is False
        assert attempt["synchronized"] is False
        assert attempt["clear_existing"] is True
        assert attempt["hard_stop_at"] == start_calls[index][2]["hard_stop_at"]
        assert attempt["pre_session_id"] == (
            None if index == 0 else api.session_id
        )
        assert attempt["expected_session_id"] == (
            None if index == 0 else api.session_id
        )
        assert attempt["pre_authority"]["generation"] == "runtime-1"
        assert attempt["session_id"] == api.session_id
        assert attempt["run_id"] == (
            api.session_id
            if index == 0
            else f"{index + 2:08d}-2222-4222-8222-222222222222"
        )
        assert attempt["start_result"]["ok"] is True
        assert "binary_base64" not in attempt["start_result"]
    clear_request = next(call[2] for call in api.calls if call[1] == "/api/trex/stats/clear")
    assert clear_request == {"ports": PORTS}
    stop_request = next(call[2] for call in api.calls if call[1] == "/api/trex/traffic/stop")
    assert stop_request == {
        "ports": PORTS,
        "confirmation": "stop",
        "expected_session_id": api.session_id,
    }
    assert api.save_requests[0]["traffic_session_id"] == api.session_id
    assert api.save_requests[0]["traffic_session_revision"] == 5
    assert not six_port.RESERVED_REPORT_PAYLOAD_KEYS.intersection(
        api.save_requests[0]["payload"]
    )
    saved_document = next(iter(api.saved_documents.values()))
    assert saved_document["payload"]["traffic_session"] == api.final_session
    assert Path(run["local_report"]).is_file()


def test_session_id_drift_fails_closed_cleans_started_ports_and_saves_unbound(
    monkeypatch, tmp_path: Path
) -> None:
    api = FakeSixPortApi(drift_group="pair-1")
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert "drifted" in run["failure"]["message"]
    stop_request = next(call[2] for call in api.calls if call[1] == "/api/trex/traffic/stop")
    assert stop_request["ports"] == [0, 1, 2, 3]
    assert stop_request["expected_session_id"] == api.session_id
    assert len(api.save_requests) == 1
    assert "traffic_session_id" not in api.save_requests[0]
    assert "traffic_session_revision" not in api.save_requests[0]
    assert not six_port.RESERVED_REPORT_PAYLOAD_KEYS.intersection(
        api.save_requests[0]["payload"]
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("profile_path", "profiles/drift.py"),
        ("start_multiplier", "99kpps"),
        ("multiplier", "99kpps"),
        ("duration", 5),
        ("start_force", False),
        ("start_total", True),
        ("start_synchronized", True),
        ("start_clear_existing", False),
    ],
)
def test_started_plan_session_rejects_exact_attempt_field_drift(
    monkeypatch,
    tmp_path: Path,
    field: str,
    value: Any,
) -> None:
    api = FakeSixPortApi(start_field_drift=(field, value))
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert "start fields changed" in run["failure"]["message"]
    assert "traffic_session_id" not in api.save_requests[0]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("profile_path", "profiles/drift.py"),
        ("start_multiplier", "99kpps"),
        ("multiplier", "99kpps"),
        ("duration", 5),
        ("start_force", False),
        ("start_total", True),
        ("start_synchronized", True),
        ("start_clear_existing", False),
    ],
)
def test_final_session_rejects_exact_plan_field_drift(
    monkeypatch,
    tmp_path: Path,
    field: str,
    value: Any,
) -> None:
    session = canonical_session()
    session["groups"][1][field] = value
    api = FakeSixPortApi(final_session=session)
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert f"pair-1 {field} does not match the plan" in run["failure"]["message"]
    assert "traffic_session_id" not in api.save_requests[0]


def test_single_port_without_rx_growth_fails_even_when_global_traffic_exists(
    monkeypatch, tmp_path: Path
) -> None:
    api = FakeSixPortApi(idle_port=4)
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path, stats_timeout=0.001))

    assert run["verdict"] == "fail"
    assert run["failure"]["stage"] == "six-port stats"
    assert run["failure"]["payload"]["missing_growth"] == {"P4": ["ipackets"]}
    stop_request = next(call[2] for call in api.calls if call[1] == "/api/trex/traffic/stop")
    assert stop_request["ports"] == PORTS
    assert "traffic_session_id" not in api.save_requests[0]


def test_partial_start_failure_still_stops_only_successfully_started_ports_and_removes_capture(
    monkeypatch, tmp_path: Path
) -> None:
    api = FakeSixPortApi(fail_group="pair-2")
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    stop_request = next(call[2] for call in api.calls if call[1] == "/api/trex/traffic/stop")
    assert stop_request["ports"] == [0, 1, 2, 3]
    assert ("POST", "/api/trex/capture/remove-all") in [
        (method, path) for method, path, _payload in api.calls
    ]
    assert run["postconditions"] == {
        "exact_inventory": True,
        "port_ids": PORTS,
        "ports_idle": True,
        "links_up": True,
        "ports_unowned": True,
        "acquired_ports_after_stop": [],
        "capture_recorders": 0,
        "runtime_exact_inventory": True,
        "runtime_port_ids": PORTS,
        "runtime_ports_stopped": True,
        "runtime_ports_unowned": True,
    }


def test_lost_group_start_response_adopts_exact_leased_prefix_for_cleanup(
    monkeypatch,
    tmp_path: Path,
) -> None:
    api = FakeSixPortApi(response_loss_group="pair-1")
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert "exact leased session was recovered" in run["failure"]["message"]
    stop_request = next(
        call[2] for call in api.calls if call[1] == "/api/trex/traffic/stop"
    )
    assert stop_request == {
        "ports": [0, 1, 2, 3],
        "confirmation": "stop",
        "expected_session_id": api.session_id,
    }
    assert run["group_start_attempts"][1]["status"] == "recovered-active"
    deadlines = [
        datetime.fromisoformat(
            attempt["hard_stop_at"].replace("Z", "+00:00")
        )
        for attempt in run["group_start_attempts"]
    ]
    now = datetime.now(timezone.utc)
    assert all(now < deadline <= now + timedelta(seconds=300) for deadline in deadlines)


def test_lost_first_start_response_rejects_foreign_runtime_authority_without_stop(
    monkeypatch,
    tmp_path: Path,
) -> None:
    api = FakeSixPortApi(
        response_loss_group="pair-0",
        recovery_authority_generation="runtime-foreign",
    )
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert not any(call[1] == "/api/trex/traffic/stop" for call in api.calls)
    rejected = run["cleanup_runtime_recovery_rejected"]
    assert isinstance(rejected, dict)
    assert "different authority" in rejected["reason"]
    assert rejected["expected_authority"]["generation"] == "runtime-1"
    assert rejected["observed_authority"]["generation"] == "runtime-foreign"
    deadline = datetime.fromisoformat(
        api.hard_stop_at["pair-0"].replace("Z", "+00:00")
    )
    now = datetime.now(timezone.utc)
    assert now < deadline <= now + timedelta(seconds=300)


def test_lost_later_start_response_never_stops_stale_prefix_after_authority_change(
    monkeypatch,
    tmp_path: Path,
) -> None:
    api = FakeSixPortApi(
        response_loss_group="pair-1",
        recovery_authority_generation="runtime-foreign",
    )
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert not any(call[1] == "/api/trex/traffic/stop" for call in api.calls)
    withheld = run["cleanup_operator_stop_withheld"]
    assert withheld["stale_session_id"] == api.session_id
    assert withheld["stale_ports"] == [0, 1]
    rejected = run["cleanup_runtime_recovery_rejected"]
    assert rejected["expected_authority"]["generation"] == "runtime-1"
    assert rejected["observed_authority"]["generation"] == "runtime-foreign"


def test_oversized_six_port_hard_stop_budget_fails_before_any_api_write(
    monkeypatch,
    tmp_path: Path,
) -> None:
    calls: list[tuple[str, str, Any]] = []
    monkeypatch.setattr(
        six_port,
        "request_json",
        lambda _base, method, path, payload, _timeout: calls.append(
            (method, path, payload)
        ),
    )

    with pytest.raises(six_port.AcceptanceError, match="300-second safety limit"):
        six_port.run_gate(args(tmp_path, timeout=50.0))

    assert calls == []


def test_retained_group_lease_cannot_certify_six_port_run(
    monkeypatch,
    tmp_path: Path,
) -> None:
    session = canonical_session()
    session["groups"][1]["hard_stop_at"] = "2026-07-31T12:05:00Z"
    api = FakeSixPortApi(final_session=session)
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert "hard-stop lease was not cleared" in run["failure"]["message"]
    assert "traffic_session_id" not in api.save_requests[0]


def test_hard_stop_cleanup_cannot_certify_six_port_run(
    monkeypatch,
    tmp_path: Path,
) -> None:
    session = canonical_session()
    stop_evidence = session["mutation_evidence"][-1]
    stop_evidence["completion_mode"] = "hard_stop"
    for group in session["groups"]:
        group["cleanup_evidence"]["completion"] = "hard_stop"
    api = FakeSixPortApi(final_session=session)
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert "cleanup evidence is incomplete" in run["failure"]["message"]
    assert "traffic_session_id" not in api.save_requests[0]


@pytest.mark.parametrize(
    ("update", "expected_message"),
    [
        ({"revision": 0}, "revision is not a positive integer"),
        ({"evidence_version": None}, "evidence_version is not 1"),
        ({"state": "running"}, "session is not stopped"),
    ],
)
def test_invalid_final_session_evidence_is_saved_unbound(
    monkeypatch,
    tmp_path: Path,
    update: dict[str, Any],
    expected_message: str,
) -> None:
    session = canonical_session()
    session.update(update)
    api = FakeSixPortApi(final_session=session)
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert expected_message in run["failure"]["message"]
    assert "traffic_session_id" not in api.save_requests[0]
    assert "traffic_session" not in api.save_requests[0]["payload"]


def test_observed_cleanup_evidence_cannot_certify_six_port_run(
    monkeypatch, tmp_path: Path
) -> None:
    api = FakeSixPortApi(
        final_session=canonical_session(observed_cleanup_group="pair-1")
    )
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert "cleanup evidence is incomplete or observed" in run["failure"]["message"]
    assert "traffic_session_id" not in api.save_requests[0]


def test_stale_bound_report_cas_retries_as_failed_unbound_report(
    monkeypatch, tmp_path: Path
) -> None:
    api = FakeSixPortApi(reject_bound_save=True)
    monkeypatch.setattr(six_port, "request_json", api)

    run = six_port.run_gate(args(tmp_path))

    assert run["verdict"] == "fail"
    assert run["failure"]["message"] == "traffic_session_revision_conflict"
    assert len(api.save_requests) == 2
    assert api.save_requests[0]["traffic_session_revision"] == 5
    assert "traffic_session_id" not in api.save_requests[1]
    assert "traffic_session_revision" not in api.save_requests[1]
    assert not six_port.RESERVED_REPORT_PAYLOAD_KEYS.intersection(
        api.save_requests[1]["payload"]
    )
    assert Path(run["local_report"]).is_file()


def test_report_payload_never_leaks_client_fabricated_reserved_fields() -> None:
    payload = six_port.report_payload(
        {
            "workflow": "six-port-e2e",
            "verdict": "fail",
            "traffic_session": {"id": "fabricated"},
            "traffic_session_binding": {"id": "fabricated", "revision": 1},
        }
    )

    assert payload == {"workflow": "six-port-e2e", "verdict": "fail"}


def test_port_counter_snapshot_accepts_integer_and_json_string_port_keys() -> None:
    payload = stats_payload(3)
    payload["data"][0] = payload["data"].pop("0")

    snapshot = six_port.port_counter_snapshot(payload, PORTS, "stats")

    assert snapshot[0] == {"opackets": 3.0, "ipackets": 3.0}
    assert snapshot[5] == {"opackets": 3.0, "ipackets": 3.0}


@pytest.mark.parametrize("extra_ports", [[6], [6, 7]])
def test_exact_six_port_inventory_rejects_extra_live_and_runtime_ports(
    extra_ports: list[int],
) -> None:
    live = ports_payload()
    live["data"]["port_ids"].extend(extra_ports)
    live["data"]["ports"].extend(
        {
            "id": port,
            "acquired": False,
            "info": {"status": "IDLE", "link": "UP", "owner": None},
        }
        for port in extra_ports
    )
    with pytest.raises(six_port.AcceptanceError, match="extra="):
        six_port.validate_ports_idle_and_up(live, PORTS, "live inventory")

    runtime = runtime_payload()["data"]
    runtime["available_ports"].extend(extra_ports)
    runtime["port_states"].extend(
        {"port": port, "state": "stopped", "ownership": "none"}
        for port in extra_ports
    )
    runtime["config"]["port_limit"] += len(extra_ports)
    runtime["config"]["interfaces"].extend(
        f"0000:04:00.{port}" for port in extra_ports
    )
    with pytest.raises(six_port.AcceptanceError, match="extra="):
        six_port.validate_runtime_ports_stopped(runtime, PORTS, "runtime inventory")


@pytest.mark.parametrize(
    ("acquired", "owner", "message"),
    [
        (True, None, "acquired=True"),
        (False, "Client1", "owner='Client1'"),
    ],
)
def test_six_port_boundary_rejects_manual_stl_ownership(
    acquired: bool, owner: str | None, message: str
) -> None:
    payload = ports_payload()
    payload["data"]["ports"][2]["acquired"] = acquired
    payload["data"]["ports"][2]["info"]["owner"] = owner

    with pytest.raises(six_port.AcceptanceError, match=message):
        six_port.validate_ports_idle_and_up(payload, PORTS, "ownership boundary")


def test_six_port_runtime_boundary_rejects_managed_ownership() -> None:
    runtime = runtime_payload()["data"]
    runtime["port_states"][4]["ownership"] = "managed"

    with pytest.raises(six_port.AcceptanceError, match="not stopped and unowned"):
        six_port.validate_runtime_ports_stopped(runtime, PORTS, "runtime boundary")


def test_cli_defaults_and_group_id_validation() -> None:
    parsed = six_port.build_parser().parse_args([])

    assert parsed.base_url == "http://127.0.0.1"
    assert parsed.group_ids == GROUP_IDS
    assert parsed.output_dir == ".logs/six-port-e2e"
    with pytest.raises(six_port.AcceptanceError, match="exactly three"):
        six_port.target_ports(["pair-0", "pair-1"])
    with pytest.raises(six_port.AcceptanceError, match="unique"):
        six_port.target_ports(["pair-0", "pair-0", "pair-2"])
