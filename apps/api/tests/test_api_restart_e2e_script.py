from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest


SCRIPT_PATH = (
    Path(__file__).resolve().parents[3] / "scripts" / "trex_api_restart_e2e.py"
)
SCRIPTS_DIR = SCRIPT_PATH.parent


def load_script_module():
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location("trex_api_restart_e2e", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


restart_e2e = load_script_module()
SESSION_ID = "11111111-1111-4111-8111-111111111111"
RUN_ID = SESSION_ID
STOP_NONCE = "22222222-2222-4222-8222-222222222222"
PORTS = [0, 1]
GROUP_ID = "pair-0"
PLAN_REVISION = 7


def mutation_evidence(
    *,
    nonce: str,
    operation: str,
    completed_at: str,
) -> dict[str, Any]:
    desired = "running" if operation == "start" else "stopped"
    baseline = "stopped" if operation == "start" else "running"
    return {
        "intent_nonce": nonce,
        "operation": operation,
        "completion_mode": "direct",
        "ports": list(PORTS),
        "baseline_port_states": {str(port): baseline for port in PORTS},
        "desired_port_states": {str(port): desired for port in PORTS},
        "baseline_acquired_ports": [],
        "prepared_at": "2026-07-31T12:00:00.000000Z",
        "completed_at": completed_at,
        "acquisition_restored": True,
        "wal_cleared": True,
    }


def canonical_started_session(
    *,
    session_id: str = SESSION_ID,
    revision: int = 1,
) -> dict[str, Any]:
    start_evidence = mutation_evidence(
        nonce=session_id,
        operation="start",
        completed_at="2026-07-31T12:00:00.500000Z",
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
            "generation": "daemon-generation-1",
        },
        "state": "running",
        "started_at": "2026-07-31T12:00:00.500000Z",
        "updated_at": "2026-07-31T12:00:00.500000Z",
        "ended_at": None,
        "groups": [
            {
                "group_id": GROUP_ID,
                "run_id": session_id,
                "source": "plan",
                "plan_revision": PLAN_REVISION,
                "ports": list(PORTS),
                "profile_path": "udp_1pkt_simple.py",
                "profile_sha256": "a" * 64,
                "start_multiplier": "1kpps",
                "multiplier": "1kpps",
                "duration": -1.0,
                "start_force": False,
                "start_total": False,
                "start_synchronized": False,
                "start_clear_existing": True,
                "started_at": "2026-07-31T12:00:00.500000Z",
                "ended_at": None,
                "hard_stop_at": None,
                "tunables": {},
                "start_evidence": start_evidence,
                "cleanup_evidence": None,
                "state": "running",
                "port_states": {str(port): "running" for port in PORTS},
                "updated_at": "2026-07-31T12:00:00.500000Z",
            }
        ],
        "completed_groups": [],
        "mutation_evidence": [start_evidence],
        "reconciliation": None,
    }


def canonical_stopped_session(
    *,
    cleanup_completion: str = "operator_stop",
) -> dict[str, Any]:
    session = copy.deepcopy(canonical_started_session())
    stopped_at = "2026-07-31T12:00:03.000000Z"
    stop_evidence = mutation_evidence(
        nonce=STOP_NONCE,
        operation="stop",
        completed_at=stopped_at,
    )
    session.update(
        {
            "revision": 2,
            "state": "stopped",
            "updated_at": stopped_at,
            "ended_at": stopped_at,
            "mutation_evidence": [*session["mutation_evidence"], stop_evidence],
        }
    )
    group = session["groups"][0]
    group.update(
        {
            "ended_at": stopped_at,
            "cleanup_evidence": {
                "completion": cleanup_completion,
                "completed_at": stopped_at,
                "final_port_states": {str(port): "stopped" for port in PORTS},
                "intent_nonce": STOP_NONCE,
                "acquisition_restored": True,
                "wal_cleared": True,
            },
            "state": "stopped",
            "port_states": {str(port): "stopped" for port in PORTS},
            "updated_at": stopped_at,
        }
    )
    return session


def reconciled_session(
    session: dict[str, Any],
    *,
    revision: int,
    updated_at: str,
    reconciliation: str,
) -> dict[str, Any]:
    reconciled = copy.deepcopy(session)
    reconciled.update(
        {
            "revision": revision,
            "updated_at": updated_at,
            "reconciliation": reconciliation,
        }
    )
    return reconciled


