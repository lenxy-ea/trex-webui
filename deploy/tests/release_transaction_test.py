from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import fcntl
import grp
import pwd
import re
import signal
import shutil
import stat
import subprocess
import sys
import time
import uuid
from pathlib import Path
from types import ModuleType

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = PROJECT_ROOT / "deploy" / "release_transaction.py"
BOOTSTRAP_PATH = PROJECT_ROOT / "deploy" / "bootstrap_release_infrastructure.py"
UNIT_PATH = (
    PROJECT_ROOT
    / "deploy"
    / "systemd"
    / "trex-webui-release-reconcile-v2.service"
)
RETRY_UNIT_PATH = (
    PROJECT_ROOT / "deploy" / "systemd" / "trex-webui-release-retry-v2.service"
)
ACK_UNIT_PATH = (
    PROJECT_ROOT
    / "deploy"
    / "systemd"
    / "trex-webui-release-consumer-ack-v2.service"
)
API_UNIT_PATH = PROJECT_ROOT / "deploy" / "systemd" / "trex-webui-api.service"
DAEMON_UNIT_PATH = (
    PROJECT_ROOT / "deploy" / "systemd" / "trex-daemon-server.service"
)
NGINX_DROPIN_PATH = (
    PROJECT_ROOT
    / "deploy"
    / "systemd"
    / "trex-webui-release-reconcile-v2.conf"
)
BRIDGE_PATHS = (
    PROJECT_ROOT
    / "deploy"
    / "systemd"
    / "trex-webui-release-reconcile-v1-bridge-v2.conf",
    PROJECT_ROOT
    / "deploy"
    / "systemd"
    / "trex-webui-release-retry-v1-bridge-v2.conf",
    PROJECT_ROOT
    / "deploy"
    / "systemd"
    / "trex-webui-release-consumer-ack-v1-bridge-v2.conf",
)


def load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "trex_webui_release_transaction_test", MODULE_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release_transaction = load_module()


def make_engine(
    root: Path,
    *,
    expected_gid: int | None = None,
    available_bytes=None,
    fault_hook=None,
    host_artifact_paths: tuple[Path, ...] = (),
    host_artifact_relabel=None,
    daemon_reload=None,
    consumer_enable=None,
    consumer_is_enabled=None,
    consumer_start=None,
    consumer_is_active=None,
    consumer_capture=None,
    consumer_is_ready=None,
    consumer_stop=None,
    consumer_force_stop=None,
    daemon_mutation_preflight=None,
    native_boundary_snapshot=None,
    native_boundary_restore=None,
    native_boundary_verify=None,
    native_boundary_helper_source: Path | None = None,
):
    install_root = root / "opt" / "trex-webui"
    state_parent = root / "var" / "lib"
    install_root.mkdir(parents=True, mode=0o755, exist_ok=True)
    state_parent.mkdir(parents=True, mode=0o755, exist_ok=True)
    os.chmod(install_root, 0o755)
    os.chmod(state_parent, 0o755)
    return release_transaction.ReleaseTransactionEngine(
        install_root=install_root,
        state_root=state_parent / "trex-webui-deploy",
        expected_uid=os.geteuid(),
        expected_gid=os.getegid() if expected_gid is None else expected_gid,
        available_bytes=available_bytes,
        fault_hook=fault_hook,
        host_artifact_paths=host_artifact_paths,
        host_artifact_relabel=host_artifact_relabel,
        daemon_reload=daemon_reload,
        consumer_enable=consumer_enable,
        consumer_is_enabled=consumer_is_enabled,
        consumer_start=consumer_start,
        consumer_is_active=consumer_is_active,
        consumer_capture=consumer_capture,
        consumer_is_ready=consumer_is_ready,
        consumer_stop=consumer_stop,
        consumer_force_stop=consumer_force_stop,
        daemon_mutation_preflight=daemon_mutation_preflight,
        native_boundary_snapshot=native_boundary_snapshot,
        native_boundary_restore=native_boundary_restore,
        native_boundary_verify=native_boundary_verify,
        native_boundary_helper_source=native_boundary_helper_source,
    )


def make_release_source(root: Path, label: str, *, size: int = 128) -> tuple[Path, str]:
    source = root / "sources" / label
    (source / "apps" / "api").mkdir(parents=True)
    (source / "apps" / "web" / "dist").mkdir(parents=True)
    files = {
        "apps/api/app.py": (f"RELEASE = {label!r}\n".encode("utf-8"), 0o644),
        "apps/web/dist/index.html": ((label.encode("utf-8") * size), 0o644),
    }
    entries: list[dict[str, object]] = []
    for relative, (content, mode) in files.items():
        path = source / relative
        path.write_bytes(content)
        path.chmod(mode)
        entries.append(
            {
                "path": relative,
                "type": "file",
                "mode": f"{mode:04o}",
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
    entries.sort(key=lambda item: str(item["path"]))
    digest = hashlib.sha256(
        release_transaction.canonical_json_bytes(
            {
                "algorithm": release_transaction.PAYLOAD_IDENTITY_ALGORITHM,
                "files": entries,
            }
        )
    ).hexdigest()
    manifest = {
        "schema": release_transaction.RELEASE_MANIFEST_SCHEMA,
        "payload_identity": {
            "algorithm": release_transaction.PAYLOAD_IDENTITY_ALGORITHM,
            "digest": digest,
            "file_count": len(entries),
            "manifest_path": release_transaction.RELEASE_MANIFEST_NAME,
            "manifest_excluded": True,
            "files": entries,
        },
    }
    manifest_path = source / release_transaction.RELEASE_MANIFEST_NAME
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    manifest_path.chmod(0o644)
    for directory, names, _files in os.walk(source):
        Path(directory).chmod(0o755)
        for name in names:
            (Path(directory) / name).chmod(0o755)
    return source, digest


def add_runtime(root: Path, *, external_python: Path | None = None) -> Path:
    runtime = root / ".venv"
    (runtime / "bin").mkdir(parents=True)
    (runtime / release_transaction.MANAGED_MARKER_NAME).write_text(
        release_transaction.MANAGED_MARKER_VALUE + "\n", encoding="ascii"
    )
    (runtime / release_transaction.VENV_RELEASE_MARKER_NAME).write_text(
        "trex-webui-venv-release-20260731T010203Z-123\n", encoding="ascii"
    )
    python = runtime / "bin" / "python"
    if external_python is None:
        python.write_text("#!/bin/sh\nexit 0\n", encoding="ascii")
        python.chmod(0o755)
    else:
        python.symlink_to(external_python)
    for directory, _names, filenames in os.walk(runtime):
        Path(directory).chmod(0o755)
        for filename in filenames:
            path = Path(directory) / filename
            if not path.is_symlink():
                path.chmod(0o644 if filename.startswith(".trex-") else 0o755)
    return runtime


def select_release(engine, source: Path) -> tuple[dict[str, object], str]:
    prepared = engine.prepare(source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    activated = engine.activate(str(prepared["transaction_id"]))
    committed = engine.commit(str(activated["transaction_id"]))
    return committed, str(committed["candidate"])


def selector_target(engine, name: str) -> str | None:
    path = engine.install_root / name
    if not path.is_symlink():
        return None
    return os.readlink(path)


def assert_selected(engine, *, current: str | None, previous: str | None) -> None:
    assert selector_target(engine, "current") == (
        f"releases/sha256-{current}" if current is not None else None
    )
    assert selector_target(engine, "previous") == (
        f"releases/sha256-{previous}" if previous is not None else None
    )


def assert_terminal_authority_retired(state: dict[str, object]) -> None:
    assert state["phase"] in release_transaction.TERMINAL_PHASES
    assert state["rollback_authority_retired"] is True
    assert state["host_artifacts"] == []
    assert state["native_boundary"] is None
    assert state["consumer_enable"] == []
    assert state["consumer_start"] == []
    assert state["consumer_active_before"] == []
    assert state["consumer_baseline"] == []
    assert state["consumer_mutation_armed"] is False
    assert state["daemon_mutation_started"] is False
    assert state["rollback_restored"] is False


def crash_at(expected: str):
    def hook(observed: str) -> None:
        if observed == expected:
            raise release_transaction.InjectedCrash(expected)

    return hook


def make_host_artifact_fixture(
    root: Path,
) -> tuple[tuple[Path, ...], Path, Path, Path]:
    host_root = root / "host-authority"
    regular = host_root / "etc" / "systemd" / "api.service"
    absent = host_root / "etc" / "nginx" / "trex-webui.conf"
    symlink = host_root / "etc" / "systemd" / "wants" / "nginx.service"
    for parent in (regular.parent, absent.parent, symlink.parent):
        parent.mkdir(parents=True, exist_ok=True)
        parent.chmod(0o755)
    regular.write_bytes(b"baseline-unit\n")
    regular.chmod(0o640)
    symlink.symlink_to("/usr/lib/systemd/system/nginx.service")
    return (regular, absent, symlink), regular, absent, symlink


def mutate_host_artifacts(regular: Path, absent: Path, symlink: Path) -> None:
    regular.write_bytes(b"candidate-unit\n")
    regular.chmod(0o600)
    absent.write_bytes(b"candidate-nginx\n")
    absent.chmod(0o644)
    symlink.unlink()
    symlink.symlink_to("/usr/lib/systemd/system/other.service")


def assert_baseline_host_artifacts(
    regular: Path, absent: Path, symlink: Path
) -> None:
    assert regular.read_bytes() == b"baseline-unit\n"
    assert stat.S_IMODE(regular.stat().st_mode) == 0o640
    assert not absent.exists() and not absent.is_symlink()
    assert symlink.is_symlink()
    assert os.readlink(symlink) == "/usr/lib/systemd/system/nginx.service"


def test_commit_uses_relative_atomic_selectors_and_retains_exactly_n_minus_one(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    first_source, first_digest = make_release_source(tmp_path, "first")
    second_source, second_digest = make_release_source(tmp_path, "second")
    third_source, third_digest = make_release_source(tmp_path, "third")

    select_release(engine, first_source)
    select_release(engine, second_source)
    committed, _ = select_release(engine, third_source)

    assert committed["phase"] == "committed"
    assert_selected(engine, current=third_digest, previous=second_digest)
    releases = {path.name for path in engine.releases_root.iterdir()}
    assert releases == {f"sha256-{second_digest}", f"sha256-{third_digest}"}
    assert not (engine.releases_root / f"sha256-{first_digest}").exists()
    assert stat.S_IMODE(engine.transaction_path.stat().st_mode) == 0o600
    assert engine.transaction_path.stat().st_uid == os.geteuid()


@pytest.mark.parametrize(
    "failpoint",
    [
        "after_phase:staging",
        "after_stage_copy",
        "after_stage_rename",
        "after_phase:prepared",
    ],
)
def test_reconcile_rolls_back_each_interrupted_prepare_phase(
    tmp_path: Path, failpoint: str
) -> None:
    baseline_engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(baseline_engine, old_source)

    crashing_engine = make_engine(tmp_path, fault_hook=crash_at(failpoint))
    with pytest.raises(release_transaction.InjectedCrash):
        crashing_engine.prepare(candidate_source, reserve_bytes=0)

    recovered = make_engine(tmp_path)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert recovered.reconcile() == state
    assert_selected(recovered, current=old_digest, previous=None)
    assert not (recovered.releases_root / f"sha256-{candidate_digest}").exists()
    assert not any(
        path.name.startswith(".staging-") for path in recovered.releases_root.iterdir()
    )


@pytest.mark.parametrize(
    "failpoint",
    [
        "after_phase:switching_current",
        "after_current_link",
        "after_phase:current_switched",
        "after_phase:switching_previous",
        "after_previous_link",
        "after_phase:activated",
    ],
)
def test_reconcile_rolls_back_each_interrupted_activation_phase(
    tmp_path: Path, failpoint: str
) -> None:
    baseline_engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(baseline_engine, old_source)
    prepared = baseline_engine.prepare(candidate_source, reserve_bytes=0)
    baseline_engine.arm_consumers(str(prepared["transaction_id"]), consumers=())

    crashing_engine = make_engine(tmp_path, fault_hook=crash_at(failpoint))
    with pytest.raises(release_transaction.InjectedCrash):
        crashing_engine.activate(str(prepared["transaction_id"]))

    recovered = make_engine(tmp_path)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert recovered.reconcile() == state
    assert_selected(recovered, current=old_digest, previous=None)
    assert not (recovered.releases_root / f"sha256-{candidate_digest}").exists()


@pytest.mark.parametrize(
    "failpoint",
    [
        "after_phase:rolling_back_current",
        "after_rollback_current_link",
        "after_phase:rolling_back_previous",
        "after_rollback_previous_link",
        "after_phase:rolled_back",
    ],
)
def test_reconcile_finishes_each_interrupted_rollback_phase(
    tmp_path: Path, failpoint: str
) -> None:
    engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))

    crashing_engine = make_engine(tmp_path, fault_hook=crash_at(failpoint))
    with pytest.raises(release_transaction.InjectedCrash):
        crashing_engine.rollback(str(prepared["transaction_id"]))

    recovered = make_engine(tmp_path)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert recovered.reconcile() == state
    assert_selected(recovered, current=old_digest, previous=None)
    assert not (recovered.releases_root / f"sha256-{candidate_digest}").exists()


def test_durable_commit_is_kept_when_process_dies_before_pruning(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))

    crashing_engine = make_engine(
        tmp_path, fault_hook=crash_at("after_phase:committed")
    )
    with pytest.raises(release_transaction.InjectedCrash):
        crashing_engine.commit(str(prepared["transaction_id"]))

    recovered = make_engine(tmp_path)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "committed"
    assert recovered.reconcile() == state
    assert_selected(recovered, current=candidate_digest, previous=old_digest)


def test_explicit_rollback_is_idempotent(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, _candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))

    first = engine.rollback(str(prepared["transaction_id"]))
    second = engine.rollback(str(prepared["transaction_id"]))

    assert first == second
    assert first["phase"] == "rolled_back"
    assert_selected(engine, current=old_digest, previous=None)


def test_rollback_removes_incomplete_candidate_runtime_after_killed_install(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))
    incomplete = engine.releases_root / f"sha256-{candidate_digest}" / ".venv"
    incomplete.mkdir()
    (incomplete / "partial-install").write_text("killed\n")

    rolled_back = engine.reconcile()

    assert rolled_back is not None and rolled_back["phase"] == "rolled_back"
    assert_selected(engine, current=old_digest, previous=None)
    assert not (engine.releases_root / f"sha256-{candidate_digest}").exists()


