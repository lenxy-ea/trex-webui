from __future__ import annotations

import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

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
            "traffic_ports_idle": True,
            "active_ports_after_stop": [],
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
    assert 'post.get("traffic_ports_idle") is not True' in gate
    assert 'post.get("capture_recorders_after_stop") != 0' in gate
    assert "verify_python_baseline" in gate
    assert "major gate requires a Python 3.11 .venv" in gate
    assert "trex_assert_managed_path" in gate
    assert "trex_assert_disjoint_paths" in gate
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