def runtime_payload(
    *,
    session: dict[str, Any] | None,
    active: bool,
) -> dict[str, Any]:
    return {
        "ok": True,
        "data": {
            "plan_revision": PLAN_REVISION,
            "groups": [
                {
                    "id": GROUP_ID,
                    "name": "P0 ↔ P1",
                    "ports": list(PORTS),
                    "profile_path": "udp_1pkt_simple.py",
                    "multiplier": "1kpps",
                    "duration": -1.0,
                    "force": False,
                    "total": False,
                    "synchronized": False,
                    "clear_existing": True,
                    "tunables": {},
                }
            ],
            "session": session,
            "mutation_intent": None,
            "config": {
                "path": "/var/lib/trex-webui/trex_cfg.yaml",
                "port_limit": 2,
                "interfaces": ["0000:02:00.1", "0000:02:00.0"],
            },
            "available_ports": list(PORTS),
            "port_states": [
                {
                    "port": port,
                    "state": "running" if active else "stopped",
                    "ownership": "managed" if active else "none",
                }
                for port in PORTS
            ],
            "live_state_sampled": True,
            "reconciliation": "live TRex port state reconciled",
        },
    }


def ports_payload(*, active: bool) -> dict[str, Any]:
    return {
        "ok": True,
        "data": {
            "port_ids": list(PORTS),
            "ports": [
                {
                    "id": port,
                    "acquired": False,
                    "info": {
                        "status": "TRANSMITTING" if active else "IDLE",
                        "link": "UP",
                        "owner": None,
                    },
                }
                for port in PORTS
            ],
        },
    }


def service_identity(
    *,
    main_pid: int,
    invocation_id: str,
    start_monotonic_us: int,
    restart_count: int,
) -> Any:
    return restart_e2e.ServiceProcessIdentity(
        service="trex-webui-api.service",
        boot_id="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        main_pid=main_pid,
        invocation_id=invocation_id,
        start_monotonic_us=start_monotonic_us,
        restart_count=restart_count,
        restart_policy="on-failure",
        active_state="active",
        sub_state="running",
    )


BEFORE_IDENTITY = service_identity(
    main_pid=1001,
    invocation_id="a" * 32,
    start_monotonic_us=100_000,
    restart_count=0,
)
AFTER_IDENTITY = service_identity(
    main_pid=1002,
    invocation_id="b" * 32,
    start_monotonic_us=200_000,
    restart_count=1,
)


class IdentitySequence:
    def __init__(self, after: Any) -> None:
        self.after = after
        self.calls = 0

    def __call__(self, _service: str) -> Any:
        self.calls += 1
        return BEFORE_IDENTITY if self.calls == 1 else self.after


