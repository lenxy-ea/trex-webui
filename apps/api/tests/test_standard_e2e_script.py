from __future__ import annotations

import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "trex_standard_e2e.py"
SCRIPTS_DIR = SCRIPT_PATH.parent
PROJECT_ROOT = SCRIPT_PATH.parents[1]
VERIFY_MAJOR_SCRIPT = SCRIPTS_DIR / "verify_major_change.sh"
PACKAGE_JSON = PROJECT_ROOT / "package.json"
WEB_PACKAGE_JSON = PROJECT_ROOT / "apps" / "web" / "package.json"
BROWSER_SMOKE_SCRIPT = PROJECT_ROOT / "apps" / "web" / "scripts" / "production-browser-smoke.mjs"
BROWSER_WRITE_ACCEPTANCE_SCRIPT = (
    PROJECT_ROOT / "apps" / "web" / "scripts" / "production-browser-write-acceptance.mjs"
)
CI_WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "ci.yml"
README = PROJECT_ROOT / "README.md"
DEVELOPMENT_DOC = PROJECT_ROOT / "docs" / "DEVELOPMENT.md"
NGINX_DEPLOYMENT_DOC = PROJECT_ROOT / "docs" / "NGINX_DEPLOYMENT.md"
ARCHIVE_SAFETY_SCRIPT = PROJECT_ROOT / "deploy" / "archive_safety.py"
RELEASE_CONTRACT_SCRIPT = PROJECT_ROOT / "scripts" / "release_contract.py"
PACKAGE_SCRIPT = PROJECT_ROOT / "deploy" / "package.sh"


def load_script_module():
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location("trex_standard_e2e", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


standard_e2e = load_script_module()


def test_source_identity_ignores_versioned_runtime_state_at_checkout_root(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repository, check=True)
    subprocess.run(
        ["git", "config", "user.email", "tests@trex-webui.invalid"],
        cwd=repository,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "TRex WebUI tests"],
        cwd=repository,
        check=True,
    )
    (repository / ".gitignore").write_text(
        "/current\n/previous\n/releases/\n",
        encoding="utf-8",
    )
    (repository / "source.py").write_text("value = 1\n", encoding="utf-8")
    subprocess.run(["git", "add", ".gitignore", "source.py"], cwd=repository, check=True)
    subprocess.run(["git", "commit", "-qm", "fixture"], cwd=repository, check=True)
    before = standard_e2e.compute_git_source_identity(repository)

    releases = repository / "releases"
    (releases / f"sha256-{'a' * 64}").mkdir(parents=True)
    (releases / f"sha256-{'a' * 64}" / "runtime.txt").write_text("runtime\n", encoding="utf-8")
    (repository / "current").symlink_to(f"releases/sha256-{'a' * 64}")
    (repository / "previous").symlink_to(f"releases/sha256-{'b' * 64}")

    after = standard_e2e.compute_git_source_identity(repository)

    assert after == before


def test_source_identity_normalizes_checkout_umask(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repository, check=True)
    subprocess.run(
        ["git", "config", "user.email", "tests@trex-webui.invalid"],
        cwd=repository,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "TRex WebUI tests"],
        cwd=repository,
        check=True,
    )
    source = repository / "source.py"
    source.write_text("value = 1\n", encoding="utf-8")
    source.chmod(0o600)
    subprocess.run(["git", "add", "source.py"], cwd=repository, check=True)
    subprocess.run(["git", "commit", "-qm", "fixture"], cwd=repository, check=True)

    restrictive = standard_e2e.compute_git_source_identity(repository)
    source.chmod(0o644)
    conventional = standard_e2e.compute_git_source_identity(repository)

    assert restrictive["digest"] == conventional["digest"]
    assert restrictive["git"]["status_sha256"] == conventional["git"]["status_sha256"]
    assert restrictive["git"]["dirty"] is False
    assert conventional["git"]["dirty"] is False
    assert restrictive["file_count"] == conventional["file_count"] == 1