def test_committed_n_minus_one_can_be_reactivated_as_a_guarded_transaction(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    first_source, first_digest = make_release_source(tmp_path, "first")
    second_source, second_digest = make_release_source(tmp_path, "second")
    add_runtime(first_source)
    add_runtime(second_source)
    select_release(engine, first_source)
    select_release(engine, second_source)

    prepared = engine.prepare_previous()
    assert prepared["candidate"] == first_digest
    engine.arm_consumers(
        str(prepared["transaction_id"]),
        consumers=("trex-webui-api.service", "nginx.service"),
    )
    activated = engine.activate(str(prepared["transaction_id"]))
    committed = engine.commit(str(activated["transaction_id"]))

    assert committed["phase"] == "committed"
    assert_selected(engine, current=first_digest, previous=second_digest)
    assert {path.name for path in engine.releases_root.iterdir()} == {
        f"sha256-{first_digest}",
        f"sha256-{second_digest}",
    }


def test_interrupted_n_minus_one_reactivation_restores_newer_release(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    first_source, first_digest = make_release_source(tmp_path, "first")
    second_source, second_digest = make_release_source(tmp_path, "second")
    select_release(engine, first_source)
    select_release(engine, second_source)
    prepared = engine.prepare_previous()
    engine.arm_consumers(
        str(prepared["transaction_id"]),
        consumers=("trex-webui-api.service", "nginx.service"),
    )

    crashing = make_engine(tmp_path, fault_hook=crash_at("after_current_link"))
    with pytest.raises(release_transaction.InjectedCrash):
        crashing.activate(str(prepared["transaction_id"]))

    recovered = make_engine(tmp_path)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert_selected(recovered, current=second_digest, previous=first_digest)


def test_archive_prepare_rejects_reusing_previous_release_before_new_authority(
    tmp_path: Path,
) -> None:
    paths, _regular, _absent, _symlink = make_host_artifact_fixture(tmp_path)
    engine = make_engine(tmp_path, host_artifact_paths=paths)
    first_source, first_digest = make_release_source(tmp_path, "previous-a")
    second_source, second_digest = make_release_source(tmp_path, "current-b")
    select_release(engine, first_source)
    select_release(engine, second_source)
    previous_release = engine.releases_root / f"sha256-{first_digest}"
    assert not (previous_release / ".env").exists()
    assert not (previous_release / ".venv").exists()
    journal_before = engine.transaction_path.read_bytes()
    rollback_plan = ("trex-webui-api.service", "nginx.service")

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="retained previous release",
    ):
        engine.prepare(
            first_source,
            reserve_bytes=0,
            transaction_kind="archive",
            consumer_rollback_plan=rollback_plan,
        )

    assert engine.transaction_path.read_bytes() == journal_before
    assert not list(engine.state_root.glob("host-artifacts-*"))
    assert_selected(engine, current=second_digest, previous=first_digest)


def test_tampered_archive_journal_cannot_reuse_previous_release_authority(
    tmp_path: Path,
) -> None:
    paths, regular, _absent, _symlink = make_host_artifact_fixture(tmp_path)
    engine = make_engine(tmp_path, host_artifact_paths=paths)
    first_source, first_digest = make_release_source(tmp_path, "journal-a")
    second_source, second_digest = make_release_source(tmp_path, "journal-b")
    third_source, _third_digest = make_release_source(tmp_path, "journal-c")
    select_release(engine, first_source)
    select_release(engine, second_source)
    prepared = engine.prepare(
        third_source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=("trex-webui-api.service", "nginx.service"),
    )
    snapshot = engine.state_root / f"host-artifacts-{prepared['transaction_id']}"
    assert snapshot.is_dir()
    host_before = regular.read_bytes()
    transaction = json.loads(engine.transaction_path.read_text(encoding="utf-8"))
    transaction["candidate"] = first_digest
    engine.transaction_path.write_bytes(
        release_transaction.canonical_json_bytes(transaction) + b"\n"
    )
    engine.transaction_path.chmod(0o600)
    tampered_journal = engine.transaction_path.read_bytes()

    for operation in (engine.status, engine.reconcile):
        with pytest.raises(
            release_transaction.ReleaseTransactionError,
            match="cannot reuse retained previous release authority",
        ):
            operation()

    assert engine.transaction_path.read_bytes() == tampered_journal
    assert snapshot.is_dir()
    assert regular.read_bytes() == host_before
    assert_selected(engine, current=second_digest, previous=first_digest)


def test_capacity_preflight_fails_before_journal_or_copy(tmp_path: Path) -> None:
    engine = make_engine(tmp_path, available_bytes=lambda _path: 1)
    source, digest = make_release_source(tmp_path, "large", size=4096)

    with pytest.raises(release_transaction.CapacityError, match="capacity preflight"):
        engine.prepare(source, reserve_bytes=0)

    assert not engine.transaction_path.exists()
    assert not (engine.releases_root / f"sha256-{digest}").exists()


def test_legacy_snapshot_capacity_fails_before_destination_is_created(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path, available_bytes=lambda _path: 1)
    install = engine.install_root
    (install / "apps" / "api").mkdir(parents=True)
    (install / "apps" / "api" / "app.py").write_text("legacy\n")
    runtime = add_runtime(install)
    static = tmp_path / "legacy-static"
    static.mkdir()
    (static / "index.html").write_bytes(b"legacy frontend\n" * 1024)
    for directory in (install / "apps", install / "apps" / "api", static):
        directory.chmod(0o755)
    (install / "apps" / "api" / "app.py").chmod(0o644)
    (static / "index.html").chmod(0o644)
    destination = tmp_path / "snapshot-parent" / "legacy"
    destination.parent.mkdir()
    destination.parent.chmod(0o700)

    with pytest.raises(
        release_transaction.CapacityError,
        match="legacy snapshot capacity preflight failed before copy",
    ):
        engine.snapshot_legacy(
            destination=destination,
            static_root=static,
            runtime_root=runtime,
            reserve_bytes=0,
        )

    assert not destination.exists()
    assert list(destination.parent.iterdir()) == []


def test_legacy_source_drift_guard_rejects_files_newer_than_serving_process(
    tmp_path: Path,
) -> None:
    api_tree = tmp_path / "apps" / "api"
    api_tree.mkdir(parents=True)
    source = api_tree / "app.py"
    source.write_text("legacy\n")
    old_ns = 946684800 * 1_000_000_000
    os.utime(source, ns=(old_ns, old_ns))
    command = [
        "bash",
        "-c",
        'source "$1/deploy/upgrade.sh"; '
        'legacy_api_tree_not_newer_than_process "$2" "$3" ""',
        "legacy-drift",
        str(PROJECT_ROOT),
        str(os.getpid()),
        str(api_tree),
    ]
    accepted = subprocess.run(command, capture_output=True, text=True)
    assert accepted.returncode == 0, accepted.stderr

    future_ns = time.time_ns() + 10_000_000_000
    os.utime(source, ns=(future_ns, future_ns))
    rejected = subprocess.run(command, capture_output=True, text=True)
    assert rejected.returncode != 0
    assert "changed after the API process started" in rejected.stderr


def test_candidate_symlink_is_rejected_before_journaling(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    source, _digest = make_release_source(tmp_path, "symlink")
    payload = source / "apps" / "api" / "app.py"
    payload.unlink()
    payload.symlink_to("/etc/passwd")

    with pytest.raises(release_transaction.ReleaseTransactionError, match="unsafe"):
        engine.prepare(source, reserve_bytes=0)

    assert not engine.transaction_path.exists()


def test_malicious_selector_target_fails_closed(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    source, _digest = make_release_source(tmp_path, "old")
    select_release(engine, source)
    current = engine.install_root / "current"
    current.unlink()
    current.symlink_to("../../../../etc")

    with pytest.raises(
        release_transaction.ReleaseTransactionError, match="selector target is unsafe"
    ):
        engine.reconcile()

    assert os.readlink(current) == "../../../../etc"


def test_symlinked_transaction_journal_fails_closed(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    engine.reconcile()
    external = tmp_path / "external.json"
    external.write_text("{}\n", encoding="utf-8")
    engine.transaction_path.symlink_to(external)

    with pytest.raises(
        release_transaction.ReleaseTransactionError, match="regular 0600"
    ):
        engine.status()


def test_transaction_state_directory_must_remain_private(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    engine.reconcile()
    engine.state_root.chmod(0o750)

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="must have mode 0700",
    ):
        engine.status()


def test_modified_release_permissions_block_activation(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    old_source, _old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    candidate = engine.releases_root / f"sha256-{candidate_digest}"
    candidate.chmod(0o777)

    with pytest.raises(
        release_transaction.ReleaseTransactionError, match="release tree root is unsafe"
    ):
        engine.activate(str(prepared["transaction_id"]))

    assert prepared["phase"] == "prepared"


def test_unknown_release_store_entry_does_not_block_boot_but_blocks_prepare(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    engine.reconcile()
    unknown = engine.releases_root / "operator-notes"
    unknown.mkdir()

    assert engine.reconcile() is None
    assert unknown.is_dir()

    source, _digest = make_release_source(tmp_path, "blocked-by-garbage")

    with pytest.raises(
        release_transaction.ReleaseTransactionError, match="unknown entry"
    ):
        engine.prepare(source, reserve_bytes=0)

    assert unknown.is_dir()
    assert not engine.transaction_path.exists()


def test_active_nginx_baseline_is_snapshotted_as_a_safe_regular_file(
    tmp_path: Path,
) -> None:
    def capture(unit: str, response_path: Path) -> dict[str, object]:
        assert unit == "nginx.service"
        payload = b"baseline nginx response\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            "unit": unit,
            "kind": "nginx",
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    rollback_plan = ("trex-webui-api.service", "nginx.service")
    engine = make_engine(
        tmp_path,
        consumer_is_active=lambda unit: unit == "nginx.service",
        consumer_capture=capture,
    )
    source, _digest = make_release_source(tmp_path, "nginx-active")
    prepared = engine.prepare(
        source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )

    armed = engine.arm_consumers(
        str(prepared["transaction_id"]), consumers=rollback_plan
    )

    assert armed["consumer_active_before"] == ["nginx.service"]
    baselines = armed["consumer_baseline"]
    assert isinstance(baselines, list) and len(baselines) == 1
    assert baselines[0]["kind"] == "nginx"


@pytest.mark.parametrize("initial_active", [False, True])
def test_arm_rejects_consumer_active_subset_drift_before_durable_mutation(
    tmp_path: Path,
    initial_active: bool,
) -> None:
    active = {"nginx.service": initial_active}

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        payload = b"stable nginx\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            "unit": unit,
            "kind": "nginx",
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    def drift(observed: str) -> None:
        if observed == "after_consumer_baseline_capture":
            active["nginx.service"] = not initial_active

    rollback_plan = ("trex-webui-api.service", "nginx.service")
    engine = make_engine(
        tmp_path,
        fault_hook=drift,
        consumer_is_active=lambda unit: active.get(unit, False),
        consumer_capture=capture,
        consumer_is_ready=lambda _record, _root: True,
    )
    source, _digest = make_release_source(
        tmp_path, f"active-drift-{int(initial_active)}"
    )
    prepared = engine.prepare(
        source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="active-state authority changed",
    ):
        engine.arm_consumers(
            str(prepared["transaction_id"]), consumers=rollback_plan
        )

    transaction = engine.status()["transaction"]
    assert isinstance(transaction, dict)
    assert transaction["phase"] == "prepared"
    assert transaction["consumer_mutation_armed"] is False
    assert transaction["consumer_active_before"] == []
    assert_selected(engine, current=None, previous=None)


@pytest.mark.parametrize(
    "active_subset",
    [
        (),
        ("trex-webui-api.service",),
        ("nginx.service",),
        ("trex-webui-api.service", "nginx.service"),
    ],
)
def test_frontend_active_subset_matrix_restores_exact_canonical_set(
    tmp_path: Path,
    active_subset: tuple[str, ...],
) -> None:
    active = set(active_subset)
    starts: list[str] = []

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        common: dict[str, object] = {
            "unit": unit,
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": None,
            "response_sha256": None,
            "response_size": 0,
        }
        if unit == "trex-webui-api.service":
            return {
                **common,
                "kind": "api",
                "working_directory": "/opt/trex-webui",
                "exec_start": "/usr/bin/python3 -m uvicorn app.main:app",
                "argv0": "/usr/bin/python3",
                "resolved_exec": "/usr/bin/python3.11",
            }
        payload = b"matrix nginx baseline\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            **common,
            "kind": "nginx",
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    def stop(units: tuple[str, ...]) -> None:
        active.difference_update(units)

    def start(unit: str) -> None:
        starts.append(unit)
        active.add(unit)

    engine = make_engine(
        tmp_path,
        consumer_is_active=lambda unit: unit in active,
        consumer_capture=capture,
        consumer_is_ready=lambda record, _root: str(record["unit"]) in active,
        consumer_stop=stop,
        consumer_start=start,
    )
    baseline_source, baseline_digest = make_release_source(
        tmp_path, "matrix-baseline-" + str(len(active_subset))
    )
    candidate_source, _ = make_release_source(
        tmp_path,
        "matrix-candidate-" + "-".join(unit.split(".")[0] for unit in active_subset),
    )
    select_release(engine, baseline_source)
    rollback_plan = ("trex-webui-api.service", "nginx.service")
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )
    armed = engine.arm_consumers(
        str(prepared["transaction_id"]), consumers=rollback_plan
    )
    assert armed["consumer_active_before"] == list(active_subset)
    stop(rollback_plan)
    engine.activate(str(prepared["transaction_id"]))

    recovered = engine.reconcile()
    assert recovered is not None
    if active_subset:
        assert recovered["phase"] == "starting_baseline_consumers"
        terminal = engine.acknowledge_consumers()
    else:
        terminal = recovered
    assert terminal is not None and terminal["phase"] == "rolled_back"
    assert starts == list(active_subset)
    assert active == set(active_subset)
    assert_selected(engine, current=baseline_digest, previous=None)


def test_managed_native_snapshot_uses_safe_regular_file_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host_artifact = tmp_path / "etc" / "managed-unit.service"
    host_artifact.parent.mkdir()
    host_artifact.write_text("managed\n", encoding="utf-8")
    host_artifact.chmod(0o644)
    helper = tmp_path / "stable-native-boundary.sh"
    helper.write_text("#!/bin/sh\n", encoding="ascii")
    helper.chmod(0o755)

    def snapshot(_helper: Path, destination: Path) -> None:
        destination.write_text(
            f"{release_transaction.NATIVE_BOUNDARY_HEADER_PREFIX}absent\n",
            encoding="utf-8",
        )
        destination.chmod(0o600)

    engine = make_engine(
        tmp_path,
        host_artifact_paths=(host_artifact,),
        native_boundary_snapshot=snapshot,
        native_boundary_helper_source=helper,
    )
    monkeypatch.setattr(
        engine,
        "_host_paths_for_profile",
        lambda profile: (host_artifact,) if profile == "managed-local" else (),
    )
    source, _digest = make_release_source(tmp_path, "managed-native")
    rollback_plan = (
        "trex-daemon-server.service",
        "trex-webui-api.service",
        "nginx.service",
    )

    prepared = engine.prepare(
        source,
        reserve_bytes=0,
        host_profile="managed-local",
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )

    native = prepared["native_boundary"]
    assert isinstance(native, dict)
    assert native["state"] == "absent"
    assert native["helper_size"] == len(helper.read_bytes())


def test_common_profile_rollback_and_ack_never_touch_external_daemon(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host_artifact = tmp_path / "etc" / "webui-api.service"
    host_artifact.parent.mkdir()
    host_artifact.write_text("baseline host\n", encoding="utf-8")
    host_artifact.chmod(0o644)
    active = {
        "trex-webui-api.service": False,
        "nginx.service": True,
    }
    calls: list[tuple[str, str]] = []

    def is_active(unit: str) -> bool:
        calls.append(("active", unit))
        return active.get(unit, False)

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        calls.append(("capture", unit))
        payload = b"external nginx baseline\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            "unit": unit,
            "kind": "nginx",
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    def stop(units: tuple[str, ...]) -> None:
        for unit in units:
            calls.append(("stop", unit))
            active[unit] = False

    def start(unit: str) -> None:
        calls.append(("start", unit))
        active[unit] = True

    engine = make_engine(
        tmp_path,
        host_artifact_paths=(host_artifact,),
        consumer_is_active=is_active,
        consumer_capture=capture,
        consumer_is_ready=lambda record, _root: active.get(str(record["unit"]), False),
        consumer_stop=stop,
        consumer_start=start,
    )
    monkeypatch.setattr(
        engine,
        "_host_paths_for_profile",
        lambda profile: (host_artifact,) if profile == "common" else (),
    )
    baseline_source, baseline_digest = make_release_source(
        tmp_path, "external-baseline"
    )
    candidate_source, _candidate_digest = make_release_source(
        tmp_path, "external-candidate"
    )
    select_release(engine, baseline_source)
    rollback_plan = ("trex-webui-api.service", "nginx.service")
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        host_profile="common",
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )
    engine.arm_consumers(
        str(prepared["transaction_id"]), consumers=rollback_plan
    )
    host_artifact.write_text("candidate host\n", encoding="utf-8")
    engine.activate(str(prepared["transaction_id"]))

    pending = engine.reconcile()
    assert pending is not None and pending["phase"] == "starting_baseline_consumers"
    terminal = engine.acknowledge_consumers()
    assert terminal is not None and terminal["phase"] == "rolled_back"
    assert host_artifact.read_text(encoding="utf-8") == "baseline host\n"
    assert_selected(engine, current=baseline_digest, previous=None)
    assert ("start", "nginx.service") in calls
    assert all(unit != "trex-daemon-server.service" for _action, unit in calls)

    rejected_source, _ = make_release_source(tmp_path, "external-rejected-daemon")
    journal_before = engine.transaction_path.read_bytes()
    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="cannot own daemon consumer intent",
    ):
        engine.prepare(
            rejected_source,
            reserve_bytes=0,
            host_profile="common",
            transaction_kind="archive",
            consumer_rollback_plan=(
                "trex-daemon-server.service",
                "trex-webui-api.service",
                "nginx.service",
            ),
        )
    assert engine.transaction_path.read_bytes() == journal_before
    assert not list(engine.state_root.glob("host-artifacts-*"))


def test_marker_false_rollback_restores_frontends_without_touching_daemon_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host_artifact = tmp_path / "etc" / "managed-daemon.service"
    host_artifact.parent.mkdir()
    host_artifact.write_text("baseline daemon host\n", encoding="utf-8")
    host_artifact.chmod(0o644)
    helper = tmp_path / "native-helper.sh"
    helper.write_text("#!/bin/sh\n", encoding="ascii")
    helper.chmod(0o755)
    native = tmp_path / "native.state"
    native.write_text(
        f"{release_transaction.NATIVE_BOUNDARY_HEADER_PREFIX}absent\n",
        encoding="utf-8",
    )
    active = {"trex-daemon-server.service", "nginx.service"}
    stops: list[tuple[str, ...]] = []
    starts: list[str] = []

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        common: dict[str, object] = {
            "unit": unit,
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": None,
            "response_sha256": None,
            "response_size": 0,
        }
        if unit == "trex-daemon-server.service":
            return {**common, "kind": "daemon"}
        payload = b"baseline nginx\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            **common,
            "kind": "nginx",
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    def stop(scope: tuple[str, ...]) -> None:
        stops.append(scope)
        active.difference_update(scope)

    def start(unit: str) -> None:
        starts.append(unit)
        active.add(unit)

    def snapshot_native(_helper: Path, destination: Path) -> None:
        destination.write_bytes(native.read_bytes())
        destination.chmod(0o600)

    engine = make_engine(
        tmp_path,
        host_artifact_paths=(host_artifact,),
        consumer_is_active=lambda unit: unit in active,
        consumer_capture=capture,
        consumer_is_ready=lambda record, _root: str(record["unit"]) in active,
        consumer_stop=stop,
        consumer_force_stop=lambda _scope: pytest.fail("force stop before marker"),
        consumer_start=start,
        native_boundary_snapshot=snapshot_native,
        native_boundary_restore=lambda _helper, snapshot: native.write_bytes(
            snapshot.read_bytes()
        ),
        native_boundary_verify=lambda _helper, snapshot: (
            None
            if native.read_bytes() == snapshot.read_bytes()
            else (_ for _ in ()).throw(
                release_transaction.ReleaseTransactionError("native drift")
            )
        ),
        native_boundary_helper_source=helper,
    )
    monkeypatch.setattr(
        engine,
        "_host_paths_for_profile",
        lambda profile: (host_artifact,) if profile == "managed-local" else (),
    )
    baseline_source, baseline_digest = make_release_source(
        tmp_path, "marker-false-baseline"
    )
    candidate_source, _ = make_release_source(tmp_path, "marker-false-candidate")
    select_release(engine, baseline_source)
    plan = (
        "trex-daemon-server.service",
        "trex-webui-api.service",
        "nginx.service",
    )
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        host_profile="managed-local",
        transaction_kind="archive",
        consumer_rollback_plan=plan,
    )
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=plan)
    # Models frontend fencing followed by daemon/native drift before the
    # durable daemon-mutation intent boundary.
    active.discard("nginx.service")
    host_artifact.write_text("independent daemon host drift\n", encoding="utf-8")
    native.write_text("independent native drift\n", encoding="utf-8")

    pending = engine.reconcile()
    assert pending is not None and pending["phase"] == "starting_baseline_consumers"
    assert stops == [("trex-webui-api.service", "nginx.service")]
    assert starts == ["nginx.service"]
    assert "trex-daemon-server.service" in active
    terminal = engine.acknowledge_consumers()
    assert terminal is not None and terminal["phase"] == "rolled_back"
    assert host_artifact.read_text(encoding="utf-8") == "independent daemon host drift\n"
    assert native.read_text(encoding="utf-8") == "independent native drift\n"
    assert_selected(engine, current=baseline_digest, previous=None)


def test_marker_true_rollback_uses_force_stop_and_restores_daemon_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host_artifact = tmp_path / "etc" / "managed-daemon.service"
    host_artifact.parent.mkdir()
    host_artifact.write_text("baseline daemon host\n", encoding="utf-8")
    host_artifact.chmod(0o644)
    helper = tmp_path / "native-helper.sh"
    helper.write_text("#!/bin/sh\n", encoding="ascii")
    helper.chmod(0o755)
    native = tmp_path / "native.state"
    native.write_text(
        f"{release_transaction.NATIVE_BOUNDARY_HEADER_PREFIX}absent\n",
        encoding="utf-8",
    )
    native_baseline = native.read_bytes()
    active = {"trex-daemon-server.service", "nginx.service"}
    force_scopes: list[tuple[str, ...]] = []
    starts: list[str] = []
    preflight: list[bool] = []

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        empty: dict[str, object] = {
            "unit": unit,
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": None,
            "response_sha256": None,
            "response_size": 0,
        }
        if unit == "trex-daemon-server.service":
            return {**empty, "kind": "daemon"}
        payload = b"baseline nginx\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            **empty,
            "kind": "nginx",
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    def force_stop(scope: tuple[str, ...]) -> None:
        force_scopes.append(scope)
        active.difference_update(scope)

    def start(unit: str) -> None:
        starts.append(unit)
        active.add(unit)

    def snapshot_native(_helper: Path, destination: Path) -> None:
        destination.write_bytes(native.read_bytes())
        destination.chmod(0o600)

    def restore_native(_helper: Path, snapshot: Path) -> None:
        native.write_bytes(snapshot.read_bytes())
        native.chmod(0o600)

    def verify_native(_helper: Path, snapshot: Path) -> None:
        if native.read_bytes() != snapshot.read_bytes():
            raise release_transaction.ReleaseTransactionError("native drift")

    engine = make_engine(
        tmp_path,
        host_artifact_paths=(host_artifact,),
        consumer_is_active=lambda unit: unit in active,
        consumer_capture=capture,
        consumer_is_ready=lambda record, _root: str(record["unit"]) in active,
        consumer_stop=lambda _scope: pytest.fail("safe stop after durable marker"),
        consumer_force_stop=force_stop,
        consumer_start=start,
        daemon_mutation_preflight=lambda was_active: preflight.append(was_active),
        native_boundary_snapshot=snapshot_native,
        native_boundary_restore=restore_native,
        native_boundary_verify=verify_native,
        native_boundary_helper_source=helper,
    )
    monkeypatch.setattr(
        engine,
        "_host_paths_for_profile",
        lambda profile: (host_artifact,) if profile == "managed-local" else (),
    )
    baseline_source, baseline_digest = make_release_source(
        tmp_path, "marker-true-baseline"
    )
    candidate_source, _ = make_release_source(tmp_path, "marker-true-candidate")
    select_release(engine, baseline_source)
    plan = (
        "trex-daemon-server.service",
        "trex-webui-api.service",
        "nginx.service",
    )
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        host_profile="managed-local",
        transaction_kind="archive",
        consumer_rollback_plan=plan,
    )
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=plan)
    marked = engine.mark_daemon_mutation_started(str(prepared["transaction_id"]))
    assert marked["daemon_mutation_started"] is True
    assert preflight == [True]
    host_artifact.write_text("candidate daemon host\n", encoding="utf-8")
    native.write_text("candidate native mutation\n", encoding="utf-8")
    engine.activate(str(prepared["transaction_id"]))

    pending = engine.reconcile()
    assert pending is not None and pending["phase"] == "starting_baseline_consumers"
    assert force_scopes == [plan]
    assert starts == ["trex-daemon-server.service", "nginx.service"]
    terminal = engine.acknowledge_consumers()
    assert terminal is not None and terminal["phase"] == "rolled_back"
    assert host_artifact.read_text(encoding="utf-8") == "baseline daemon host\n"
    assert native.read_bytes() == native_baseline
    assert_selected(engine, current=baseline_digest, previous=None)