class ScenarioApi:
    def __init__(
        self,
        *,
        adopted_session: dict[str, Any] | None = None,
        stopped_session: dict[str, Any] | None = None,
        final_session: dict[str, Any] | None = None,
        stale_stop: bool = False,
        bound_report_conflict: bool = False,
        fail_report_save: bool = False,
    ) -> None:
        self.started_session = canonical_started_session()
        self.adopted_session = adopted_session or copy.deepcopy(self.started_session)
        self.stopped_session = stopped_session or canonical_stopped_session()
        self.final_session = final_session or copy.deepcopy(self.stopped_session)
        self.stale_stop = stale_stop
        self.bound_report_conflict = bound_report_conflict
        self.fail_report_save = fail_report_save
        self.runtime_calls = 0
        self.port_calls = 0
        self.stop_requests: list[dict[str, Any]] = []
        self.start_requests: list[dict[str, Any]] = []
        self.save_requests: list[dict[str, Any]] = []
        self.last_archive = ""
        self.is_active = False

    def __call__(
        self,
        _base_url: str,
        method: str,
        endpoint: str,
        body: dict[str, Any] | None,
        _timeout: float,
    ) -> dict[str, Any]:
        if (method, endpoint) == ("GET", "/api/health"):
            return {"status": "ok"}
        if (method, endpoint) == ("GET", "/api/trex/traffic/runtime"):
            self.runtime_calls += 1
            if self.runtime_calls == 1:
                return runtime_payload(session=None, active=False)
            if self.runtime_calls == 2:
                return runtime_payload(session=self.adopted_session, active=True)
            return runtime_payload(session=self.final_session, active=False)
        if (method, endpoint) == ("GET", "/api/trex/ports"):
            self.port_calls += 1
            return ports_payload(active=self.is_active)
        if (
            method,
            endpoint,
        ) == ("POST", f"/api/trex/traffic/group/{GROUP_ID}/start"):
            assert isinstance(body, dict)
            assert body["plan_revision"] == PLAN_REVISION
            assert body["expected_session_id"] is None
            assert body["confirmation"] == "start-traffic"
            assert isinstance(body["hard_stop_at"], str)
            self.start_requests.append(copy.deepcopy(body))
            self.started_session["groups"][0]["hard_stop_at"] = body["hard_stop_at"]
            self.adopted_session["groups"][0]["hard_stop_at"] = body["hard_stop_at"]
            self.is_active = True
            return {"ok": True, "data": {"session": self.started_session}}
        if (method, endpoint) == ("POST", "/api/trex/traffic/stop"):
            assert isinstance(body, dict)
            self.stop_requests.append(copy.deepcopy(body))
            if self.stale_stop:
                return {
                    "ok": False,
                    "blocker": "traffic_session_conflict",
                    "error": "expected session is stale",
                }
            self.is_active = False
            return {"ok": True, "data": {"session": self.stopped_session}}
        if (method, endpoint) == ("POST", "/api/trex/reports/save"):
            assert isinstance(body, dict)
            self.save_requests.append(copy.deepcopy(body))
            if self.fail_report_save:
                return {
                    "ok": False,
                    "blocker": "report_store_unavailable",
                    "error": "report store is unavailable",
                }
            is_bound = "traffic_session_id" in body
            if is_bound and self.bound_report_conflict:
                self.bound_report_conflict = False
                return {
                    "ok": False,
                    "blocker": "run_report_session_conflict",
                    "error": "session changed before save",
                }
            archive_payload = copy.deepcopy(body["payload"])
            if is_bound:
                archive_payload["traffic_session"] = copy.deepcopy(self.final_session)
                archive_payload["traffic_session_binding"] = {
                    "id": self.final_session["id"],
                    "revision": self.final_session["revision"],
                    "evidence_version": 1,
                }
            self.last_archive = json.dumps(
                {"title": body["title"], "payload": archive_payload},
                sort_keys=True,
            )
            return {
                "ok": True,
                "data": {"file": {"name": body["file_name"]}},
            }
        if (method, endpoint) == ("POST", "/api/trex/reports/download"):
            return {
                "ok": True,
                "data": {"file": {"name": body["file_name"], "content": self.last_archive}},
            }
        raise AssertionError(f"unexpected request: {method} {endpoint} {body}")