def load_archive_safety_module(path: Path):
    spec = importlib.util.spec_from_file_location("test_release_archive_safety", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_test_release_manifest(project_root: Path) -> dict[str, object]:
    archive_safety = load_archive_safety_module(ARCHIVE_SAFETY_SCRIPT)
    archive_script = project_root / "deploy" / "archive_safety.py"
    archive_script.parent.mkdir(parents=True)
    shutil.copy2(ARCHIVE_SAFETY_SCRIPT, archive_script)
    release_contract_script = project_root / "scripts" / "release_contract.py"
    release_contract_script.parent.mkdir(parents=True)
    shutil.copy2(RELEASE_CONTRACT_SCRIPT, release_contract_script)
    app_source = project_root / "apps" / "api" / "app" / "main.py"
    app_source.parent.mkdir(parents=True)
    app_source.write_text("APP_VERSION = 'test-release'\n", encoding="utf-8")

    files = archive_safety.scan_payload_tree(project_root)
    payload_digest = archive_safety.payload_digest(files)
    source_digest = "1" * 64
    git_sha = "2" * 40
    source_identity = {
        "algorithm": standard_e2e.SOURCE_IDENTITY_ALGORITHM,
        "digest": source_digest,
        "file_count": len(files),
        "path_set": "git ls-files --cached --others --exclude-standard",
        "git": {
            "sha": git_sha,
            "branch": "release-test",
            "dirty": False,
            "status_sha256": "3" * 64,
        },
    }
    manifest = {
        "schema": archive_safety.RELEASE_MANIFEST_SCHEMA,
        "name": "trex-webui-test-release",
        "version": "0.1.0",
        "git_commit": git_sha,
        "git_dirty": False,
        "source_digest": source_digest,
        "source_identity": source_identity,
        "release_repository": None,
        "release_ref": None,
        "signer_workflow": None,
        "release_provenance": {
            "schema": "trex-webui-release-provenance/v1",
            "kind": "local-build",
            "publishable": False,
            "source_sha": git_sha,
            "source_dirty": False,
        },
        "payload_identity": {
            "algorithm": archive_safety.PAYLOAD_IDENTITY_ALGORITHM,
            "digest": payload_digest,
            "file_count": len(files),
            "files": files,
            "manifest_excluded": True,
            "manifest_path": archive_safety.RELEASE_MANIFEST_NAME,
        },
    }
    manifest_path = project_root / archive_safety.RELEASE_MANIFEST_NAME
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    manifest_path.chmod(0o644)
    return manifest


def write_test_trusted_versioned_runtime(
    project_root: Path,
    suffix: str = "20260722T120000Z-1234",
) -> Path:
    runtime = project_root / f".venv.runtime-{suffix}"
    (runtime / "bin").mkdir(parents=True)
    (runtime / standard_e2e.RELEASE_MANAGED_MARKER_NAME).write_text(
        f"{standard_e2e.RELEASE_MANAGED_MARKER_VALUE}\n",
        encoding="utf-8",
    )
    (runtime / standard_e2e.RELEASE_VENV_RUNTIME_MARKER_NAME).write_text(
        f"{standard_e2e.RELEASE_VENV_RUNTIME_MARKER_VALUE}\n",
        encoding="utf-8",
    )
    (runtime / standard_e2e.RELEASE_VENV_RELEASE_MARKER_NAME).write_text(
        f"trex-webui-venv-release-{suffix}\n",
        encoding="utf-8",
    )
    (runtime / "bin" / "python").write_text("trusted runtime\n", encoding="utf-8")
    runtime.chmod(0o755)
    return runtime


def make_runtime_appear_root_owned(monkeypatch, runtime: Path) -> None:
    original_lstat = Path.lstat
    trusted_markers = {
        standard_e2e.RELEASE_MANAGED_MARKER_NAME,
        standard_e2e.RELEASE_VENV_RUNTIME_MARKER_NAME,
        standard_e2e.RELEASE_VENV_RELEASE_MARKER_NAME,
    }

    def root_owned_lstat(path: Path):
        metadata = original_lstat(path)
        if path != runtime and not (path.parent == runtime and path.name in trusted_markers):
            return metadata
        values = list(metadata)
        values[4] = 0
        values[5] = 0
        return os.stat_result(values)

    monkeypatch.setattr(Path, "lstat", root_owned_lstat)


def test_default_trex_config_renders_custom_two_port_yaml() -> None:
    content = standard_e2e.default_trex_config(
        port_limit=2,
        interfaces=["03:00.0", "03:00.1"],
        port0_ip="1.1.1.1",
        port0_gw="2.2.2.2",
        port1_ip="2.2.2.2",
        port1_gw="1.1.1.1",
        port_bandwidth_gb=25,
    )

    assert "port_limit: 2" in content
    assert "interfaces: ['03:00.0', '03:00.1']" in content
    assert "port_bandwidth_gb: 25" in content
    assert "latency_thread_id: 1" in content


def test_custom_config_identity_uses_six_port_yaml_instead_of_cli_defaults(tmp_path: Path) -> None:
    config_path = tmp_path / "trex_cfg.yaml"
    config_path.write_text(
        """
- version: 2
  port_limit: 6
  interfaces: ['0000:01:00.0', '0000:01:00.1', '0000:01:00.2', '0000:01:00.3', '0000:02:00.0', '0000:02:00.1']
  port_bandwidth_gb: 1
  c: 4
  platform:
    master_thread_id: 0
    latency_thread_id: 1
    dual_if:
      - socket: 0
        threads: [2, 3, 4, 5]
      - socket: 0
        threads: [6, 7, 8, 9]
      - socket: 0
        threads: [10, 11, 12, 13]
""".lstrip(),
        encoding="utf-8",
    )
    args = standard_e2e.build_parser().parse_args(["--config-file", str(config_path)])
    assert args.port_limit == 2
    assert args.interfaces == ["03:00.0", "03:00.1"]
    assert args.port_bandwidth_gb == 25

    content = standard_e2e.config_content_from_args(args)
    identity = standard_e2e.trex_config_identity(args, content)

    assert identity["summary"] == {
        "source": str(config_path),
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
        "tx_port": 0,
        "rx_port": 1,
        "latency_profile": standard_e2e.DEFAULT_LATENCY_PROFILE,
        "capture_profile": standard_e2e.DEFAULT_CAPTURE_PROFILE,
    }


def test_trex_config_summary_does_not_invent_optional_yaml_values() -> None:
    summary = standard_e2e.trex_config_summary(
        """
- version: 2
  interfaces: ['03:00.0', '03:00.1']
""".lstrip()
    )

    assert summary["port_limit"] is None
    assert summary["port_bandwidth_gb"] is None


def test_stop_traffic_uses_exact_active_session_cas(monkeypatch) -> None:
    requests: list[tuple[str, str, dict[str, object]]] = []

    def fake_request_json(base_url, method, path, payload, timeout):
        requests.append((method, path, payload))
        return {
            "ok": True,
            "data": {
                "session": {
                    "id": "session-123",
                },
            },
        }

    monkeypatch.setattr(standard_e2e, "request_json", fake_request_json)
    args = SimpleNamespace(
        base_url="http://127.0.0.1",
        tx_port=0,
        timeout=3.0,
    )
    run = {"active_traffic_session_id": "session-123"}

    result = standard_e2e.stop_traffic(args, run, "traffic stop")

    assert result["ok"] is True
    assert requests == [
        (
            "POST",
            "/api/trex/traffic/stop",
            {
                "ports": [0],
                "confirmation": "stop",
                "expected_session_id": "session-123",
            },
        )
    ]
    assert run["active_traffic_session_id"] is None


def test_stop_traffic_rejects_missing_or_mismatched_session_id(monkeypatch) -> None:
    args = SimpleNamespace(
        base_url="http://127.0.0.1",
        tx_port=0,
        timeout=3.0,
    )
    with pytest.raises(standard_e2e.AcceptanceError):
        standard_e2e.stop_traffic(args, {}, "traffic stop")

    monkeypatch.setattr(
        standard_e2e,
        "request_json",
        lambda *_args: {
            "ok": True,
            "data": {
                "session": {
                    "id": "session-new",
                },
            },
        },
    )
    run = {"active_traffic_session_id": "session-old"}
    with pytest.raises(standard_e2e.AcceptanceError):
        standard_e2e.stop_traffic(args, run, "traffic stop")
    assert run["active_traffic_session_id"] == "session-old"


def selected_ports_payload() -> dict[str, object]:
    return {
        "ok": True,
        "data": {
            "port_ids": [0, 1, 2, 3],
            "ports": [
                {
                    "id": port,
                    "acquired": False,
                    "info": {"status": "IDLE", "link": "UP", "owner": None},
                }
                for port in range(4)
            ],
        },
    }


def selected_runtime_payload() -> dict[str, object]:
    return {
        "ok": True,
        "data": {
            "plan_revision": 1,
            "groups": [],
            "authority": standard_runtime_authority(),
            "session": None,
            "mutation_intent": None,
            "config": {
                "path": "/etc/trex_cfg.yaml",
                "port_limit": 4,
                "interfaces": [
                    "0000:03:00.0",
                    "0000:03:00.1",
                    "0000:03:00.2",
                    "0000:03:00.3",
                ],
            },
            "available_ports": [0, 1, 2, 3],
            "port_states": [
                {"port": port, "state": "stopped", "ownership": "none"}
                for port in range(4)
            ],
            "live_state_sampled": True,
        },
    }


STANDARD_SESSION_ID = "11111111-1111-4111-8111-111111111111"
STANDARD_STOP_NONCE = "99999999-9999-4999-8999-999999999999"
STANDARD_PROFILE = "profiles/udp_1pkt_simple.py"


def standard_runtime_authority(
    generation: str = "runtime-1",
) -> dict[str, object]:
    return {
        "host": "127.0.0.1",
        "sync_port": 4501,
        "async_port": 4500,
        "scapy_port": 4507,
        "daemon_supervisor": "systemd",
        "generation": generation,
    }


def standard_mutation_evidence(
    nonce: str,
    operation: str,
    *,
    completed_at: str,
    completion_mode: str = "direct",
) -> dict[str, object]:
    return {
        "intent_nonce": nonce,
        "operation": operation,
        "completion_mode": completion_mode,
        "ports": [0],
        "baseline_port_states": {
            "0": "stopped" if operation == "start" else "running",
        },
        "desired_port_states": {
            "0": "running" if operation == "start" else "stopped",
        },
        "baseline_acquired_ports": [],
        "prepared_at": "2026-07-31T12:00:00.000000Z",
        "completed_at": completed_at,
        "acquisition_restored": True,
        "wal_cleared": True,
    }


def canonical_standard_session(
    hard_stop_at: str,
    *,
    stopped: bool = False,
    retain_lease: bool = False,
    hard_stop_cleanup: bool = False,
    revision: int | None = None,
    authority_generation: str = "runtime-1",
    profile_path: str = STANDARD_PROFILE,
    multiplier: str = "1kpps",
) -> dict[str, object]:
    started_at = "2026-07-31T12:00:00.500000Z"
    stopped_at = "2026-07-31T12:00:03.000000Z"
    start_evidence = standard_mutation_evidence(
        STANDARD_SESSION_ID,
        "start",
        completed_at=started_at,
    )
    cleanup = None
    mutations = [start_evidence]
    if stopped:
        stop_mode = "hard_stop" if hard_stop_cleanup else "direct"
        stop_evidence = standard_mutation_evidence(
            STANDARD_STOP_NONCE,
            "stop",
            completed_at=stopped_at,
            completion_mode=stop_mode,
        )
        mutations.append(stop_evidence)
        cleanup = {
            "completion": "hard_stop" if hard_stop_cleanup else "operator_stop",
            "completed_at": stopped_at,
            "final_port_states": {"0": "stopped"},
            "intent_nonce": STANDARD_STOP_NONCE,
            "acquisition_restored": True,
            "wal_cleared": True,
        }
    state = "stopped" if stopped else "running"
    group = {
        "group_id": None,
        "run_id": STANDARD_SESSION_ID,
        "source": "ad_hoc",
        "plan_revision": None,
        "ports": [0],
        "profile_path": profile_path,
        "profile_sha256": "1" * 64,
        "start_multiplier": multiplier,
        "multiplier": multiplier,
        "duration": -1,
        "start_force": True,
        "start_total": False,
        "start_synchronized": False,
        "start_clear_existing": True,
        "started_at": started_at,
        "ended_at": stopped_at if stopped else None,
        "hard_stop_at": hard_stop_at if not stopped or retain_lease else None,
        "tunables": {},
        "start_evidence": start_evidence,
        "cleanup_evidence": cleanup,
        "state": state,
        "port_states": {"0": state},
        "updated_at": stopped_at if stopped else started_at,
    }
    return {
        "id": STANDARD_SESSION_ID,
        "revision": revision if revision is not None else (2 if stopped else 1),
        "evidence_version": 1,
        "authority": standard_runtime_authority(authority_generation),
        "state": state,
        "started_at": started_at,
        "updated_at": stopped_at if stopped else started_at,
        "ended_at": stopped_at if stopped else None,
        "groups": [group],
        "completed_groups": [],
        "mutation_evidence": mutations,
        "reconciliation": None,
    }


def standard_start_descriptor_fixture(
    hard_stop_at: str,
    *,
    phase: str = "capture",
    profile_path: str = STANDARD_PROFILE,
    multiplier: str = "1kpps",
) -> dict[str, object]:
    return {
        "phase": phase,
        "profile_path": profile_path,
        "multiplier": multiplier,
        "duration": -1,
        "ports": [0],
        "boundary_ports": [0, 1],
        "hard_stop_at": hard_stop_at,
        "pre_plan_revision": 1,
        "pre_config": selected_runtime_payload()["data"]["config"],
        "pre_session_id": None,
        "pre_authority": standard_runtime_authority(),
        "session_id": STANDARD_SESSION_ID,
        "run_id": STANDARD_SESSION_ID,
        "status": "stopped",
    }


def leased_standard_runtime_payload(
    session: dict[str, object] | None = None,
    *,
    authority_generation: str = "runtime-1",
    live_active: bool = False,
) -> dict[str, object]:
    payload = selected_runtime_payload()
    data = payload["data"]
    assert isinstance(data, dict)
    data["authority"] = standard_runtime_authority(authority_generation)
    data["session"] = session
    if live_active:
        data["port_states"] = [
            {"port": 0, "state": "running", "ownership": "managed"},
            {"port": 1, "state": "stopped", "ownership": "none"},
            {"port": 2, "state": "stopped", "ownership": "none"},
            {"port": 3, "state": "stopped", "ownership": "none"},
        ]
    return payload


def standard_traffic_args(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "base_url": "http://127.0.0.1",
        "timeout": 3.0,
        "tx_port": 0,
        "rx_port": 1,
        "stats_timeout": 1.0,
        "poll_interval": 0.0,
        "latency_observe_seconds": 1.0,
        "capture_observe_seconds": 1.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeStandardTrafficApi:
    def __init__(
        self,
        *,
        response_loss: bool = False,
        recovery_authority_generation: str = "runtime-1",
        retain_lease: bool = False,
        hard_stop_cleanup: bool = False,
    ) -> None:
        self.calls: list[tuple[str, str, Any]] = []
        self.response_loss = response_loss
        self.recovery_authority_generation = recovery_authority_generation
        self.retain_lease = retain_lease
        self.hard_stop_cleanup = hard_stop_cleanup
        self.started = False
        self.stopped = False
        self.hard_stop_at: str | None = None
        self.active_session: dict[str, object] | None = None
        self.final_session: dict[str, object] | None = None

    def __call__(self, _base_url, method, path, payload, _timeout):
        self.calls.append((method, path, payload))
        if (method, path) == ("GET", "/api/trex/traffic/runtime"):
            if not self.started:
                return leased_standard_runtime_payload()
            if not self.stopped:
                return leased_standard_runtime_payload(
                    self.active_session,
                    authority_generation=self.recovery_authority_generation,
                    live_active=True,
                )
            return leased_standard_runtime_payload(self.final_session)
        if (method, path) == ("POST", "/api/trex/traffic/start"):
            assert isinstance(payload, dict)
            self.started = True
            self.hard_stop_at = str(payload["hard_stop_at"])
            self.active_session = canonical_standard_session(
                self.hard_stop_at,
                authority_generation=self.recovery_authority_generation,
                profile_path=str(payload["profile_path"]),
                multiplier=str(payload["multiplier"]),
            )
            if self.response_loss:
                raise standard_e2e.AcceptanceError(
                    "fixture traffic start",
                    "response was lost after the leased session persisted",
                )
            return {"ok": True, "data": {"session": self.active_session}}
        if (method, path) == ("POST", "/api/trex/traffic/stop"):
            assert self.hard_stop_at is not None
            self.stopped = True
            self.final_session = canonical_standard_session(
                self.hard_stop_at,
                stopped=True,
                retain_lease=self.retain_lease,
                hard_stop_cleanup=self.hard_stop_cleanup,
            )
            return {"ok": True, "data": {"session": self.final_session}}
        if (method, path) == ("POST", "/api/trex/capture/remove-all"):
            return {"ok": True, "data": {"removed": []}}
        raise AssertionError(f"unexpected request: {method} {path}")


def test_standard_boundary_covers_tx_and_rx_and_rejects_manual_ownership() -> None:
    active_rx = selected_ports_payload()
    active_rx["data"]["ports"][1]["info"]["status"] = "TRANSMITTING"
    with pytest.raises(standard_e2e.AcceptanceError, match="not idle"):
        standard_e2e.validate_live_port_boundary(
            active_rx, target_ports=[0, 1], stage="selected ports"
        )

    acquired_rx = selected_ports_payload()
    acquired_rx["data"]["ports"][1]["acquired"] = True
    acquired_rx["data"]["ports"][1]["info"]["owner"] = "Client1"
    with pytest.raises(standard_e2e.AcceptanceError, match="unacquired, and unowned"):
        standard_e2e.validate_live_port_boundary(
            acquired_rx, target_ports=[0, 1], stage="selected ports"
        )


def test_standard_runtime_boundary_requires_both_ports_stopped_and_unowned() -> None:
    runtime = selected_runtime_payload()
    runtime["data"]["port_states"][1]["ownership"] = "managed"

    with pytest.raises(standard_e2e.AcceptanceError, match="stopped and unowned"):
        standard_e2e.validate_runtime_port_boundary(
            runtime, target_ports=[0, 1], stage="selected runtime"
        )


def test_standard_start_posts_and_validates_exact_canonical_hard_stop_lease(
    monkeypatch,
) -> None:
    api = FakeStandardTrafficApi()
    monkeypatch.setattr(standard_e2e, "request_json", api)
    run: dict[str, object] = {
        "hard_stop_windows_seconds": {"latency": 30.0, "capture": 45.0},
        "traffic_start_attempts": [],
        "active_traffic_session_id": None,
        "active_traffic_descriptor": None,
    }

    result, descriptor = standard_e2e.start_standard_traffic(
        standard_traffic_args(),
        run,
        phase="latency",
        profile_path=STANDARD_PROFILE,
        multiplier="1kpps",
    )

    start_request = next(
        call[2] for call in api.calls if call[1] == "/api/trex/traffic/start"
    )
    deadline = datetime.fromisoformat(
        start_request["hard_stop_at"].replace("Z", "+00:00")
    )
    now = datetime.now(timezone.utc)
    assert now < deadline <= now + timedelta(seconds=300)
    assert descriptor["hard_stop_at"] == start_request["hard_stop_at"]
    assert result["data"]["session"]["groups"][0]["hard_stop_at"] == deadline.isoformat().replace(
        "+00:00", "Z"
    )
    assert run["active_traffic_session_id"] == STANDARD_SESSION_ID

    stopped = standard_e2e.stop_traffic(
        standard_traffic_args(), run, "latency traffic stop"
    )
    assert stopped["data"]["session"]["groups"][0]["hard_stop_at"] is None
    assert descriptor["status"] == "stopped"


def test_lost_standard_start_response_adopts_exact_lease_for_operator_cleanup(
    monkeypatch,
) -> None:
    api = FakeStandardTrafficApi(response_loss=True)
    monkeypatch.setattr(standard_e2e, "request_json", api)
    run: dict[str, object] = {
        "hard_stop_windows_seconds": {"latency": 30.0, "capture": 45.0},
        "traffic_start_attempts": [],
        "active_traffic_session_id": None,
        "active_traffic_descriptor": None,
        "cleanup": [],
    }
    args = standard_traffic_args()

    with pytest.raises(
        standard_e2e.AcceptanceError,
        match="exact leased session was recovered",
    ):
        standard_e2e.start_standard_traffic(
            args,
            run,
            phase="capture",
            profile_path=STANDARD_PROFILE,
            multiplier="1kpps",
        )

    assert run["active_traffic_session_id"] == STANDARD_SESSION_ID
    attempt = run["traffic_start_attempts"][0]
    assert attempt["status"] == "recovered-active"
    standard_e2e.cleanup(args, run)
    stop_request = next(
        call[2] for call in api.calls if call[1] == "/api/trex/traffic/stop"
    )
    assert stop_request == {
        "ports": [0],
        "confirmation": "stop",
        "expected_session_id": STANDARD_SESSION_ID,
    }
    assert attempt["status"] == "stopped"
    assert api.final_session["groups"][0]["cleanup_evidence"]["completion"] == (
        "operator_stop"
    )


def test_lost_first_standard_start_rejects_foreign_authority_without_stop(
    monkeypatch,
) -> None:
    api = FakeStandardTrafficApi(
        response_loss=True,
        recovery_authority_generation="runtime-foreign",
    )
    monkeypatch.setattr(standard_e2e, "request_json", api)
    run: dict[str, object] = {
        "hard_stop_windows_seconds": {"latency": 30.0, "capture": 45.0},
        "traffic_start_attempts": [],
        "active_traffic_session_id": None,
        "active_traffic_descriptor": None,
        "cleanup": [],
    }
    args = standard_traffic_args()

    with pytest.raises(standard_e2e.AcceptanceError, match="response was lost"):
        standard_e2e.start_standard_traffic(
            args,
            run,
            phase="latency",
            profile_path=STANDARD_PROFILE,
            multiplier="1kpps",
        )
    standard_e2e.cleanup(args, run)

    assert not any(call[1] == "/api/trex/traffic/stop" for call in api.calls)
    attempt = run["traffic_start_attempts"][0]
    rejected = attempt["runtime_recovery_rejected"]
    assert rejected["expected_authority"]["generation"] == "runtime-1"
    assert rejected["observed_authority"]["generation"] == "runtime-foreign"
    deadline = datetime.fromisoformat(
        api.hard_stop_at.replace("Z", "+00:00")
    )
    now = datetime.now(timezone.utc)
    assert now < deadline <= now + timedelta(seconds=300)


def test_standard_stop_rejects_retained_lease(monkeypatch) -> None:
    api = FakeStandardTrafficApi(retain_lease=True)
    monkeypatch.setattr(standard_e2e, "request_json", api)
    run: dict[str, object] = {
        "hard_stop_windows_seconds": {"latency": 30.0, "capture": 45.0},
        "traffic_start_attempts": [],
        "active_traffic_session_id": None,
        "active_traffic_descriptor": None,
    }
    args = standard_traffic_args()
    standard_e2e.start_standard_traffic(
        args,
        run,
        phase="latency",
        profile_path=STANDARD_PROFILE,
        multiplier="1kpps",
    )

    with pytest.raises(standard_e2e.AcceptanceError, match="lease was not cleared"):
        standard_e2e.stop_traffic(args, run, "latency traffic stop")

    assert run["active_traffic_session_id"] == STANDARD_SESSION_ID


def test_standard_stop_rejects_hard_stop_cleanup(monkeypatch) -> None:
    api = FakeStandardTrafficApi(hard_stop_cleanup=True)
    monkeypatch.setattr(standard_e2e, "request_json", api)
    run: dict[str, object] = {
        "hard_stop_windows_seconds": {"latency": 30.0, "capture": 45.0},
        "traffic_start_attempts": [],
        "active_traffic_session_id": None,
        "active_traffic_descriptor": None,
    }
    args = standard_traffic_args()
    standard_e2e.start_standard_traffic(
        args,
        run,
        phase="capture",
        profile_path=STANDARD_PROFILE,
        multiplier="1kpps",
    )

    with pytest.raises(
        standard_e2e.AcceptanceError,
        match="operator cleanup evidence is incomplete",
    ):
        standard_e2e.stop_traffic(args, run, "capture traffic stop")

    assert run["active_traffic_session_id"] == STANDARD_SESSION_ID


def test_oversized_standard_hard_stop_budget_fails_before_any_api_write(
    monkeypatch,
) -> None:
    calls: list[tuple[str, str, object]] = []
    monkeypatch.setattr(
        standard_e2e,
        "request_json",
        lambda _base, method, path, payload, _timeout: calls.append(
            (method, path, payload)
        ),
    )

    with pytest.raises(standard_e2e.AcceptanceError, match="300-second safety limit"):
        standard_e2e.run_standard_e2e(
            standard_traffic_args(timeout=50.0)
        )

    assert calls == []


def test_save_report_binds_backend_session_using_refreshed_revision(
    monkeypatch,
    tmp_path: Path,
) -> None:
    calls: list[tuple[str, str, object]] = []
    saved_document: dict[str, object] = {}
    hard_stop_at = "2026-07-31T12:05:00Z"
    canonical_session = canonical_standard_session(
        hard_stop_at,
        stopped=True,
        revision=9,
    )

    def fake_request_json(base_url, method, path, payload, timeout):
        calls.append((method, path, payload))
        if (method, path) == ("GET", "/api/trex/traffic/runtime"):
            return leased_standard_runtime_payload(canonical_session)
        if (method, path) == ("POST", "/api/trex/reports/save"):
            assert isinstance(payload, dict)
            canonical_payload = json.loads(json.dumps(payload["payload"]))
            canonical_payload["traffic_session"] = json.loads(
                json.dumps(canonical_session)
            )
            canonical_payload["traffic_session_binding"] = {
                "id": STANDARD_SESSION_ID,
                "revision": 9,
                "evidence_version": 1,
            }
            saved_document.update(
                {
                    "version": 2,
                    "title": payload["title"],
                    "markdown": payload["markdown"],
                    "payload": canonical_payload,
                }
            )
            return {
                "ok": True,
                "data": {"file": {"name": payload["file_name"]}},
            }
        if (method, path) == ("POST", "/api/trex/reports/download"):
            return {
                "ok": True,
                "data": {
                    "file": {
                        "content": json.dumps(saved_document),
                    }
                },
            }
        raise AssertionError(f"unexpected request: {method} {path}")

    monkeypatch.setattr(standard_e2e, "request_json", fake_request_json)
    args = SimpleNamespace(
        base_url="http://127.0.0.1",
        timeout=3.0,
        output_dir=str(tmp_path),
        tx_port=0,
        rx_port=1,
    )
    run = {
        "run_id": "20260731T120000Z",
        "report_prefix": "standard-e2e",
        "verdict": "pass",
        "traffic_stops": [
            {
                "stage": "capture traffic stop",
                "result": {
                    "ok": True,
                    "data": {
                        "session": {
                            "id": STANDARD_SESSION_ID,
                            # The save CAS must not reuse this stale revision.
                            "revision": 8,
                        }
                    },
                },
            }
        ],
        "traffic_start_attempts": [
            standard_start_descriptor_fixture(hard_stop_at)
        ],
    }

    result = standard_e2e.save_report(args, run)

    assert result["ok"] is True
    assert [(method, path) for method, path, _payload in calls] == [
        ("GET", "/api/trex/traffic/runtime"),
        ("POST", "/api/trex/reports/save"),
        ("POST", "/api/trex/reports/download"),
    ]
    save_request = calls[1][2]
    assert isinstance(save_request, dict)
    assert save_request["traffic_session_id"] == STANDARD_SESSION_ID
    assert save_request["traffic_session_revision"] == 9
    assert "traffic_session" not in save_request["payload"]
    assert "traffic_session_binding" not in save_request["payload"]


@pytest.mark.parametrize(
    "traffic_stops",
    [
        None,
        [
            {
                "stage": "latency traffic stop",
                "result": {
                    "data": {
                        "session": {
                            "id": "session-earlier",
                            "revision": 4,
                        }
                    }
                },
            }
        ],
    ],
    ids=["early-failure", "failure-after-earlier-session"],
)
def test_save_report_keeps_failures_unbound_and_strips_reserved_payload(
    monkeypatch,
    tmp_path: Path,
    traffic_stops: list[dict[str, object]] | None,
) -> None:
    calls: list[tuple[str, str, object]] = []
    saved_document: dict[str, object] = {}

    def fake_request_json(base_url, method, path, payload, timeout):
        calls.append((method, path, payload))
        if (method, path) == ("POST", "/api/trex/reports/save"):
            assert isinstance(payload, dict)
            saved_document.update(
                {
                    "version": 2,
                    "title": payload["title"],
                    "markdown": payload["markdown"],
                    "payload": payload["payload"],
                }
            )
            return {
                "ok": True,
                "data": {"file": {"name": payload["file_name"]}},
            }
        if (method, path) == ("POST", "/api/trex/reports/download"):
            return {
                "ok": True,
                "data": {"file": {"content": json.dumps(saved_document)}},
            }
        raise AssertionError(f"unexpected request: {method} {path}")

    monkeypatch.setattr(standard_e2e, "request_json", fake_request_json)
    args = SimpleNamespace(
        base_url="http://127.0.0.1",
        timeout=3.0,
        output_dir=str(tmp_path),
    )
    run = {
        "run_id": "20260731T120001Z",
        "report_prefix": "standard-e2e",
        "verdict": "fail",
        "failure": {"message": "daemon unavailable"},
        "traffic_session": {"id": "client-fabricated"},
        "traffic_session_binding": {
            "id": "client-fabricated",
            "revision": 1,
            "evidence_version": 1,
        },
    }
    if traffic_stops is not None:
        run["traffic_stops"] = traffic_stops

    standard_e2e.save_report(args, run)

    assert [(method, path) for method, path, _payload in calls] == [
        ("POST", "/api/trex/reports/save"),
        ("POST", "/api/trex/reports/download"),
    ]
    save_request = calls[0][2]
    assert isinstance(save_request, dict)
    assert "traffic_session_id" not in save_request
    assert "traffic_session_revision" not in save_request
    assert "traffic_session" not in save_request["payload"]
    assert "traffic_session_binding" not in save_request["payload"]


@pytest.mark.parametrize(
    ("session_update", "runtime_update", "expected_message"),
    [
        ({"id": "session-other"}, {}, "expected session session-current"),
        ({"revision": True}, {}, "revision is not a positive integer"),
        ({"revision": 0}, {}, "revision is not a positive integer"),
        ({"evidence_version": None}, {}, "evidence_version is not 1"),
        ({"state": "running"}, {}, "not stopped"),
        ({}, {"mutation_intent": {"nonce": "pending"}}, "pending mutation intent"),
    ],
)
def test_report_binding_rejects_noncanonical_runtime_session(
    monkeypatch,
    session_update: dict[str, object],
    runtime_update: dict[str, object],
    expected_message: str,
) -> None:
    session = {
        "id": "session-current",
        "revision": 9,
        "evidence_version": 1,
        "state": "stopped",
    }
    session.update(session_update)
    runtime_data = {
        "session": session,
        "mutation_intent": None,
        "available_ports": [0, 1],
        "port_states": [
            {"port": 0, "state": "stopped", "ownership": "none"},
            {"port": 1, "state": "stopped", "ownership": "none"},
        ],
        "live_state_sampled": True,
    }
    runtime_data.update(runtime_update)
    monkeypatch.setattr(
        standard_e2e,
        "request_json",
        lambda *_args: {"ok": True, "data": runtime_data},
    )
    args = SimpleNamespace(
        base_url="http://127.0.0.1",
        timeout=3.0,
        tx_port=0,
        rx_port=1,
    )
    run = {
        "verdict": "pass",
        "traffic_stops": [
            {
                "result": {
                    "data": {"session": {"id": "session-current"}},
                }
            }
        ],
    }

    with pytest.raises(standard_e2e.AcceptanceError, match=expected_message):
        standard_e2e.report_traffic_session_binding(args, run)


def test_passing_report_requires_a_completed_session_from_this_run() -> None:
    args = SimpleNamespace(
        base_url="http://127.0.0.1",
        timeout=3.0,
    )

    with pytest.raises(standard_e2e.AcceptanceError, match="no completed traffic session"):
        standard_e2e.report_traffic_session_binding(args, {"verdict": "pass"})


def test_latency_evidence_extracts_pg_average() -> None:
    stats = {
        "ok": True,
        "data": {
            "latency": {
                "12": {
                    "latency": {
                        "average": 5.25,
                        "total_max": 13,
                        "jitter": 1,
                    }
                }
            }
        },
    }

    evidence = standard_e2e.latency_evidence(stats)

    assert evidence["latency_pg_ids"] == ["12"]
    assert evidence["latency_avg_us"] == 5.25
    assert evidence["records"][0]["max_us"] == 13


def test_standard_report_archive_contains_product_metrics_and_conclusion() -> None:
    run = {
        "run_id": "20260617T120000Z",
        "report_prefix": "standard-e2e",
        "generated_at": "2026-06-17T12:00:00+00:00",
        "base_url": "http://127.0.0.1",
        "tx_port": 0,
        "rx_port": 1,
        "ports_before": {"ok": True, "data": {"port_ids": [0, 1]}},
        "daemon_custom_yaml_start": {
            "started": True,
            "config_path": "/tmp/trex_files/root",
            "trex_cmd_options": {"cfg": "/tmp/trex_files/root"},
        },
        "latency_phase": {
            "profile": "gui_example.yaml",
            "latency_pg_ids": ["12"],
            "latency_avg_us": 5.0,
            "tx_packets": 2000,
            "rx_packets": 2000,
            "tx_bps": 1_000_000,
            "rx_bps": 1_000_000,
            "tx_pps": 1000,
            "rx_pps": 1000,
        },
        "capture_phase": {
            "profile": "udp_1pkt_simple.py",
            "packet_count": 64,
            "decoded_packets": 64,
            "layer_chain": "Ethernet > IPv4 > UDP",
            "pcap": "standard-e2e-20260617T120000Z.pcap",
            "drop_bps": 0,
            "queue_full": 0,
        },
        "post_conditions": {
            "target_ports": [0, 1],
            "traffic_ports_idle": True,
            "active_ports_after_stop": [],
            "ports_unowned": True,
            "acquired_ports_after_stop": [],
            "owned_ports_after_stop": {},
            "runtime_ports_stopped": True,
            "runtime_ports_unowned": True,
            "capture_recorders_after_stop": 0,
        },
        "verdict": "pass",
        "evidence_identity": {
            "schema": "trex-webui-evidence/v1",
            "gate_id": "gate-20260617",
            "source": {
                "digest": "s" * 64,
                "git": {"sha": "a" * 40, "branch": "master", "dirty": True, "status_sha256": "d" * 64},
            },
            "build": {
                "digest": "b" * 64,
                "frontend": {
                    "asset_manifest_hash": "f" * 64,
                    "asset_manifest": [{"path": "index.html", "size": 20, "sha256": "i" * 64}],
                },
            },
            "api": {
                "title": "TRex WebUI API",
                "version": "0.1.0",
                "configuration": {
                    "digest": "c" * 64,
                    "summary": {"host": "127.0.0.1", "sync_port": 4501},
                },
            },
        },
        "binary_base64": "must be removed",
    }

    archive = standard_e2e.build_report_archive(run)
    payload = archive["payload"]
    metrics = {metric["label"]: metric["value"] for metric in payload["metrics"]}

    assert payload["standard_e2e"] is True
    assert payload["workflow"] == "standard-e2e"
    assert payload["verdict"] == "pass"
    assert payload["conclusion"]["verdict"] == "pass"
    assert metrics["Latency avg"] == "5.0 us"
    assert metrics["Monitor packets"] == "64"
    assert metrics["Field matches"] == "Ethernet > IPv4 > UDP"
    assert payload["gate_id"] == "gate-20260617"
    assert payload["git_sha"] == "a" * 40
    assert payload["git_dirty"] is True
    assert payload["source_identity"] == "s" * 64
    assert payload["build_identity"] == "b" * 64
    assert payload["frontend_asset_hash"] == "f" * 64
    assert payload["frontend_asset_manifest"][0]["path"] == "index.html"
    assert payload["api_version"] == "0.1.0"
    assert payload["api_config_summary"]["sync_port"] == 4501
    assert "binary_base64" not in payload


def test_frontend_build_identity_is_recomputable_from_asset_manifest(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    dist = project_root / "apps" / "web" / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text('<script src="/assets/app.js"></script>', encoding="utf-8")
    (assets / "app.js").write_text("console.log('app')\n", encoding="utf-8")

    first = standard_e2e.compute_build_identity(project_root)
    second = standard_e2e.compute_build_identity(project_root)

    assert first == second
    assert len(first["digest"]) == 64
    assert first["frontend"]["asset_count"] == 2
    assert [item["path"] for item in first["frontend"]["asset_manifest"]] == ["assets/app.js", "index.html"]

    (assets / "app.js").write_text("console.log('changed')\n", encoding="utf-8")
    assert standard_e2e.compute_build_identity(project_root)["digest"] != first["digest"]


def test_source_identity_records_git_revision_dirty_state_and_algorithm() -> None:
    identity = standard_e2e.compute_source_identity(PROJECT_ROOT)
    git = identity["git"]

    assert len(identity["digest"]) == 64
    assert identity["file_count"] > 0
    assert "git ls-files" in identity["path_set"]
    assert len(git["sha"]) == 40
    assert isinstance(git["dirty"], bool)
    assert len(git["status_sha256"]) == 64
    assert identity["provenance"] == {"kind": "git-checkout"}


def test_source_identity_uses_verified_release_payload_without_git(tmp_path: Path) -> None:
    manifest = write_test_release_manifest(tmp_path)
    (tmp_path / ".venv" / "bin").mkdir(parents=True)
    (tmp_path / ".venv" / "bin" / "python").write_text("runtime-only\n", encoding="utf-8")
    (tmp_path / ".env").write_text("TREX_WEBUI_HOST=127.0.0.1\n", encoding="utf-8")
    (tmp_path / "profiles").mkdir()
    (tmp_path / "profiles" / "operator.yaml").write_text("runtime-profile\n", encoding="utf-8")
    (tmp_path / "scripts" / "__pycache__").mkdir(parents=True)
    (tmp_path / "scripts" / "__pycache__" / "acceptance.pyc").write_bytes(b"runtime-cache")

    identity = standard_e2e.compute_source_identity(tmp_path)

    assert identity["digest"] == manifest["source_identity"]["digest"]
    assert identity["git"] == manifest["source_identity"]["git"]
    assert identity["provenance"]["kind"] == "verified-release-payload"
    assert identity["provenance"]["payload_digest"] == manifest["payload_identity"]["digest"]
    assert identity["provenance"]["payload_file_count"] == manifest["payload_identity"]["file_count"]


def test_release_source_identity_excludes_trusted_versioned_runtime(tmp_path: Path, monkeypatch) -> None:
    manifest = write_test_release_manifest(tmp_path)
    runtime = write_test_trusted_versioned_runtime(tmp_path)
    make_runtime_appear_root_owned(monkeypatch, runtime)

    identity = standard_e2e.compute_source_identity(tmp_path)

    assert identity["digest"] == manifest["source_identity"]["digest"]
    assert identity["provenance"]["payload_digest"] == manifest["payload_identity"]["digest"]
    runtime_exclusion = identity["provenance"]["validated_versioned_runtime_exclusion"]
    assert runtime_exclusion["pattern"] == ".venv.runtime-*"
    assert "root-owned-directory-and-markers" in runtime_exclusion["checks"]


def test_release_source_identity_rejects_forged_versioned_runtime(tmp_path: Path, monkeypatch) -> None:
    write_test_release_manifest(tmp_path)
    runtime = write_test_trusted_versioned_runtime(tmp_path)
    make_runtime_appear_root_owned(monkeypatch, runtime)
    (runtime / standard_e2e.RELEASE_VENV_RUNTIME_MARKER_NAME).write_text(
        "forged-runtime-marker\n",
        encoding="utf-8",
    )

    with pytest.raises(standard_e2e.EvidenceIdentityError, match="no trusted runtime marker"):
        standard_e2e.compute_source_identity(tmp_path)


def test_release_source_identity_rejects_writable_versioned_runtime_marker(tmp_path: Path, monkeypatch) -> None:
    write_test_release_manifest(tmp_path)
    runtime = write_test_trusted_versioned_runtime(tmp_path)
    make_runtime_appear_root_owned(monkeypatch, runtime)
    (runtime / standard_e2e.RELEASE_VENV_RUNTIME_MARKER_NAME).chmod(0o664)

    with pytest.raises(standard_e2e.EvidenceIdentityError, match="runtime marker must not be group/other writable"):
        standard_e2e.compute_source_identity(tmp_path)


@pytest.mark.parametrize("mutation", ["changed", "missing", "extra"])
def test_release_source_identity_rejects_payload_mutation(tmp_path: Path, mutation: str) -> None:
    write_test_release_manifest(tmp_path)
    app_source = tmp_path / "apps" / "api" / "app" / "main.py"
    if mutation == "changed":
        app_source.write_text("APP_VERSION = 'tampered'\n", encoding="utf-8")
    elif mutation == "missing":
        app_source.unlink()
    else:
        (app_source.parent / "injected.py").write_text("INJECTED = True\n", encoding="utf-8")

    with pytest.raises(standard_e2e.EvidenceIdentityError, match="payload identity verification failed"):
        standard_e2e.compute_source_identity(tmp_path)


def test_release_source_identity_rejects_unsafe_runtime_exclusion(tmp_path: Path) -> None:
    write_test_release_manifest(tmp_path)
    (tmp_path / ".env").mkdir()

    with pytest.raises(standard_e2e.EvidenceIdentityError, match="must be a regular file"):
        standard_e2e.compute_source_identity(tmp_path)


def test_source_identity_fails_closed_without_git_or_release_manifest(tmp_path: Path) -> None:
    with pytest.raises(standard_e2e.EvidenceIdentityError, match="either local Git metadata or a verified"):
        standard_e2e.compute_source_identity(tmp_path)


def test_api_version_and_configuration_summary_are_recomputable() -> None:
    metadata = standard_e2e.local_api_source_summary(PROJECT_ROOT)
    first = standard_e2e.api_config_identity({"host": "trex.lab", "sync_port": 4501})
    second = standard_e2e.api_config_identity({"sync_port": 4501, "host": "trex.lab"})

    assert metadata["title"] == "TRex WebUI API"
    assert metadata["version"] == "0.1.0"
    assert first == second
    assert first["summary"]["host"] == "trex.lab"
    assert len(first["digest"]) == 64


def test_standard_e2e_rejects_an_expected_identity_mismatch_before_hardware_actions() -> None:
    args = SimpleNamespace(expected_source_identity="expected-source", expected_build_identity=None)
    evidence = {"source": {"digest": "actual-source"}, "build": {"digest": "build"}}

    with pytest.raises(standard_e2e.AcceptanceError, match="source identity changed"):
        standard_e2e.require_expected_evidence_identity(args, evidence)


def test_standard_e2e_requires_external_root_owned_daemon_without_posting_start(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake_request_json(base_url, method, path, payload, timeout):
        calls.append((method, path))
        return {
            "status": {"running": False},
            "rpc": {"ok": False, "connected": False, "error": "daemon unavailable"},
        }

    monkeypatch.setattr(standard_e2e, "request_json", fake_request_json)
    run: dict[str, object] = {}
    args = SimpleNamespace(base_url="http://127.0.0.1", timeout=1.0)

    with pytest.raises(standard_e2e.AcceptanceError) as raised:
        standard_e2e.ensure_daemon_server(args, run)

    assert calls == [("GET", "/api/system/daemon")]
    assert raised.value.stage == "daemon server prerequisite"
    assert "root-owned trex_daemon_server RPC is not reachable" in raised.value.message
    assert "outside the hardened API" in raised.value.message
    assert "NoNewPrivileges" in raised.value.message
    assert run["daemon_server_before"]["rpc"]["connected"] is False


def test_standard_e2e_accepts_external_start_live_daemon_from_rpc_authority(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake_request_json(base_url, method, path, payload, timeout):
        calls.append((method, path))
        return {
            "status": {"running": False},
            "rpc": {"ok": True, "connected": True, "error": None},
        }

    monkeypatch.setattr(standard_e2e, "request_json", fake_request_json)
    run: dict[str, object] = {}
    args = SimpleNamespace(base_url="http://127.0.0.1", timeout=1.0)

    standard_e2e.ensure_daemon_server(args, run)

    assert calls == [("GET", "/api/system/daemon")]
    assert run["daemon_server_before"]["status"]["running"] is False
    assert run["daemon_server_before"]["rpc"]["connected"] is True


def test_major_change_gate_requires_standard_e2e_archive_evidence() -> None:
    package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    scripts = package["scripts"]

    assert scripts["e2e:standard"] == ".venv/bin/python scripts/trex_standard_e2e.py"
    assert scripts["verify:major"] == "scripts/verify_major_change.sh"
    assert scripts["smoke:web:production"].endswith(
        "scripts/npmw --prefix apps/web run smoke:production --"
    )
    assert scripts["acceptance:web:production-write"].endswith(
        "scripts/npmw --prefix apps/web run acceptance:production-write --"
    )
    web_scripts = json.loads(WEB_PACKAGE_JSON.read_text(encoding="utf-8"))["scripts"]
    assert web_scripts["smoke:production"].endswith("node scripts/production-browser-smoke.mjs")
    assert web_scripts["acceptance:production-write"].endswith(
        "node scripts/production-browser-write-acceptance.mjs"
    )
    assert BROWSER_SMOKE_SCRIPT.is_file()
    assert BROWSER_WRITE_ACCEPTANCE_SCRIPT.is_file()
    assert VERIFY_MAJOR_SCRIPT.stat().st_mode & stat.S_IXUSR

    browser_write = BROWSER_WRITE_ACCEPTANCE_SCRIPT.read_text(encoding="utf-8")
    assert "const unboundedTrafficDuration = -1;" in browser_write
    assert "export const hardStopLeaseSeconds = 60;" in browser_write
    assert 'durationInput.fill(String(unboundedTrafficDuration))' in browser_write
    assert "hard_stop_at" in browser_write
    assert "createEmergencyCleanupCoordinator" in browser_write
    assert "process.on(signal, handler)" in browser_write
    assert "process.off(signal, handler)" in browser_write
    assert "expected_session_id: state.sessionId" in browser_write
    assert "ports: targetPorts" in browser_write

    gate = VERIFY_MAJOR_SCRIPT.read_text(encoding="utf-8")
    assert "resolve_path()" in gate
    assert 'STEP_TIMEOUT_SECONDS="${VERIFY_MAJOR_STEP_TIMEOUT_SECONDS:-1800}"' in gate
    assert 'STANDARD_E2E_TIMEOUT_SECONDS="${VERIFY_MAJOR_E2E_TIMEOUT_SECONDS:-1800}"' in gate
    assert 'TIMEOUT_KILL_AFTER_SECONDS="${VERIFY_MAJOR_TIMEOUT_KILL_AFTER_SECONDS:-90}"' in gate
    assert "--step-timeout" in gate
    assert "--e2e-timeout" in gate
    assert "timeout --foreground" not in gate
    assert gate.count("--signal=TERM") == 2
    assert gate.count('--kill-after="${TIMEOUT_KILL_AFTER_SECONDS}s"') == 2
    assert '"${STEP_TIMEOUT_SECONDS}s"' in gate
    assert '"${STANDARD_E2E_TIMEOUT_SECONDS}s"' in gate
    assert '[[ "$status" -eq 124 || "$status" -eq 137 ]]' in gate
    assert 'die "$label timed out after ${STEP_TIMEOUT_SECONDS}s"' in gate
    assert 'die "standard E2E timed out after ${STANDARD_E2E_TIMEOUT_SECONDS}s; see $log_path"' in gate
    assert "command -v timeout" in gate
    assert "npm run e2e:standard --" in gate
    assert "verify_standard_e2e_archive" in gate
    assert 'output_path="$(resolve_path "$OUTPUT_DIR")"' in gate
    assert 'gate_started_epoch="$(date +%s)"' in gate
    assert 'min_mtime = float(sys.argv[4])' in gate
    assert "if path.stat().st_mtime >= min_mtime" in gate
    assert 'verify_standard_e2e_archive "$output_path" "$REPORT_PREFIX" "$BASE_URL" "$gate_started_epoch"' in gate
    assert 'payload.get("standard_e2e") is not True' in gate
    assert 'payload.get("workflow") != "standard-e2e"' in gate
    assert 'payload.get("verdict") != "pass"' in gate
    assert "prepare_gate_identity" in gate
    assert "verify_versioned_deployment_identity" in gate
    assert "selected production release source identity does not match this gate" in gate
    assert "selected production frontend build identity does not match this gate" in gate
    assert "capture_gate_source_baseline" in gate
    assert "BASELINE_SOURCE_IDENTITY" in gate
    assert "source changed while tests/build were running" in gate
    assert "trex_acquire_deployment_lock" in gate
    assert "run_production_browser_smoke" in gate
    assert "run_production_browser_write_acceptance" in gate
    assert "--browser-write-acceptance" in gate
    assert "RUN_BROWSER_WRITE_ACCEPTANCE=0" in gate
    assert "npm run acceptance:web:production-write --" in gate
    gate_main = gate[gate.index("main() {") :]
    assert gate_main.index("run_standard_e2e_gate") < gate_main.index(
        "run_production_browser_write_acceptance"
    )
    assert "deploy/tests/daemon_service_test.sh" in gate
    assert "deploy/tests/managed_environment_test.sh" in gate
    assert "npm run smoke:web:production --" in gate
    assert '--gate-id "$GATE_ID"' in gate
    assert '--expected-source-identity "$EXPECTED_SOURCE_IDENTITY"' in gate
    assert '--expected-build-identity "$EXPECTED_BUILD_IDENTITY"' in gate
    assert 'identity.get("gate_id") != gate_id' in gate
    assert 'source.get("digest") != expected_source_identity' in gate
    assert 'build.get("digest") != expected_build_identity' in gate
    assert 'current_source.get("digest") != expected_source_identity' in gate
    assert 'current_build.get("digest") != expected_build_identity' in gate
    assert 'frontend.get("asset_manifest")' in gate
    assert 'api_config.get("summary")' in gate
    assert 'post.get("target_ports") != target_ports' in gate
    assert 'post.get("traffic_ports_idle") is not True' in gate
    assert 'post.get("ports_unowned") is not True' in gate
    assert 'post.get("acquired_ports_after_stop") != []' in gate
    assert 'post.get("runtime_ports_stopped") is not True' in gate
    assert 'post.get("runtime_ports_unowned") is not True' in gate
    assert 'post.get("capture_recorders_after_stop") != 0' in gate
    assert "verify_python_baseline" in gate
    assert "major gate requires a Python 3.11 .venv" in gate
    assert "trex_assert_managed_path" in gate
    assert "trex_assert_disjoint_paths" in gate
    assert 'if trex_path_is_within "$source_dist" "$DEPLOY_PROJECT_ROOT"; then' in gate
    assert "gate checkout frontend dist belongs to the selected immutable release" in gate
    assert '"$DEPLOY_PROJECT_ROOT/deploy/archive_safety.py"' in gate
    assert "selected release payload verifier authority is unsafe" in gate
    assert "trex_write_managed_marker" in gate
    assert "rollback_gate_web_root" in gate
    assert "WEB_RELEASE_DIR" in gate
    assert 'find "$WEB_ROOT"' not in gate
    assert 'deploy/verify.sh --base-url "$BASE_URL" --web-root "$WEB_ROOT" --trex' not in gate

    readme = README.read_text(encoding="utf-8")
    assert "Major TRex WebUI changes require a real-hardware Standard E2E" in readme
    assert "scripts/npmw run verify:major" in readme
    assert "fresh local/server report pair" in readme

    development = DEVELOPMENT_DOC.read_text(encoding="utf-8")
    assert "For every major change, `scripts/npmw run e2e:standard` is the fixed acceptance" in development
    assert "The final handoff for a major change must include the local evidence file" in development
    assert "Do not mark a major TRex WebUI slice complete from unit" in development
    assert "tests alone" in development

    nginx_deployment = NGINX_DEPLOYMENT_DOC.read_text(encoding="utf-8")
    assert "Major Change Acceptance Gate" in nginx_deployment
    assert "scripts/npmw run verify:major -- --base-url http://127.0.0.1" in nginx_deployment
    assert "`scripts/npmw run e2e:standard`" in nginx_deployment
    assert "`workflow=standard-e2e` and `verdict=pass`" in nginx_deployment
    assert ".logs/standard-e2e-gate/" in nginx_deployment
    assert "/var/log/trex/reports/" in nginx_deployment


def run_gate_layout_fixture(
    *,
    project_root: Path,
    web_root: Path,
    deployed_root: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "bash",
            "-c",
            r'''
set -Eeuo pipefail
source "$1"
PROJECT_ROOT="$2"
WEB_ROOT="$3"
DEPLOY_PROJECT_ROOT="$4"
SERVICE_PROJECT_ROOT="/opt/trex-webui/current"
VERSIONED_DEPLOYMENT=1
SYNC_WEB_ROOT=0
trex_assert_managed_path() { return 0; }
validate_gate_layout
''',
            "bash",
            str(VERIFY_MAJOR_SCRIPT),
            str(project_root),
            str(web_root),
            str(deployed_root),
        ],
        check=False,
        capture_output=True,
        text=True,
    )


def test_major_gate_detects_a_consistent_versioned_deployment(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "install"
    digest = "c" * 64
    selected_root = install_root / "releases" / f"sha256-{digest}"
    selected_root.mkdir(parents=True)
    (install_root / "current").symlink_to(f"releases/sha256-{digest}")
    nginx_config = tmp_path / "trex-webui.conf"
    nginx_config.write_text(
        f"    root {install_root}/current/apps/web/dist;\n",
        encoding="utf-8",
    )
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_systemctl = fake_bin / "systemctl"
    fake_systemctl.write_text(
        "#!/usr/bin/env bash\n"
        "set -Eeuo pipefail\n"
        "case \"$*\" in\n"
        "  'show trex-webui-api.service --property=FragmentPath --value') printf '%s\\n' '/etc/systemd/system/trex-webui-api.service' ;;\n"
        "  'show trex-webui-api.service --property=NeedDaemonReload --value') printf '%s\\n' \"${FAKE_NEED_DAEMON_RELOAD:-no}\" ;;\n"
        "  'show trex-webui-api.service --property=WorkingDirectory --value') printf '%s\\n' \"${FAKE_WORKING_DIRECTORY:?}\" ;;\n"
        "  *) exit 64 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    fake_systemctl.chmod(0o755)
    checkout = tmp_path / "checkout"
    checkout.mkdir()

    result = subprocess.run(
        [
            "bash",
            "-c",
            r'''
set -Eeuo pipefail
source "$1"
PROJECT_ROOT="$2"
VERSIONED_INSTALL_ROOT="$3"
VERSIONED_NGINX_CONFIG="$4"
detect_versioned_deployment
printf '%s\n' "$VERSIONED_DEPLOYMENT" "$DEPLOY_PROJECT_ROOT" "$SERVICE_PROJECT_ROOT" "$WEB_ROOT" "$SYNC_WEB_ROOT"
''',
            "bash",
            str(VERIFY_MAJOR_SCRIPT),
            str(checkout),
            str(install_root),
            str(nginx_config),
        ],
        check=False,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "FAKE_WORKING_DIRECTORY": str(install_root / "current"),
        },
    )

    assert result.returncode == 0, result.stderr
    assert "detected versioned deployment:" in result.stdout
    assert "\n".join(
        [
            "1",
            str(selected_root),
            str(install_root / "current"),
            str(selected_root / "apps" / "web" / "dist"),
            "0",
        ]
    ) in result.stdout


def test_major_gate_rejects_a_selector_with_legacy_api_authority(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "install"
    digest = "d" * 64
    selected_root = install_root / "releases" / f"sha256-{digest}"
    selected_root.mkdir(parents=True)
    (install_root / "current").symlink_to(f"releases/sha256-{digest}")
    nginx_config = tmp_path / "trex-webui.conf"
    nginx_config.write_text(
        f"    root {install_root}/current/apps/web/dist;\n",
        encoding="utf-8",
    )
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_systemctl = fake_bin / "systemctl"
    fake_systemctl.write_text(
        "#!/usr/bin/env bash\n"
        "set -Eeuo pipefail\n"
        "case \"$*\" in\n"
        "  'show trex-webui-api.service --property=FragmentPath --value') printf '%s\\n' '/etc/systemd/system/trex-webui-api.service' ;;\n"
        "  'show trex-webui-api.service --property=NeedDaemonReload --value') printf '%s\\n' 'no' ;;\n"
        "  'show trex-webui-api.service --property=WorkingDirectory --value') printf '%s\\n' '/opt/trex-webui' ;;\n"
        "  *) exit 64 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    fake_systemctl.chmod(0o755)

    result = subprocess.run(
        [
            "bash",
            "-c",
            r'''
set -Eeuo pipefail
source "$1"
PROJECT_ROOT="$2"
VERSIONED_INSTALL_ROOT="$3"
VERSIONED_NGINX_CONFIG="$4"
detect_versioned_deployment
''',
            "bash",
            str(VERIFY_MAJOR_SCRIPT),
            str(tmp_path / "checkout"),
            str(install_root),
            str(nginx_config),
        ],
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
    )

    assert result.returncode != 0
    assert "loaded API WorkingDirectory is not current" in result.stderr


def test_major_gate_rejects_a_non_symlink_current_selector(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "install"
    (install_root / "current").mkdir(parents=True)

    result = subprocess.run(
        [
            "bash",
            "-c",
            r'''
set -Eeuo pipefail
source "$1"
PROJECT_ROOT="$2"
VERSIONED_INSTALL_ROOT="$3"
VERSIONED_NGINX_CONFIG="$4"
detect_versioned_deployment
''',
            "bash",
            str(VERIFY_MAJOR_SCRIPT),
            str(tmp_path / "checkout"),
            str(install_root),
            str(tmp_path / "trex-webui.conf"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "selector path exists but is not a symbolic link" in result.stderr


def test_versioned_gate_allows_install_root_to_contain_selected_web_root(
    tmp_path: Path,
) -> None:
    project_root = tmp_path / "trex-webui"
    deployed_root = project_root / "releases" / f"sha256-{'a' * 64}"
    web_root = deployed_root / "apps" / "web" / "dist"
    (project_root / "apps" / "web" / "dist").mkdir(parents=True)
    web_root.mkdir(parents=True)
    verifier = deployed_root / "deploy" / "archive_safety.py"
    verifier.parent.mkdir(parents=True)
    verifier.write_text("# trusted fixture\n", encoding="utf-8")

    result = run_gate_layout_fixture(
        project_root=project_root,
        web_root=web_root,
        deployed_root=deployed_root,
    )

    assert result.returncode == 0, result.stderr


def test_versioned_gate_refuses_to_build_inside_selected_release(
    tmp_path: Path,
) -> None:
    deployed_root = tmp_path / "trex-webui" / "releases" / f"sha256-{'b' * 64}"
    web_root = deployed_root / "apps" / "web" / "dist"
    web_root.mkdir(parents=True)

    result = run_gate_layout_fixture(
        project_root=deployed_root,
        web_root=web_root,
        deployed_root=deployed_root,
    )

    assert result.returncode != 0
    assert "gate checkout frontend dist belongs to the selected immutable release" in result.stderr


def test_versioned_gate_rejects_an_untrusted_release_payload_verifier(
    tmp_path: Path,
) -> None:
    project_root = tmp_path / "trex-webui"
    deployed_root = project_root / "releases" / f"sha256-{'e' * 64}"
    web_root = deployed_root / "apps" / "web" / "dist"
    (project_root / "apps" / "web" / "dist").mkdir(parents=True)
    web_root.mkdir(parents=True)
    verifier = deployed_root / "deploy" / "archive_safety.py"
    verifier.parent.mkdir(parents=True)
    verifier.write_text("# writable fixture\n", encoding="utf-8")
    verifier.chmod(0o666)

    result = run_gate_layout_fixture(
        project_root=project_root,
        web_root=web_root,
        deployed_root=deployed_root,
    )

    assert result.returncode != 0
    assert "selected release payload verifier authority is unsafe" in result.stderr


def test_ci_runs_on_main_and_master_with_python_311_locked_dependencies_and_web_shards() -> None:
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")

    assert "branches: [main, master]" in workflow
    assert 'python-version: "3.11"' in workflow
    assert workflow.count('node-version: "24.16.0"') == 4
    assert ".venv/bin/python -m pip install --require-hashes --only-binary=:all:" in workflow
    assert "-r apps/api/requirements-dev.lock" in workflow
    assert 'shard: ["1/4", "2/4", "3/4", "4/4"]' in workflow
    assert "npm run test:web:shard -- ${{ matrix.shard }} --maxWorkers 2" in workflow
    assert "npm --prefix apps/web test\n" not in workflow
    assert ".venv/bin/python -m pip_audit -r apps/api/requirements-dev.lock" in workflow
    assert "scripts/tests/python_lock_freshness_test.sh" in workflow
    assert "npm --prefix apps/web audit --audit-level=high" in workflow
    assert "npm --prefix apps/web audit --omit=dev" not in workflow
    assert "production-browser-smoke:" in workflow
    assert "playwright install --with-deps chromium" in workflow
    assert "npm run smoke:web:production" in workflow
    assert "sudo nginx -t" in workflow


def test_release_packaging_rechecks_clean_source_after_build_and_assembly() -> None:
    package_script = PACKAGE_SCRIPT.read_text(encoding="utf-8")

    assert "BASELINE_SOURCE_IDENTITY" in package_script
    assert 'assert_clean_source_stable "web build"' in package_script
    assert 'assert_clean_source_stable "payload assembly"' in package_script
    assert "source identity changed during" in package_script