def test_marker_true_activate_can_atomically_enter_commit_finalizer(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The commit-intent write retires the marker before changing phase."""

    helper = tmp_path / "native-helper.sh"
    helper.write_text("#!/bin/sh\n", encoding="ascii")
    helper.chmod(0o755)
    native = tmp_path / "native.state"
    native.write_text(
        f"{release_transaction.NATIVE_BOUNDARY_HEADER_PREFIX}absent\n",
        encoding="utf-8",
    )
    host_artifact = tmp_path / "managed-daemon.service"
    host_artifact.write_text("baseline host authority\n", encoding="utf-8")
    host_artifact.chmod(0o644)
    enabled: list[str] = []

    def snapshot_native(_helper: Path, destination: Path) -> None:
        destination.write_bytes(native.read_bytes())
        destination.chmod(0o600)

    def verify_native(_helper: Path, snapshot: Path) -> None:
        assert native.read_bytes() == snapshot.read_bytes()

    engine = make_engine(
        tmp_path,
        host_artifact_paths=(host_artifact,),
        consumer_enable=enabled.append,
        consumer_is_enabled=lambda unit: unit in enabled,
        daemon_mutation_preflight=lambda _was_active: None,
        native_boundary_snapshot=snapshot_native,
        native_boundary_verify=verify_native,
        native_boundary_helper_source=helper,
    )
    monkeypatch.setattr(
        engine,
        "_host_paths_for_profile",
        lambda profile: (host_artifact,) if profile == "managed-local" else (),
    )
    source, digest = make_release_source(tmp_path, "marker-commit")
    plan = (
        "trex-daemon-server.service",
        "trex-webui-api.service",
        "nginx.service",
    )
    prepared = engine.prepare(
        source,
        reserve_bytes=0,
        host_profile="managed-local",
        transaction_kind="archive",
        consumer_rollback_plan=plan,
    )
    transaction_id = str(prepared["transaction_id"])
    engine.arm_consumers(transaction_id, consumers=plan)
    engine.mark_daemon_mutation_started(transaction_id)
    activated = engine.activate(transaction_id)
    assert activated["phase"] == "activated"
    assert activated["daemon_mutation_started"] is True

    committed = engine.commit(transaction_id)

    assert committed["phase"] == "committed"
    assert committed["daemon_mutation_started"] is False
    assert_terminal_authority_retired(committed)
    assert_selected(engine, current=digest, previous=None)


def _run_archive_daemon_override_wrapper(
    tmp_path: Path,
    scenario: str,
) -> tuple[subprocess.CompletedProcess[str], Path, Path, Path]:
    fixture = tmp_path / scenario
    source = fixture / "archive"
    source_systemd = source / "deploy" / "systemd"
    source_systemd.mkdir(parents=True)
    shutil.copy2(DAEMON_UNIT_PATH, source_systemd / "trex-daemon-server.service")
    shutil.copy2(
        PROJECT_ROOT / "deploy" / "systemd" / "nftables-trex-webui.conf",
        source_systemd / "nftables-trex-webui.conf",
    )
    probe_source = source / "deploy" / "daemon_rpc_probe.py"
    probe_source.write_text(
        r'''from pathlib import Path
import os
import sys

command = sys.argv[-1]
state_path = Path(os.environ["OVERRIDE_DAEMON_STATE"])
journal_path = Path(os.environ["OVERRIDE_JOURNAL"])
state = state_path.read_text(encoding="utf-8").strip()
with Path(os.environ["OVERRIDE_EVENTS"]).open("a", encoding="utf-8") as stream:
    stream.write(
        f"probe {command} allow={os.environ.get('ALLOW_DAEMON_RUNTIME_RESTART', '')} "
        f"journal={'present' if journal_path.exists() else 'absent'} state={state}\n"
    )
if command == "safe-restart" and state != "safe":
    raise SystemExit(1)
raise SystemExit(0)
''',
        encoding="utf-8",
    )
    supervisor_source = source / "deploy" / "trex_daemon_supervisor.py"
    supervisor_source.write_text("# fixture supervisor\n", encoding="utf-8")
    boundary_source = source / "deploy" / "trex_native_boundary.sh"
    boundary_source.write_text(
        r'''#!/usr/bin/env bash
set -Eeuo pipefail
printf 'boundary %s allow=%s journal=%s\n' "$1" \
  "${ALLOW_DAEMON_RUNTIME_RESTART:-}" \
  "$([[ -e "${OVERRIDE_JOURNAL:?}" ]] && printf present || printf absent)" \
  >>"${OVERRIDE_EVENTS:?}"
''',
        encoding="utf-8",
    )
    boundary_source.chmod(0o755)
    persisted_validator = fixture / "persisted-validator.py"
    persisted_validator.write_text(
        "raise SystemExit(0)\n",
        encoding="utf-8",
    )

    target_root = fixture / "host"
    target_root.mkdir()
    target_unit = target_root / "trex-daemon-server.service"
    target_supervisor = target_root / "trex_daemon_supervisor.py"
    target_probe = target_root / "daemon_rpc_probe.py"
    target_boundary = target_root / "trex_native_boundary.sh"
    target_dropin = target_root / "nftables-trex-webui.conf"
    target_unit.write_text(
        "# Managed by TRex WebUI deploy/install.sh.\n[Service]\nExecStart=/bin/false\n",
        encoding="utf-8",
    )
    shutil.copy2(supervisor_source, target_supervisor)
    shutil.copy2(probe_source, target_probe)
    shutil.copy2(boundary_source, target_boundary)
    target_dropin.write_text(
        "# Managed by TRex WebUI deploy/install.sh.\n[Service]\n",
        encoding="utf-8",
    )
    journal = fixture / "transaction.json"
    events = fixture / "events.log"
    args_log = fixture / "install-args.log"
    result_state = fixture / "result.state"
    daemon_state = fixture / "daemon.state"
    daemon_state.write_text(
        "safe\n" if scenario in {"active-safe", "expected-zero"} else "unsafe\n",
        encoding="utf-8",
    )
    runtime_state = fixture / "runtime-state.json"
    runtime_state.write_text("{}\n", encoding="utf-8")
    staging = fixture / "staging"
    staging.mkdir()

    script = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
trap - EXIT
fixture="$2"
scenario="$3"
ARCHIVE="fixture.tar.gz"
ARCHIVE_SOURCE_ROOT="$4"
STAGING_ROOT="$5"
INSTALL_ROOT="$fixture/install"
RELEASE_PROJECT_ROOT="$ARCHIVE_SOURCE_ROOT"
RELEASE_STATE_ROOT="$fixture/release-state"
RELEASE_TRANSACTION_ID="11111111-1111-4111-8111-111111111111"
MANAGE_LOCAL_DAEMON=1
RUN_RESTART=1
RUN_ENABLE=1
DRY_RUN=0
ALLOW_DAEMON_RUNTIME_RESTART=1
DAEMON_SYSTEMD_SERVICE_TARGET="$6"
DAEMON_SUPERVISOR_TARGET="$7"
DAEMON_RPC_PROBE_TARGET="$8"
DAEMON_NATIVE_BOUNDARY_TARGET="$9"
NFTABLES_SYSTEMD_DROPIN_TARGET="${10}"
NFTABLES_CONFIG_PATH="$fixture/nftables.conf"
TREX_DAEMON_SCRIPTS_DIR="$fixture/trex/scripts"
TREX_DAEMON_BIN="$TREX_DAEMON_SCRIPTS_DIR/trex_daemon_server"
TREX_PERSISTED_STATE_VALIDATOR_TARGET="${11}"
RELEASE_ROLLBACK_DAEMON_PROBE_TARGET="$8"
SERVICE_RUNTIME_STATE_PATH="${12}"
export ALLOW_DAEMON_RUNTIME_RESTART
export OVERRIDE_DAEMON_STATE="${13}"
export OVERRIDE_JOURNAL="${14}"
export OVERRIDE_EVENTS="${15}"
: >"$OVERRIDE_EVENTS"

assert_loaded_unit_disk_authority() { :; }
assert_loaded_unit_not_stale() { :; }
cmp() {
  [[ "$scenario" == "expected-zero" ]]
}
systemctl() {
  local journal_state=absent
  [[ -e "$OVERRIDE_JOURNAL" ]] && journal_state=present
  printf 'systemctl %s allow=%s journal=%s\n' "$*" \
    "$ALLOW_DAEMON_RUNTIME_RESTART" "$journal_state" >>"$OVERRIDE_EVENTS"
  case "$*" in
    "show trex-daemon-server.service --property=LoadState --value") printf 'loaded\n' ;;
    "show trex-daemon-server.service --property=FragmentPath --value") printf '%s\n' "$DAEMON_SYSTEMD_SERVICE_TARGET" ;;
    "show nftables.service --property=DropInPaths --value") printf '%s\n' "$NFTABLES_SYSTEMD_DROPIN_TARGET" ;;
    "is-active --quiet trex-daemon-server.service") [[ "$scenario" != "inactive" ]] ;;
    "show trex-daemon-server.service --property=NeedDaemonReload --value") printf 'no\n' ;;
    "show nftables.service --property=NeedDaemonReload --value") printf 'no\n' ;;
    "show trex-daemon-server.service --property=KillMode --value") printf 'mixed\n' ;;
    "show trex-daemon-server.service --property=Restart --value") printf 'on-failure\n' ;;
    "show trex-daemon-server.service --property=ExecStartPost --value") printf 'daemon_rpc_probe.py ready\n' ;;
    "restart trex-daemon-server.service")
      if [[ "$journal_state" == absent && "$scenario" == "restart-still-unsafe" ]]; then
        printf 'unsafe\n' >"$OVERRIDE_DAEMON_STATE"
      else
        printf 'safe\n' >"$OVERRIDE_DAEMON_STATE"
      fi
      ;;
    *) printf 'unexpected systemctl call: %s\n' "$*" >&2; return 64 ;;
  esac
}
release_engine() {
  local journal_state=absent
  [[ -e "$OVERRIDE_JOURNAL" ]] && journal_state=present
  printf 'release-engine %s allow=%s journal=%s\n' "$*" \
    "$ALLOW_DAEMON_RUNTIME_RESTART" "$journal_state" >>"$OVERRIDE_EVENTS"
  [[ "$ALLOW_DAEMON_RUNTIME_RESTART" -eq 0 ]] || return 90
  [[ "$journal_state" == present ]] || return 91
  case "$1" in
    mark-daemon-mutation-started) printf 'marked\n' >>"$OVERRIDE_JOURNAL" ;;
    rollback) : ;;
    *) return 92 ;;
  esac
  printf '{"phase":"prepared"}\n'
}

preflight_archive_daemon_runtime
[[ ! -e "$OVERRIDE_JOURNAL" ]]
[[ "$ALLOW_DAEMON_RUNTIME_RESTART" -eq 0 ]]
while IFS= read -r -d '' argument; do
  printf '%s\n' "$argument" >>"${16}"
done < <(install_args)
! grep -Fqx -- '--allow-daemon-runtime-restart' "${16}"
printf 'prepared\n' >"$OVERRIDE_JOURNAL"
post_fence_archive_runtime_preflight
mark_archive_daemon_mutation_started
converge_archive_daemon_runtime_after_recovery_barrier
release_engine rollback --transaction-id "$RELEASE_TRANSACTION_ID" >/dev/null
printf 'expected=%s\nactive=%s\nconsumed=%s\nallow=%s\n' \
  "$ARCHIVE_DAEMON_MUTATION_EXPECTED" \
  "$ARCHIVE_DAEMON_WAS_ACTIVE_FOR_PREFLIGHT" \
  "$ARCHIVE_DAEMON_OVERRIDE_CONSUMED" \
  "$ALLOW_DAEMON_RUNTIME_RESTART" >"${17}"
'''
    result = subprocess.run(
        [
            "bash",
            "-c",
            script,
            "override-wrapper",
            str(PROJECT_ROOT),
            str(fixture),
            scenario,
            str(source),
            str(staging),
            str(target_unit),
            str(target_supervisor),
            str(target_probe),
            str(target_boundary),
            str(target_dropin),
            str(persisted_validator),
            str(runtime_state),
            str(daemon_state),
            str(journal),
            str(events),
            str(args_log),
            str(result_state),
        ],
        capture_output=True,
        text=True,
    )
    return result, events, args_log, result_state


@pytest.mark.parametrize(
    "scenario,expected,active,consumed,pre_journal_restarts,post_journal_restarts,marker_calls",
    [
        ("active-unsafe", 1, 1, 1, 1, 1, 1),
        ("active-safe", 1, 1, 0, 0, 1, 1),
        ("inactive", 1, 0, 0, 0, 0, 1),
        ("expected-zero", 0, 1, 0, 0, 0, 0),
    ],
)
def test_archive_override_is_consumed_or_discarded_before_journal(
    tmp_path: Path,
    scenario: str,
    expected: int,
    active: int,
    consumed: int,
    pre_journal_restarts: int,
    post_journal_restarts: int,
    marker_calls: int,
) -> None:
    result, events_path, args_path, state_path = _run_archive_daemon_override_wrapper(
        tmp_path, scenario
    )

    assert result.returncode == 0, result.stderr
    events = events_path.read_text(encoding="utf-8").splitlines()
    state = dict(
        line.split("=", 1)
        for line in state_path.read_text(encoding="utf-8").splitlines()
    )
    assert state == {
        "expected": str(expected),
        "active": str(active),
        "consumed": str(consumed),
        "allow": "0",
    }
    assert "--allow-daemon-runtime-restart" not in args_path.read_text(
        encoding="utf-8"
    ).splitlines()
    restart_events = [
        event
        for event in events
        if event.startswith("systemctl restart trex-daemon-server.service ")
    ]
    assert sum("journal=absent" in event for event in restart_events) == (
        pre_journal_restarts
    )
    assert sum("journal=present" in event for event in restart_events) == (
        post_journal_restarts
    )
    assert all(
        "allow=0" in event
        for event in restart_events
        if "journal=present" in event
    )
    marker_events = [
        event
        for event in events
        if event.startswith("release-engine mark-daemon-mutation-started ")
    ]
    assert len(marker_events) == marker_calls
    assert all("allow=0" in event and "journal=present" in event for event in marker_events)
    rollback_events = [
        event for event in events if event.startswith("release-engine rollback ")
    ]
    assert len(rollback_events) == 1
    assert "allow=0" in rollback_events[0] and "journal=present" in rollback_events[0]


def test_archive_override_restart_must_converge_before_journal(
    tmp_path: Path,
) -> None:
    result, events_path, args_path, state_path = _run_archive_daemon_override_wrapper(
        tmp_path, "restart-still-unsafe"
    )

    assert result.returncode != 0
    assert "did not converge the daemon to safe restart state" in result.stderr
    events = events_path.read_text(encoding="utf-8").splitlines()
    restart_events = [
        event
        for event in events
        if event.startswith("systemctl restart trex-daemon-server.service ")
    ]
    assert len(restart_events) == 1
    assert "allow=1" in restart_events[0] and "journal=absent" in restart_events[0]
    assert not any(event.startswith("release-engine ") for event in events)
    assert not args_path.exists()
    assert not state_path.exists()
    assert not (tmp_path / "restart-still-unsafe" / "transaction.json").exists()


def test_legacy_snapshot_makes_first_migration_crash_serviceable(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    install = engine.install_root
    (install / "apps" / "api").mkdir(parents=True)
    (install / "apps" / "api" / "app.py").write_text("RELEASE = 'legacy'\n")
    (install / "profiles").mkdir()
    (install / "profiles" / "legacy.yaml").write_text("- duration: 1\n")
    (install / ".env").write_text("TREX_WEBUI_TEST_VALUE=legacy\n")
    (install / ".env").chmod(0o640)
    runtime = add_runtime(install)
    static = tmp_path / "legacy-static"
    static.mkdir()
    (static / "index.html").write_text("legacy\n")
    for directory in (install / "apps", install / "apps" / "api", install / "profiles", static):
        directory.chmod(0o755)
    for path in (
        install / "apps" / "api" / "app.py",
        install / "profiles" / "legacy.yaml",
        static / "index.html",
    ):
        path.chmod(0o644)

    snapshot = tmp_path / "staging" / "legacy-baseline"
    snapshot.parent.mkdir()
    snapshot.parent.chmod(0o700)
    previous_umask = os.umask(0o077)
    try:
        result = engine.snapshot_legacy(
            destination=snapshot,
            static_root=static,
            runtime_root=runtime,
        )
    finally:
        os.umask(previous_umask)
    assert result["digest"]
    for service_ancestor in (
        snapshot,
        snapshot / "apps",
        snapshot / "apps" / "web",
    ):
        assert stat.S_IMODE(service_ancestor.stat().st_mode) == 0o755
    baseline, baseline_digest = select_release(engine, snapshot)
    assert baseline["phase"] == "committed"

    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    candidate = engine.releases_root / f"sha256-{candidate_digest}"
    engine.attach_dotenv(
        transaction_id=str(prepared["transaction_id"]),
        source=(engine.install_root / "current" / ".env").resolve(),
    )
    add_runtime(candidate)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))

    # Models SIGKILL after the stable API/Nginx config was published but before
    # the outer archive transaction committed: both consumers currently work.
    assert (engine.install_root / "current" / ".venv" / "bin" / "python").is_file()
    assert (engine.install_root / "current" / "apps" / "web" / "dist" / "index.html").is_file()

    recovered = make_engine(tmp_path)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert_selected(recovered, current=baseline_digest, previous=None)
    assert (recovered.install_root / "current" / ".venv" / "bin" / "python").is_file()
    assert (
        recovered.install_root
        / "current"
        / "apps"
        / "web"
        / "dist"
        / "index.html"
    ).read_text() == "legacy\n"
    assert (recovered.install_root / "current" / ".env").read_text() == (
        "TREX_WEBUI_TEST_VALUE=legacy\n"
    )


@pytest.mark.parametrize(
    "failpoint,relative,new_content",
    [
        ("after_legacy_api_copy", "apps/api/app.py", "api changed\n"),
        ("after_legacy_static_copy", "static/index.html", "static changed\n"),
        ("after_legacy_profiles_copy", "profiles/legacy.yaml", "profile changed\n"),
        ("after_legacy_runtime_copy", ".venv/pkg.py", "runtime changed\n"),
        ("after_legacy_dotenv_copy", ".env", "TREX_WEBUI_TEST_VALUE=changed\n"),
    ],
)
def test_legacy_snapshot_rejects_mid_copy_source_drift_before_publication(
    tmp_path: Path,
    failpoint: str,
    relative: str,
    new_content: str,
) -> None:
    target: Path | None = None

    def mutate(observed: str) -> None:
        if observed == failpoint:
            assert target is not None
            target.write_text(new_content, encoding="utf-8")

    engine = make_engine(tmp_path, fault_hook=mutate)
    install = engine.install_root
    api = install / "apps" / "api"
    profiles = install / "profiles"
    api.mkdir(parents=True)
    profiles.mkdir()
    (api / "app.py").write_text("api original\n", encoding="utf-8")
    (profiles / "legacy.yaml").write_text("profile original\n", encoding="utf-8")
    runtime = add_runtime(install)
    (runtime / "pkg.py").write_text("runtime original\n", encoding="utf-8")
    (runtime / "pkg.py").chmod(0o644)
    dotenv = install / ".env"
    dotenv.write_text("TREX_WEBUI_TEST_VALUE=original\n", encoding="utf-8")
    dotenv.chmod(0o640)
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("static original\n", encoding="utf-8")
    for directory in (install / "apps", api, profiles, static):
        directory.chmod(0o755)
    for path in (
        api / "app.py",
        profiles / "legacy.yaml",
        static / "index.html",
    ):
        path.chmod(0o644)
    targets = {
        "apps/api/app.py": api / "app.py",
        "static/index.html": static / "index.html",
        "profiles/legacy.yaml": profiles / "legacy.yaml",
        ".venv/pkg.py": runtime / "pkg.py",
        ".env": dotenv,
    }
    target = targets[relative]
    destination = tmp_path / "snapshot" / "legacy"
    destination.parent.mkdir()
    destination.parent.chmod(0o700)

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="changed while the legacy rollback baseline was copied",
    ):
        engine.snapshot_legacy(
            destination=destination,
            static_root=static,
            runtime_root=runtime,
            reserve_bytes=0,
        )

    assert not destination.exists()
    assert not engine.transaction_path.exists()
    assert_selected(engine, current=None, previous=None)


@pytest.mark.parametrize(
    "relative,new_content",
    [
        ("profiles/legacy.yaml", "post-restart profile\n"),
        (".venv/pkg.py", "post-restart runtime\n"),
        (".env", "TREX_WEBUI_TEST_VALUE=post_restart\n"),
    ],
)
def test_post_restart_legacy_verifier_rejects_snapshot_drift(
    tmp_path: Path,
    relative: str,
    new_content: str,
) -> None:
    engine = make_engine(tmp_path)
    install = engine.install_root
    api = install / "apps" / "api"
    profiles = install / "profiles"
    api.mkdir(parents=True)
    profiles.mkdir()
    (api / "app.py").write_text("api original\n", encoding="utf-8")
    (profiles / "legacy.yaml").write_text("profile original\n", encoding="utf-8")
    runtime = add_runtime(install)
    (runtime / "pkg.py").write_text("runtime original\n", encoding="utf-8")
    (runtime / "pkg.py").chmod(0o644)
    dotenv = install / ".env"
    dotenv.write_text("TREX_WEBUI_TEST_VALUE=original\n", encoding="utf-8")
    dotenv.chmod(0o640)
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("static original\n", encoding="utf-8")
    for directory in (install / "apps", api, profiles, static):
        directory.chmod(0o755)
    for path in (
        api / "app.py",
        profiles / "legacy.yaml",
        static / "index.html",
    ):
        path.chmod(0o644)
    snapshot = tmp_path / "snapshot" / "legacy"
    snapshot.parent.mkdir()
    snapshot.parent.chmod(0o700)
    engine.snapshot_legacy(
        destination=snapshot,
        static_root=static,
        runtime_root=runtime,
        reserve_bytes=0,
    )

    targets = {
        "profiles/legacy.yaml": profiles / "legacy.yaml",
        ".venv/pkg.py": runtime / "pkg.py",
        ".env": dotenv,
    }
    targets[relative].write_text(new_content, encoding="utf-8")

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="snapshot differs",
    ):
        engine.verify_legacy_snapshot(
            snapshot=snapshot,
            static_root=static,
            runtime_root=runtime,
        )

    assert not engine.transaction_path.exists()
    assert_selected(engine, current=None, previous=None)


def test_upgrade_reverifies_all_legacy_authorities_after_second_cold_restart() -> None:
    script = (PROJECT_ROOT / "deploy" / "upgrade.sh").read_text(encoding="utf-8")
    function = script.split("prepare_legacy_baseline() {", 1)[1].split(
        "\nactivate_versioned_release() {", 1
    )[0]
    snapshot_index = function.index("release_engine snapshot-legacy")
    restart_index = function.index(
        "restart_legacy_api_and_prove_disk_authority", snapshot_index
    )
    exact_verify_index = function.index(
        "release_engine verify-legacy-snapshot", restart_index
    )
    prepare_index = function.index("release_engine prepare --source", exact_verify_index)

    assert snapshot_index < restart_index < exact_verify_index < prepare_index


def test_candidate_dotenv_is_bounded_and_requires_private_mode(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    source, _digest = make_release_source(tmp_path, "dotenv")
    prepared = engine.prepare(source, reserve_bytes=0)
    dotenv = tmp_path / "operator.env"
    dotenv.write_text("TREX_WEBUI_TEST_VALUE=preserved\n")
    dotenv.chmod(0o644)

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="regular 0640",
    ):
        engine.attach_dotenv(
            transaction_id=str(prepared["transaction_id"]),
            source=dotenv,
        )

    dotenv.chmod(0o640)
    attached = engine.attach_dotenv(
        transaction_id=str(prepared["transaction_id"]),
        source=dotenv,
    )
    candidate = engine.releases_root / f"sha256-{prepared['candidate']}" / ".env"
    assert attached["size"] == len("TREX_WEBUI_TEST_VALUE=preserved\n")
    assert candidate.read_text() == "TREX_WEBUI_TEST_VALUE=preserved\n"
    assert stat.S_IMODE(candidate.stat().st_mode) == 0o640


@pytest.mark.skipif(os.geteuid() != 0, reason="requires a real non-privileged uid")
def test_legacy_dotenv_keeps_service_group_and_settings_semantics(
    tmp_path: Path,
) -> None:
    if shutil.which("runuser") is None:
        pytest.skip("runuser is unavailable")
    try:
        service_user = pwd.getpwnam(release_transaction.SERVICE_GROUP_NAME)
        service_group = grp.getgrnam(release_transaction.SERVICE_GROUP_NAME)
    except KeyError:
        pytest.skip("trex-webui service identity is unavailable")
    assert service_user.pw_gid == service_group.gr_gid

    engine = make_engine(tmp_path, expected_gid=service_group.gr_gid)
    install = engine.install_root
    (install / "apps" / "api").mkdir(parents=True)
    (install / "apps" / "api" / "app.py").write_text("legacy\n")
    runtime = add_runtime(install)
    static = tmp_path / "legacy-static"
    static.mkdir()
    (static / "index.html").write_text("legacy\n")
    dotenv = install / ".env"
    dotenv.write_text("TREX_WEBUI_TREX_HOST=192.0.2.77\n")
    os.chown(dotenv, 0, service_group.gr_gid)
    dotenv.chmod(0o640)
    for directory in (install / "apps", install / "apps" / "api", static):
        directory.chmod(0o755)
    for path in (install / "apps" / "api" / "app.py", static / "index.html"):
        path.chmod(0o644)

    snapshot = tmp_path / "snapshot" / "legacy"
    snapshot.parent.mkdir()
    snapshot.parent.chmod(0o755)
    engine.snapshot_legacy(
        destination=snapshot,
        static_root=static,
        runtime_root=runtime,
        reserve_bytes=0,
    )
    _committed, digest = select_release(engine, snapshot)
    selected_dotenv = engine.releases_root / f"sha256-{digest}" / ".env"
    assert selected_dotenv.stat().st_gid == service_group.gr_gid
    assert stat.S_IMODE(selected_dotenv.stat().st_mode) == 0o640

    changed_modes: list[tuple[Path, int]] = []
    ancestor = selected_dotenv.parent
    while ancestor != ancestor.parent:
        original = stat.S_IMODE(ancestor.stat().st_mode)
        if not (original & stat.S_IXOTH):
            changed_modes.append((ancestor, original))
            ancestor.chmod(original | stat.S_IXOTH)
        ancestor = ancestor.parent
    script = """
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from app.core import settings
settings.PROJECT_DOTENV = Path(sys.argv[2])
print(settings.TrexEnvironment.from_env().host)
"""
    try:
        result = subprocess.run(
            [
                "runuser",
                "-u",
                release_transaction.SERVICE_GROUP_NAME,
                "--",
                "env",
                "-u",
                "TREX_WEBUI_TREX_HOST",
                "python3.11",
                "-c",
                script,
                str(PROJECT_ROOT / "apps" / "api"),
                str(selected_dotenv),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    finally:
        for path, mode in reversed(changed_modes):
            path.chmod(mode)
    assert result.stdout.strip() == "192.0.2.77"


def test_runtime_symlink_is_preserved_without_dereferencing(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    source, digest = make_release_source(tmp_path, "runtime-link")
    external = tmp_path / "trusted-python"
    external.write_text("#!/bin/sh\nexit 0\n")
    external.chmod(0o755)
    add_runtime(source, external_python=external)

    prepared = engine.prepare(source, reserve_bytes=0)
    staged_python = (
        engine.releases_root / f"sha256-{digest}" / ".venv" / "bin" / "python"
    )
    assert prepared["phase"] == "prepared"
    assert staged_python.is_symlink()
    assert os.readlink(staged_python) == os.fspath(external)


def test_runtime_symlink_to_writable_authority_is_rejected(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    source, _digest = make_release_source(tmp_path, "unsafe-runtime-link")
    external = tmp_path / "writable-python"
    external.write_text("#!/bin/sh\nexit 0\n")
    external.chmod(0o777)
    add_runtime(source, external_python=external)

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="can be replaced|writable or unowned",
    ):
        engine.prepare(source, reserve_bytes=0)


def test_selector_publication_fsyncs_install_root(tmp_path: Path) -> None:
    engine = make_engine(tmp_path)
    source, _digest = make_release_source(tmp_path, "fsync")
    prepared = engine.prepare(source, reserve_bytes=0)
    observed: list[Path] = []
    original = engine._fsync_directory

    def record(path: Path) -> None:
        observed.append(path)
        original(path)

    engine._fsync_directory = record
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))
    assert observed.count(engine.install_root) >= 1


def test_reconciler_guard_preserves_live_candidate_and_boot_recovers(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "old")
    candidate_source, candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    engine.arm_consumers(str(prepared["transaction_id"]), consumers=())
    engine.activate(str(prepared["transaction_id"]))

    lock_authority = tmp_path / "run" / "lock"
    lock_authority.mkdir(parents=True)
    lock_authority.chmod(0o755)
    deployment_lock = lock_authority / "trex-webui" / "deploy.lock"
    with engine.deployment_guard(deployment_lock) as acquired:
        assert acquired is True
    inode_before = deployment_lock.stat().st_ino
    descriptor = os.open(deployment_lock, os.O_RDWR | os.O_CLOEXEC)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        for _consumer in ("api", "nginx", "daemon"):
            with engine.deployment_guard(deployment_lock) as acquired:
                assert acquired is False
            assert_selected(engine, current=candidate_digest, previous=old_digest)
            assert deployment_lock.stat().st_ino == inode_before
    finally:
        os.close(descriptor)

    recovered = make_engine(tmp_path)
    with recovered.deployment_guard(deployment_lock) as acquired:
        assert acquired is True
        state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert_selected(recovered, current=old_digest, previous=None)
    assert deployment_lock.stat().st_ino == inode_before


def test_reconciler_boot_creates_missing_lock_parent_and_second_upgrade_works(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    first_source, first_digest = make_release_source(tmp_path, "first")
    second_source, second_digest = make_release_source(tmp_path, "second")
    deployment_lock = tmp_path / "fresh-run" / "lock" / "trex-webui" / "deploy.lock"
    deployment_lock.parent.parent.mkdir(parents=True)
    deployment_lock.parent.parent.chmod(0o755)

    assert not deployment_lock.parent.exists()
    with engine.deployment_guard(deployment_lock) as acquired:
        assert acquired is True
        assert engine.reconcile() is None
    assert deployment_lock.parent.is_dir()
    assert stat.S_IMODE(deployment_lock.parent.stat().st_mode) == 0o700
    assert stat.S_IMODE(deployment_lock.stat().st_mode) == 0o600
    first, _ = select_release(engine, first_source)
    assert first["phase"] == "committed"
    second, _ = select_release(engine, second_source)
    assert second["phase"] == "committed"
    assert_selected(engine, current=second_digest, previous=first_digest)


def test_operator_n_minus_one_entry_has_guarded_terminal_contract() -> None:
    content = (PROJECT_ROOT / "deploy" / "upgrade.sh").read_text(encoding="utf-8")
    assert "--rollback-previous" in content
    for operation in (
        "trex_acquire_deployment_lock",
        "prepare_previous_release",
        "stop_versioned_release_consumers_for_selector_mutation",
        "post_stop_previous_release_runtime_preflight",
        "activate_versioned_release",
        "verify_previous_release_readiness",
        "commit_versioned_release",
        "rollback_versioned_release",
    ):
        assert operation in content


def _rollback_runtime_payloads() -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    runtime = {
        "ok": True,
        "data": {
            "live_state_sampled": True,
            "mutation_intent": None,
            "session": None,
            "available_ports": [0, 1],
            "port_states": [
                {"port": 0, "state": "stopped", "ownership": "none"},
                {"port": 1, "state": "stopped", "ownership": "none"},
            ],
        },
    }
    capture = {
        "ok": True,
        "data": {
            "captures": [],
            "port_usage": [],
            "service_mode": {"managed_capture_ids": []},
        },
    }
    quick = {
        "ok": True,
        "data": {"active": False, "recovery_required": False},
    }
    return runtime, capture, quick


def _run_rollback_runtime_validator(
    runtime: dict[str, object],
    capture: dict[str, object],
    quick: dict[str, object],
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "bash",
            "-c",
            'source "$1/deploy/upgrade.sh"; '
            'validate_previous_release_runtime_evidence "$2" "$3" "$4"',
            "runtime-validator",
            str(PROJECT_ROOT),
            json.dumps(runtime, separators=(",", ":")),
            json.dumps(capture, separators=(",", ":")),
            json.dumps(quick, separators=(",", ":")),
        ],
        capture_output=True,
        text=True,
    )


def test_operator_n_minus_one_runtime_preflight_accepts_exact_idle_evidence() -> None:
    runtime, capture, quick = _rollback_runtime_payloads()
    result = _run_rollback_runtime_validator(runtime, capture, quick)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "mutation",
    [
        "active_session",
        "unknown_port",
        "managed_owner",
        "mutation_recovery",
        "active_capture",
        "quick_recovery",
        "missing_port_usage",
        "missing_service_mode",
        "missing_managed_capture_ids",
    ],
)
def test_operator_n_minus_one_runtime_preflight_fails_closed(mutation: str) -> None:
    runtime, capture, quick = _rollback_runtime_payloads()
    if mutation == "active_session":
        runtime["data"]["session"] = {"state": "running"}  # type: ignore[index]
    elif mutation == "unknown_port":
        runtime["data"]["port_states"][0]["state"] = "unknown"  # type: ignore[index]
    elif mutation == "managed_owner":
        runtime["data"]["port_states"][0]["ownership"] = "managed"  # type: ignore[index]
    elif mutation == "mutation_recovery":
        runtime["data"]["mutation_intent"] = {"phase": "cleanup_required"}  # type: ignore[index]
    elif mutation == "active_capture":
        capture["data"]["captures"] = [{"id": 7}]  # type: ignore[index]
    elif mutation == "quick_recovery":
        quick["data"]["recovery_required"] = True  # type: ignore[index]
    elif mutation == "missing_port_usage":
        del capture["data"]["port_usage"]  # type: ignore[index]
    elif mutation == "missing_service_mode":
        del capture["data"]["service_mode"]  # type: ignore[index]
    else:
        del capture["data"]["service_mode"]["managed_capture_ids"]  # type: ignore[index]
    result = _run_rollback_runtime_validator(runtime, capture, quick)
    assert result.returncode != 0
    assert "N-1 rollback runtime preflight failed" in result.stderr


def test_operator_n_minus_one_wrapper_swaps_and_commits_real_selectors(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    first_source, first_digest = make_release_source(tmp_path, "first")
    second_source, second_digest = make_release_source(tmp_path, "second")
    add_runtime(first_source)
    add_runtime(second_source)
    select_release(engine, first_source)
    select_release(engine, second_source)
    script = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
INSTALL_ROOT="$2"
RELEASE_STATE_ROOT="$3"
RELEASE_RECONCILER_TARGET="$1/deploy/release_transaction.py"
ROLLBACK_PREVIOUS=1
DRY_RUN=0
preflight_previous_release_consumers() { :; }
arm_installed_release_reconciler() { :; }
preflight_previous_release_runtime() { :; }
cold_restart_forward_daemon_for_previous_release() { :; }
prelabel_versioned_release_for_selinux() { :; }
stop_versioned_release_consumers_for_selector_mutation() {
  ARCHIVE_API_MUTATION_GUARD_APPLIED=1
  ROLLBACK_NGINX_MUTATION_GUARD_APPLIED=1
}
post_stop_previous_release_runtime_preflight() { :; }
verify_previous_release_readiness() {
  [[ "$(readlink -- "$INSTALL_ROOT/current")" == "releases/sha256-$RELEASE_CANDIDATE_DIGEST" ]]
}
run_previous_release_rollback
release_engine status
'''
    result = subprocess.run(
        [
            "bash",
            "-c",
            script,
            "rollback-test",
            str(PROJECT_ROOT),
            str(engine.install_root),
            str(engine.state_root),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    status = json.loads(result.stdout.splitlines()[-1])
    assert status["transaction"]["phase"] == "committed"
    assert status["transaction"]["candidate"] == first_digest
    assert_selected(engine, current=first_digest, previous=second_digest)


def test_reconciler_unit_orders_recovery_before_services() -> None:
    content = UNIT_PATH.read_text(encoding="utf-8")
    assert "Before=trex-webui-api.service nginx.service" in content
    assert "Before=trex-daemon-server.service" not in content
    assert (
        "ExecStart=/usr/bin/python3.11 "
        "/usr/libexec/trex-webui/recovery-v2/release_transaction.py "
        "--deployment-lock /run/lock/trex-webui/deploy.lock "
        "--supervise-errors reconcile"
    ) in content
    assert "ConditionPathExists=" not in content
    assert "Type=oneshot" in content
    assert "TimeoutStartSec=infinity" in content
    assert "StartLimitIntervalSec=0" in content
    assert "RemainAfterExit=yes" not in content
    assert "StateDirectory=trex-webui-deploy" in content
    assert "RuntimeDirectory=" not in content
    assert "ReadWritePaths=/opt/trex-webui /var/lib/trex-webui-deploy /run/lock" in content
    host_restore_paths = (
        "ReadWritePaths=-/etc/nginx/conf.d -/etc/systemd/system "
        "-/etc/systemd/system/nftables.service.d -/etc/logrotate.d "
        "-/etc/trex-webui -/usr/libexec/trex-webui"
    )
    assert host_restore_paths in content
    assert "RestrictAddressFamilies=AF_UNIX AF_INET AF_NETLINK" in content
    deny_privileged = "SystemCallFilter=~@clock @cpu-emulation @debug @module @mount @obsolete @privileged"
    assert deny_privileged in content
    assert content.index(deny_privileged) < content.index("SystemCallFilter=@chown")
    for consumer in (API_UNIT_PATH, DAEMON_UNIT_PATH, NGINX_DROPIN_PATH):
        consumer_content = consumer.read_text(encoding="utf-8")
        assert "Requires=trex-webui-release-reconcile-v2.service" in consumer_content
        assert "After=" in consumer_content
        assert "trex-webui-release-reconcile-v2.service" in consumer_content
    retry_content = RETRY_UNIT_PATH.read_text(encoding="utf-8")
    assert "--retry-on-lock-busy reconcile" in retry_content
    assert "Restart=on-failure" in retry_content
    assert "StartLimitIntervalSec=0" in retry_content
    assert host_restore_paths in retry_content
    assert "RestrictAddressFamilies=AF_UNIX AF_INET AF_NETLINK" in retry_content
    assert deny_privileged in retry_content
    assert retry_content.index(deny_privileged) < retry_content.index(
        "SystemCallFilter=@chown"
    )
    ack_content = ACK_UNIT_PATH.read_text(encoding="utf-8")
    assert "Restart=on-failure" in ack_content
    assert "StartLimitIntervalSec=0" in ack_content
    assert "trex-daemon-server.service" not in ack_content
    for bridge_path in BRIDGE_PATHS:
        bridge_content = bridge_path.read_text(encoding="utf-8")
        assert "ExecStart=\n" in bridge_content
        assert "ExecStart=/usr/bin/true" in bridge_content
        assert "ExecStartPost=\n" in bridge_content
        assert "Restart=no" in bridge_content
        assert "/usr/libexec/trex-webui/release_transaction.py" not in bridge_content


def _run_recovery_v2_handoff_fixture(
    tmp_path: Path,
    legacy_status: dict[str, object],
    candidate_status: dict[str, object],
    *,
    use_installed_v2: bool = False,
) -> subprocess.CompletedProcess[str]:
    archive_root = tmp_path / "archive"
    source_engine = archive_root / "deploy" / "release_transaction.py"
    legacy_engine = tmp_path / "legacy_release_transaction.py"
    source_engine.parent.mkdir(parents=True)
    for path, payload in (
        (legacy_engine, legacy_status),
        (source_engine, candidate_status),
    ):
        path.write_text(
            "#!/usr/bin/env python3.11\n"
            f"print({json.dumps(json.dumps(payload, sort_keys=True))})\n",
            encoding="utf-8",
        )
        path.chmod(0o755)
    script = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
ARCHIVE_SOURCE_ROOT="$2"
LEGACY_RELEASE_RECONCILER_TARGET="$3"
INSTALL_ROOT="$4/install"
RELEASE_STATE_ROOT="$4/state"
RELEASE_RECONCILER_TARGET="$5"
verify_legacy_terminal_handoff_to_v2
trap - EXIT
'''
    return subprocess.run(
        [
            "bash",
            "-c",
            script,
            "handoff-fixture",
            str(PROJECT_ROOT),
            "" if use_installed_v2 else str(archive_root),
            str(legacy_engine),
            str(tmp_path),
            str(source_engine),
        ],
        capture_output=True,
        text=True,
    )


def _terminal_handoff_status(*, phase: str = "rolled_back") -> dict[str, object]:
    current = "a" * 64
    previous = None
    return {
        "schema": "trex-webui-release-selection-status/v1",
        "current": current,
        "previous": previous,
        "transaction": {
            "phase": phase,
            "current_before": current,
            "previous_before": previous,
            "rollback_authority_retired": True,
            "consumer_mutation_armed": False,
            "daemon_mutation_started": False,
            "rollback_restored": False,
            "consumer_active_before": [],
            "consumer_baseline": [],
            "consumer_enable": [],
            "consumer_start": [],
            "host_artifacts": [],
            "native_boundary": None,
        },
    }


def test_recovery_v2_handoff_accepts_identical_retired_terminal_journal(
    tmp_path: Path,
) -> None:
    status = _terminal_handoff_status()
    result = _run_recovery_v2_handoff_fixture(tmp_path, status, status)
    assert result.returncode == 0, result.stderr


def test_recovery_v2_handoff_uses_installed_engine_for_n_minus_one_rollback(
    tmp_path: Path,
) -> None:
    status = _terminal_handoff_status()
    result = _run_recovery_v2_handoff_fixture(
        tmp_path,
        status,
        status,
        use_installed_v2=True,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("failure", ["divergent", "nonterminal", "retained"])
def test_recovery_v2_handoff_rejects_unsafe_migration_state(
    tmp_path: Path, failure: str
) -> None:
    legacy = _terminal_handoff_status()
    candidate = json.loads(json.dumps(legacy))
    transaction = candidate["transaction"]
    assert isinstance(transaction, dict)
    if failure == "divergent":
        candidate["previous"] = "b" * 64
    elif failure == "nonterminal":
        transaction["phase"] = "activated"
    else:
        transaction["consumer_mutation_armed"] = True
    result = _run_recovery_v2_handoff_fixture(tmp_path, legacy, candidate)
    assert result.returncode != 0
    assert "terminal handoff precondition failed" in result.stderr


def test_upgrade_publishes_v2_only_after_v1_terminal_migration_gate() -> None:
    source = (PROJECT_ROOT / "deploy" / "upgrade.sh").read_text(encoding="utf-8")
    bootstrap = source[
        source.index("bootstrap_release_reconciler() {") : source.index("have_cmd() {")
    ]
    assert bootstrap.index("preflight_recovery_v2_migration") < bootstrap.index(
        "/usr/bin/python3 \"$source_bootstrap\""
    )
    assert bootstrap.index(
        '"$source_reconcile_bridge::$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET::0644"'
    ) < bootstrap.index(
        '"$source_dropin::$RELEASE_RECONCILER_API_DROPIN_TARGET::0644"'
    )
    preflight = source[
        source.index("preflight_recovery_v2_migration() {") : source.index(
            "bootstrap_release_reconciler() {"
        )
    ]
    assert preflight.index("verify_legacy_release_infrastructure_exact") < preflight.index(
        "assert_legacy_release_units_quiescent"
    ) < preflight.index("verify_legacy_terminal_handoff_to_v2")
    legacy_probe = source[
        source.index("legacy_release_infrastructure_present() {") : source.index(
            "verify_legacy_release_infrastructure_exact() {"
        )
    ]
    assert '"$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST"' in legacy_probe
    assert '"$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"' in legacy_probe
    arm = source[
        source.index("arm_installed_release_reconciler() {") : source.index(
            "assert_loaded_release_infrastructure_unit() {"
        )
    ]
    assert arm.index("verify_legacy_terminal_handoff_to_v2") < arm.index(
        "assert_legacy_release_units_quiescent"
    ) < arm.index("systemctl daemon-reload")
    install_source = (PROJECT_ROOT / "deploy" / "install.sh").read_text(
        encoding="utf-8"
    )
    installer = install_source[
        install_source.index("install_release_reconciler() {") : install_source.index(
            "install_packages() {"
        )
    ]
    assert '"$RELEASE_STATE_ROOT/infrastructure-managed-local.json"' in installer
    assert (
        '"$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT/'
        'trex-webui-release-reconcile.conf"'
    ) in installer
    assert installer.index("recovery ABI v1 must be migrated") < installer.index(
        'install -d -o root -g root -m 0755'
    )


def test_supervised_reconcile_retries_raw_exceptions_in_same_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts: list[tuple[int, tuple[str, ...]]] = []
    failures: list[Exception] = [
        OSError("injected filesystem race"),
        subprocess.CalledProcessError(1, ["systemctl", "daemon-reload"]),
    ]

    def fake_main(argv: list[str] | None = None) -> int:
        attempts.append((os.getpid(), tuple(argv or ())))
        if failures:
            raise failures.pop(0)
        return 0

    monkeypatch.setattr(release_transaction, "main", fake_main)
    monkeypatch.setattr(release_transaction.time, "sleep", lambda _delay: None)

    result = release_transaction.run_cli(
        [
            "--deployment-lock",
            "/run/lock/trex-webui/deploy.lock",
            "--supervise-errors",
            "reconcile",
        ]
    )

    assert result == 0
    assert len(attempts) == 3
    assert {pid for pid, _argv in attempts} == {os.getpid()}


@pytest.mark.parametrize("fault_after", [0, 1, 2])
def test_fixed_abi_bootstrap_faults_never_publish_dropin_before_prerequisites(
    tmp_path: Path,
    fault_after: int,
) -> None:
    source_root = tmp_path / "source"
    target_root = tmp_path / "targets"
    state_root = tmp_path / "state"
    source_root.mkdir(mode=0o700)
    target_root.mkdir(mode=0o755)
    state_root.mkdir(mode=0o700)
    sources = [source_root / name for name in ("engine", "unit", "dropin")]
    targets = [target_root / name for name in ("engine", "unit", "dropin")]
    for index, source in enumerate(sources):
        source.write_bytes(f"artifact-{index}\n".encode())
        source.chmod(0o755 if index == 0 else 0o644)
    manifest = state_root / "infrastructure.json"
    arguments = [
        str(BOOTSTRAP_PATH),
        "--manifest",
        str(manifest),
        "--artifact",
        f"{sources[0]}::{targets[0]}::0755",
        "--artifact",
        f"{sources[1]}::{targets[1]}::0644",
        "--consumer-dropin",
        f"{sources[2]}::{targets[2]}::0644",
    ]

    crashed = subprocess.run(
        [*arguments, "--fault-after", str(fault_after)],
        capture_output=True,
        text=True,
    )

    assert crashed.returncode == 91
    assert targets[0].is_file()
    assert targets[1].is_file() is (fault_after >= 1)
    assert targets[2].is_file() is (fault_after >= 2)
    if targets[2].exists():
        assert all(target.exists() for target in targets[:2])
    assert not manifest.exists()

    completed = subprocess.run(arguments, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
    assert all(target.is_file() for target in targets)
    assert manifest.is_file()
    verified = subprocess.run(
        [
            str(BOOTSTRAP_PATH),
            "--manifest",
            str(manifest),
            "--verify-installed",
            "--expected",
            f"{targets[0]}::0755::prerequisite",
            "--expected",
            f"{targets[1]}::0644::prerequisite",
            "--expected",
            f"{targets[2]}::0644::consumer-dropin",
        ],
        capture_output=True,
        text=True,
    )
    assert verified.returncode == 0, verified.stderr


def test_fixed_abi_bootstrap_rejects_foreign_legacy_target_without_mutation(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    target_root = tmp_path / "targets"
    state_root = tmp_path / "state"
    source_root.mkdir(mode=0o700)
    target_root.mkdir(mode=0o755)
    state_root.mkdir(mode=0o700)
    source = source_root / "engine"
    target = target_root / "engine"
    source.write_text("fixed-v1\n", encoding="utf-8")
    source.chmod(0o755)
    target.write_text("foreign-legacy\n", encoding="utf-8")
    target.chmod(0o755)
    manifest = state_root / "infrastructure.json"

    result = subprocess.run(
        [
            str(BOOTSTRAP_PATH),
            "--manifest",
            str(manifest),
            "--artifact",
            f"{source}::{target}::0755",
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "refusing to mix" in result.stderr
    assert target.read_text(encoding="utf-8") == "foreign-legacy\n"
    assert not manifest.exists()


@pytest.mark.parametrize("contract_case", ["missing", "extra", "wrong-class"])
def test_fixed_abi_verify_requires_exact_profile_contract(
    tmp_path: Path,
    contract_case: str,
) -> None:
    source_root = tmp_path / "source"
    target_root = tmp_path / "targets"
    state_root = tmp_path / "state"
    source_root.mkdir(mode=0o700)
    target_root.mkdir(mode=0o755)
    state_root.mkdir(mode=0o700)
    engine_source = source_root / "engine"
    dropin_source = source_root / "dropin"
    engine_target = target_root / "engine"
    dropin_target = target_root / "dropin"
    engine_source.write_text("engine\n", encoding="utf-8")
    engine_source.chmod(0o755)
    dropin_source.write_text("dropin\n", encoding="utf-8")
    dropin_source.chmod(0o644)
    manifest = state_root / "infrastructure.json"
    published = subprocess.run(
        [
            str(BOOTSTRAP_PATH),
            "--manifest",
            str(manifest),
            "--artifact",
            f"{engine_source}::{engine_target}::0755",
            "--consumer-dropin",
            f"{dropin_source}::{dropin_target}::0644",
        ],
        capture_output=True,
        text=True,
    )
    assert published.returncode == 0, published.stderr
    expected = [
        f"{engine_target}::0755::prerequisite",
        f"{dropin_target}::0644::consumer-dropin",
    ]
    if contract_case == "missing":
        expected.pop()
    elif contract_case == "extra":
        expected.append(f"{target_root / 'extra'}::0644::prerequisite")
    else:
        expected[1] = f"{dropin_target}::0644::prerequisite"
    arguments = [
        str(BOOTSTRAP_PATH),
        "--manifest",
        str(manifest),
        "--verify-installed",
    ]
    for record in expected:
        arguments.extend(("--expected", record))

    result = subprocess.run(arguments, capture_output=True, text=True)

    assert result.returncode != 0
    assert "exact expected profile" in result.stderr


@pytest.mark.parametrize("constant", ["NaN", "Infinity", "-Infinity"])
def test_fixed_abi_manifest_rejects_non_finite_json(
    tmp_path: Path,
    constant: str,
) -> None:
    state_root = tmp_path / "state"
    state_root.mkdir(mode=0o700)
    manifest = state_root / "infrastructure.json"
    manifest.write_text(
        '{"artifacts":[],"schema":' + constant + "}\n",
        encoding="utf-8",
    )
    manifest.chmod(0o600)

    result = subprocess.run(
        [
            str(BOOTSTRAP_PATH),
            "--manifest",
            str(manifest),
            "--verify-installed",
            "--expected",
            f"{tmp_path / 'irrelevant'}::0644::prerequisite",
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "non-finite" in result.stderr


@pytest.mark.parametrize(
    "reserved",
    [
        ["--archive", "/tmp/unattested.tar.gz"],
        ["--sha256", "0" * 64],
        ["--rollback-previous"],
    ],
)
def test_verified_upgrade_rejects_attestation_passthrough_overrides(
    reserved: list[str],
) -> None:
    result = subprocess.run(
        [
            str(PROJECT_ROOT / "deploy" / "verified_upgrade.sh"),
            "--tag",
            "v1.0.0",
            "--metadata",
            "/does/not/need/to/exist",
            "--",
            *reserved,
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "reserved by the attested bootstrap" in result.stderr
    assert "GitHub" not in result.stderr


@pytest.mark.parametrize(
    "arguments,option",
    [
        (["--archive", "/tmp/a", "--archive", "/tmp/b"], "--archive"),
        (["--sha256", "0" * 64, "--sha256", "1" * 64], "--sha256"),
        (["--rollback-previous", "--rollback-previous"], "--rollback-previous"),
    ],
)
def test_upgrade_parser_rejects_duplicate_trust_boundary_options(
    arguments: list[str],
    option: str,
) -> None:
    shell_arguments = " ".join(subprocess.list2cmdline([argument]) for argument in arguments)
    result = subprocess.run(
        [
            "bash",
            "-c",
            f'source "$1/deploy/upgrade.sh"; parse_args {shell_arguments}',
            "duplicate-upgrade-option",
            str(PROJECT_ROOT),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert f"{option} may be specified only once" in result.stderr


def test_ci_runs_release_transaction_pytest_as_root() -> None:
    workflow = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )
    assert (
        'sudo env "PATH=$PATH" .venv/bin/python -m pytest -q '
        "deploy/tests/release_transaction_test.py"
    ) in workflow
    assert "sudo apt-get install --yes nginx" in workflow


@pytest.mark.parametrize("child_inherits_lock", [False, True])
def test_independent_retry_recovers_after_outer_sigkill_and_inherited_lock_exit(
    tmp_path: Path,
    child_inherits_lock: bool,
) -> None:
    engine = make_engine(tmp_path)
    baseline_source, baseline_digest = make_release_source(tmp_path, "baseline")
    candidate_source, _candidate_digest = make_release_source(tmp_path, "candidate")
    select_release(engine, baseline_source)
    prepared = engine.prepare(candidate_source, transaction_kind="selector-only")
    transaction_id = str(prepared["transaction_id"])
    engine.arm_consumers(transaction_id, consumers=())
    deployment_lock = tmp_path / "run" / "lock" / "trex-webui" / "deploy.lock"
    deployment_lock.parent.parent.mkdir(parents=True, mode=0o755)
    deployment_lock.parent.parent.chmod(0o755)
    with engine.deployment_guard(deployment_lock) as acquired:
        assert acquired is True

    outer_script = r"""
import fcntl
import os
import subprocess
import sys
import time

lock_path, python, engine, install_root, state_root, transaction_id, inherit, child_done, child_release = sys.argv[1:]
descriptor = os.open(lock_path, os.O_RDWR | os.O_CLOEXEC)
fcntl.flock(descriptor, fcntl.LOCK_EX)
subprocess.run(
    [
        python,
        engine,
        "--install-root",
        install_root,
        "--state-root",
        state_root,
        "activate",
        "--transaction-id",
        transaction_id,
    ],
    check=True,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE,
    text=True,
)
child = None
if inherit == "1":
    child = subprocess.Popen(
        [
            python,
            "-c",
            '''
import pathlib
import sys
import time

done = pathlib.Path(sys.argv[1])
release = pathlib.Path(sys.argv[2])
deadline = time.monotonic() + 10
while not release.is_file():
    if time.monotonic() >= deadline:
        raise SystemExit("timed out waiting for inherited-lock release")
    time.sleep(0.01)
done.write_text(str(time.time_ns()))
''',
            child_done,
            child_release,
        ],
        pass_fds=(descriptor,),
    )
print(f"activated {child.pid if child is not None else 0}", flush=True)
time.sleep(120)
"""
    outer = subprocess.Popen(
        [
            sys.executable,
            "-c",
            outer_script,
            str(deployment_lock),
            sys.executable,
            str(MODULE_PATH),
            str(engine.install_root),
            str(engine.state_root),
            transaction_id,
            "1" if child_inherits_lock else "0",
            str(tmp_path / "inherited-child.done"),
            str(tmp_path / "inherited-child.release"),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    child_pid = 0
    supervisor: subprocess.Popen[str] | None = None
    try:
        assert outer.stdout is not None
        line = outer.stdout.readline().strip()
        assert line.startswith("activated "), (
            line,
            outer.stderr.read() if outer.stderr is not None else "",
        )
        child_pid = int(line.split()[1])
        retry_command = [
            sys.executable,
            str(MODULE_PATH),
            "--install-root",
            str(engine.install_root),
            "--state-root",
            str(engine.state_root),
            "--deployment-lock",
            str(deployment_lock),
            "--retry-on-lock-busy",
            "reconcile",
        ]
        retry_supervisor_script = r"""
import json
import subprocess
import sys
import time

attempt = 0
while True:
    attempt += 1
    result = subprocess.run(sys.argv[1:], capture_output=True, text=True)
    if result.returncode == 75:
        print(json.dumps({"status": "busy", "attempt": attempt, "time_ns": time.time_ns()}), flush=True)
        time.sleep(0.05)
        continue
    print(json.dumps({
        "status": "finished",
        "attempt": attempt,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }), flush=True)
    raise SystemExit(result.returncode)
"""
        supervisor = subprocess.Popen(
            [
                sys.executable,
                "-c",
                retry_supervisor_script,
                *retry_command,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert supervisor.stdout is not None
        first_event = json.loads(supervisor.stdout.readline())
        assert first_event["status"] == "busy"
        events = [first_event]

        killed_at = time.time_ns()
        os.kill(outer.pid, signal.SIGKILL)
        outer.wait(timeout=10)
        if child_inherits_lock:
            while True:
                event = json.loads(supervisor.stdout.readline())
                events.append(event)
                assert event["status"] == "busy"
                if int(event["time_ns"]) > killed_at:
                    break
            (tmp_path / "inherited-child.release").write_text(
                "release\n", encoding="utf-8"
            )

        remaining_stdout, supervisor_stderr = supervisor.communicate(timeout=15)
        events.extend(
            json.loads(event)
            for event in remaining_stdout.splitlines()
            if event.strip()
        )
        assert supervisor.returncode == 0, supervisor_stderr
        finished = [event for event in events if event["status"] == "finished"]
        assert len(finished) == 1
        assert int(finished[0]["attempt"]) >= 2
        assert json.loads(str(finished[0]["stdout"]))["phase"] == "rolled_back"
        assert_selected(engine, current=baseline_digest, previous=None)
        if child_inherits_lock:
            assert (tmp_path / "inherited-child.done").is_file()
            assert any(
                event["status"] == "busy" and int(event["time_ns"]) > killed_at
                for event in events
                if "time_ns" in event
            )
            child_pid = 0
    finally:
        if supervisor is not None and supervisor.poll() is None:
            supervisor.kill()
            supervisor.wait(timeout=10)
        if outer.poll() is None:
            outer.kill()
            outer.wait(timeout=10)
        if child_pid:
            try:
                os.kill(child_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def test_verified_locked_deploy_entrypoints_never_daemonize_descendants() -> None:
    """Inherited lock FDs remain a conservative last-mutator barrier."""

    for path in (
        PROJECT_ROOT / "deploy" / "upgrade.sh",
        PROJECT_ROOT / "deploy" / "install.sh",
        PROJECT_ROOT / "deploy" / "verified_upgrade.sh",
    ):
        source = path.read_text(encoding="utf-8")
        assert re.search(r"\b(?:nohup|setsid|daemonize|disown)\b", source) is None
        assert re.search(r"(?m)(?<!&)&[ \t]*(?:#.*)?$", source) is None
    # This queues work in PID 1; no service process is forked from the locked
    # client and therefore no service can inherit its deployment lock FD.
    upgrade = (PROJECT_ROOT / "deploy" / "upgrade.sh").read_text(encoding="utf-8")
    assert upgrade.count("systemctl start --no-block") == 1


def test_archive_retry_supervisor_recovers_host_native_and_active_subset_after_sigkill(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "opt" / "trex-webui"
    state_root = tmp_path / "var" / "lib" / "trex-webui-deploy"
    install_root.mkdir(parents=True, mode=0o755)
    state_root.parent.mkdir(parents=True, mode=0o755)
    install_root.chmod(0o755)
    state_root.parent.chmod(0o755)
    host_artifact = tmp_path / "etc" / "webui-api.service"
    host_artifact.parent.mkdir(parents=True)
    host_artifact.write_text("baseline host\n", encoding="utf-8")
    host_artifact.chmod(0o644)
    host_baseline = host_artifact.read_bytes()
    host_baseline_stat = host_artifact.lstat()
    native_state = tmp_path / "native-boundary.state"
    native_state.write_text(
        f"{release_transaction.NATIVE_BOUNDARY_HEADER_PREFIX}absent\n",
        encoding="utf-8",
    )
    native_state.chmod(0o600)
    native_baseline = native_state.read_bytes()
    native_helper = tmp_path / "stable-native-boundary.sh"
    native_helper.write_text("#!/bin/sh\n", encoding="ascii")
    native_helper.chmod(0o755)
    active_state = tmp_path / "active.json"
    active_state.write_text(
        '["nginx.service", "trex-daemon-server.service"]\n',
        encoding="utf-8",
    )
    starts = tmp_path / "starts.log"
    stops = tmp_path / "stops.log"
    force_stops = tmp_path / "force-stops.log"

    def read_active() -> set[str]:
        return set(json.loads(active_state.read_text(encoding="utf-8")))

    def write_active(units: set[str]) -> None:
        active_state.write_text(json.dumps(sorted(units)) + "\n", encoding="utf-8")

    def append(path: Path, unit: str) -> None:
        with path.open("a", encoding="utf-8") as stream:
            stream.write(unit + "\n")
            stream.flush()
            os.fsync(stream.fileno())

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        payload = b"archive nginx baseline\n"
        response_path.write_bytes(payload)
        response_path.chmod(0o600)
        return {
            "unit": unit,
            "kind": "nginx",
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }

    def snapshot_native(_helper: Path, destination: Path) -> None:
        destination.write_bytes(native_state.read_bytes())
        destination.chmod(0o600)

    def restore_native(_helper: Path, snapshot: Path) -> None:
        native_state.write_bytes(snapshot.read_bytes())
        native_state.chmod(0o600)

    def verify_native(_helper: Path, snapshot: Path) -> None:
        if native_state.read_bytes() != snapshot.read_bytes():
            raise release_transaction.ReleaseTransactionError(
                "native test authority drifted"
            )

    def stop_consumers(units: tuple[str, ...]) -> None:
        active = read_active()
        for unit in units:
            append(stops, unit)
            active.discard(unit)
        write_active(active)

    def start_consumer(unit: str) -> None:
        append(starts, unit)
        active = read_active()
        active.add(unit)
        write_active(active)

    def ready(record: dict[str, object], root: Path) -> bool:
        unit = str(record["unit"])
        if unit not in read_active():
            return False
        backup = record.get("response_backup")
        return unit != "nginx.service" or (
            isinstance(backup, str)
            and (root / backup).read_bytes() == b"archive nginx baseline\n"
        )

    engine = release_transaction.ReleaseTransactionEngine(
        install_root=install_root,
        state_root=state_root,
        expected_uid=os.geteuid(),
        expected_gid=os.getegid(),
        host_artifact_paths=(host_artifact,),
        consumer_is_active=lambda unit: unit in read_active(),
        consumer_capture=capture,
        consumer_is_ready=ready,
        consumer_stop=stop_consumers,
        consumer_start=start_consumer,
        native_boundary_snapshot=snapshot_native,
        native_boundary_restore=restore_native,
        native_boundary_verify=verify_native,
        native_boundary_helper_source=native_helper,
    )
    engine._host_paths_for_profile = (  # type: ignore[method-assign]
        lambda profile: (host_artifact,) if profile == "managed-local" else ()
    )
    baseline_source, baseline_digest = make_release_source(
        tmp_path, "archive-sigkill-baseline"
    )
    candidate_source, _candidate_digest = make_release_source(
        tmp_path, "archive-sigkill-candidate"
    )
    select_release(engine, baseline_source)
    rollback_plan = (
        "trex-daemon-server.service",
        "trex-webui-api.service",
        "nginx.service",
    )
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        host_profile="managed-local",
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )
    transaction_id = str(prepared["transaction_id"])
    deployment_lock = tmp_path / "run" / "lock" / "trex-webui" / "deploy.lock"
    deployment_lock.parent.parent.mkdir(parents=True, mode=0o755)
    deployment_lock.parent.parent.chmod(0o755)
    harness = tmp_path / "archive_harness.py"
    harness.write_text(
        r'''
import argparse
import hashlib
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--module", type=Path, required=True)
parser.add_argument("--install", type=Path, required=True)
parser.add_argument("--state", type=Path, required=True)
parser.add_argument("--host", type=Path, required=True)
parser.add_argument("--native", type=Path, required=True)
parser.add_argument("--helper", type=Path, required=True)
parser.add_argument("--active", type=Path, required=True)
parser.add_argument("--starts", type=Path, required=True)
parser.add_argument("--stops", type=Path, required=True)
parser.add_argument("--force-stops", type=Path, required=True)
parser.add_argument("--lock", type=Path, required=True)
parser.add_argument("--transaction", required=True)
parser.add_argument("command", choices=("outer", "retry", "ack"))
args = parser.parse_args()
spec = importlib.util.spec_from_file_location("release_harness_module", args.module)
module = importlib.util.module_from_spec(spec)
assert spec is not None and spec.loader is not None
spec.loader.exec_module(module)
plan = (
    "trex-daemon-server.service",
    "trex-webui-api.service",
    "nginx.service",
)

def read_active():
    return set(json.loads(args.active.read_text(encoding="utf-8")))

def write_active(units):
    temporary = args.active.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        stream.write(json.dumps(sorted(units)) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, args.active)

def append(path, unit):
    with path.open("a", encoding="utf-8") as stream:
        stream.write(unit + "\n")
        stream.flush()
        os.fsync(stream.fileno())

def capture(unit, response_path):
    if unit == "trex-daemon-server.service":
        return {
            "unit": unit,
            "kind": "daemon",
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": None,
            "response_sha256": None,
            "response_size": 0,
        }
    payload = b"archive nginx baseline\n"
    descriptor = os.open(response_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(descriptor, payload)
        os.fchmod(descriptor, 0o600)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return {
        "unit": unit,
        "kind": "nginx",
        "working_directory": None,
        "exec_start": None,
        "argv0": None,
        "resolved_exec": None,
        "response_backup": response_path.name,
        "response_sha256": hashlib.sha256(payload).hexdigest(),
        "response_size": len(payload),
    }

def stop(units):
    active = read_active()
    for unit in units:
        append(args.stops, unit)
        active.discard(unit)
    write_active(active)

def force_stop(units):
    active = read_active()
    for unit in units:
        append(args.force_stops, unit)
        active.discard(unit)
    write_active(active)

def start(unit):
    append(args.starts, unit)
    active = read_active()
    active.add(unit)
    write_active(active)

def ready(record, state_root):
    unit = str(record["unit"])
    if unit not in read_active():
        return False
    backup = record.get("response_backup")
    return unit != "nginx.service" or (
        isinstance(backup, str)
        and (state_root / backup).read_bytes() == b"archive nginx baseline\n"
    )

def snapshot_native(_helper, destination):
    destination.write_bytes(args.native.read_bytes())
    destination.chmod(0o600)

def restore_native(_helper, snapshot):
    args.native.write_bytes(snapshot.read_bytes())
    args.native.chmod(0o600)

def verify_native(_helper, snapshot):
    if args.native.read_bytes() != snapshot.read_bytes():
        raise module.ReleaseTransactionError("native test authority drifted")

engine = module.ReleaseTransactionEngine(
    install_root=args.install,
    state_root=args.state,
    expected_uid=os.geteuid(),
    expected_gid=os.getegid(),
    host_artifact_paths=(args.host,),
    consumer_is_active=lambda unit: unit in read_active(),
    consumer_capture=capture,
    consumer_is_ready=ready,
    consumer_stop=stop,
    consumer_force_stop=force_stop,
    consumer_start=start,
    native_boundary_snapshot=snapshot_native,
    native_boundary_restore=restore_native,
    native_boundary_verify=verify_native,
    native_boundary_helper_source=args.helper,
)
engine._host_paths_for_profile = lambda profile: (args.host,) if profile == "managed-local" else ()

if args.command == "outer":
    with engine.deployment_guard(args.lock) as acquired:
        if not acquired:
            raise SystemExit(75)
        engine.arm_consumers(args.transaction, consumers=plan)
        engine.mark_daemon_mutation_started(args.transaction)
        stop(plan)
        args.host.write_text("candidate host\n", encoding="utf-8")
        args.host.chmod(0o600)
        args.native.write_text("candidate native mutation\n", encoding="utf-8")
        os.sync()
        engine.activate(args.transaction)
        print("activated", flush=True)
        time.sleep(120)
elif args.command == "retry":
    with engine.deployment_guard(args.lock) as acquired:
        if not acquired:
            print(json.dumps({"status": "deployment-active"}), flush=True)
            raise SystemExit(75)
        result = engine.reconcile()
    print(json.dumps(result, sort_keys=True), flush=True)
else:
    print(json.dumps(engine.acknowledge_consumers(), sort_keys=True), flush=True)
''',
        encoding="utf-8",
    )
    common = [
        sys.executable,
        str(harness),
        "--module",
        str(MODULE_PATH),
        "--install",
        str(install_root),
        "--state",
        str(state_root),
        "--host",
        str(host_artifact),
        "--native",
        str(native_state),
        "--helper",
        str(native_helper),
        "--active",
        str(active_state),
        "--starts",
        str(starts),
        "--stops",
        str(stops),
        "--force-stops",
        str(force_stops),
        "--lock",
        str(deployment_lock),
        "--transaction",
        transaction_id,
    ]
    outer = subprocess.Popen(
        [*common, "outer"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    supervisor: subprocess.Popen[str] | None = None
    try:
        assert outer.stdout is not None
        assert outer.stdout.readline().strip() == "activated"
        retry_loop = r'''
import json
import os
import subprocess
import sys
import time
attempt = 0
while True:
    attempt += 1
    result = subprocess.run(sys.argv[1:], capture_output=True, text=True)
    if result.returncode == 75:
        print(json.dumps({"status": "busy", "attempt": attempt, "pid": os.getpid()}), flush=True)
        time.sleep(0.05)
        continue
    print(json.dumps({"status": "finished", "attempt": attempt, "pid": os.getpid(), "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}), flush=True)
    raise SystemExit(result.returncode)
'''
        supervisor = subprocess.Popen(
            [sys.executable, "-c", retry_loop, *common, "retry"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert supervisor.stdout is not None
        first = json.loads(supervisor.stdout.readline())
        assert first["status"] == "busy"
        assert int(first["pid"]) == supervisor.pid
        os.kill(outer.pid, signal.SIGKILL)
        outer.wait(timeout=10)
        remaining, supervisor_stderr = supervisor.communicate(timeout=15)
        events = [first, *[json.loads(line) for line in remaining.splitlines()]]
        assert supervisor.returncode == 0, supervisor_stderr
        finished = [event for event in events if event["status"] == "finished"]
        assert len(finished) == 1 and int(finished[0]["attempt"]) >= 2
        assert int(finished[0]["pid"]) == supervisor.pid
        pending = json.loads(str(finished[0]["stdout"]))
        assert pending["phase"] == "starting_baseline_consumers"
        pending_snapshot = state_root / f"host-artifacts-{transaction_id}"
        assert pending_snapshot.is_dir()
        assert host_artifact.read_bytes() == host_baseline
        restored_host_stat = host_artifact.lstat()
        assert (
            stat.S_IMODE(restored_host_stat.st_mode),
            restored_host_stat.st_uid,
            restored_host_stat.st_gid,
        ) == (
            stat.S_IMODE(host_baseline_stat.st_mode),
            host_baseline_stat.st_uid,
            host_baseline_stat.st_gid,
        )
        assert native_state.read_bytes() == native_baseline
        assert_selected(engine, current=baseline_digest, previous=None)
        assert stops.read_text(encoding="utf-8").splitlines() == list(rollback_plan)
        assert force_stops.read_text(encoding="utf-8").splitlines() == list(
            rollback_plan
        )
        assert starts.read_text(encoding="utf-8").splitlines() == [
            "trex-daemon-server.service",
            "nginx.service",
        ]
        assert read_active() == {"trex-daemon-server.service", "nginx.service"}

        acknowledged = subprocess.run(
            [*common, "ack"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        assert acknowledged.returncode == 0, acknowledged.stderr
        terminal = json.loads(acknowledged.stdout)
        assert terminal["phase"] == "rolled_back"
        assert_terminal_authority_retired(terminal)
        assert not pending_snapshot.exists()
    finally:
        if supervisor is not None and supervisor.poll() is None:
            supervisor.kill()
            supervisor.wait(timeout=10)
        if outer.poll() is None:
            outer.kill()
            outer.wait(timeout=10)


def test_continuous_nginx_http_samples_never_mix_release_generations(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Successful stable edge samples are wholly old or wholly candidate.

    Connection failures while Nginx is fenced are an intentional maintenance
    window.  A frontend(A) -> proxied API(B) -> frontend(C) sample that crosses
    a selector boundary (A != C) is ignored; only A == C can claim a stable
    generation and therefore must have B == A.
    """

    import http.server
    import socket
    import threading
    import urllib.request

    nginx = shutil.which("nginx")
    if nginx is None:
        pytest.skip("continuous generation test requires Nginx")
    if os.geteuid() != 0:
        pytest.skip("continuous generation test uses a root Nginx worker in private pytest paths")

    def free_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])

    edge_port = free_port()
    api_port = free_port()
    while api_port == edge_port:
        api_port = free_port()

    engine = make_engine(tmp_path)
    old_source, old_digest = make_release_source(tmp_path, "http-old", size=32)
    candidate_source, candidate_digest = make_release_source(
        tmp_path, "http-new", size=32
    )
    select_release(engine, old_source)
    old_body = (old_source / "apps" / "web" / "dist" / "index.html").read_bytes()
    new_body = (
        candidate_source / "apps" / "web" / "dist" / "index.html"
    ).read_bytes()
    digest_generation = {
        old_digest: "old",
        candidate_digest: "new",
    }

    nginx_root = tmp_path / "nginx"
    nginx_root.mkdir()
    nginx_config = nginx_root / "nginx.conf"
    nginx_config.write_text(
        f"""
user root;
worker_processes 1;
error_log {nginx_root / 'error.log'} notice;
pid {nginx_root / 'nginx.pid'};
events {{ worker_connections 64; }}
http {{
  access_log off;
  sendfile off;
  server {{
    listen 127.0.0.1:{edge_port};
    server_name localhost;
    root {engine.install_root / 'current' / 'apps' / 'web' / 'dist'};
    location = / {{
      add_header Cache-Control "no-store" always;
      try_files /index.html =404;
    }}
    location = /api/identity {{
      proxy_http_version 1.0;
      proxy_set_header Connection close;
      proxy_pass http://127.0.0.1:{api_port}/identity;
    }}
  }}
}}
""",
        encoding="utf-8",
    )
    config_check = subprocess.run(
        [nginx, "-p", str(nginx_root), "-c", str(nginx_config), "-t"],
        capture_output=True,
        text=True,
    )
    assert config_check.returncode == 0, config_check.stderr

    class ReusableServer(http.server.ThreadingHTTPServer):
        allow_reuse_address = True
        daemon_threads = True

    api_server: ReusableServer | None = None
    api_thread: threading.Thread | None = None
    nginx_process: subprocess.Popen[bytes] | None = None
    active: set[str] = set()

    def fetch(path: str, *, timeout: float = 0.5) -> bytes:
        request = urllib.request.Request(
            f"http://127.0.0.1:{edge_port}{path}",
            headers={"Connection": "close", "Cache-Control": "no-cache"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()

    def selected_generation() -> str:
        target = os.readlink(engine.install_root / "current")
        digest = target.removeprefix("releases/sha256-")
        return digest_generation[digest]

    def start_api(generation: str) -> None:
        nonlocal api_server, api_thread
        assert api_server is None and api_thread is None

        class IdentityHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - stdlib handler ABI
                if self.path.split("?", 1)[0] != "/identity":
                    self.send_error(404)
                    return
                payload = generation.encode("ascii")
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, _format: str, *_args: object) -> None:
                return

        api_server = ReusableServer(("127.0.0.1", api_port), IdentityHandler)
        api_thread = threading.Thread(
            target=lambda: api_server.serve_forever(poll_interval=0.01),
            daemon=True,
        )
        api_thread.start()

    def stop_api() -> None:
        nonlocal api_server, api_thread
        if api_server is None:
            return
        api_server.shutdown()
        api_server.server_close()
        assert api_thread is not None
        api_thread.join(timeout=2)
        assert not api_thread.is_alive()
        api_server = None
        api_thread = None

    def start_nginx() -> None:
        nonlocal nginx_process
        assert nginx_process is None
        nginx_process = subprocess.Popen(
            [
                nginx,
                "-p",
                str(nginx_root),
                "-c",
                str(nginx_config),
                "-g",
                "daemon off;",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if nginx_process.poll() is not None:
                stderr = (
                    nginx_process.stderr.read().decode("utf-8", errors="replace")
                    if nginx_process.stderr is not None
                    else ""
                )
                raise AssertionError(f"Nginx exited during start: {stderr}")
            try:
                fetch("/", timeout=0.1)
                return
            except Exception:
                time.sleep(0.01)
        raise AssertionError("Nginx did not expose the release edge")

    def stop_nginx() -> None:
        nonlocal nginx_process
        if nginx_process is None:
            return
        nginx_process.terminate()
        try:
            nginx_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            nginx_process.kill()
            nginx_process.wait(timeout=3)
        nginx_process = None

    def fence(units: tuple[str, ...]) -> None:
        # Production fences the public edge first so no new control or static
        # request can observe the in-progress selector/service transition.
        if "nginx.service" in units:
            stop_nginx()
            active.discard("nginx.service")
        if "trex-webui-api.service" in units:
            stop_api()
            active.discard("trex-webui-api.service")
        time.sleep(0.08)

    def start_consumer(unit: str) -> None:
        if unit == "trex-webui-api.service":
            start_api(selected_generation())
        elif unit == "nginx.service":
            start_nginx()
        else:
            raise AssertionError(f"unexpected HTTP fixture consumer: {unit}")
        active.add(unit)

    def capture(unit: str, response_path: Path) -> dict[str, object]:
        common: dict[str, object] = {
            "unit": unit,
            "working_directory": None,
            "exec_start": None,
            "argv0": None,
            "resolved_exec": None,
            "response_backup": None,
            "response_sha256": None,
            "response_size": 0,
        }
        if unit == "trex-webui-api.service":
            return {
                **common,
                "kind": "api",
                "working_directory": str(engine.install_root / "current"),
                "exec_start": f"{sys.executable} -m fixture_api",
                "argv0": sys.executable,
                "resolved_exec": os.path.realpath(sys.executable),
            }
        response_path.write_bytes(old_body)
        response_path.chmod(0o600)
        return {
            **common,
            "kind": "nginx",
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(old_body).hexdigest(),
            "response_size": len(old_body),
        }

    engine.consumer_is_active = lambda unit: unit in active
    engine.consumer_capture = capture
    engine.consumer_is_ready = lambda record, _root: str(record["unit"]) in active
    engine.consumer_stop = fence
    engine.consumer_force_stop = fence
    engine.consumer_start = start_consumer
    monkeypatch.setattr(engine, "_host_paths_for_profile", lambda _profile: ())

    observations: list[tuple[str, ...]] = []
    stop_polling = threading.Event()

    def poll_edge() -> None:
        sample = 0
        while not stop_polling.is_set():
            sample += 1
            try:
                first = fetch(f"/?sample={sample}-a", timeout=0.2)
                api = fetch(f"/api/identity?sample={sample}", timeout=0.2)
                last = fetch(f"/?sample={sample}-c", timeout=0.2)
            except Exception:
                observations.append(("fenced",))
            else:
                if first != last:
                    observations.append(("boundary",))
                else:
                    frontend = (
                        "old" if first == old_body else "new" if first == new_body else "invalid"
                    )
                    api_identity = api.decode("ascii", errors="replace")
                    observations.append(
                        ("stable", frontend, api_identity)
                        if frontend == api_identity and frontend in {"old", "new"}
                        else ("mixed", frontend, api_identity)
                    )
            time.sleep(0.003)

    def wait_for_stable(generation: str, *, after: int = 0) -> None:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if sum(
                observation == ("stable", generation, generation)
                for observation in observations[after:]
            ) >= 5:
                return
            time.sleep(0.01)
        raise AssertionError(
            f"edge did not expose five stable {generation} samples: {observations[after:]}"
        )

    poller: threading.Thread | None = None
    try:
        start_consumer("trex-webui-api.service")
        start_consumer("nginx.service")
        poller = threading.Thread(target=poll_edge, daemon=True)
        poller.start()
        wait_for_stable("old")

        plan = ("trex-webui-api.service", "nginx.service")
        prepared = engine.prepare(
            candidate_source,
            reserve_bytes=0,
            host_profile="common",
            transaction_kind="archive",
            consumer_rollback_plan=plan,
        )
        transaction_id = str(prepared["transaction_id"])
        engine.arm_consumers(transaction_id, consumers=plan)
        fence(plan)
        engine.activate(transaction_id)
        start_consumer("trex-webui-api.service")
        start_consumer("nginx.service")
        candidate_window = len(observations)
        wait_for_stable("new", after=candidate_window)

        rollback_window = len(observations)
        pending = engine.reconcile()
        assert pending is not None
        assert pending["phase"] == "starting_baseline_consumers"
        wait_for_stable("old", after=rollback_window)
        terminal = engine.acknowledge_consumers()
        assert terminal is not None and terminal["phase"] == "rolled_back"
        assert_selected(engine, current=old_digest, previous=None)
    finally:
        stop_polling.set()
        if poller is not None:
            poller.join(timeout=2)
        stop_nginx()
        stop_api()

    assert not [sample for sample in observations if sample[0] == "mixed"]
    assert {sample[1] for sample in observations if sample[0] == "stable"} == {
        "old",
        "new",
    }
    assert any(sample[0] == "fenced" for sample in observations)


def _run_persisted_runtime_validator(
    state_path: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "bash",
            "-c",
            'source "$1/deploy/upgrade.sh"; '
            'TREX_PERSISTED_STATE_VALIDATOR_TARGET="$1/deploy/trex_persisted_state_contract.py"; '
            'validate_persisted_previous_release_runtime_state '
            '"$2"',
            "persisted-runtime-validator",
            str(PROJECT_ROOT),
            str(state_path),
        ],
        capture_output=True,
        text=True,
    )


def test_post_stop_runtime_validator_accepts_empty_canonical_state(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    state_path.write_text(
        json.dumps(
            {
                "capture_leases": [],
                "connection": None,
                "revision": 0,
                "traffic_groups": [],
                "traffic_mutation_intent": None,
                "traffic_plan_revision": 0,
                "traffic_session": None,
                "updated_at": None,
                "version": 2,
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    result = _run_persisted_runtime_validator(state_path)

    assert result.returncode == 0, result.stderr


def _active_quick_validation_payload() -> dict[str, object]:
    created = "2026-07-31T00:00:00Z"
    return {
        "version": 1,
        "revision": 1,
        "updated_at": created,
        "run": {
            "id": "11111111-1111-4111-8111-111111111111",
            "revision": 1,
            "process_instance_id": "22222222-2222-4222-8222-222222222222",
            "phase": "preflight",
            "group": {
                "group_id": "pair-0",
                "plan_revision": 1,
                "name": "Pair 0",
                "ports": [0],
                "profile_path": "/profiles/udp.py",
                "profile_sha256": None,
                "multiplier": "1kpps",
                "plan_duration": -1,
                "force": False,
                "total": False,
                "synchronized": False,
                "clear_existing": True,
                "tunables": {},
            },
            "config": {
                "path": "/etc/trex_cfg.yaml",
                "port_limit": 1,
                "interfaces": ["0000:01:00.0"],
            },
            "duration_seconds": 1,
            "created_at": created,
            "started_at": None,
            "deadline_at": "2026-07-31T00:00:01Z",
            "watchdog_at": "2026-07-31T00:00:02Z",
            "ended_at": None,
            "traffic_session_id": None,
            "traffic_session_revision": None,
            "traffic_run_id": None,
            "preflight": {
                "observed_at": created,
                "runtime_reconciliation": "idle",
                "live_state_sampled": True,
                "link_states": {"0": "up"},
                "port_statuses": {"0": "idle"},
                "initial_port_states": {"0": "stopped"},
                "initial_port_ownership": {"0": "none"},
                "baseline_counters": {
                    "0": {"tx_packets": 0, "rx_packets": 0}
                },
            },
            "samples": [],
            "pending_terminal": None,
            "recovery_required": False,
            "failure_code": None,
            "failure_detail": None,
            "cleanup": None,
            "idle_verified": False,
        },
    }


def test_post_stop_runtime_validator_rejects_quick_validation_race(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    state_path.write_text(
        json.dumps(
            {
                "capture_leases": [],
                "connection": None,
                "revision": 0,
                "traffic_groups": [],
                "traffic_mutation_intent": None,
                "traffic_plan_revision": 0,
                "traffic_session": None,
                "updated_at": None,
                "version": 2,
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    quick_path = tmp_path / "runtime-state-quick-validation.json"
    quick_path.write_text(
        json.dumps(_active_quick_validation_payload(), separators=(",", ":")),
        encoding="utf-8",
    )

    result = _run_persisted_runtime_validator(state_path)

    assert result.returncode != 0
    assert "quick validation is still active or unknown" in result.stderr


def test_reverse_legacy_rollback_uses_wrapper_runtime_authority(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "legacy-install"
    (install_root / "current" / "apps" / "api").mkdir(parents=True)
    state_path = tmp_path / "runtime-state.json"
    state_path.write_text(
        json.dumps(
            {
                "capture_leases": [],
                "connection": None,
                "revision": 0,
                "traffic_groups": [],
                "traffic_mutation_intent": None,
                "traffic_plan_revision": 0,
                "traffic_session": None,
                "updated_at": None,
                "version": 2,
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    probe = tmp_path / "daemon-probe.py"
    probe.write_text("raise SystemExit(0)\n", encoding="utf-8")
    result = subprocess.run(
        [
            "bash",
            "-c",
            'source "$1/deploy/upgrade.sh"; '
            'PROJECT_ROOT="$1"; INSTALL_ROOT="$2"; DRY_RUN=0; '
            'MANAGE_LOCAL_DAEMON=1; SERVICE_RUNTIME_STATE_PATH="$3"; '
            'DAEMON_RPC_PROBE_TARGET="$4"; '
            'TREX_PERSISTED_STATE_VALIDATOR_TARGET="$1/deploy/trex_persisted_state_contract.py"; '
            "post_stop_previous_release_runtime_preflight",
            "reverse-legacy-validator",
            str(PROJECT_ROOT),
            str(install_root),
            str(state_path),
            str(probe),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_operator_rollback_rejects_external_daemon_mode() -> None:
    result = subprocess.run(
        [
            "bash",
            "-c",
            'source "$1/deploy/upgrade.sh"; '
            "parse_args --rollback-previous --external-daemon",
            "external-rollback-parser",
            str(PROJECT_ROOT),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "requires the installer-managed local daemon" in result.stderr


def _run_prelabel_fixture(
    install_root: Path,
    candidate: Path,
    current_before: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "bash",
            "-c",
            r'''
source "$1/deploy/upgrade.sh"
INSTALL_ROOT="$2"
RELEASE_PROJECT_ROOT="$3"
RELEASE_CURRENT_BEFORE="$4"
RUN_SELINUX=0
DRY_RUN=0
upgrade_selinux_mode() { printf 'Enforcing\n'; }
have_cmd() { return 0; }
semanage() { printf 'semanage %s\n' "$*"; }
matchpathcon() { printf '%s system_u:object_r:httpd_sys_content_t:s0\n' "$1"; }
chmod() { printf 'chmod %s\n' "$*"; }
restorecon() { printf 'restorecon %s\n' "$*"; }
setsebool() { printf 'setsebool %s\n' "$*"; }
prelabel_versioned_release_for_selinux
''',
            "prelabel-fixture",
            str(PROJECT_ROOT),
            str(install_root),
            str(candidate),
            current_before,
        ],
        capture_output=True,
        text=True,
    )


def test_selinux_prelabel_accepts_fresh_install_without_current(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "opt" / "trex-webui"
    candidate = install_root / "releases" / f"sha256-{'c' * 64}"
    (candidate / "apps" / "web" / "dist").mkdir(parents=True)

    result = _run_prelabel_fixture(install_root, candidate, "")

    assert result.returncode == 0, result.stderr
    for service_ancestor in (
        candidate,
        candidate / "apps",
        candidate / "apps" / "web",
    ):
        assert f"chmod 0755 {service_ancestor}" in result.stdout
    assert f"restorecon -RF {candidate}" in result.stdout


def test_versioned_selinux_relabels_complete_release_tree() -> None:
    upgrade = (PROJECT_ROOT / "deploy" / "upgrade.sh").read_text(encoding="utf-8")
    prelabel = upgrade.split("prelabel_versioned_release_for_selinux() {", 1)[1].split(
        "\nprepare_legacy_baseline() {", 1
    )[0]
    assert 'run restorecon -RF "$release_path"' in prelabel
    assert 'run restorecon -RF "$release_path/apps/web/dist"' not in prelabel

    installer = (PROJECT_ROOT / "deploy" / "install.sh").read_text(encoding="utf-8")
    configure = installer.split("configure_selinux() {", 1)[1].split(
        "\nconfigure_firewalld() {", 1
    )[0]
    assert 'run restorecon -RF "$release_path"' in configure
    assert 'run restorecon -RF "$release_path/apps/web/dist"' not in configure


@pytest.mark.parametrize(
    "value",
    [
        "",
        "/usr/bin/python3",
        "{ path=/usr/bin/python3 ; ignore_errors=no }",
        "{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 app.py ; "
        "ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; "
        "pid=invalid ; code=(null) ; status=0/0 }",
    ],
)
def test_systemd_exec_identity_rejects_malformed_values(value: str) -> None:
    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="systemd ExecStart identity",
    ):
        release_transaction._stable_systemd_exec_start(value)


def test_systemd_exec_identity_ignores_only_process_runtime_fields() -> None:
    before = (
        "{ path=/opt/trex-webui/.venv/bin/python ; "
        "argv[]=/opt/trex-webui/.venv/bin/python -m uvicorn app.main:app ; "
        "ignore_errors=no ; start_time=[Sat 2026-08-01 08:02:44 JST] ; "
        "stop_time=[n/a] ; pid=1577952 ; code=(null) ; status=0/0 }"
    )
    after = (
        "{ path=/opt/trex-webui/.venv/bin/python ; "
        "argv[]=/opt/trex-webui/.venv/bin/python -m uvicorn app.main:app ; "
        "ignore_errors=no ; start_time=[Sat 2026-08-01 08:03:32 JST] ; "
        "stop_time=[n/a] ; pid=1579764 ; code=(null) ; status=0/0 }"
    )
    changed_command = after.replace("app.main:app", "other.main:app")

    stable = release_transaction._stable_systemd_exec_start(before)
    assert stable == release_transaction._stable_systemd_exec_start(after)
    assert stable == release_transaction._stable_systemd_exec_start(stable)
    assert release_transaction._stable_systemd_exec_start(
        before
    ) != release_transaction._stable_systemd_exec_start(changed_command)


def _api_consumer_ready_fixture(
    monkeypatch: pytest.MonkeyPatch,
    *,
    working_directory: str,
    exec_start: str,
    main_pid: int,
    argv0: str,
) -> None:
    properties = {
        "WorkingDirectory": working_directory,
        "ExecStart": exec_start,
        "MainPID": str(main_pid),
    }
    proc_cmdline = Path(f"/proc/{main_pid}/cmdline")
    original_read_bytes = Path.read_bytes

    def read_bytes(path: Path) -> bytes:
        if path == proc_cmdline:
            return os.fsencode(argv0) + b"\0-m\0uvicorn\0app.main:app\0"
        return original_read_bytes(path)

    monkeypatch.setattr(
        release_transaction, "systemd_consumer_is_active", lambda _unit: True
    )
    monkeypatch.setattr(release_transaction, "_api_health_ready", lambda: True)
    monkeypatch.setattr(
        release_transaction,
        "_systemctl_property",
        lambda _unit, name: properties[name],
    )
    monkeypatch.setattr(Path, "read_bytes", read_bytes)


def test_systemd_api_consumer_ready_accepts_restart_with_same_identity(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    argv0 = "/usr/bin/python3"
    working_directory = "/opt/trex-webui/current/apps/api"
    baseline_exec_start = (
        f"{{ path={argv0} ; "
        f"argv[]={argv0} -m uvicorn app.main:app ; "
        "ignore_errors=no ; start_time=[Sat 2026-08-01 08:02:44 JST] ; "
        "stop_time=[n/a] ; pid=1577952 ; code=(null) ; status=0/0 }"
    )
    restarted_exec_start = (
        f"{{ path={argv0} ; "
        f"argv[]={argv0} -m uvicorn app.main:app ; "
        "ignore_errors=no ; start_time=[Sat 2026-08-01 08:03:32 JST] ; "
        "stop_time=[n/a] ; pid=1579764 ; code=(null) ; status=0/0 }"
    )
    _api_consumer_ready_fixture(
        monkeypatch,
        working_directory=working_directory,
        exec_start=restarted_exec_start,
        main_pid=1579764,
        argv0=argv0,
    )
    baseline = {
        "unit": "trex-webui-api.service",
        "kind": "api",
        "working_directory": working_directory,
        "exec_start": baseline_exec_start,
        "argv0": argv0,
        "resolved_exec": str(Path(argv0).resolve(strict=True)),
    }

    assert release_transaction.systemd_consumer_is_ready(baseline, tmp_path)


@pytest.mark.parametrize(
    ("working_directory", "path", "application"),
    [
        (
            "/opt/trex-webui/previous/apps/api",
            "/usr/bin/python3",
            "app.main:app",
        ),
        (
            "/opt/trex-webui/current/apps/api",
            "/usr/local/bin/python3",
            "app.main:app",
        ),
        (
            "/opt/trex-webui/current/apps/api",
            "/usr/bin/python3",
            "other.main:app",
        ),
    ],
    ids=["working-directory", "executable-path", "argv"],
)
def test_systemd_api_consumer_ready_rejects_identity_drift(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    working_directory: str,
    path: str,
    application: str,
) -> None:
    argv0 = "/usr/bin/python3"
    expected_working_directory = "/opt/trex-webui/current/apps/api"
    baseline_exec_start = (
        f"{{ path={argv0} ; "
        f"argv[]={argv0} -m uvicorn app.main:app ; "
        "ignore_errors=no ; start_time=[Sat 2026-08-01 08:02:44 JST] ; "
        "stop_time=[n/a] ; pid=1577952 ; code=(null) ; status=0/0 }"
    )
    restarted_exec_start = (
        f"{{ path={path} ; "
        f"argv[]={argv0} -m uvicorn {application} ; "
        "ignore_errors=no ; start_time=[Sat 2026-08-01 08:03:32 JST] ; "
        "stop_time=[n/a] ; pid=1579764 ; code=(null) ; status=0/0 }"
    )
    _api_consumer_ready_fixture(
        monkeypatch,
        working_directory=working_directory,
        exec_start=restarted_exec_start,
        main_pid=1579764,
        argv0=argv0,
    )
    baseline = {
        "unit": "trex-webui-api.service",
        "kind": "api",
        "working_directory": expected_working_directory,
        "exec_start": baseline_exec_start,
        "argv0": argv0,
        "resolved_exec": str(Path(argv0).resolve(strict=True)),
    }

    assert not release_transaction.systemd_consumer_is_ready(baseline, tmp_path)


def test_selinux_prelabel_rejects_missing_prepared_current(
    tmp_path: Path,
) -> None:
    install_root = tmp_path / "opt" / "trex-webui"
    candidate = install_root / "releases" / f"sha256-{'c' * 64}"
    (candidate / "apps" / "web" / "dist").mkdir(parents=True)

    result = _run_prelabel_fixture(install_root, candidate, "a" * 64)

    assert result.returncode != 0
    assert "prepared current release selector disappeared" in result.stderr


def test_selinux_prelabel_happens_before_every_selector_activation() -> None:
    source = (PROJECT_ROOT / "deploy" / "upgrade.sh").read_text(encoding="utf-8")
    rollback = source[source.index("run_previous_release_rollback() {") :]
    assert rollback.index("prelabel_versioned_release_for_selinux") < rollback.index(
        "activate_versioned_release"
    )
    main = source[source.index("main() {") :]
    archive_flow = main[main.index("prepare_versioned_release") :]
    assert archive_flow.index("prelabel_versioned_release_for_selinux") < archive_flow.index(
        "activate_versioned_release"
    )
    install_source = (PROJECT_ROOT / "deploy" / "install.sh").read_text(
        encoding="utf-8"
    )
    install_main = install_source[install_source.index("main() {") :]
    assert install_main.index("configure_selinux") < install_main.index(
        "install_configs"
    )


def test_versioned_selinux_pattern_is_exact_and_private() -> None:
    expected = (
        r"/opt/trex-webui/releases/sha256-[0-9a-f]{64}"
        r"/apps/web/dist(/.*)?"
    )
    for path in (
        PROJECT_ROOT / "deploy" / "install.sh",
        PROJECT_ROOT / "deploy" / "upgrade.sh",
        PROJECT_ROOT / "deploy" / "verify.sh",
    ):
        source = path.read_text(encoding="utf-8")
        assert f"VERSIONED_WEB_SELINUX_PATTERN='{expected}'" in source
    expression = re.compile(expected)
    release = f"/opt/trex-webui/releases/sha256-{'a' * 64}"
    assert expression.fullmatch(f"{release}/apps/web/dist")
    assert expression.fullmatch(f"{release}/apps/web/dist/assets/app.js")
    assert not expression.fullmatch(f"{release}/apps/api/app/main.py")
    assert not expression.fullmatch(f"{release}/.env")
    assert not expression.fullmatch(f"{release}/apps/web/index.html")


@pytest.mark.parametrize("missing", ["requires", "after"])
def test_verifier_rejects_incomplete_consumer_dependency(
    tmp_path: Path, missing: str
) -> None:
    unit = tmp_path / "consumer.service"
    lines = ["[Unit]"]
    if missing != "requires":
        lines.append("Requires=trex-webui-release-reconcile-v2.service")
    if missing != "after":
        lines.append("After=network.target trex-webui-release-reconcile-v2.service")
    unit.write_text("\n".join(lines) + "\n", encoding="utf-8")
    result = subprocess.run(
        [
            "bash",
            "-c",
            'source "$1/deploy/verify.sh"; '
            'assert_release_reconcile_unit_dependency "$2" fixture',
            "dependency-fixture",
            str(PROJECT_ROOT),
            str(unit),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "release reconciliation contract error" in result.stderr


def test_verifier_rejects_mislabeled_api_child(tmp_path: Path) -> None:
    api_child = tmp_path / "main.py"
    api_child.write_text("pass\n", encoding="utf-8")
    result = subprocess.run(
        [
            "bash",
            "-c",
            r'''
source "$1/deploy/verify.sh"
matchpathcon() { printf '%s system_u:object_r:usr_t:s0\n' "$1"; }
stat() { printf 'system_u:object_r:httpd_sys_content_t:s0\n'; }
assert_selinux_not_http_content "$2" 'API child'
''',
            "selinux-private-fixture",
            str(PROJECT_ROOT),
            str(api_child),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "labeled as Nginx-readable content" in result.stderr


def test_verifier_rejects_broad_local_httpd_fcontext() -> None:
    result = subprocess.run(
        [
            "bash",
            "-c",
            r'''
source "$1/deploy/verify.sh"
semanage() {
  printf '%s all files system_u:object_r:httpd_sys_content_t:s0\n' "$VERSIONED_WEB_SELINUX_PATTERN"
  printf '/opt/trex-webui/releases(/.*)? all files system_u:object_r:httpd_sys_content_t:s0\n'
}
assert_exact_versioned_selinux_fcontext
''',
            "selinux-rule-fixture",
            str(PROJECT_ROOT),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "not exact and persistent" in result.stderr


@pytest.mark.parametrize("index", [0, 1, 2])
def test_fresh_reconcile_cleans_snapshot_orphaned_before_new_journal(
    tmp_path: Path, index: int
) -> None:
    paths, regular, absent, symlink = make_host_artifact_fixture(tmp_path)
    baseline = make_engine(tmp_path, host_artifact_paths=paths)
    old_source, old_digest = make_release_source(tmp_path, "host-old")
    candidate_source, _ = make_release_source(tmp_path, "host-candidate")
    select_release(baseline, old_source)
    old_transaction = baseline.status()["transaction"]
    assert isinstance(old_transaction, dict)

    crashing = make_engine(
        tmp_path,
        host_artifact_paths=paths,
        fault_hook=crash_at(f"after_host_snapshot:{index}"),
    )
    with pytest.raises(release_transaction.InjectedCrash):
        crashing.prepare(candidate_source, reserve_bytes=0)

    recovered = make_engine(tmp_path, host_artifact_paths=paths)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "committed"
    assert state["transaction_id"] == old_transaction["transaction_id"]
    assert_selected(recovered, current=old_digest, previous=None)
    assert_baseline_host_artifacts(regular, absent, symlink)
    assert_terminal_authority_retired(state)
    assert not list(recovered.state_root.glob("host-artifacts-*"))


@pytest.mark.parametrize(
    "failpoint",
    [
        "after_phase:restoring_host_artifacts",
        "after_host_restore:0",
        "after_host_restore:1",
        "after_host_restore:2",
        "after_host_daemon_reload",
        "after_phase:host_artifacts_restored",
        "after_rollback_current_link",
        "after_rollback_previous_link",
        "after_phase:rolled_back",
    ],
)
def test_host_artifact_rollback_is_idempotent_across_durable_boundaries(
    tmp_path: Path, failpoint: str
) -> None:
    paths, regular, absent, symlink = make_host_artifact_fixture(tmp_path)
    relabeled: list[Path] = []
    reloads: list[str] = []
    callbacks = {
        "host_artifact_paths": paths,
        "host_artifact_relabel": relabeled.append,
        "daemon_reload": lambda: reloads.append("reload"),
    }
    engine = make_engine(tmp_path, **callbacks)
    old_source, old_digest = make_release_source(tmp_path, "restore-old")
    candidate_source, candidate_digest = make_release_source(
        tmp_path, "restore-candidate"
    )
    select_release(engine, old_source)
    rollback_plan = ("trex-webui-api.service", "nginx.service")
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )
    engine.arm_consumers(
        str(prepared["transaction_id"]), consumers=rollback_plan
    )
    mutate_host_artifacts(regular, absent, symlink)
    engine.activate(str(prepared["transaction_id"]))

    crashing = make_engine(
        tmp_path, fault_hook=crash_at(failpoint), **callbacks
    )
    with pytest.raises(release_transaction.InjectedCrash):
        crashing.rollback(str(prepared["transaction_id"]))

    recovered = make_engine(tmp_path, **callbacks)
    state = recovered.reconcile()
    assert state is not None and state["phase"] == "rolled_back"
    assert recovered.reconcile() == state
    assert_selected(recovered, current=old_digest, previous=None)
    assert not (recovered.releases_root / f"sha256-{candidate_digest}").exists()
    assert_baseline_host_artifacts(regular, absent, symlink)
    assert regular in relabeled and symlink in relabeled
    assert reloads
    assert_terminal_authority_retired(state)
    assert not (
        recovered.state_root / f"host-artifacts-{prepared['transaction_id']}"
    ).exists()


def test_host_snapshot_backup_corruption_fails_closed_in_fresh_process(
    tmp_path: Path,
) -> None:
    paths, _regular, _absent, _symlink = make_host_artifact_fixture(tmp_path)
    engine = make_engine(tmp_path, host_artifact_paths=paths)
    old_source, _ = make_release_source(tmp_path, "corrupt-old")
    candidate_source, _ = make_release_source(tmp_path, "corrupt-candidate")
    select_release(engine, old_source)
    prepared = engine.prepare(candidate_source, reserve_bytes=0)
    records = prepared["host_artifacts"]
    assert isinstance(records, list) and isinstance(records[0], dict)
    backup = engine.state_root / str(records[0]["backup"])
    original = backup.read_bytes()
    backup.write_bytes(bytes([original[0] ^ 1]) + original[1:])

    fresh = make_engine(tmp_path, host_artifact_paths=paths)
    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="backup digest mismatch",
    ):
        fresh.status()
    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="backup digest mismatch",
    ):
        fresh.reconcile()


def test_committed_host_mutation_is_kept_and_snapshot_is_retired_immediately(
    tmp_path: Path,
) -> None:
    paths, regular, absent, symlink = make_host_artifact_fixture(tmp_path)
    engine = make_engine(tmp_path, host_artifact_paths=paths)
    old_source, old_digest = make_release_source(tmp_path, "commit-host-old")
    candidate_source, candidate_digest = make_release_source(
        tmp_path, "commit-host-candidate"
    )
    next_source, _ = make_release_source(tmp_path, "commit-host-next")
    select_release(engine, old_source)
    rollback_plan = ("trex-webui-api.service", "nginx.service")
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )
    engine.arm_consumers(
        str(prepared["transaction_id"]), consumers=rollback_plan
    )
    mutate_host_artifacts(regular, absent, symlink)
    engine.activate(str(prepared["transaction_id"]))
    committed = engine.commit(str(prepared["transaction_id"]))

    fresh = make_engine(tmp_path, host_artifact_paths=paths)
    assert fresh.status()["transaction"] == committed
    assert fresh.reconcile() == committed
    assert regular.read_bytes() == b"candidate-unit\n"
    assert absent.read_bytes() == b"candidate-nginx\n"
    assert os.readlink(symlink) == "/usr/lib/systemd/system/other.service"
    assert_terminal_authority_retired(committed)
    old_snapshot = fresh.state_root / f"host-artifacts-{prepared['transaction_id']}"
    assert not old_snapshot.exists()

    next_prepared = fresh.prepare(next_source, reserve_bytes=0)
    assert not old_snapshot.exists()
    assert (
        fresh.state_root / f"host-artifacts-{next_prepared['transaction_id']}"
    ).is_dir()
    assert_selected(fresh, current=candidate_digest, previous=old_digest)


def test_retired_terminal_journal_ignores_unsafe_snapshot_but_prepare_fails_closed(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    paths, _regular, _absent, _symlink = make_host_artifact_fixture(tmp_path)
    engine = make_engine(tmp_path, host_artifact_paths=paths)
    old_source, old_digest = make_release_source(tmp_path, "retire-old")
    candidate_source, candidate_digest = make_release_source(
        tmp_path, "retire-candidate"
    )
    next_source, _next_digest = make_release_source(tmp_path, "retire-next")
    select_release(engine, old_source)
    rollback_plan = ("trex-webui-api.service", "nginx.service")
    prepared = engine.prepare(
        candidate_source,
        reserve_bytes=0,
        transaction_kind="archive",
        consumer_rollback_plan=rollback_plan,
    )
    engine.arm_consumers(
        str(prepared["transaction_id"]), consumers=rollback_plan
    )
    engine.activate(str(prepared["transaction_id"]))

    crashing = make_engine(
        tmp_path,
        host_artifact_paths=paths,
        fault_hook=crash_at("after_terminal_rollback_authority_retired"),
    )
    with pytest.raises(release_transaction.InjectedCrash):
        crashing.commit(str(prepared["transaction_id"]))

    snapshot = (
        engine.state_root / f"host-artifacts-{prepared['transaction_id']}"
    )
    assert snapshot.is_dir()
    backup = next(snapshot.iterdir())
    backup.chmod(0o644)

    fresh = make_engine(tmp_path, host_artifact_paths=paths)
    status = fresh.status()["transaction"]
    assert isinstance(status, dict)
    assert_terminal_authority_retired(status)
    journal_before = fresh.transaction_path.read_bytes()
    assert fresh.reconcile() == status
    assert "deferred release housekeeping" in capsys.readouterr().err
    assert_selected(fresh, current=candidate_digest, previous=old_digest)
    assert snapshot.is_dir()

    with pytest.raises(
        release_transaction.ReleaseTransactionError,
        match="host artifact snapshot is unsafe",
    ):
        fresh.prepare(next_source, reserve_bytes=0)

    assert fresh.transaction_path.read_bytes() == journal_before
    assert_selected(fresh, current=candidate_digest, previous=old_digest)


def test_committed_reconcile_ignores_unknown_release_and_unsafe_staging_garbage(
    tmp_path: Path,
) -> None:
    engine = make_engine(tmp_path)
    source, digest = make_release_source(tmp_path, "healthy-current")
    committed, _ = select_release(engine, source)

    unknown = engine.releases_root / "operator-notes"
    unknown.mkdir()
    staging = engine.releases_root / f".staging-{uuid.uuid4()}"
    staging.mkdir()
    staging.chmod(0o777)

    fresh = make_engine(tmp_path)
    assert fresh.reconcile() == committed
    assert_selected(fresh, current=digest, previous=None)
    assert unknown.is_dir()
    assert staging.is_dir()