def args(tmp_path: Path, **overrides: Any) -> SimpleNamespace:
    values = {
        "base_url": "http://127.0.0.1",
        "group_id": GROUP_ID,
        "service": "trex-webui-api",
        "output_dir": str(tmp_path),
        "report_prefix": "restart-test",
        "timeout": 1.0,
        "restart_timeout": 0.0,
        "poll_interval": 0.0,
        "hard_stop_window": 120.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_read_service_identity_parses_systemd_and_boot_identity(tmp_path: Path) -> None:
    boot_id_path = tmp_path / "boot_id"
    boot_id_path.write_text("boot-id-1\n", encoding="ascii")
    observed_command: list[str] = []

    def runner(command: list[str], **_kwargs: Any) -> subprocess.CompletedProcess[str]:
        observed_command.extend(command)
        return subprocess.CompletedProcess(
            command,
            0,
            stdout="\n".join(
                [
                    "ActiveState=active",
                    "SubState=running",
                    "MainPID=321",
                    f"InvocationID={'c' * 32}",
                    "ExecMainStartTimestampMonotonic=123456",
                    "NRestarts=8",
                    "Restart=on-failure",
                ]
            ),
            stderr="",
        )

    identity = restart_e2e.read_service_identity(
        "trex-webui-api", runner=runner, boot_id_path=boot_id_path
    )

    assert identity.service == "trex-webui-api.service"
    assert identity.main_pid == 321
    assert identity.restart_count == 8
    assert observed_command[-2:] == ["--", "trex-webui-api.service"]


def test_happy_path_proves_process_change_adoption_cleanup_and_bound_report(
    tmp_path: Path,
) -> None:
    api = ScenarioApi()
    killed: list[int] = []

    run = restart_e2e.run_api_restart_e2e(
        args(tmp_path),
        api_request=api,
        identity_reader=IdentitySequence(AFTER_IDENTITY),
        process_killer=killed.append,
        sleeper=lambda _seconds: None,
    )

    assert killed == [BEFORE_IDENTITY.main_pid]
    assert run["verdict"] == "pass"
    assert api.start_requests[0]["hard_stop_at"].endswith("Z")
    assert run["service_before"]["main_pid"] == 1001
    assert run["service_after"]["main_pid"] == 1002
    assert run["session_continuity"] == {
        "id": SESSION_ID,
        "run_id": RUN_ID,
        "started_revision": 1,
        "start_evidence_sha256": restart_e2e.canonical_digest(
            canonical_started_session()["groups"][0]["start_evidence"]
        ),
        "mutation_evidence_before_sha256": restart_e2e.canonical_digest(
            canonical_started_session()["mutation_evidence"]
        ),
        "adopted_revision": 1,
        "mutation_evidence_after_sha256": restart_e2e.canonical_digest(
            canonical_started_session()["mutation_evidence"]
        ),
        "stopped_revision": 2,
        "final_mutation_evidence_sha256": restart_e2e.canonical_digest(
            canonical_stopped_session()["mutation_evidence"]
        ),
    }
    assert api.stop_requests == [
        {
            "ports": PORTS,
            "confirmation": "stop",
            "expected_session_id": SESSION_ID,
        }
    ]
    assert api.save_requests[0]["traffic_session_id"] == SESSION_ID
    assert api.save_requests[0]["traffic_session_revision"] == 2
    assert run["postconditions"] == {
        "target_ports": PORTS,
        "runtime_ports_stopped": True,
        "runtime_ports_unowned": True,
        "ports_idle": True,
        "links_up": True,
        "ports_unowned": True,
        "acquired_ports_after_stop": [],
    }
    assert run["ports_after_cleanup"]["ports_unowned"] is True
    assert run["ports_after_cleanup"]["acquired_ports_after_stop"] == []
    assert "traffic_session" not in api.save_requests[0]["payload"]
    archived_payload = json.loads(api.last_archive)["payload"]
    assert archived_payload["traffic_session"] == canonical_stopped_session()
    assert archived_payload["traffic_session_binding"] == {
        "id": SESSION_ID,
        "revision": 2,
        "evidence_version": 1,
    }
    assert Path(run["local_report"]).read_text(encoding="utf-8") == api.last_archive


def test_read_side_reconciliation_revision_increase_preserves_exact_evidence(
    tmp_path: Path,
) -> None:
    adopted = reconciled_session(
        canonical_started_session(),
        revision=2,
        updated_at="2026-07-31T12:00:01.000000Z",
        reconciliation=(
            "live TRex port state reconciled; managed session authority "
            "recovered after API restart"
        ),
    )
    stopped = canonical_stopped_session()
    stopped["revision"] = 3
    final_session = reconciled_session(
        stopped,
        revision=4,
        updated_at="2026-07-31T12:00:04.000000Z",
        reconciliation="live TRex port state reconciled",
    )
    api = ScenarioApi(
        adopted_session=adopted,
        stopped_session=stopped,
        final_session=final_session,
    )

    run = restart_e2e.run_api_restart_e2e(
        args(tmp_path),
        api_request=api,
        identity_reader=IdentitySequence(AFTER_IDENTITY),
        process_killer=lambda _pid: None,
        sleeper=lambda _seconds: None,
    )

    assert run["verdict"] == "pass"
    assert run["session_continuity"]["started_revision"] == 1
    assert run["session_continuity"]["adopted_revision"] == 2
    assert run["session_continuity"]["stopped_revision"] == 3
    assert api.save_requests[0]["traffic_session_revision"] == 4
    assert json.loads(api.last_archive)["payload"]["traffic_session"] == final_session


def test_adoption_rejects_revision_decrease() -> None:
    before = canonical_started_session(revision=2)
    after = canonical_started_session(revision=1)

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.validate_adopted_session(
            runtime_payload(session=after, active=True)["data"],
            before_session=before,
            group_id=GROUP_ID,
            run_id=RUN_ID,
            target_ports=PORTS,
        )

    assert raised.value.stage == "runtime adoption"
    assert raised.value.payload["session"]["revision"] == {
        "before": 2,
        "after": 1,
        "minimum": 2,
    }


@pytest.mark.parametrize(
    "drift",
    [
        lambda session: session["authority"].update(
            generation="daemon-generation-foreign"
        ),
        lambda session: session["groups"][0].update(ports=[0]),
        lambda session: session["groups"][0].update(
            run_id="33333333-3333-4333-8333-333333333333"
        ),
        lambda session: session["groups"][0]["start_evidence"].update(
            completed_at="2026-07-31T12:00:00.750000Z"
        ),
        lambda session: session["mutation_evidence"][0].update(
            completed_at="2026-07-31T12:00:00.750000Z"
        ),
    ],
)
def test_adoption_rejects_authority_group_run_and_start_ledger_drift(drift) -> None:
    before = canonical_started_session()
    after = reconciled_session(
        before,
        revision=2,
        updated_at="2026-07-31T12:00:01.000000Z",
        reconciliation="managed session authority recovered after API restart",
    )
    drift(after)

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.validate_adopted_session(
            runtime_payload(session=after, active=True)["data"],
            before_session=before,
            group_id=GROUP_ID,
            run_id=RUN_ID,
            target_ports=PORTS,
        )

    assert raised.value.stage == "runtime adoption"


def test_adoption_rejects_metadata_change_without_revision_advance() -> None:
    before = canonical_started_session()
    after = copy.deepcopy(before)
    after.update(
        {
            "updated_at": "2026-07-31T12:00:01.000000Z",
            "reconciliation": "managed session authority recovered after API restart",
        }
    )

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.validate_adopted_session(
            runtime_payload(session=after, active=True)["data"],
            before_session=before,
            group_id=GROUP_ID,
            run_id=RUN_ID,
            target_ports=PORTS,
        )

    assert raised.value.stage == "runtime adoption"
    assert {"updated_at", "reconciliation"}.issubset(
        raised.value.payload["session"]
    )


def test_restart_identity_mismatch_cleans_up_and_saves_only_unbound_failure(
    tmp_path: Path,
) -> None:
    api = ScenarioApi()
    killed: list[int] = []

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.run_api_restart_e2e(
            args(tmp_path),
            api_request=api,
            identity_reader=IdentitySequence(BEFORE_IDENTITY),
            process_killer=killed.append,
            sleeper=lambda _seconds: None,
        )

    assert killed == [1001]
    assert raised.value.stage == "api restart e2e"
    assert api.stop_requests[-1]["expected_session_id"] == SESSION_ID
    assert len(api.save_requests) == 1
    assert "traffic_session_id" not in api.save_requests[0]
    assert "traffic_session_revision" not in api.save_requests[0]
    archived_payload = json.loads(api.last_archive)["payload"]
    assert archived_payload["verdict"] == "fail"
    assert "traffic_session" not in archived_payload
    assert "traffic_session_binding" not in archived_payload


def test_adoption_mismatch_uses_original_session_for_cleanup_and_unbound_failure(
    tmp_path: Path,
) -> None:
    adopted = canonical_started_session(
        session_id="33333333-3333-4333-8333-333333333333"
    )
    api = ScenarioApi(adopted_session=adopted)

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.run_api_restart_e2e(
            args(tmp_path),
            api_request=api,
            identity_reader=IdentitySequence(AFTER_IDENTITY),
            process_killer=lambda _pid: None,
            sleeper=lambda _seconds: None,
        )

    assert raised.value.payload["failure"]["stage"] == "runtime adoption"
    assert api.stop_requests[-1]["expected_session_id"] == SESSION_ID
    assert "traffic_session_id" not in api.save_requests[0]
    assert "traffic_session" not in json.loads(api.last_archive)["payload"]


def test_stale_stop_session_cas_retries_cleanup_and_keeps_failure_unbound(
    tmp_path: Path,
) -> None:
    api = ScenarioApi(stale_stop=True)

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.run_api_restart_e2e(
            args(tmp_path),
            api_request=api,
            identity_reader=IdentitySequence(AFTER_IDENTITY),
            process_killer=lambda _pid: None,
            sleeper=lambda _seconds: None,
        )

    assert raised.value.payload["failure"]["stage"] == "exact traffic stop"
    assert len(api.stop_requests) == 2
    assert api.stop_requests[0] == api.stop_requests[1]
    assert raised.value.payload["traffic_cleanup_complete"] is False
    assert "traffic_session_id" not in api.save_requests[0]
    assert "traffic_session_binding" not in json.loads(api.last_archive)["payload"]


def test_invalid_commanded_cleanup_evidence_fails_closed_and_report_is_unbound(
    tmp_path: Path,
) -> None:
    api = ScenarioApi(
        stopped_session=canonical_stopped_session(cleanup_completion="observed")
    )

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.run_api_restart_e2e(
            args(tmp_path),
            api_request=api,
            identity_reader=IdentitySequence(AFTER_IDENTITY),
            process_killer=lambda _pid: None,
            sleeper=lambda _seconds: None,
        )

    assert raised.value.payload["failure"]["stage"] == "traffic stop evidence"
    assert len(api.stop_requests) == 1
    assert "traffic_session_id" not in api.save_requests[0]
    assert "traffic_session" not in json.loads(api.last_archive)["payload"]


def test_bound_report_stale_cas_falls_back_to_unbound_failure_archive(
    tmp_path: Path,
) -> None:
    api = ScenarioApi(bound_report_conflict=True)

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.run_api_restart_e2e(
            args(tmp_path),
            api_request=api,
            identity_reader=IdentitySequence(AFTER_IDENTITY),
            process_killer=lambda _pid: None,
            sleeper=lambda _seconds: None,
        )

    assert raised.value.payload["failure"]["stage"] == "bound report CAS"
    assert len(api.save_requests) == 2
    assert api.save_requests[0]["traffic_session_id"] == SESSION_ID
    assert api.save_requests[0]["traffic_session_revision"] == 2
    assert "traffic_session_id" not in api.save_requests[1]
    assert "traffic_session_revision" not in api.save_requests[1]
    archived_payload = json.loads(api.last_archive)["payload"]
    assert archived_payload["verdict"] == "fail"
    assert "traffic_session" not in archived_payload
    assert "traffic_session_binding" not in archived_payload


def test_report_store_failure_still_writes_local_unbound_failure_evidence(
    tmp_path: Path,
) -> None:
    api = ScenarioApi(fail_report_save=True)

    with pytest.raises(restart_e2e.AcceptanceError) as raised:
        restart_e2e.run_api_restart_e2e(
            args(tmp_path),
            api_request=api,
            identity_reader=IdentitySequence(AFTER_IDENTITY),
            process_killer=lambda _pid: None,
            sleeper=lambda _seconds: None,
        )

    payload = raised.value.payload
    assert payload["verdict"] == "fail"
    assert payload["failure"]["stage"] == "bound report CAS"
    assert payload["report_failure"]["stage"] == "unbound failure report save"
    local_report = Path(payload["local_report"])
    assert local_report.name.endswith("-unbound-failure.json")
    archive = json.loads(local_report.read_text(encoding="utf-8"))
    assert archive["payload"]["verdict"] == "fail"
    assert "traffic_session" not in archive["payload"]
    assert "traffic_session_binding" not in archive["payload"]


def test_restart_identity_rejects_boot_change_and_reused_process_identity() -> None:
    same = restart_e2e.service_restart_mismatches(BEFORE_IDENTITY, BEFORE_IDENTITY)
    rebooted = restart_e2e.ServiceProcessIdentity(
        **{
            **AFTER_IDENTITY.to_record(),
            "boot_id": "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb",
        }
    )
    rebooted_mismatches = restart_e2e.service_restart_mismatches(
        BEFORE_IDENTITY, rebooted
    )

    assert {"main_pid", "invocation_id", "process_identity", "restart_count"}.issubset(same)
    assert "boot_id" in rebooted_mismatches


def test_parser_exposes_restart_gate_controls() -> None:
    parsed = restart_e2e.build_parser().parse_args(
        [
            "--base-url",
            "http://localhost/api",
            "--group-id",
            "pair-2",
            "--service",
            "custom-api.service",
            "--output-dir",
            "/tmp/evidence",
            "--timeout",
            "3",
            "--restart-timeout",
            "9",
        ]
    )

    assert parsed.base_url == "http://localhost/api"
    assert parsed.group_id == "pair-2"
    assert parsed.service == "custom-api.service"
    assert parsed.output_dir == "/tmp/evidence"
    assert parsed.timeout == 3
    assert parsed.restart_timeout == 9


@pytest.mark.parametrize(
    ("acquired", "owner"),
    [
        (True, None),
        (False, "Client1"),
    ],
)
def test_idle_live_port_boundary_rejects_manual_stl_ownership(
    acquired: bool, owner: str | None
) -> None:
    payload = ports_payload(active=False)
    payload["data"]["ports"][0]["acquired"] = acquired
    payload["data"]["ports"][0]["info"]["owner"] = owner

    with pytest.raises(
        restart_e2e.AcceptanceError,
        match="explicitly unacquired, and unowned",
    ):
        restart_e2e.validate_live_ports(
            payload,
            target_ports=PORTS,
            expected_active=False,
            stage="ownership boundary",
        )
