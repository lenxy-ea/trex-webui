from __future__ import annotations

import hashlib
import importlib
import importlib.util
import io
import json
import sys
import tarfile
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
for import_root in (PROJECT_ROOT / "apps" / "api", PROJECT_ROOT / "scripts"):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))


def load_script(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence = load_script(
    "trex_webui_release_evidence_test",
    PROJECT_ROOT / "scripts" / "release_evidence.py",
)
contract = load_script(
    "trex_webui_release_contract_fixture",
    PROJECT_ROOT / "scripts" / "release_contract.py",
)
six_port_gate = load_script(
    "trex_webui_release_six_port_gate_fixture",
    PROJECT_ROOT / "scripts" / "trex_six_port_e2e.py",
)
TrafficSessionState = importlib.import_module(
    "app.trex.runtime_state"
).TrafficSessionState
VERSION = "0.1.0-rc.2"
SHA = "1" * 40
SOURCE_DIGEST = "2" * 64
REPOSITORY = "lenxy-ea/trex-webui"
RELEASE_REF = f"refs/tags/v{VERSION}"
SIGNER_WORKFLOW = f"{REPOSITORY}/.github/workflows/release.yml"
SIGNER_WORKFLOW_REF = f"{SIGNER_WORKFLOW}@{RELEASE_REF}"
PAYLOAD_ALGORITHM = "sha256(canonical-json(release-file-manifest)-v1)"
AUTHORITY = {
    "host": "127.0.0.1",
    "sync_port": 4501,
    "async_port": 4500,
    "scapy_port": 4507,
    "daemon_supervisor": "systemd",
    "generation": "00000000-0000-4000-8000-000000000001",
}
STANDARD_SESSION_ID = "00000000-0000-4000-8000-000000000101"
STANDARD_STOP_NONCE = "00000000-0000-4000-8000-000000000102"
SIX_SESSION_ID = "00000000-0000-4000-8000-000000000201"
SIX_SECOND_RUN_ID = "00000000-0000-4000-8000-000000000202"
SIX_THIRD_RUN_ID = "00000000-0000-4000-8000-000000000203"
SIX_STOP_NONCE = "00000000-0000-4000-8000-000000000204"
SIX_HARD_STOP_AT = [
    "2026-07-31T01:04:01Z",
    "2026-07-31T01:03:43Z",
    "2026-07-31T01:03:25Z",
]
SIX_DURATION = 60.0
SIX_FLAGS = {
    "force": True,
    "total": True,
    "synchronized": True,
    "clear_existing": False,
}


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def entry(path: str, content: bytes, mode: int) -> dict[str, object]:
    return {
        "path": path,
        "type": "file",
        "mode": f"{mode:04o}",
        "size": len(content),
        "sha256": digest(content),
    }


def write_json(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def mutation_evidence(
    nonce: str,
    operation: str,
    ports: list[int],
    prepared_at: str,
    completed_at: str,
    baseline_port_states: dict[int, str],
) -> dict[str, object]:
    return {
        "intent_nonce": nonce,
        "operation": operation,
        "completion_mode": "direct",
        "ports": ports,
        "baseline_port_states": baseline_port_states,
        "desired_port_states": {
            port: "running" if operation == "start" else "stopped"
            for port in ports
        },
        "baseline_acquired_ports": [],
        "prepared_at": prepared_at,
        "completed_at": completed_at,
        "acquisition_restored": True,
        "wal_cleared": True,
    }


def cleanup_evidence(
    nonce: str, ports: list[int], completed_at: str
) -> dict[str, object]:
    return {
        "completion": "operator_stop",
        "completed_at": completed_at,
        "final_port_states": {port: "stopped" for port in ports},
        "intent_nonce": nonce,
        "acquisition_restored": True,
        "wal_cleared": True,
    }


def session_group(
    *,
    group_id: str | None,
    run_id: str,
    source: str,
    plan_revision: int | None,
    ports: list[int],
    profile_path: str,
    profile_sha256: str,
    multiplier: str,
    started_at: str,
    ended_at: str,
    start_evidence: dict[str, object],
    stop_nonce: str,
    start_force: bool,
    duration: float = -1.0,
    start_total: bool = False,
    start_synchronized: bool = False,
    start_clear_existing: bool = True,
) -> dict[str, object]:
    return {
        "group_id": group_id,
        "run_id": run_id,
        "source": source,
        "plan_revision": plan_revision,
        "ports": ports,
        "profile_path": profile_path,
        "profile_sha256": profile_sha256,
        "start_multiplier": multiplier,
        "multiplier": multiplier,
        "duration": duration,
        "start_force": start_force,
        "start_total": start_total,
        "start_synchronized": start_synchronized,
        "start_clear_existing": start_clear_existing,
        "started_at": started_at,
        "ended_at": ended_at,
        "hard_stop_at": None,
        "tunables": {},
        "start_evidence": start_evidence,
        "cleanup_evidence": cleanup_evidence(stop_nonce, ports, ended_at),
        "state": "stopped",
        "port_states": {port: "stopped" for port in ports},
        "updated_at": ended_at,
    }


def running_session_prefix(
    final_session: dict[str, object],
    deadlines: list[str],
    *,
    revision: int | None = None,
) -> dict[str, object]:
    returned = json.loads(json.dumps(final_session))
    groups = returned["groups"]
    mutations = returned["mutation_evidence"]
    assert isinstance(groups, list) and isinstance(mutations, list)
    groups = groups[: len(deadlines)]
    for group, deadline in zip(groups, deadlines, strict=True):
        assert isinstance(group, dict)
        ports = group["ports"]
        assert isinstance(ports, list)
        group.update(
            {
                "ended_at": None,
                "hard_stop_at": deadline,
                "cleanup_evidence": None,
                "state": "running",
                "port_states": {port: "running" for port in ports},
                "updated_at": group["started_at"],
            }
        )
    returned.update(
        {
            "revision": len(groups) if revision is None else revision,
            "state": "running",
            "updated_at": groups[-1]["started_at"],
            "ended_at": None,
            "groups": groups,
            "completed_groups": [],
            "mutation_evidence": mutations[: len(groups)],
            "reconciliation": "promoted from durable traffic start intent",
        }
    )
    return returned


def standard_session_fixture() -> tuple[dict[str, object], dict[str, object]]:
    start = mutation_evidence(
        STANDARD_SESSION_ID,
        "start",
        [0],
        "2026-07-31T00:00:01Z",
        "2026-07-31T00:00:02Z",
        {port: "stopped" for port in range(6)},
    )
    stop = mutation_evidence(
        STANDARD_STOP_NONCE,
        "stop",
        [0],
        "2026-07-31T00:00:09Z",
        "2026-07-31T00:00:10Z",
        {
            port: "running" if port == 0 else "stopped"
            for port in range(6)
        },
    )
    group = session_group(
        group_id=None,
        run_id=STANDARD_SESSION_ID,
        source="ad_hoc",
        plan_revision=None,
        ports=[0],
        profile_path="/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
        profile_sha256="6" * 64,
        multiplier="5kpps",
        started_at="2026-07-31T00:00:02Z",
        ended_at="2026-07-31T00:00:10Z",
        start_evidence=start,
        stop_nonce=STANDARD_STOP_NONCE,
        start_force=True,
    )
    session = {
        "id": STANDARD_SESSION_ID,
        "revision": 7,
        "evidence_version": 1,
        "authority": dict(AUTHORITY),
        "state": "stopped",
        "started_at": "2026-07-31T00:00:02Z",
        "updated_at": "2026-07-31T00:00:11Z",
        "ended_at": "2026-07-31T00:00:10Z",
        "groups": [group],
        "completed_groups": [],
        "mutation_evidence": [start, stop],
        "reconciliation": "live TRex port state reconciled",
    }
    binding = {
        "id": STANDARD_SESSION_ID,
        "revision": 7,
        "evidence_version": 1,
    }
    return binding, session


def six_port_session_fixture() -> tuple[dict[str, object], dict[str, object]]:
    run_ids = [SIX_SESSION_ID, SIX_SECOND_RUN_ID, SIX_THIRD_RUN_ID]
    pairs = [[0, 1], [2, 3], [4, 5]]
    prepared = [
        "2026-07-31T01:00:01Z",
        "2026-07-31T01:00:03Z",
        "2026-07-31T01:00:05Z",
    ]
    completed = [
        "2026-07-31T01:00:02Z",
        "2026-07-31T01:00:04Z",
        "2026-07-31T01:00:06Z",
    ]
    mutations: list[dict[str, object]] = []
    groups: list[dict[str, object]] = []
    running: set[int] = set()
    for index, (run_id, ports) in enumerate(zip(run_ids, pairs, strict=True)):
        baseline = {
            port: "running" if port in running else "stopped"
            for port in range(6)
        }
        start = mutation_evidence(
            run_id,
            "start",
            ports,
            prepared[index],
            completed[index],
            baseline,
        )
        mutations.append(start)
        groups.append(
            session_group(
                group_id=f"pair-{index}",
                run_id=run_id,
                source="plan",
                plan_revision=19,
                ports=ports,
                profile_path="/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
                profile_sha256=str(7 + index) * 64,
                multiplier="1kpps",
                started_at=completed[index],
                ended_at="2026-07-31T01:00:10Z",
                start_evidence=start,
                stop_nonce=SIX_STOP_NONCE,
                start_force=SIX_FLAGS["force"],
                duration=SIX_DURATION,
                start_total=SIX_FLAGS["total"],
                start_synchronized=SIX_FLAGS["synchronized"],
                start_clear_existing=SIX_FLAGS["clear_existing"],
            )
        )
        running.update(ports)
    mutations.append(
        mutation_evidence(
            SIX_STOP_NONCE,
            "stop",
            [0, 1, 2, 3, 4, 5],
            "2026-07-31T01:00:09Z",
            "2026-07-31T01:00:10Z",
            {port: "running" for port in range(6)},
        )
    )
    session = {
        "id": SIX_SESSION_ID,
        "revision": 11,
        "evidence_version": 1,
        "authority": dict(AUTHORITY),
        "state": "stopped",
        "started_at": "2026-07-31T01:00:02Z",
        "updated_at": "2026-07-31T01:00:11Z",
        "ended_at": "2026-07-31T01:00:10Z",
        "groups": groups,
        "completed_groups": [],
        "mutation_evidence": mutations,
        "reconciliation": "live TRex port state reconciled",
    }
    binding = {
        "id": SIX_SESSION_ID,
        "revision": 11,
        "evidence_version": 1,
    }
    return binding, session


def release_fixture(tmp_path: Path) -> dict[str, object]:
    root = f"trex-webui-{VERSION}"
    executable = {
        "deploy/bootstrap_release_infrastructure.py",
        "deploy/daemon_rpc_probe.py",
        "deploy/install.sh",
        "deploy/release_transaction.py",
        "deploy/trex_daemon_supervisor.py",
        "deploy/trex_native_boundary.sh",
        "deploy/trex_overview_contract.py",
        "deploy/trex_persisted_state_contract.py",
        "deploy/upgrade.sh",
        "deploy/verified_upgrade.sh",
        "deploy/verify.sh",
        "scripts/release_contract.py",
        "scripts/release_evidence.py",
        "scripts/release_metadata.py",
    }
    files = {
        "LICENSE": b"fixture\n",
        "NOTICE": b"fixture\n",
        "THIRD_PARTY_NOTICES.md": b"fixture\n",
        "SBOM.python.cdx.json": b'{"bom":"python"}\n',
        "SBOM.web.cdx.json": b'{"bom":"web"}\n',
        "apps/api/app/main.py": b'app = FastAPI(title="TRex WebUI", version="0.1.0")\n',
        "apps/api/requirements-dev.lock": b"fixture==1\n",
        "apps/api/requirements-dev.txt": b"fixture==1\n",
        "apps/api/requirements.lock": b"fixture==1\n",
        "apps/api/requirements.txt": b"fixture==1\n",
        "apps/web/package-lock.json": b'{"lockfileVersion":3}\n',
        "apps/web/package.json": b'{"name":"fixture"}\n',
        "apps/web/dist/assets/index.js": b"console.log('fixture')\n",
        "apps/web/dist/index.html": b"<div id='root'></div>\n",
        "deploy/archive_safety.py": b"# fixture\n",
        "deploy/bootstrap_release_infrastructure.py": b"#!/usr/bin/env python3\n",
        "deploy/daemon_rpc_probe.py": b"#!/usr/bin/env python3\n",
        "deploy/install.sh": b"#!/usr/bin/env bash\n",
        "deploy/logrotate/trex-daemon-server": b"# fixture\n",
        "deploy/path_safety.sh": b"# fixture\n",
        "deploy/release_transaction.py": b"#!/usr/bin/env python3\n",
        "deploy/systemd/trex-daemon-server.service": b"[Service]\n",
        "deploy/systemd/nftables-trex-webui.conf": b"table inet fixture {}\n",
        "deploy/systemd/nginx-trex-webui-release-reconcile.conf": b"[Unit]\nRequires=trex-webui-release-reconcile.service\nAfter=trex-webui-release-reconcile.service\n",
        "deploy/systemd/trex-webui-api.service": b"[Service]\n",
        "deploy/systemd/trex-webui-release-consumer-ack.service": b"[Service]\n",
        "deploy/systemd/trex-webui-release-reconcile.service": b"[Service]\n",
        "deploy/systemd/trex-webui-release-retry.service": b"[Service]\n",
        "deploy/trex_daemon_supervisor.py": b"#!/usr/bin/env python3\n",
        "deploy/trex_native_boundary.sh": b"#!/usr/bin/env bash\n",
        "deploy/trex_overview_contract.py": b"#!/usr/bin/env python3\n",
        "deploy/trex_persisted_state_contract.py": b"#!/usr/bin/env python3\n",
        "deploy/upgrade.sh": b"#!/usr/bin/env bash\n",
        "deploy/verified_upgrade.sh": b"#!/usr/bin/env bash\n",
        "deploy/verify.sh": b"#!/usr/bin/env bash\n",
        "scripts/release_contract.py": b"#!/usr/bin/env python3\n",
        "scripts/release_evidence.py": b"#!/usr/bin/env python3\n",
        "scripts/release_metadata.py": b"#!/usr/bin/env python3\n",
    }
    entries = [
        entry(path, content, 0o755 if path in executable else 0o644)
        for path, content in sorted(files.items())
    ]
    payload_digest = digest(
        contract.canonical_json_bytes(
            {"algorithm": PAYLOAD_ALGORITHM, "files": entries}
        )
    )
    provenance = contract.build_release_provenance(
        version=VERSION,
        source_sha=SHA,
        source_dirty=False,
        repository=REPOSITORY,
        release_ref=RELEASE_REF,
        signer_workflow_ref=SIGNER_WORKFLOW_REF,
        signer_workflow_sha=SHA,
        require_publishable=True,
    )
    manifest = {
        "schema": contract.RELEASE_MANIFEST_SCHEMA,
        "name": root,
        "version": VERSION,
        "created_at": "2026-07-31T00:00:00Z",
        "git_commit": SHA,
        "git_dirty": False,
        "source_digest": SOURCE_DIGEST,
        "source_identity": {
            "algorithm": "sha256(canonical-json(git-sha,path,type,mode,size,content-sha256)-v1)",
            "digest": SOURCE_DIGEST,
            "file_count": 1,
            "path_set": "git ls-files --cached --others --exclude-standard",
            "git": {
                "sha": SHA,
                "dirty": False,
                "status_sha256": "3" * 64,
            },
        },
        "release_repository": REPOSITORY,
        "release_ref": RELEASE_REF,
        "signer_workflow": SIGNER_WORKFLOW,
        "release_provenance": provenance,
        "payload_identity": {
            "algorithm": PAYLOAD_ALGORITHM,
            "digest": payload_digest,
            "file_count": len(entries),
            "manifest_path": "RELEASE_MANIFEST.json",
            "manifest_excluded": True,
            "files": entries,
        },
    }
    manifest_content = (
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        + b"\n"
    )
    archive_path = tmp_path / f"{root}.tar.gz"
    with tarfile.open(archive_path, mode="w:gz") as archive:
        for path, content, mode in [
            ("RELEASE_MANIFEST.json", manifest_content, 0o644),
            *[
                (path, content, 0o755 if path in executable else 0o644)
                for path, content in files.items()
            ],
        ]:
            member = tarfile.TarInfo(f"{root}/{path}")
            member.mode = mode
            member.size = len(content)
            archive.addfile(member, io.BytesIO(content))
    archive_digest = digest(archive_path.read_bytes())
    checksum_path = Path(f"{archive_path}.sha256")
    checksum_path.write_text(
        f"{archive_digest}  {archive_path.name}\n",
        encoding="ascii",
    )

    frontend_hash = evidence.frontend_asset_hash(entries)
    api_sha = digest(files["apps/api/app/main.py"])
    base_identity = {
        "schema": "trex-webui-evidence/v1",
        "source": {
            "algorithm": manifest["source_identity"]["algorithm"],
            "digest": SOURCE_DIGEST,
            "file_count": 1,
            "git": {"sha": SHA, "dirty": False, "status_sha256": "3" * 64},
            "provenance": {"kind": "git-checkout"},
        },
        "build": {
            "algorithm": "fixture",
            "digest": "4" * 64,
            "frontend": {"asset_manifest_hash": frontend_hash},
        },
        "api": {"source_sha256": api_sha},
        "trex_config": {
            "content_sha256": "5" * 64,
            "summary": {
                "port_limit": 6,
                "interfaces": [
                    "fixture-port-0",
                    "fixture-port-1",
                    "fixture-port-2",
                    "fixture-port-3",
                    "fixture-port-4",
                    "fixture-port-5",
                ],
            },
        },
    }
    standard_binding, standard_session = standard_session_fixture()
    six_binding, six_session = six_port_session_fixture()
    standard_deadline = "2026-07-31T00:04:00Z"
    standard_start_session = running_session_prefix(
        standard_session, [standard_deadline], revision=3
    )
    six_plan_groups = {
        f"pair-{index}": {
            "ports": [index * 2, index * 2 + 1],
            "profile_path": "udp_1pkt_simple.py",
            "multiplier": "1kpps",
            "duration": SIX_DURATION,
            **SIX_FLAGS,
        }
        for index in range(3)
    }
    six_start_sessions = [
        running_session_prefix(
            six_session,
            SIX_HARD_STOP_AT[: index + 1],
            revision=[1, 3, 5][index],
        )
        for index in range(3)
    ]
    pre_runtime = {
        "authority": dict(AUTHORITY),
        "plan_revision": 19,
        "config": {
            "path": "/etc/trex_cfg.yaml",
            "port_limit": 6,
            "interfaces": [f"fixture-port-{port}" for port in range(6)],
        },
    }
    six_attempts: list[dict[str, object]] = []
    for index in range(3):
        attempt = six_port_gate.start_attempt_descriptor(
            group_id=f"pair-{index}",
            plan_revision=19,
            group=six_plan_groups[f"pair-{index}"],
            hard_stop_at=SIX_HARD_STOP_AT[index],
            expected_session_id=None if index == 0 else SIX_SESSION_ID,
            pre_runtime=pre_runtime,
            pre_session=None if index == 0 else six_start_sessions[index - 1],
        )
        attempt.update(
            {
                "status": "started",
                "start_result": {
                    "ok": True,
                    "data": {"session": six_start_sessions[index]},
                },
                "session_id": SIX_SESSION_ID,
                "run_id": [SIX_SESSION_ID, SIX_SECOND_RUN_ID, SIX_THIRD_RUN_ID][
                    index
                ],
            }
        )
        six_attempts.append(attempt)
    standard_payload = {
        "workflow": "standard-e2e",
        "standard_e2e": True,
        "verdict": "pass",
        "run_id": "standard-run",
        "tx_port": 0,
        "rx_port": 1,
        "evidence_identity": {**base_identity, "gate_id": "standard-gate"},
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
            "traffic_runtime_after_stop": {
                "ok": True,
                "data": {
                    "mutation_intent": None,
                    "authority": dict(AUTHORITY),
                    "session": standard_session,
                },
            },
        },
        "latency_phase": {
            "profile": "gui_example.yaml",
            "tx_port": 0,
            "rx_port": 1,
            "multiplier": "5kpps",
            "session_id": "00000000-0000-4000-8000-000000000099",
            "traffic_run_id": "00000000-0000-4000-8000-000000000099",
            "latency_pg_ids": ["12"],
            "latency_avg_us": 28.0,
            "tx_packets": 4099.0,
            "rx_packets": 4104.0,
        },
        "capture_phase": {
            "profile": "udp_1pkt_simple.py",
            "tx_port": 0,
            "rx_port": 1,
            "multiplier": "5kpps",
            "session_id": STANDARD_SESSION_ID,
            "traffic_run_id": STANDARD_SESSION_ID,
            "hard_stop_at": standard_deadline,
            "start_result": {
                "ok": True,
                "data": {"session": standard_start_session},
            },
            "expected_layer_chain": "Ethernet > IPv4 > UDP",
            "layer_chain": "Ethernet > IPv4 > UDP",
            "layer_chains": ["Ethernet > IPv4 > UDP"],
            "packet_count": 64,
            "decoded_packets": 64,
            "tx_packets": 5119.0,
            "rx_packets": 5124.0,
        },
        "traffic_start_attempts": [
            {"phase": "latency", "status": "stopped"},
            {
                "phase": "capture",
                "profile_path": "udp_1pkt_simple.py",
                "multiplier": "5kpps",
                "duration": -1,
                "ports": [0],
                "boundary_ports": [0, 1],
                "hard_stop_at": standard_deadline,
                "pre_session_id": None,
                "pre_authority": dict(AUTHORITY),
                "session_id": STANDARD_SESSION_ID,
                "run_id": STANDARD_SESSION_ID,
                "status": "stopped",
            },
        ],
        "traffic_session_binding": standard_binding,
        "traffic_session": standard_session,
    }
    six_payload = {
        "workflow": "six-port-e2e",
        "verdict": "pass",
        "run_id": "six-port-run",
        "evidence_identity": {**base_identity, "gate_id": "six-port-gate"},
        "target_ports": [0, 1, 2, 3, 4, 5],
        "group_ids": ["pair-0", "pair-1", "pair-2"],
        "plan_revision": 19,
        "plan_groups": six_plan_groups,
        "group_start_attempts": six_attempts,
        "group_hard_stop_at": {
            f"pair-{index}": deadline
            for index, deadline in enumerate(SIX_HARD_STOP_AT)
        },
        "packet_growth": {
            str(port): {"opackets": 10 + port, "ipackets": 11 + port}
            for port in range(6)
        },
        "postconditions": {
            "exact_inventory": True,
            "port_ids": [0, 1, 2, 3, 4, 5],
            "ports_idle": True,
            "links_up": True,
            "ports_unowned": True,
            "acquired_ports_after_stop": [],
            "capture_recorders": 0,
            "runtime_exact_inventory": True,
            "runtime_port_ids": [0, 1, 2, 3, 4, 5],
            "runtime_ports_stopped": True,
            "runtime_ports_unowned": True,
        },
        "final_runtime": {
            "ok": True,
            "data": {
                "mutation_intent": None,
                "authority": dict(AUTHORITY),
                "session": six_session,
            },
        },
        "traffic_session_binding": six_binding,
        "traffic_session": six_session,
    }
    standard_path = tmp_path / "standard.json"
    six_path = tmp_path / "six-port.json"
    write_json(standard_path, {"payload": standard_payload})
    write_json(six_path, {"payload": six_payload})
    return {
        "archive": archive_path,
        "checksum": checksum_path,
        "standard": standard_path,
        "six": six_path,
        "manifest": manifest,
    }


def build_index(fixture: dict[str, object]) -> dict[str, object]:
    return evidence.build_evidence_index(
        archive_path=fixture["archive"],
        checksum_path=fixture["checksum"],
        standard_report_path=fixture["standard"],
        six_port_report_path=fixture["six"],
        expected_repository=REPOSITORY,
        expected_release_ref=RELEASE_REF,
        expected_signer_workflow=SIGNER_WORKFLOW,
        project_root=PROJECT_ROOT,
    )


def test_evidence_index_is_deterministic_and_binds_complete_chain(tmp_path: Path) -> None:
    fixture = release_fixture(tmp_path)

    first = build_index(fixture)
    repeated = build_index(fixture)

    assert first == repeated
    assert evidence.canonical_json_bytes(first) == evidence.canonical_json_bytes(repeated)
    assert first["schema"] == "trex-webui-release-evidence/v1"
    assert first["release"]["release_ref"] == RELEASE_REF
    assert first["attestation_policy"] == {
        "repository": REPOSITORY,
        "signer_workflow": SIGNER_WORKFLOW,
        "source_ref": RELEASE_REF,
        "source_digest": SHA,
        "signer_digest": SHA,
    }
    assert [item["workflow"] for item in first["acceptance"]] == [
        "standard-e2e",
        "six-port-e2e",
    ]
    assert all(item["verdict"] == "pass" for item in first["acceptance"])
    assert len(first["artifacts"]["sboms"]) == 2


def test_six_port_positive_fixture_matches_runtime_model_and_gate_validator(
    tmp_path: Path,
) -> None:
    fixture = release_fixture(tmp_path)
    document = json.loads(fixture["six"].read_text(encoding="utf-8"))
    payload = document["payload"]
    session = TrafficSessionState.model_validate(payload["traffic_session"])
    canonical = session.model_dump(mode="json")

    validated, revision = six_port_gate.validate_final_session(
        {"session": canonical, "mutation_intent": None},
        str(session.id),
        int(payload["plan_revision"]),
        payload["plan_groups"],
        payload["group_ids"],
    )

    assert validated == canonical
    assert revision == session.revision
    assert [
        attempt["start_result"]["data"]["session"]["revision"]
        for attempt in payload["group_start_attempts"]
    ] == [1, 3, 5]
    assert build_index(fixture)["acceptance"][1]["verdict"] == "pass"


def test_evidence_rejects_wrong_repository_policy(tmp_path: Path) -> None:
    fixture = release_fixture(tmp_path)
    with pytest.raises(evidence.ReleaseEvidenceError, match="repository mismatch"):
        evidence.build_evidence_index(
            archive_path=fixture["archive"],
            checksum_path=fixture["checksum"],
            standard_report_path=fixture["standard"],
            six_port_report_path=fixture["six"],
            expected_repository="someone/else",
            expected_release_ref=RELEASE_REF,
            expected_signer_workflow=SIGNER_WORKFLOW,
            project_root=PROJECT_ROOT,
        )


def test_evidence_rejects_checksum_drift_before_report_acceptance(tmp_path: Path) -> None:
    fixture = release_fixture(tmp_path)
    fixture["checksum"].write_text(f"{'0' * 64}  {fixture['archive'].name}\n", encoding="ascii")
    with pytest.raises(evidence.ReleaseEvidenceError, match="checksum sidecar"):
        build_index(fixture)


def replace_with_minimal_session(payload: dict[str, object]) -> None:
    binding = payload["traffic_session_binding"]
    assert isinstance(binding, dict)
    payload["traffic_session"] = {**binding, "state": "stopped"}


def duplicate_session_group(payload: dict[str, object]) -> None:
    session = payload["traffic_session"]
    assert isinstance(session, dict)
    groups = session["groups"]
    completed = session["completed_groups"]
    assert isinstance(groups, list) and isinstance(completed, list)
    completed.append(json.loads(json.dumps(groups[0])))


def overlap_six_port_group(payload: dict[str, object]) -> None:
    session = payload["traffic_session"]
    assert isinstance(session, dict)
    groups = session["groups"]
    assert isinstance(groups, list) and isinstance(groups[1], dict)
    groups[1]["ports"] = [1, 2]


def append_extra_stop_mutation(payload: dict[str, object]) -> None:
    session = payload["traffic_session"]
    assert isinstance(session, dict)
    mutations = session["mutation_evidence"]
    assert isinstance(mutations, list)
    mutations.append(
        mutation_evidence(
            "00000000-0000-4000-8000-000000000299",
            "stop",
            [0, 1, 2, 3, 4, 5],
            "2026-07-31T01:00:08Z",
            "2026-07-31T01:00:10Z",
            {port: "running" for port in range(6)},
        )
    )


def set_standard_capture_deadline(
    payload: dict[str, object], deadline: str
) -> None:
    capture = payload["capture_phase"]
    attempts = payload["traffic_start_attempts"]
    assert isinstance(capture, dict) and isinstance(attempts, list)
    descriptor = attempts[-1]
    assert isinstance(descriptor, dict)
    descriptor["hard_stop_at"] = deadline
    capture["hard_stop_at"] = deadline
    returned_group = capture["start_result"]["data"]["session"]["groups"][0]
    returned_group["hard_stop_at"] = deadline


def set_six_group_deadline(
    payload: dict[str, object], group_index: int, deadline: str
) -> None:
    group_id = f"pair-{group_index}"
    attempts = payload["group_start_attempts"]
    hard_stops = payload["group_hard_stop_at"]
    assert isinstance(attempts, list) and isinstance(hard_stops, dict)
    attempt = attempts[group_index]
    assert isinstance(attempt, dict)
    attempt["hard_stop_at"] = deadline
    hard_stops[group_id] = deadline
    for prefix_attempt in attempts[group_index:]:
        assert isinstance(prefix_attempt, dict)
        groups = prefix_attempt["start_result"]["data"]["session"]["groups"]
        returned_group = next(group for group in groups if group["group_id"] == group_id)
        returned_group["hard_stop_at"] = deadline


def set_standard_final_revision(payload: dict[str, object], revision: int) -> None:
    payload["traffic_session_binding"]["revision"] = revision
    payload["traffic_session"]["revision"] = revision
    payload["post_conditions"]["traffic_runtime_after_stop"]["data"]["session"][
        "revision"
    ] = revision


def set_six_final_revision(payload: dict[str, object], revision: int) -> None:
    payload["traffic_session_binding"]["revision"] = revision
    payload["traffic_session"]["revision"] = revision
    payload["final_runtime"]["data"]["session"]["revision"] = revision


@pytest.mark.parametrize(
    ("report_key", "mutation", "message"),
    [
        ("standard", lambda payload: payload.update(verdict="fail"), "verdict"),
        (
            "standard",
            lambda payload: payload["evidence_identity"]["source"].update(digest="9" * 64),
            "source identity",
        ),
        (
            "standard",
            lambda payload: payload["evidence_identity"]["build"]["frontend"].update(
                asset_manifest_hash="9" * 64
            ),
            "frontend assets",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session_binding"].update(revision=8),
            "canonical traffic session",
        ),
        (
            "standard",
            lambda payload: payload["post_conditions"].update(
                acquired_ports_after_stop=[1]
            ),
            "postconditions",
        ),
        (
            "standard",
            replace_with_minimal_session,
            "canonical traffic session.*shape is not canonical",
        ),
        (
            "standard",
            lambda payload: payload.update(traffic_mutation_intent={"nonce": "pending"}),
            "pending mutation intent",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session"]["authority"].update(
                generation="not-a-uuid"
            ),
            "runtime authority generation",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session"].update(
                started_at="2026-07-31T00:00:02+00:00"
            ),
            "canonical UTC form",
        ),
        (
            "standard",
            duplicate_session_group,
            "duplicate run ids",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session"]["groups"][0].update(
                hard_stop_at="2026-07-31T00:04:00Z"
            ),
            "hard-stop lease",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session"]["groups"][0][
                "cleanup_evidence"
            ].update(completion="hard_stop"),
            "not an operator stop",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session"]["groups"][0][
                "cleanup_evidence"
            ].update(wal_cleared=False),
            "restore acquisition and clear its WAL",
        ),
        (
            "standard",
            lambda payload: payload.pop("latency_phase"),
            "complete latency/capture phases",
        ),
        (
            "standard",
            lambda payload: payload.pop("capture_phase"),
            "complete latency/capture phases",
        ),
        (
            "standard",
            lambda payload: payload["latency_phase"].update(latency_pg_ids=[]),
            "latency PG evidence",
        ),
        (
            "standard",
            lambda payload: payload["latency_phase"].update(latency_avg_us=None),
            "finite latency average",
        ),
        (
            "standard",
            lambda payload: payload["capture_phase"].update(tx_packets=0),
            "greater than 0",
        ),
        (
            "standard",
            lambda payload: payload["capture_phase"].update(decoded_packets=0),
            "positive integer",
        ),
        (
            "standard",
            lambda payload: payload["capture_phase"].update(
                layer_chains=["Ethernet > IPv4 > TCP"]
            ),
            "expected decoded layer chain",
        ),
        (
            "standard",
            lambda payload: payload["traffic_start_attempts"][-1].update(
                run_id="00000000-0000-4000-8000-000000000199"
            ),
            "exact session and run id",
        ),
        (
            "standard",
            lambda payload: payload["capture_phase"].pop("start_result"),
            "successful start result",
        ),
        (
            "standard",
            lambda payload: payload["capture_phase"]["start_result"]["data"][
                "session"
            ].update(revision=0),
            "positive integer",
        ),
        (
            "standard",
            lambda payload: set_standard_final_revision(payload, 3),
            "revision did not advance",
        ),
        (
            "standard",
            lambda payload: set_standard_capture_deadline(
                payload, "2026-07-31T00:00:00Z"
            ),
            "hard-stop deadline",
        ),
        (
            "standard",
            lambda payload: set_standard_capture_deadline(
                payload, "2026-07-31T00:05:02Z"
            ),
            "hard-stop deadline",
        ),
        (
            "standard",
            lambda payload: payload["capture_phase"]["start_result"]["data"][
                "session"
            ].update(id="00000000-0000-4000-8000-000000000199"),
            "canonical runtime authority/session",
        ),
        (
            "standard",
            lambda payload: payload["traffic_session"]["groups"][0].update(
                duration=5
            ),
            "final capture phase",
        ),
        (
            "standard",
            lambda payload: payload["post_conditions"]["traffic_runtime_after_stop"][
                "data"
            ].update(authority={**AUTHORITY, "generation": "00000000-0000-4000-8000-000000000009"}),
            "final runtime authority",
        ),
        ("six", lambda payload: payload.update(target_ports=[0, 1]), "ports 0 through 5"),
        (
            "six",
            lambda payload: payload["packet_growth"]["5"].update(ipackets=0),
            "positive ipackets",
        ),
        (
            "six",
            lambda payload: payload["postconditions"].update(ports_idle=False),
            "postconditions",
        ),
        (
            "six",
            lambda payload: payload["postconditions"].update(exact_inventory=False),
            "postconditions",
        ),
        (
            "six",
            overlap_six_port_group,
            "overlap or are duplicated",
        ),
        (
            "six",
            append_extra_stop_mutation,
            "stop mutations do not exactly match",
        ),
        (
            "six",
            lambda payload: payload["traffic_session"]["groups"][1].update(
                plan_revision=20
            ),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload["traffic_session"]["groups"][1].update(
                profile_path="/opt/trex-core/scripts/stl/different.py"
            ),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload["traffic_session"]["groups"][1].update(
                multiplier="2kpps", start_multiplier="2kpps"
            ),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload["traffic_session"]["groups"][1].update(
                duration=1
            ),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload["traffic_session"]["groups"][1].update(
                start_force=False
            ),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload.pop("group_start_attempts"),
            "exactly three group start attempts",
        ),
        (
            "six",
            lambda payload: payload["group_start_attempts"][1]["start_result"][
                "data"
            ]["session"].update(revision=1),
            "not strictly increasing",
        ),
        (
            "six",
            lambda payload: set_six_final_revision(payload, 5),
            "revision did not advance",
        ),
        (
            "six",
            lambda payload: payload["group_hard_stop_at"].pop("pair-2"),
            "exactly three group hard-stop deadlines",
        ),
        (
            "six",
            lambda payload: set_six_group_deadline(
                payload, 0, "2026-07-31T01:00:00Z"
            ),
            "hard-stop deadline",
        ),
        (
            "six",
            lambda payload: set_six_group_deadline(
                payload, 1, "2026-07-31T01:05:04Z"
            ),
            "hard-stop deadline",
        ),
        (
            "six",
            lambda payload: payload["plan_groups"]["pair-1"].update(duration=61),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload["group_start_attempts"][1].update(force=False),
            "changed from its exact plan",
        ),
        (
            "six",
            lambda payload: payload["group_start_attempts"][1].update(
                pre_authority={
                    **AUTHORITY,
                    "generation": "00000000-0000-4000-8000-000000000009",
                }
            ),
            "runtime authority",
        ),
        (
            "six",
            lambda payload: payload["group_start_attempts"][1].update(
                expected_session_id="00000000-0000-4000-8000-000000000299"
            ),
            "session authority",
        ),
        (
            "six",
            lambda payload: payload["group_start_attempts"][1].update(
                profile_path="/opt/trex-core/scripts/stl/drift.py"
            ),
            "changed from its exact plan",
        ),
    ],
)
def test_evidence_reports_fail_closed(
    tmp_path: Path,
    report_key: str,
    mutation,
    message: str,
) -> None:
    fixture = release_fixture(tmp_path)
    path = fixture[report_key]
    document = json.loads(path.read_text(encoding="utf-8"))
    mutation(document["payload"])
    write_json(path, document)

    with pytest.raises(evidence.ReleaseEvidenceError, match=message):
        build_index(fixture)


def test_publish_json_is_atomic_and_refuses_overwrite(tmp_path: Path) -> None:
    fixture = release_fixture(tmp_path)
    index = build_index(fixture)
    output = tmp_path / "release-evidence.json"

    evidence.publish_json(output, index)
    assert json.loads(output.read_text(encoding="utf-8")) == index
    with pytest.raises(evidence.ReleaseEvidenceError, match="refusing to replace"):
        evidence.publish_json(output, index)
