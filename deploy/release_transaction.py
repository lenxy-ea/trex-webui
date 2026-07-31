#!/usr/bin/env python3.11
"""Crash-safe, content-addressed release selection for TRex WebUI.

This module deliberately does not install a release or restart services.  It
owns the durable publication boundary: snapshotting the exact managed host
consumer artifacts, staging an already verified release tree, selecting
``current``/``previous`` atomically, and recovering an interrupted publication.
The caller must commit only after the candidate services and release evidence
have passed their readiness gates.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import grp
import hashlib
import http.client
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path, PurePosixPath
from typing import Any


INSTALL_ROOT = Path("/opt/trex-webui")
STATE_ROOT = Path("/var/lib/trex-webui-deploy")
RELEASES_DIRECTORY_NAME = "releases"
RELEASE_MANIFEST_NAME = "RELEASE_MANIFEST.json"
TRANSACTION_FILE_NAME = "transaction.json"
LOCK_FILE_NAME = "transaction.lock"
MANAGED_MARKER_NAME = ".trex-webui-managed"
MANAGED_MARKER_VALUE = "trex-webui-managed-v1"
VENV_RELEASE_MARKER_NAME = ".trex-webui-venv-release"
VENV_RUNTIME_MARKER_NAME = ".trex-webui-venv-runtime"
VENV_RUNTIME_MARKER_VALUE = "trex-webui-venv-runtime-v1"
SERVICE_GROUP_NAME = "trex-webui"
TRANSACTION_SCHEMA = "trex-webui-release-transaction/v3"
RELEASE_MANIFEST_SCHEMA = "trex-webui-release/v3"
PAYLOAD_IDENTITY_ALGORITHM = "sha256(canonical-json(release-file-manifest)-v1)"
DEFAULT_RESERVE_BYTES = 128 * 1024 * 1024
MAX_MANIFEST_BYTES = 32 * 1024 * 1024
MAX_TRANSACTION_BYTES = 64 * 1024
MAX_RUNTIME_CONFIG_BYTES = 1024 * 1024
MAX_HOST_ARTIFACT_BYTES = 16 * 1024 * 1024
MAX_PAYLOAD_FILES = 50_000
MAX_PAYLOAD_FILE_BYTES = 1_000_000_000
MAX_PAYLOAD_BYTES = 2_000_000_000

SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
RELEASE_NAME_RE = re.compile(r"sha256-([0-9a-f]{64})\Z")
STAGING_NAME_RE = re.compile(
    r"\.staging-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\Z"
)
PAYLOAD_ENTRY_KEYS = {"mode", "path", "sha256", "size", "type"}
PAYLOAD_IDENTITY_KEYS = {
    "algorithm",
    "digest",
    "file_count",
    "files",
    "manifest_excluded",
    "manifest_path",
}
TRANSACTION_KEYS = {
    "candidate",
    "candidate_bytes",
    "consumer_enable",
    "consumer_active_before",
    "consumer_baseline",
    "consumer_rollback_plan",
    "consumer_mutation_armed",
    "consumer_start",
    "created_at",
    "current_before",
    "daemon_mutation_started",
    "host_artifacts",
    "host_profile",
    "native_boundary",
    "phase",
    "previous_before",
    "rollback_authority_retired",
    "rollback_restored",
    "reserve_bytes",
    "schema",
    "transaction_id",
    "transaction_kind",
    "updated_at",
}
PHASES = {
    "staging",
    "prepared",
    "switching_current",
    "current_switched",
    "switching_previous",
    "activated",
    "finalizing_consumer_enable",
    "committed",
    "restoring_host_artifacts",
    "host_artifacts_restored",
    "restoring_native_boundary",
    "native_boundary_restored",
    "stopping_consumers",
    "consumers_stopped",
    "starting_baseline_consumers",
    "rolling_back_current",
    "rolling_back_previous",
    "rolled_back",
}
TERMINAL_PHASES = {"committed", "rolled_back"}
DAEMON_MUTATION_PHASES = {
    "prepared",
    "switching_current",
    "current_switched",
    "switching_previous",
    "activated",
    "stopping_consumers",
    "consumers_stopped",
    "rolling_back_current",
    "rolling_back_previous",
    "restoring_native_boundary",
    "native_boundary_restored",
    "restoring_host_artifacts",
    "host_artifacts_restored",
    "starting_baseline_consumers",
    "rolled_back",
}
TRANSACTION_KINDS = {
    "archive",
    "legacy-baseline",
    "n-minus-one",
    "selector-only",
}
CONSUMER_ENABLE_UNITS = (
    "trex-daemon-server.service",
    "trex-webui-api.service",
    "nginx.service",
)
HOST_SNAPSHOT_RE = re.compile(
    r"host-artifacts-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\Z"
)
HOST_ARTIFACT_ENTRY_KEYS = {
    "backup",
    "gid",
    "kind",
    "mode",
    "path",
    "sha256",
    "size",
    "symlink_target",
    "uid",
}
NATIVE_BOUNDARY_ENTRY_KEYS = {
    "backup",
    "helper_backup",
    "helper_sha256",
    "helper_size",
    "sha256",
    "size",
    "state",
}
NATIVE_BOUNDARY_HEADER_PREFIX = "# TRex WebUI native boundary snapshot v1: "
CONSUMER_BASELINE_ENTRY_KEYS = {
    "argv0",
    "exec_start",
    "kind",
    "resolved_exec",
    "response_backup",
    "response_sha256",
    "response_size",
    "unit",
    "working_directory",
}
HOST_ARTIFACT_PATHS = (
    Path("/etc/nginx/conf.d/trex-webui.conf"),
    Path("/etc/systemd/system/trex-webui-api.service"),
    Path("/etc/systemd/system/trex-daemon-server.service"),
    Path("/etc/logrotate.d/trex-daemon-server"),
    Path("/usr/libexec/trex-webui/trex_daemon_supervisor.py"),
    Path("/usr/libexec/trex-webui/daemon_rpc_probe.py"),
    Path("/usr/libexec/trex-webui/trex_native_boundary.sh"),
    Path(
        "/etc/systemd/system/nftables.service.d/trex-webui-native-boundary.conf"
    ),
    Path("/etc/trex-webui/trex-webui.env"),
)
COMMON_HOST_ARTIFACT_PATHS = (
    Path("/etc/nginx/conf.d/trex-webui.conf"),
    Path("/etc/systemd/system/trex-webui-api.service"),
    Path("/etc/trex-webui/trex-webui.env"),
)
STABLE_DAEMON_RPC_PROBE = Path(
    "/usr/libexec/trex-webui/release_daemon_rpc_probe.py"
)
STABLE_NATIVE_BOUNDARY = Path(
    "/usr/libexec/trex-webui/release_native_boundary.sh"
)


class ReleaseTransactionError(RuntimeError):
    """A release tree, selector, journal, or transition failed validation."""


class CapacityError(ReleaseTransactionError):
    """The release filesystem cannot hold the candidate and safety reserve."""


class InjectedCrash(BaseException):
    """Test-only SIGKILL equivalent raised at a durable transition boundary."""


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def strict_json_loads(content: bytes, *, label: str) -> object:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ReleaseTransactionError(f"{label} contains duplicate key {key!r}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ReleaseTransactionError(f"{label} contains non-finite value {value}")

    try:
        return json.loads(
            content.decode("utf-8"),
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except UnicodeDecodeError as exc:
        raise ReleaseTransactionError(f"{label} is not valid UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise ReleaseTransactionError(f"{label} is not valid JSON: {exc}") from exc


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def require_digest(value: object, *, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise ReleaseTransactionError(f"{label} must be a lowercase SHA-256 digest")
    return value


def require_optional_digest(value: object, *, label: str) -> str | None:
    if value is None:
        return None
    return require_digest(value, label=label)


def require_non_negative_integer(value: object, *, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ReleaseTransactionError(f"{label} must be a non-negative integer")
    return value


def require_uuid(value: object, *, label: str) -> str:
    if not isinstance(value, str):
        raise ReleaseTransactionError(f"{label} must be a canonical UUID")
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise ReleaseTransactionError(f"{label} must be a canonical UUID") from exc
    if str(parsed) != value:
        raise ReleaseTransactionError(f"{label} must be a canonical UUID")
    return value


def require_timestamp(value: object, *, label: str) -> str:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ReleaseTransactionError(f"{label} must be a canonical UTC timestamp")
    try:
        parsed = dt.datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError as exc:
        raise ReleaseTransactionError(f"{label} must be a canonical UTC timestamp") from exc
    if parsed.tzinfo != dt.UTC or parsed.isoformat(timespec="seconds").replace("+00:00", "Z") != value:
        raise ReleaseTransactionError(f"{label} must be a canonical UTC timestamp")
    return value


def restore_host_artifact_selinux(path: Path) -> None:
    """Restore and verify policy-derived SELinux context after atomic rename."""

    if not Path("/sys/fs/selinux/enforce").is_file():
        return
    restorecon = Path("/usr/sbin/restorecon")
    matchpathcon = Path("/usr/sbin/matchpathcon")
    if not restorecon.is_file() or not os.access(restorecon, os.X_OK):
        raise ReleaseTransactionError("restorecon is unavailable on an SELinux host")
    if not matchpathcon.is_file() or not os.access(matchpathcon, os.X_OK):
        raise ReleaseTransactionError("matchpathcon is unavailable on an SELinux host")
    subprocess.run(
        [str(restorecon), "-F", str(path)],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    subprocess.run(
        [str(matchpathcon), "-V", str(path)],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    try:
        context = os.getxattr(path, "security.selinux", follow_symlinks=False)
    except OSError as exc:
        raise ReleaseTransactionError(
            f"restored host artifact has no inspectable SELinux context: {path}: {exc}"
        ) from exc
    if b":object_r:" not in context or b":unlabeled_t:" in context:
        raise ReleaseTransactionError(
            f"restored host artifact has an unsafe SELinux context: {path}"
        )


def reload_systemd_manager() -> None:
    systemctl = Path("/usr/bin/systemctl")
    if not systemctl.is_file() or not os.access(systemctl, os.X_OK):
        raise ReleaseTransactionError("systemctl is unavailable for host rollback")
    subprocess.run(
        [str(systemctl), "daemon-reload"],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    sync = Path("/usr/bin/sync")
    if not sync.is_file() or not os.access(sync, os.X_OK):
        raise ReleaseTransactionError("sync is unavailable for host rollback")
    # Persist regular bytes, ownership, SELinux xattrs, directory renames, and
    # systemctl-created wants links before a later journal phase can become
    # durable on the separate deployment-state filesystem.
    for authority in (
        Path("/etc/systemd/system"),
        Path("/etc/nginx"),
        Path("/etc/logrotate.d"),
        Path("/etc/trex-webui"),
        Path("/usr/libexec/trex-webui"),
    ):
        target = authority if authority.exists() else authority.parent
        subprocess.run(
            [str(sync), "--file-system", str(target)],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=30,
        )


def enable_systemd_consumer(unit: str) -> None:
    subprocess.run(
        ["/usr/bin/systemctl", "enable", unit],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )


def systemd_consumer_is_enabled(unit: str) -> bool:
    result = subprocess.run(
        ["/usr/bin/systemctl", "is-enabled", "--quiet", unit],
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    return result.returncode == 0


def start_systemd_consumer_no_block(unit: str) -> None:
    subprocess.run(
        ["/usr/bin/systemctl", "start", "--no-block", unit],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    active_state = subprocess.run(
        ["/usr/bin/systemctl", "show", "--property=ActiveState", "--value", unit],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    job = subprocess.run(
        ["/usr/bin/systemctl", "show", "--property=Job", "--value", unit],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    if active_state not in {"active", "activating", "reloading"} and not job:
        raise ReleaseTransactionError(
            f"systemd did not retain a start job for baseline consumer {unit}"
        )


def systemd_consumer_is_active(unit: str) -> bool:
    load_state = subprocess.run(
        ["/usr/bin/systemctl", "show", "--property=LoadState", "--value", unit],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    if load_state in {"not-found", "masked"}:
        return False
    if load_state != "loaded":
        raise ReleaseTransactionError(
            f"consumer {unit} has unknown load state {load_state!r}"
        )
    active_state = subprocess.run(
        ["/usr/bin/systemctl", "show", "--property=ActiveState", "--value", unit],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    if active_state == "active":
        return True
    if active_state in {"inactive", "failed"}:
        return False
    raise ReleaseTransactionError(
        f"consumer {unit} is transitional before release prepare: {active_state!r}"
    )


def _loopback_get(path: str, *, port: int = 80) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=8)
    try:
        connection.request("GET", path, headers={"Host": "127.0.0.1"})
        response = connection.getresponse()
        return response.status, response.read(MAX_HOST_ARTIFACT_BYTES + 1)
    finally:
        connection.close()


def _systemctl_property(unit: str, name: str) -> str:
    return subprocess.run(
        ["/usr/bin/systemctl", "show", f"--property={name}", "--value", unit],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    ).stdout.strip()


def _api_health_ready() -> bool:
    status, payload = _loopback_get("/api/health", port=8080)
    if status != 200 or len(payload) > MAX_HOST_ARTIFACT_BYTES:
        return False
    try:
        value = strict_json_loads(payload, label="API health response")
    except ReleaseTransactionError:
        return False
    return isinstance(value, dict) and value.get("status") == "ok"


def capture_systemd_consumer_baseline(
    unit: str, response_path: Path
) -> dict[str, object]:
    empty: dict[str, object] = {
        "unit": unit,
        "kind": "",
        "working_directory": None,
        "exec_start": None,
        "argv0": None,
        "resolved_exec": None,
        "response_backup": None,
        "response_sha256": None,
        "response_size": 0,
    }
    if unit == "trex-webui-api.service":
        if not _api_health_ready():
            raise ReleaseTransactionError("baseline API is active but not ready")
        main_pid = _systemctl_property(unit, "MainPID")
        if not main_pid.isdecimal() or int(main_pid) <= 0:
            raise ReleaseTransactionError("baseline API has no stable MainPID")
        cmdline = Path(f"/proc/{main_pid}/cmdline").read_bytes().split(b"\0")
        if not cmdline or not cmdline[0]:
            raise ReleaseTransactionError("baseline API command line is unavailable")
        argv0 = os.fsdecode(cmdline[0])
        resolved = Path(argv0).resolve(strict=True)
        return {
            **empty,
            "kind": "api",
            "working_directory": _systemctl_property(unit, "WorkingDirectory"),
            "exec_start": _systemctl_property(unit, "ExecStart"),
            "argv0": argv0,
            "resolved_exec": str(resolved),
        }
    if unit == "nginx.service":
        status, payload = _loopback_get("/")
        if status != 200 or len(payload) > MAX_HOST_ARTIFACT_BYTES:
            raise ReleaseTransactionError("baseline Nginx response is not ready")
        descriptor = os.open(
            response_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
            0o600,
        )
        try:
            offset = 0
            while offset < len(payload):
                offset += os.write(descriptor, payload[offset:])
            os.fchmod(descriptor, 0o600)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return {
            **empty,
            "kind": "nginx",
            "response_backup": response_path.name,
            "response_sha256": hashlib.sha256(payload).hexdigest(),
            "response_size": len(payload),
        }
    if unit == "trex-daemon-server.service":
        subprocess.run(
            [
                "/usr/bin/python3",
                str(STABLE_DAEMON_RPC_PROBE),
                "--host",
                "127.0.0.1",
                "--port",
                "8090",
                "--timeout",
                "5",
                "ready",
            ],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=10,
        )
        subprocess.run(
            ["/usr/bin/bash", str(STABLE_NATIVE_BOUNDARY), "verify"],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=10,
        )
        return {**empty, "kind": "daemon"}
    raise ReleaseTransactionError(f"unsupported release consumer {unit}")


def systemd_consumer_is_ready(
    baseline: dict[str, object], state_root: Path
) -> bool:
    unit = str(baseline["unit"])
    if not systemd_consumer_is_active(unit):
        return False
    kind = baseline["kind"]
    if kind == "api":
        if (
            _systemctl_property(unit, "WorkingDirectory")
            != baseline["working_directory"]
            or _systemctl_property(unit, "ExecStart") != baseline["exec_start"]
            or not _api_health_ready()
        ):
            return False
        main_pid = _systemctl_property(unit, "MainPID")
        if not main_pid.isdecimal() or int(main_pid) <= 0:
            return False
        cmdline = Path(f"/proc/{main_pid}/cmdline").read_bytes().split(b"\0")
        if not cmdline or os.fsdecode(cmdline[0]) != baseline["argv0"]:
            return False
        return str(Path(os.fsdecode(cmdline[0])).resolve(strict=True)) == baseline[
            "resolved_exec"
        ]
    if kind == "nginx":
        status, payload = _loopback_get("/")
        backup = baseline["response_backup"]
        if not isinstance(backup, str):
            return False
        return status == 200 and payload == (state_root / backup).read_bytes()
    if kind == "daemon":
        subprocess.run(
            [
                "/usr/bin/python3",
                str(STABLE_DAEMON_RPC_PROBE),
                "--host",
                "127.0.0.1",
                "--port",
                "8090",
                "--timeout",
                "5",
                "ready",
            ],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=10,
        )
        subprocess.run(
            ["/usr/bin/bash", str(STABLE_NATIVE_BOUNDARY), "verify"],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=10,
        )
        return True
    raise ReleaseTransactionError("consumer baseline kind is invalid")


def _stop_systemd_consumers(
    scope: tuple[str, ...], *, force_owned_daemon: bool
) -> None:
    if (
        len(scope) != len(set(scope))
        or list(scope) != [unit for unit in CONSUMER_ENABLE_UNITS if unit in scope]
    ):
        raise ReleaseTransactionError("rollback consumer scope is invalid")

    def loaded(units: list[str]) -> list[str]:
        result: list[str] = []
        for unit in units:
            load_state = subprocess.run(
                ["/usr/bin/systemctl", "show", "--property=LoadState", "--value", unit],
                check=True,
                capture_output=True,
                text=True,
                timeout=5,
            ).stdout.strip()
            if load_state == "loaded":
                result.append(unit)
            elif load_state not in {"not-found", "masked"}:
                raise ReleaseTransactionError(
                    f"consumer {unit} has unknown load state during rollback: {load_state!r}"
                )
        return result

    def stop_and_verify(units: list[str]) -> None:
        loaded_units = loaded(units)
        if loaded_units:
            subprocess.run(
                ["/usr/bin/systemctl", "stop", "--no-block", *loaded_units],
                check=True,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=30,
            )
        deadline = time.monotonic() + 30
        while True:
            unsettled: list[str] = []
            for unit in units:
                active_state = subprocess.run(
                    [
                        "/usr/bin/systemctl",
                        "show",
                        "--property=ActiveState",
                        "--value",
                        unit,
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=5,
                ).stdout.strip()
                job = subprocess.run(
                    ["/usr/bin/systemctl", "show", "--property=Job", "--value", unit],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=5,
                ).stdout.strip()
                if active_state not in {"inactive", "failed"} or job:
                    unsettled.append(unit)
            if not unsettled:
                return
            if time.monotonic() >= deadline:
                raise ReleaseTransactionError(
                    "consumer stop jobs did not settle: " + ", ".join(unsettled)
                )
            time.sleep(0.1)

    # Fence HTTP control first, then stop the API and prove both jobs/processes
    # are gone before asking whether the privileged daemon is safe to stop.
    frontends = [
        unit
        for unit in ("nginx.service", "trex-webui-api.service")
        if unit in scope
    ]
    stop_and_verify(frontends)

    daemon_unit = "trex-daemon-server.service"
    if daemon_unit not in scope:
        return
    if daemon_unit in loaded([daemon_unit]):
        active_state = subprocess.run(
            [
                "/usr/bin/systemctl",
                "show",
                "--property=ActiveState",
                "--value",
                daemon_unit,
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip()
        if active_state == "active":
            if not force_owned_daemon:
                probe = STABLE_DAEMON_RPC_PROBE
                if not probe.is_file() or probe.is_symlink():
                    raise ReleaseTransactionError(
                        "managed daemon safety probe is unavailable during rollback"
                    )
                subprocess.run(
                    [
                        "/usr/bin/python3",
                        str(probe),
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "8090",
                        "--timeout",
                        "5",
                        "safe-restart",
                    ],
                    check=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    timeout=10,
                )
        elif active_state not in {"inactive", "failed"}:
            raise ReleaseTransactionError(
                f"managed daemon is transitional during rollback: {active_state!r}"
            )
    stop_and_verify([daemon_unit])


def stop_systemd_consumers(scope: tuple[str, ...]) -> None:
    _stop_systemd_consumers(scope, force_owned_daemon=False)


def force_stop_owned_systemd_consumers(scope: tuple[str, ...]) -> None:
    """Stop a daemon only after durable transaction-owned mutation intent."""

    _stop_systemd_consumers(scope, force_owned_daemon=True)


def verify_systemd_daemon_mutation_boundary(was_active: bool) -> None:
    """Close daemon liveness/safety at the durable mutation-intent edge."""

    daemon_unit = "trex-daemon-server.service"
    active = systemd_consumer_is_active(daemon_unit)
    if active != was_active:
        raise ReleaseTransactionError(
            "managed daemon active state changed before mutation intent"
        )
    if not active:
        _assert_daemon_stopped_without_native_listeners()
        return
    subprocess.run(
        [
            "/usr/bin/python3",
            str(STABLE_DAEMON_RPC_PROBE),
            "--host",
            "127.0.0.1",
            "--port",
            "8090",
            "--timeout",
            "5",
            "safe-restart",
        ],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=10,
    )


def _run_native_boundary_helper(
    helper: Path, command: str, snapshot: Path
) -> None:
    subprocess.run(
        ["/usr/bin/bash", str(helper), command, str(snapshot)],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
    )


def snapshot_native_boundary(helper: Path, snapshot: Path) -> None:
    _run_native_boundary_helper(helper, "snapshot", snapshot)


def _assert_daemon_stopped_without_native_listeners() -> None:
    active_state = subprocess.run(
        [
            "/usr/bin/systemctl",
            "show",
            "--property=ActiveState",
            "--value",
            "trex-daemon-server.service",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    ).stdout.strip()
    if active_state not in {"inactive", "failed"}:
        raise ReleaseTransactionError(
            "managed daemon is not stopped before native-boundary rollback"
        )
    listeners = subprocess.run(
        ["/usr/sbin/ss", "-H", "-ltn"],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    ).stdout
    for line in listeners.splitlines():
        fields = line.split()
        if len(fields) >= 4 and re.search(r":(?:4500|4501|4507)\Z", fields[3]):
            raise ReleaseTransactionError(
                "native TRex listener remains before boundary rollback"
            )


def restore_native_boundary(helper: Path, snapshot: Path) -> None:
    _assert_daemon_stopped_without_native_listeners()
    _run_native_boundary_helper(helper, "restore", snapshot)


def verify_native_boundary_snapshot(helper: Path, snapshot: Path) -> None:
    temporary = snapshot.parent / f".{snapshot.name}.verify-{uuid.uuid4()}"
    try:
        _run_native_boundary_helper(helper, "snapshot", temporary)
        if temporary.read_bytes() != snapshot.read_bytes():
            raise ReleaseTransactionError(
                "restored native-boundary state differs from the durable snapshot"
            )
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


class ReleaseTransactionEngine:
    """Durable release selector with explicit crash-recovery semantics."""

    def __init__(
        self,
        *,
        install_root: Path = INSTALL_ROOT,
        state_root: Path = STATE_ROOT,
        expected_uid: int = 0,
        expected_gid: int | None = None,
        available_bytes: Callable[[Path], int] | None = None,
        fault_hook: Callable[[str], None] | None = None,
        host_artifact_paths: tuple[Path, ...] = (),
        host_artifact_relabel: Callable[[Path], None] | None = None,
        daemon_reload: Callable[[], None] | None = None,
        consumer_enable: Callable[[str], None] | None = None,
        consumer_is_enabled: Callable[[str], bool] | None = None,
        consumer_start: Callable[[str], None] | None = None,
        consumer_is_active: Callable[[str], bool] | None = None,
        consumer_capture: Callable[[str, Path], dict[str, object]] | None = None,
        consumer_is_ready: Callable[[dict[str, object], Path], bool] | None = None,
        consumer_stop: Callable[[tuple[str, ...]], None] | None = None,
        consumer_force_stop: Callable[[tuple[str, ...]], None] | None = None,
        daemon_mutation_preflight: Callable[[bool], None] | None = None,
        native_boundary_snapshot: Callable[[Path, Path], None] | None = None,
        native_boundary_restore: Callable[[Path, Path], None] | None = None,
        native_boundary_verify: Callable[[Path, Path], None] | None = None,
        native_boundary_helper_source: Path | None = None,
    ) -> None:
        self.install_root = self._canonical_absolute(install_root, "install root")
        self.state_root = self._canonical_absolute(state_root, "state root")
        self.releases_root = self.install_root / RELEASES_DIRECTORY_NAME
        self.transaction_path = self.state_root / TRANSACTION_FILE_NAME
        self.lock_path = self.state_root / LOCK_FILE_NAME
        self.expected_uid = expected_uid
        self.expected_gid = expected_gid
        self.available_bytes = available_bytes or self._filesystem_available_bytes
        self.fault_hook = fault_hook
        self.host_artifact_paths = tuple(
            self._canonical_absolute(path, "host artifact")
            for path in host_artifact_paths
        )
        if len(self.host_artifact_paths) != len(set(self.host_artifact_paths)):
            raise ReleaseTransactionError("host artifact paths must be unique")
        self.host_artifact_relabel = host_artifact_relabel or (lambda _path: None)
        self.daemon_reload = daemon_reload or (lambda: None)
        self.consumer_enable = consumer_enable or (lambda _unit: None)
        self.consumer_is_enabled = consumer_is_enabled or (lambda _unit: False)
        self.consumer_start = consumer_start or (lambda _unit: None)
        self.consumer_is_active = consumer_is_active or (lambda _unit: False)
        self.consumer_capture = consumer_capture or (
            lambda unit, _path: {
                "unit": unit,
                "kind": "daemon" if unit == "trex-daemon-server.service" else (
                    "api" if unit == "trex-webui-api.service" else "nginx"
                ),
                "working_directory": None,
                "exec_start": None,
                "argv0": None,
                "resolved_exec": None,
                "response_backup": None,
                "response_sha256": None,
                "response_size": 0,
            }
        )
        self.consumer_is_ready = consumer_is_ready or (
            lambda _baseline, _state_root: True
        )
        self.consumer_stop = consumer_stop or (lambda _units: None)
        self.consumer_force_stop = consumer_force_stop or self.consumer_stop
        self.daemon_mutation_preflight = daemon_mutation_preflight or (
            lambda _was_active: None
        )
        self.native_boundary_snapshot = (
            native_boundary_snapshot or snapshot_native_boundary
        )
        self.native_boundary_restore = (
            native_boundary_restore or restore_native_boundary
        )
        self.native_boundary_verify = (
            native_boundary_verify or verify_native_boundary_snapshot
        )
        helper_source = native_boundary_helper_source
        if helper_source is None:
            helper_source = (
                STABLE_NATIVE_BOUNDARY
                if self.install_root == INSTALL_ROOT and self.state_root == STATE_ROOT
                else Path(__file__).with_name("trex_native_boundary.sh")
            )
        self.native_boundary_helper_source = self._canonical_absolute(
            helper_source, "native-boundary helper source"
        )

    def _runtime_config_gid(self) -> int:
        if self.expected_gid is not None:
            return self.expected_gid
        try:
            return grp.getgrnam(SERVICE_GROUP_NAME).gr_gid
        except KeyError as exc:
            raise ReleaseTransactionError(
                f"service group {SERVICE_GROUP_NAME!r} is required for release .env"
            ) from exc

    def _capture_consumer_active_before(
        self, rollback_consumers: tuple[str, ...]
    ) -> list[str]:
        active: list[str] = []
        for unit in rollback_consumers:
            try:
                if self.consumer_is_active(unit):
                    active.append(unit)
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot capture baseline consumer state for {unit}: {exc}"
                ) from exc
        return active

    def _capture_consumer_baseline(
        self,
        transaction_id: str,
        active: list[str],
    ) -> list[dict[str, object]]:
        if not active:
            return []
        snapshot_root = self._host_snapshot_root(transaction_id)
        if not snapshot_root.exists():
            self._mkdir_owned(
                snapshot_root,
                mode=0o700,
                label="host artifact snapshot root",
            )
        else:
            self._assert_safe_directory(
                snapshot_root,
                label="host artifact snapshot root",
                exact_mode=0o700,
            )
        records: list[dict[str, object]] = []
        for index, unit in enumerate(active):
            response_path = snapshot_root / f"consumer-{index:02d}.bin"
            try:
                captured = self.consumer_capture(unit, response_path)
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot capture baseline readiness authority for {unit}: {exc}"
                ) from exc
            if not isinstance(captured, dict):
                raise ReleaseTransactionError(
                    "consumer baseline capture returned an invalid record"
                )
            record = dict(captured)
            if response_path.exists() or response_path.is_symlink():
                metadata = self._assert_safe_regular_file(
                    response_path,
                    label="consumer baseline response",
                    exact_mode=0o600,
                )
                if metadata.st_size > MAX_HOST_ARTIFACT_BYTES:
                    raise ReleaseTransactionError(
                        "consumer baseline response exceeds the size limit"
                    )
                content = response_path.read_bytes()
                record["response_backup"] = (
                    f"{snapshot_root.name}/{response_path.name}"
                )
                record["response_size"] = len(content)
                record["response_sha256"] = hashlib.sha256(content).hexdigest()
            records.append(record)
            self._fault(f"after_consumer_baseline_snapshot:{index}")
        self._fsync_directory(snapshot_root)
        return self._validate_consumer_baseline_records(
            records,
            transaction_id=transaction_id,
            active=active,
        )

    def _cleanup_unarmed_consumer_baseline(self, transaction_id: str) -> None:
        """Remove crash leftovers before retrying an unarmed baseline capture."""

        snapshot_root = self._host_snapshot_root(transaction_id)
        try:
            snapshot_root.lstat()
        except FileNotFoundError:
            return
        self._assert_safe_directory(
            snapshot_root,
            label="host artifact snapshot root",
            exact_mode=0o700,
        )
        changed = False
        for child in snapshot_root.iterdir():
            if re.fullmatch(r"consumer-[0-9]{2}\.bin", child.name) is None:
                continue
            self._assert_safe_regular_file(
                child,
                label="unarmed consumer baseline response",
                exact_mode=0o600,
            )
            child.unlink()
            changed = True
        if changed:
            self._fsync_directory(snapshot_root)

    def _host_paths_for_profile(
        self, profile: str | None
    ) -> tuple[Path, ...]:
        if profile is None:
            return self.host_artifact_paths
        if self.host_artifact_paths != HOST_ARTIFACT_PATHS:
            raise ReleaseTransactionError(
                "named host profiles require the production host allowlist"
            )
        if profile == "common":
            return COMMON_HOST_ARTIFACT_PATHS
        if profile == "managed-local":
            return HOST_ARTIFACT_PATHS
        raise ReleaseTransactionError("host artifact profile is invalid")

    @staticmethod
    def _canonical_absolute(path: Path, label: str) -> Path:
        path = Path(path)
        if not path.is_absolute():
            raise ReleaseTransactionError(f"{label} must be absolute")
        normalized = Path(os.path.normpath(os.fspath(path)))
        if normalized != path or ".." in path.parts:
            raise ReleaseTransactionError(f"{label} must be canonical")
        return path

    def _fault(self, name: str) -> None:
        if self.fault_hook is not None:
            self.fault_hook(name)

    def _assert_safe_directory(
        self,
        path: Path,
        *,
        label: str,
        exact_mode: int | None = None,
    ) -> os.stat_result:
        try:
            metadata = path.lstat()
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot inspect {label} {path}: {exc}") from exc
        if not stat.S_ISDIR(metadata.st_mode) or path.is_symlink():
            raise ReleaseTransactionError(f"{label} must be a real directory: {path}")
        if metadata.st_uid != self.expected_uid:
            raise ReleaseTransactionError(
                f"{label} must be owned by uid {self.expected_uid}: {path}"
            )
        mode = stat.S_IMODE(metadata.st_mode)
        if mode & 0o022:
            raise ReleaseTransactionError(
                f"{label} must not be group/other writable: {path}"
            )
        if exact_mode is not None and mode != exact_mode:
            raise ReleaseTransactionError(
                f"{label} must have mode {exact_mode:04o}: {path}"
            )
        return metadata

    def _assert_safe_regular_file(
        self,
        path: Path,
        *,
        label: str,
        exact_mode: int | None = None,
    ) -> os.stat_result:
        """Prove a path is one stable, owned regular-file inode."""

        try:
            metadata = path.lstat()
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect {label} {path}: {exc}"
            ) from exc
        mode = stat.S_IMODE(metadata.st_mode)
        if not stat.S_ISREG(metadata.st_mode):
            raise ReleaseTransactionError(
                f"{label} must be a regular file: {path}"
            )
        if metadata.st_uid != self.expected_uid:
            raise ReleaseTransactionError(
                f"{label} must be owned by uid {self.expected_uid}: {path}"
            )
        if metadata.st_nlink != 1:
            raise ReleaseTransactionError(
                f"{label} must have exactly one hard link: {path}"
            )
        if mode & 0o022:
            raise ReleaseTransactionError(
                f"{label} must not be group/other writable: {path}"
            )
        if exact_mode is not None and mode != exact_mode:
            raise ReleaseTransactionError(
                f"{label} must have mode {exact_mode:04o}: {path}"
            )
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(path, flags)
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot safely open {label} {path}: {exc}"
            ) from exc
        try:
            observed = os.fstat(descriptor)
        finally:
            os.close(descriptor)
        identity = lambda value: (
            value.st_dev,
            value.st_ino,
            value.st_mode,
            value.st_uid,
            value.st_gid,
            value.st_nlink,
            value.st_size,
            value.st_mtime_ns,
            value.st_ctime_ns,
        )
        if identity(observed) != identity(metadata):
            raise ReleaseTransactionError(
                f"{label} changed while it was opened: {path}"
            )
        return observed

    def _assert_authority_path(self, path: Path, *, label: str) -> None:
        """Require every existing path component to be controlled by root/the owner."""

        if not path.is_absolute():
            raise ReleaseTransactionError(f"{label} must be absolute: {path}")
        previous: os.stat_result | None = None
        for index in range(1, len(path.parts) + 1):
            component = Path(*path.parts[:index])
            try:
                metadata = component.lstat()
            except OSError as exc:
                raise ReleaseTransactionError(
                    f"cannot inspect {label} authority at {component}: {exc}"
                ) from exc
            if metadata.st_uid not in {0, self.expected_uid}:
                raise ReleaseTransactionError(
                    f"{label} is not controlled at {component}"
                )
            if stat.S_ISLNK(metadata.st_mode):
                raise ReleaseTransactionError(
                    f"{label} has a symbolic-link component: {component}"
                )
            if index < len(path.parts) and not stat.S_ISDIR(metadata.st_mode):
                raise ReleaseTransactionError(
                    f"{label} has a non-directory component: {component}"
                )
            if metadata.st_mode & 0o022:
                if not (
                    index < len(path.parts)
                    and stat.S_ISDIR(metadata.st_mode)
                    and metadata.st_mode & stat.S_ISVTX
                    and previous is not None
                ):
                    raise ReleaseTransactionError(
                        f"{label} can be replaced at {component}"
                    )
            previous = metadata

    def _mkdir_owned(self, path: Path, *, mode: int, label: str) -> None:
        created = False
        try:
            os.mkdir(path, mode)
            created = True
        except FileExistsError:
            pass
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot create {label} {path}: {exc}") from exc
        if created:
            flags = os.O_RDONLY | os.O_CLOEXEC
            if hasattr(os, "O_DIRECTORY"):
                flags |= os.O_DIRECTORY
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(path, flags)
            try:
                os.fchmod(descriptor, mode)
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            # Persist the new directory entry as well as the child inode. A
            # child fsync alone does not make first-layout creation durable.
            self._fsync_directory(path.parent)
        self._assert_safe_directory(path, label=label, exact_mode=mode)

    def _ensure_layout(self) -> None:
        self._assert_authority_path(self.install_root, label="install root")
        self._assert_authority_path(
            self.state_root.parent,
            label="deployment state parent",
        )
        self._assert_safe_directory(self.install_root, label="install root")
        self._assert_safe_directory(
            self.state_root.parent,
            label="deployment state parent",
        )
        self._mkdir_owned(
            self.releases_root,
            mode=0o755,
            label="release store",
        )
        self._mkdir_owned(
            self.state_root,
            mode=0o700,
            label="deployment state directory",
        )
        install_device = self.install_root.lstat().st_dev
        release_device = self.releases_root.lstat().st_dev
        if install_device != release_device:
            raise ReleaseTransactionError(
                "release store must share a filesystem with the atomic selectors"
            )
        if os.path.ismount(self.releases_root):
            raise ReleaseTransactionError("release store must not be a mountpoint")

    @contextlib.contextmanager
    def _locked(self) -> Iterator[None]:
        self._ensure_layout()
        flags = os.O_RDWR | os.O_CREAT | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(self.lock_path, flags, 0o600)
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot open deployment transaction lock {self.lock_path}: {exc}"
            ) from exc
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != self.expected_uid:
                raise ReleaseTransactionError("deployment transaction lock is unsafe")
            if stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_nlink != 1:
                raise ReleaseTransactionError(
                    "deployment transaction lock must have mode 0600 and one link"
                )
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            yield
        finally:
            os.close(descriptor)

    @contextlib.contextmanager
    def deployment_guard(self, path: Path) -> Iterator[bool]:
        """Serialize boot reconciliation with the outer deployment workflow."""

        path = self._canonical_absolute(path, "deployment lock")
        self._assert_authority_path(
            path.parent.parent,
            label="deployment lock authority parent",
        )
        self._assert_safe_directory(
            path.parent.parent,
            label="deployment lock authority parent",
        )
        self._mkdir_owned(
            path.parent,
            mode=0o700,
            label="deployment lock parent",
        )
        self._assert_authority_path(path.parent, label="deployment lock parent")
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            try:
                created_descriptor = os.open(path, flags, 0o600)
            except FileExistsError:
                metadata = path.lstat()
            except OSError as exc:
                raise ReleaseTransactionError(
                    f"cannot create deployment lock {path}: {exc}"
                ) from exc
            else:
                try:
                    os.fchmod(created_descriptor, 0o600)
                    os.fsync(created_descriptor)
                    metadata = os.fstat(created_descriptor)
                finally:
                    os.close(created_descriptor)
                self._fsync_directory(path.parent)
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect deployment lock {path}: {exc}"
            ) from exc
        if (
            not stat.S_ISREG(metadata.st_mode)
            or path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or (self.expected_uid == 0 and metadata.st_gid != 0)
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_nlink != 1
        ):
            raise ReleaseTransactionError(
                "deployment lock must be an owned regular 0600 single-link file"
            )
        flags = os.O_RDWR | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(path, flags)
        try:
            observed = os.fstat(descriptor)
            if (observed.st_dev, observed.st_ino) != (
                metadata.st_dev,
                metadata.st_ino,
            ):
                raise ReleaseTransactionError(
                    "deployment lock changed while it was opened"
                )
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
            else:
                yield True
        finally:
            os.close(descriptor)

    @staticmethod
    def _filesystem_available_bytes(path: Path) -> int:
        values = os.statvfs(path)
        return values.f_bavail * values.f_frsize

    @staticmethod
    def _fsync_directory(path: Path) -> None:
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_DIRECTORY"):
            flags |= os.O_DIRECTORY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(path, flags)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def _host_snapshot_root(self, transaction_id: str) -> Path:
        return self.state_root / f"host-artifacts-{transaction_id}"

    def _assert_host_artifact_parent(self, path: Path) -> None:
        parent = path.parent
        while not parent.exists() and not parent.is_symlink():
            if parent == parent.parent:
                raise ReleaseTransactionError(
                    f"host artifact has no existing authority parent: {path}"
                )
            parent = parent.parent
        self._assert_authority_path(parent, label="host artifact parent")
        self._assert_safe_directory(parent, label="host artifact parent")

    @staticmethod
    def _read_regular_file(descriptor: int, *, limit: int, label: str) -> bytes:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, min(1024 * 1024, limit + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > limit:
                raise ReleaseTransactionError(f"{label} exceeds the size limit")
        return b"".join(chunks)

    def _snapshot_host_artifacts(
        self,
        transaction_id: str,
        selected_paths: tuple[Path, ...],
    ) -> list[dict[str, object]]:
        paths = selected_paths
        if (
            len(paths) != len(set(paths))
            or list(paths)
            != [path for path in self.host_artifact_paths if path in paths]
        ):
            raise ReleaseTransactionError("host artifact transaction scope is invalid")
        if not paths:
            return []
        snapshot_root = self._host_snapshot_root(transaction_id)
        try:
            os.mkdir(snapshot_root, 0o700)
            os.chmod(snapshot_root, 0o700)
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot create host artifact snapshot: {exc}"
            ) from exc
        self._fsync_directory(self.state_root)
        records: list[dict[str, object]] = []
        try:
            for index, path in enumerate(paths):
                self._assert_host_artifact_parent(path)
                try:
                    metadata = path.lstat()
                except FileNotFoundError:
                    records.append(
                        {
                            "path": str(path),
                            "kind": "absent",
                            "backup": None,
                            "uid": None,
                            "gid": None,
                            "mode": None,
                            "size": 0,
                            "sha256": None,
                            "symlink_target": None,
                        }
                    )
                    self._fault(f"after_host_snapshot:{index}")
                    continue
                except OSError as exc:
                    raise ReleaseTransactionError(
                        f"cannot inspect host artifact {path}: {exc}"
                    ) from exc
                if metadata.st_uid != self.expected_uid or metadata.st_nlink != 1:
                    raise ReleaseTransactionError(
                        f"host artifact must be owned and single-link: {path}"
                    )
                mode = stat.S_IMODE(metadata.st_mode)
                if stat.S_ISREG(metadata.st_mode):
                    if mode & 0o7022 or metadata.st_size > MAX_HOST_ARTIFACT_BYTES:
                        raise ReleaseTransactionError(
                            f"host artifact has unsafe mode or size: {path}"
                        )
                    flags = os.O_RDONLY | os.O_CLOEXEC
                    if hasattr(os, "O_NOFOLLOW"):
                        flags |= os.O_NOFOLLOW
                    try:
                        source_descriptor = os.open(path, flags)
                        try:
                            before = os.fstat(source_descriptor)
                            content = self._read_regular_file(
                                source_descriptor,
                                limit=MAX_HOST_ARTIFACT_BYTES,
                                label=f"host artifact {path}",
                            )
                            after = os.fstat(source_descriptor)
                        finally:
                            os.close(source_descriptor)
                    except OSError as exc:
                        raise ReleaseTransactionError(
                            f"cannot snapshot host artifact {path}: {exc}"
                        ) from exc
                    identity = (
                        metadata.st_dev,
                        metadata.st_ino,
                        metadata.st_size,
                        metadata.st_mtime_ns,
                        metadata.st_ctime_ns,
                    )
                    if identity != (
                        before.st_dev,
                        before.st_ino,
                        before.st_size,
                        before.st_mtime_ns,
                        before.st_ctime_ns,
                    ) or identity != (
                        after.st_dev,
                        after.st_ino,
                        after.st_size,
                        after.st_mtime_ns,
                        after.st_ctime_ns,
                    ):
                        raise ReleaseTransactionError(
                            f"host artifact changed while it was snapshotted: {path}"
                        )
                    backup_name = f"{index:04d}.bin"
                    backup_path = snapshot_root / backup_name
                    descriptor = os.open(
                        backup_path,
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
                        0o600,
                    )
                    try:
                        offset = 0
                        while offset < len(content):
                            offset += os.write(descriptor, content[offset:])
                        os.fchmod(descriptor, 0o600)
                        os.fsync(descriptor)
                    finally:
                        os.close(descriptor)
                    records.append(
                        {
                            "path": str(path),
                            "kind": "file",
                            "backup": f"{snapshot_root.name}/{backup_name}",
                            "uid": metadata.st_uid,
                            "gid": metadata.st_gid,
                            "mode": mode,
                            "size": len(content),
                            "sha256": hashlib.sha256(content).hexdigest(),
                            "symlink_target": None,
                        }
                    )
                elif stat.S_ISLNK(metadata.st_mode):
                    try:
                        target = os.readlink(path)
                        after = path.lstat()
                    except OSError as exc:
                        raise ReleaseTransactionError(
                            f"cannot snapshot host artifact link {path}: {exc}"
                        ) from exc
                    if (
                        not target
                        or "\x00" in target
                        or len(os.fsencode(target)) > 4096
                        or not Path(target).is_absolute()
                        or Path(os.path.normpath(target)) != Path(target)
                        or ".." in Path(target).parts
                        or (metadata.st_dev, metadata.st_ino, metadata.st_ctime_ns)
                        != (after.st_dev, after.st_ino, after.st_ctime_ns)
                    ):
                        raise ReleaseTransactionError(
                            f"host artifact link is unsafe or changed: {path}"
                        )
                    encoded_target = os.fsencode(target)
                    records.append(
                        {
                            "path": str(path),
                            "kind": "symlink",
                            "backup": None,
                            "uid": metadata.st_uid,
                            "gid": metadata.st_gid,
                            "mode": mode,
                            "size": len(encoded_target),
                            "sha256": hashlib.sha256(encoded_target).hexdigest(),
                            "symlink_target": target,
                        }
                    )
                else:
                    raise ReleaseTransactionError(
                        f"host artifact must be a regular file, symlink, or absent: {path}"
                    )
                self._fault(f"after_host_snapshot:{index}")
            self._fsync_directory(snapshot_root)
            return records
        except BaseException:
            # A missing journal means this snapshot is not recovery authority.
            # Leave it durable for the next reconciler to validate and remove.
            raise

    def _validate_host_artifact_records(
        self,
        value: object,
        *,
        transaction_id: str,
        expected_paths: tuple[Path, ...],
    ) -> list[dict[str, object]]:
        if not isinstance(value, list) or len(value) != len(expected_paths):
            raise ReleaseTransactionError(
                "release transaction host artifact list is incomplete"
            )
        validated: list[dict[str, object]] = []
        for index, (item, expected_path) in enumerate(zip(value, expected_paths)):
            if not isinstance(item, dict) or set(item) != HOST_ARTIFACT_ENTRY_KEYS:
                raise ReleaseTransactionError("host artifact journal entry is malformed")
            if item.get("path") != str(expected_path):
                raise ReleaseTransactionError("host artifact journal path is not allowlisted")
            kind = item.get("kind")
            if kind not in {"absent", "file", "symlink"}:
                raise ReleaseTransactionError("host artifact journal kind is invalid")
            size = require_non_negative_integer(
                item.get("size"), label="host artifact size"
            )
            if size > MAX_HOST_ARTIFACT_BYTES:
                raise ReleaseTransactionError("host artifact journal size is too large")
            if kind == "absent":
                if any(
                    item.get(key) is not None
                    for key in (
                        "backup",
                        "uid",
                        "gid",
                        "mode",
                        "sha256",
                        "symlink_target",
                    )
                ) or size != 0:
                    raise ReleaseTransactionError(
                        "absent host artifact journal metadata is invalid"
                    )
            else:
                uid = require_non_negative_integer(
                    item.get("uid"), label="host artifact uid"
                )
                gid = require_non_negative_integer(
                    item.get("gid"), label="host artifact gid"
                )
                mode = require_non_negative_integer(
                    item.get("mode"), label="host artifact mode"
                )
                if (
                    uid != self.expected_uid
                    or mode > 0o7777
                    or (kind == "file" and mode & 0o7022)
                    or (kind == "symlink" and mode != 0o777)
                ):
                    raise ReleaseTransactionError(
                        "host artifact journal ownership or mode is unsafe"
                    )
                digest = require_digest(
                    item.get("sha256"), label="host artifact digest"
                )
                if kind == "file":
                    expected_backup = (
                        f"host-artifacts-{transaction_id}/{index:04d}.bin"
                    )
                    if (
                        item.get("backup") != expected_backup
                        or item.get("symlink_target") is not None
                    ):
                        raise ReleaseTransactionError(
                            "host artifact backup authority is invalid"
                        )
                else:
                    target = item.get("symlink_target")
                    if (
                        item.get("backup") is not None
                        or not isinstance(target, str)
                        or not target
                        or "\x00" in target
                        or not Path(target).is_absolute()
                        or Path(os.path.normpath(target)) != Path(target)
                        or ".." in Path(target).parts
                        or len(os.fsencode(target)) != size
                        or hashlib.sha256(os.fsencode(target)).hexdigest() != digest
                    ):
                        raise ReleaseTransactionError(
                            "host artifact symlink authority is invalid"
                        )
            validated.append(dict(item))
        return validated

    def _snapshot_native_boundary(
        self, transaction_id: str
    ) -> dict[str, object]:
        snapshot_root = self._host_snapshot_root(transaction_id)
        self._assert_safe_directory(
            snapshot_root,
            label="host artifact snapshot root",
            exact_mode=0o700,
        )
        source = self.native_boundary_helper_source
        self._assert_authority_path(source, label="native-boundary helper source")
        metadata = self._assert_safe_regular_file(
            source,
            label="native-boundary helper source",
        )
        if metadata.st_size > MAX_HOST_ARTIFACT_BYTES:
            raise ReleaseTransactionError("native-boundary helper is too large")
        helper_content = source.read_bytes()
        after = source.lstat()
        if (
            metadata.st_dev,
            metadata.st_ino,
            metadata.st_size,
            metadata.st_mtime_ns,
            metadata.st_ctime_ns,
        ) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        ):
            raise ReleaseTransactionError(
                "native-boundary helper changed while it was snapshotted"
            )
        helper_name = "native-boundary-helper.sh"
        helper_path = snapshot_root / helper_name
        descriptor = os.open(
            helper_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
            0o600,
        )
        try:
            offset = 0
            while offset < len(helper_content):
                offset += os.write(descriptor, helper_content[offset:])
            os.fchmod(descriptor, 0o600)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        self._fault("after_native_boundary_helper_snapshot")
        snapshot_name = "native-boundary.snapshot"
        snapshot_path = snapshot_root / snapshot_name
        try:
            self.native_boundary_snapshot(helper_path, snapshot_path)
        except Exception as exc:
            raise ReleaseTransactionError(
                f"cannot snapshot native-boundary runtime authority: {exc}"
            ) from exc
        snapshot_metadata = self._assert_safe_regular_file(
            snapshot_path,
            label="native-boundary snapshot",
            exact_mode=0o600,
        )
        if snapshot_metadata.st_size > MAX_HOST_ARTIFACT_BYTES:
            raise ReleaseTransactionError("native-boundary snapshot is too large")
        snapshot_flags = os.O_RDWR | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            snapshot_flags |= os.O_NOFOLLOW
        descriptor = os.open(snapshot_path, snapshot_flags)
        try:
            snapshot_content = self._read_regular_file(
                descriptor,
                limit=MAX_HOST_ARTIFACT_BYTES,
                label="native-boundary snapshot",
            )
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        state = self._native_boundary_snapshot_state(snapshot_content)
        self._fsync_directory(snapshot_root)
        self._fault("after_native_boundary_snapshot")
        return {
            "backup": f"{snapshot_root.name}/{snapshot_name}",
            "helper_backup": f"{snapshot_root.name}/{helper_name}",
            "helper_sha256": hashlib.sha256(helper_content).hexdigest(),
            "helper_size": len(helper_content),
            "sha256": hashlib.sha256(snapshot_content).hexdigest(),
            "size": len(snapshot_content),
            "state": state,
        }

    @staticmethod
    def _native_boundary_snapshot_state(content: bytes) -> str:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ReleaseTransactionError(
                "native-boundary snapshot is not UTF-8"
            ) from exc
        lines = text.splitlines()
        if not lines:
            raise ReleaseTransactionError("native-boundary snapshot is empty")
        header = lines[0]
        if header == f"{NATIVE_BOUNDARY_HEADER_PREFIX}absent":
            if len(lines) != 1:
                raise ReleaseTransactionError(
                    "absent native-boundary snapshot contains rules"
                )
            return "absent"
        if header == f"{NATIVE_BOUNDARY_HEADER_PREFIX}managed":
            body = "\n".join(lines[1:])
            if (
                "table inet trex_webui_native_boundary {" not in body
                or 'comment "Managed by TRex WebUI deploy/install.sh."' not in body
            ):
                raise ReleaseTransactionError(
                    "managed native-boundary snapshot lacks exact ownership authority"
                )
            return "managed"
        raise ReleaseTransactionError("native-boundary snapshot header is invalid")

    def _validate_native_boundary_record(
        self,
        value: object,
        *,
        transaction_id: str,
        required: bool,
    ) -> dict[str, object] | None:
        if not required:
            if value is not None:
                raise ReleaseTransactionError(
                    "native-boundary authority is outside this host profile"
                )
            return None
        if not isinstance(value, dict) or set(value) != NATIVE_BOUNDARY_ENTRY_KEYS:
            raise ReleaseTransactionError("native-boundary journal entry is malformed")
        expected_root = f"host-artifacts-{transaction_id}"
        if value.get("backup") != f"{expected_root}/native-boundary.snapshot" or value.get(
            "helper_backup"
        ) != f"{expected_root}/native-boundary-helper.sh":
            raise ReleaseTransactionError("native-boundary backup authority is invalid")
        state = value.get("state")
        if state not in {"absent", "managed"}:
            raise ReleaseTransactionError("native-boundary state is invalid")
        size = require_non_negative_integer(
            value.get("size"), label="native-boundary snapshot size"
        )
        helper_size = require_non_negative_integer(
            value.get("helper_size"), label="native-boundary helper size"
        )
        if not size or size > MAX_HOST_ARTIFACT_BYTES:
            raise ReleaseTransactionError("native-boundary snapshot size is invalid")
        if not helper_size or helper_size > MAX_HOST_ARTIFACT_BYTES:
            raise ReleaseTransactionError("native-boundary helper size is invalid")
        require_digest(value.get("sha256"), label="native-boundary snapshot digest")
        require_digest(
            value.get("helper_sha256"), label="native-boundary helper digest"
        )
        validated = dict(value)
        snapshot = self._load_native_boundary_backup(validated, helper=False)
        helper = self._load_native_boundary_backup(validated, helper=True)
        if self._native_boundary_snapshot_state(snapshot) != state:
            raise ReleaseTransactionError(
                "native-boundary snapshot state does not match its journal"
            )
        if not helper.startswith(b"#!/"):
            raise ReleaseTransactionError("native-boundary helper backup is invalid")
        return validated

    def _load_native_boundary_backup(
        self, record: dict[str, object], *, helper: bool
    ) -> bytes:
        backup_key = "helper_backup" if helper else "backup"
        size_key = "helper_size" if helper else "size"
        digest_key = "helper_sha256" if helper else "sha256"
        backup = record.get(backup_key)
        if not isinstance(backup, str):
            raise ReleaseTransactionError("native-boundary backup is missing")
        path = self.state_root / backup
        if path.parent.parent != self.state_root:
            raise ReleaseTransactionError("native-boundary backup escaped state root")
        metadata = path.lstat()
        if (
            not stat.S_ISREG(metadata.st_mode)
            or path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_nlink != 1
            or metadata.st_size != record[size_key]
        ):
            raise ReleaseTransactionError("native-boundary backup is unsafe")
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(path, flags)
        try:
            content = self._read_regular_file(
                descriptor,
                limit=MAX_HOST_ARTIFACT_BYTES,
                label="native-boundary backup",
            )
        finally:
            os.close(descriptor)
        if hashlib.sha256(content).hexdigest() != record[digest_key]:
            raise ReleaseTransactionError("native-boundary backup digest mismatch")
        return content

    def _validate_consumer_baseline_records(
        self,
        value: object,
        *,
        transaction_id: str,
        active: list[str],
    ) -> list[dict[str, object]]:
        if not isinstance(value, list) or len(value) != len(active):
            raise ReleaseTransactionError(
                "consumer baseline journal does not match active-state authority"
            )
        validated: list[dict[str, object]] = []
        kinds = {
            "trex-daemon-server.service": "daemon",
            "trex-webui-api.service": "api",
            "nginx.service": "nginx",
        }
        for index, (item, unit) in enumerate(zip(value, active)):
            if not isinstance(item, dict) or set(item) != CONSUMER_BASELINE_ENTRY_KEYS:
                raise ReleaseTransactionError("consumer baseline journal is malformed")
            if item.get("unit") != unit or item.get("kind") != kinds[unit]:
                raise ReleaseTransactionError("consumer baseline identity is invalid")
            response_size = require_non_negative_integer(
                item.get("response_size"), label="consumer baseline response size"
            )
            if response_size > MAX_HOST_ARTIFACT_BYTES:
                raise ReleaseTransactionError(
                    "consumer baseline response exceeds the size limit"
                )
            process_keys = (
                "working_directory",
                "exec_start",
                "argv0",
                "resolved_exec",
            )
            if kinds[unit] == "api":
                for key in process_keys:
                    field = item.get(key)
                    if (
                        not isinstance(field, str)
                        or not field
                        or "\x00" in field
                        or len(field.encode("utf-8")) > 16 * 1024
                    ):
                        raise ReleaseTransactionError(
                            "API baseline process identity is invalid"
                        )
                for key in ("working_directory", "argv0", "resolved_exec"):
                    path = Path(str(item[key]))
                    if not path.is_absolute() or path != Path(os.path.normpath(path)):
                        raise ReleaseTransactionError(
                            "API baseline process path is invalid"
                        )
                if any(
                    item.get(key) is not None
                    for key in ("response_backup", "response_sha256")
                ) or response_size != 0:
                    raise ReleaseTransactionError(
                        "API baseline contains unexpected response authority"
                    )
            elif kinds[unit] == "nginx":
                if any(item.get(key) is not None for key in process_keys):
                    raise ReleaseTransactionError(
                        "Nginx baseline contains unexpected process authority"
                    )
                expected_backup = (
                    f"host-artifacts-{transaction_id}/consumer-{index:02d}.bin"
                )
                if item.get("response_backup") != expected_backup or response_size == 0:
                    raise ReleaseTransactionError(
                        "Nginx baseline response authority is invalid"
                    )
                require_digest(
                    item.get("response_sha256"),
                    label="Nginx baseline response digest",
                )
                self._load_consumer_response(dict(item))
            else:
                if any(item.get(key) is not None for key in process_keys) or any(
                    item.get(key) is not None
                    for key in ("response_backup", "response_sha256")
                ) or response_size != 0:
                    raise ReleaseTransactionError(
                        "daemon baseline contains unexpected authority"
                    )
            validated.append(dict(item))
        return validated

    def _load_consumer_response(self, record: dict[str, object]) -> bytes:
        backup = record.get("response_backup")
        if not isinstance(backup, str):
            raise ReleaseTransactionError("consumer baseline response is missing")
        path = self.state_root / backup
        if path.parent.parent != self.state_root:
            raise ReleaseTransactionError(
                "consumer baseline response escaped state root"
            )
        metadata = path.lstat()
        if (
            not stat.S_ISREG(metadata.st_mode)
            or path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_nlink != 1
            or metadata.st_size != record["response_size"]
        ):
            raise ReleaseTransactionError("consumer baseline response is unsafe")
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != record["response_sha256"]:
            raise ReleaseTransactionError(
                "consumer baseline response digest mismatch"
            )
        return content

    def _restore_native_boundary(self, transaction: dict[str, object]) -> None:
        record = transaction.get("native_boundary")
        if record is None:
            return
        if not isinstance(record, dict):
            raise ReleaseTransactionError("native-boundary journal is invalid")
        snapshot = self.state_root / str(record["backup"])
        helper = self.state_root / str(record["helper_backup"])
        self._load_native_boundary_backup(record, helper=False)
        self._load_native_boundary_backup(record, helper=True)
        try:
            self.native_boundary_restore(helper, snapshot)
        except Exception as exc:
            raise ReleaseTransactionError(
                f"cannot restore native-boundary runtime authority: {exc}"
            ) from exc
        self._fault("after_native_boundary_restore")
        self._verify_native_boundary(transaction)

    def _verify_native_boundary(self, transaction: dict[str, object]) -> None:
        record = transaction.get("native_boundary")
        if record is None:
            return
        if not isinstance(record, dict):
            raise ReleaseTransactionError("native-boundary journal is invalid")
        snapshot = self.state_root / str(record["backup"])
        helper = self.state_root / str(record["helper_backup"])
        self._load_native_boundary_backup(record, helper=False)
        self._load_native_boundary_backup(record, helper=True)
        try:
            self.native_boundary_verify(helper, snapshot)
        except Exception as exc:
            raise ReleaseTransactionError(
                f"restored native-boundary verification failed: {exc}"
            ) from exc

    def _load_host_backup(self, record: dict[str, object]) -> bytes:
        backup = record.get("backup")
        if not isinstance(backup, str):
            raise ReleaseTransactionError("host artifact backup is missing")
        path = self.state_root / backup
        if path.parent.parent != self.state_root:
            raise ReleaseTransactionError("host artifact backup escaped state root")
        try:
            metadata = path.lstat()
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect host artifact backup {path}: {exc}"
            ) from exc
        if (
            not stat.S_ISREG(metadata.st_mode)
            or path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_nlink != 1
            or metadata.st_size != record["size"]
        ):
            raise ReleaseTransactionError("host artifact backup is unsafe")
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(path, flags)
        try:
            content = self._read_regular_file(
                descriptor,
                limit=MAX_HOST_ARTIFACT_BYTES,
                label="host artifact backup",
            )
        finally:
            os.close(descriptor)
        if hashlib.sha256(content).hexdigest() != record["sha256"]:
            raise ReleaseTransactionError("host artifact backup digest mismatch")
        return content

    def _assert_replaceable_host_target(self, path: Path) -> None:
        self._assert_host_artifact_parent(path)
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect current host artifact {path}: {exc}"
            ) from exc
        if (
            metadata.st_uid != self.expected_uid
            or metadata.st_nlink != 1
            or not (
                stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode)
            )
        ):
            raise ReleaseTransactionError(
                f"current host artifact is unsafe to replace: {path}"
            )

    def _restore_host_artifacts(self, transaction: dict[str, object]) -> None:
        records = transaction["host_artifacts"]
        if not isinstance(records, list):
            raise ReleaseTransactionError("host artifact journal is invalid")
        for index, record_value in enumerate(records):
            if not isinstance(record_value, dict):
                raise ReleaseTransactionError("host artifact journal is invalid")
            record = record_value
            path = Path(str(record["path"]))
            self._assert_replaceable_host_target(path)
            kind = str(record["kind"])
            if kind == "absent":
                try:
                    path.unlink()
                except FileNotFoundError:
                    pass
                except OSError as exc:
                    raise ReleaseTransactionError(
                        f"cannot remove new host artifact {path}: {exc}"
                    ) from exc
                if path.parent.exists():
                    self._fsync_directory(path.parent)
            elif kind == "file":
                content = self._load_host_backup(record)
                temporary = path.parent / f".{path.name}.restore-{uuid.uuid4()}"
                descriptor = -1
                try:
                    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
                    if hasattr(os, "O_NOFOLLOW"):
                        flags |= os.O_NOFOLLOW
                    descriptor = os.open(temporary, flags, 0o600)
                    offset = 0
                    while offset < len(content):
                        offset += os.write(descriptor, content[offset:])
                    os.fchown(descriptor, int(record["uid"]), int(record["gid"]))
                    os.fchmod(descriptor, int(record["mode"]))
                    os.fsync(descriptor)
                    os.close(descriptor)
                    descriptor = -1
                    os.replace(temporary, path)
                    self._fsync_directory(path.parent)
                except OSError as exc:
                    raise ReleaseTransactionError(
                        f"cannot restore host artifact {path}: {exc}"
                    ) from exc
                finally:
                    if descriptor >= 0:
                        os.close(descriptor)
                    try:
                        temporary.unlink()
                    except FileNotFoundError:
                        pass
                try:
                    self.host_artifact_relabel(path)
                except Exception as exc:
                    raise ReleaseTransactionError(
                        f"cannot restore SELinux authority for {path}: {exc}"
                    ) from exc
                self._fsync_directory(path.parent)
            else:
                target = str(record["symlink_target"])
                temporary = path.parent / f".{path.name}.restore-{uuid.uuid4()}"
                try:
                    os.symlink(target, temporary)
                    os.lchown(temporary, int(record["uid"]), int(record["gid"]))
                    os.replace(temporary, path)
                    self._fsync_directory(path.parent)
                except OSError as exc:
                    raise ReleaseTransactionError(
                        f"cannot restore host artifact link {path}: {exc}"
                    ) from exc
                finally:
                    try:
                        temporary.unlink()
                    except FileNotFoundError:
                        pass
                try:
                    self.host_artifact_relabel(path)
                except Exception as exc:
                    raise ReleaseTransactionError(
                        f"cannot restore SELinux authority for {path}: {exc}"
                    ) from exc
                self._fsync_directory(path.parent)
            self._fault(f"after_host_restore:{index}")
        if records:
            try:
                self.daemon_reload()
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot reload restored host consumer configuration: {exc}"
                ) from exc
            self._fault("after_host_daemon_reload")

    def _verify_host_artifacts_exact(
        self, transaction: dict[str, object]
    ) -> list[Path]:
        records = transaction["host_artifacts"]
        if not isinstance(records, list):
            raise ReleaseTransactionError("host artifact journal is invalid")
        present: list[Path] = []
        for record_value in records:
            if not isinstance(record_value, dict):
                raise ReleaseTransactionError("host artifact journal is invalid")
            record = record_value
            path = Path(str(record["path"]))
            kind = str(record["kind"])
            try:
                metadata = path.lstat()
            except FileNotFoundError:
                if kind == "absent":
                    continue
                raise ReleaseTransactionError(
                    f"restored host artifact is missing: {path}"
                )
            if kind == "absent":
                raise ReleaseTransactionError(
                    f"new host artifact survived rollback: {path}"
                )
            present.append(path)
            if (
                metadata.st_uid != record["uid"]
                or metadata.st_gid != record["gid"]
                or stat.S_IMODE(metadata.st_mode) != record["mode"]
                or metadata.st_nlink != 1
            ):
                raise ReleaseTransactionError(
                    f"restored host artifact metadata mismatch: {path}"
                )
            if kind == "file":
                if not stat.S_ISREG(metadata.st_mode):
                    raise ReleaseTransactionError(
                        f"restored host artifact type mismatch: {path}"
                    )
                content = path.read_bytes()
                if (
                    len(content) != record["size"]
                    or hashlib.sha256(content).hexdigest() != record["sha256"]
                ):
                    raise ReleaseTransactionError(
                        f"restored host artifact content mismatch: {path}"
                    )
            elif (
                not stat.S_ISLNK(metadata.st_mode)
                or os.readlink(path) != record["symlink_target"]
            ):
                raise ReleaseTransactionError(
                    f"restored host artifact link mismatch: {path}"
                )
        return present

    def _verify_restored_host_artifacts(
        self, transaction: dict[str, object]
    ) -> None:
        records = transaction["host_artifacts"]
        if not isinstance(records, list):
            raise ReleaseTransactionError("host artifact journal is invalid")
        present = self._verify_host_artifacts_exact(transaction)
        for path in present:
            try:
                self.host_artifact_relabel(path)
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"restored host artifact SELinux authority mismatch: {path}: {exc}"
                ) from exc
        if records:
            try:
                self.daemon_reload()
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot durably verify restored host consumers: {exc}"
                ) from exc

    def _cleanup_host_snapshots(self, transaction_id: str | None = None) -> None:
        try:
            entries = list(self.state_root.iterdir())
        except FileNotFoundError:
            return
        for path in entries:
            match = HOST_SNAPSHOT_RE.fullmatch(path.name)
            if match is None:
                continue
            if transaction_id is not None and match.group(1) != transaction_id:
                continue
            metadata = path.lstat()
            if (
                not stat.S_ISDIR(metadata.st_mode)
                or path.is_symlink()
                or metadata.st_uid != self.expected_uid
                or stat.S_IMODE(metadata.st_mode) != 0o700
            ):
                raise ReleaseTransactionError("host artifact snapshot root is unsafe")
            for child in path.iterdir():
                child_metadata = child.lstat()
                if (
                    not stat.S_ISREG(child_metadata.st_mode)
                    or child.is_symlink()
                    or child_metadata.st_uid != self.expected_uid
                    or stat.S_IMODE(child_metadata.st_mode) != 0o600
                    or child_metadata.st_nlink != 1
                ):
                    raise ReleaseTransactionError("host artifact snapshot is unsafe")
            if not getattr(shutil.rmtree, "avoids_symlink_attacks", False):
                raise ReleaseTransactionError(
                    "platform host snapshot cleanup is not symlink resistant"
                )
            shutil.rmtree(path)
            self._fsync_directory(self.state_root)

    def _cleanup_host_snapshots_except(self, transaction_id: str) -> None:
        """Remove orphaned snapshots while retaining the journal's authority."""

        transaction_id = require_uuid(transaction_id, label="transaction id")
        try:
            entries = list(self.state_root.iterdir())
        except FileNotFoundError:
            return
        for path in entries:
            match = HOST_SNAPSHOT_RE.fullmatch(path.name)
            if match is None or match.group(1) == transaction_id:
                continue
            self._cleanup_host_snapshots(match.group(1))

    @staticmethod
    def _warn_housekeeping(label: str, exc: Exception) -> None:
        """Report non-critical terminal cleanup without blocking availability."""

        # A terminal journal has already retired every rollback-only byte.  Its
        # selected release and consumer correctness must not depend on whether
        # unrelated garbage can be removed during boot.  stderr is deliberate:
        # CLI stdout remains a single machine-readable JSON document.
        with contextlib.suppress(Exception):
            print(
                f"warning: deferred release housekeeping ({label}): {exc}",
                file=sys.stderr,
                flush=True,
            )

    def _best_effort_housekeeping(
        self, label: str, operation: Callable[[], None]
    ) -> None:
        try:
            operation()
        except Exception as exc:
            self._warn_housekeeping(label, exc)

    def _best_effort_terminal_housekeeping(
        self,
        transaction: dict[str, object],
        retained: set[str],
    ) -> None:
        """Defer terminal garbage failures until the next prepare boundary."""

        transaction_id = str(transaction["transaction_id"])
        self._best_effort_housekeeping(
            "staging cleanup",
            self._cleanup_staging,
        )
        self._best_effort_housekeeping(
            "orphan host snapshot cleanup",
            lambda: self._cleanup_host_snapshots_except(transaction_id),
        )
        self._best_effort_housekeeping(
            "release pruning",
            lambda: self._prune_releases(retained),
        )

    def _best_effort_unjournaled_housekeeping(self, retained: set[str]) -> None:
        """Keep a healthy selector-only boot independent of unrelated garbage."""

        self._best_effort_housekeeping("staging cleanup", self._cleanup_staging)
        self._best_effort_housekeeping(
            "orphan host snapshot cleanup", self._cleanup_host_snapshots
        )
        self._best_effort_housekeeping(
            "release pruning", lambda: self._prune_releases(retained)
        )

    def _retire_terminal_rollback_authority(
        self, transaction: dict[str, object]
    ) -> dict[str, object]:
        """Durably detach terminal state from rollback-only backup bytes."""

        if transaction["phase"] not in TERMINAL_PHASES:
            raise ReleaseTransactionError(
                "rollback authority can be retired only after a terminal transition"
            )
        transaction_id = str(transaction["transaction_id"])
        if transaction["rollback_authority_retired"] is not True:
            # The last strict use of rollback-only bytes happens before the
            # compact journal forgets them.  In particular, a rolled-back
            # archive must prove its restored host/native authority once.
            self._verify_terminal(transaction)
            compacted = dict(transaction)
            compacted["host_artifacts"] = []
            compacted["native_boundary"] = None
            compacted["consumer_enable"] = []
            compacted["consumer_start"] = []
            compacted["consumer_active_before"] = []
            compacted["consumer_baseline"] = []
            compacted["consumer_mutation_armed"] = False
            compacted["daemon_mutation_started"] = False
            compacted["rollback_restored"] = False
            compacted["rollback_authority_retired"] = True
            compacted["updated_at"] = utc_now()
            self._write_transaction(compacted)
            transaction = compacted
            self._fault("after_terminal_rollback_authority_retired")
        # Cleanup is intentionally after the compact journal fsync and is not
        # correctness-critical.  Unsafe or temporarily inaccessible orphan
        # bytes are rejected strictly by the next prepare, before that prepare
        # can publish a new rollback authority or mutate selectors.
        self._best_effort_housekeeping(
            "retired terminal host snapshot cleanup",
            lambda: self._cleanup_host_snapshots(transaction_id),
        )
        return transaction

    def _write_transaction(self, value: dict[str, object]) -> None:
        value = self._validate_transaction(value)
        content = canonical_json_bytes(value) + b"\n"
        temporary = self.state_root / f".{TRANSACTION_FILE_NAME}.{uuid.uuid4()}.tmp"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = -1
        try:
            descriptor = os.open(temporary, flags, 0o600)
            offset = 0
            while offset < len(content):
                offset += os.write(descriptor, content[offset:])
            os.fsync(descriptor)
            os.close(descriptor)
            descriptor = -1
            os.replace(temporary, self.transaction_path)
            self._fsync_directory(self.state_root)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot persist release transaction: {exc}") from exc
        finally:
            if descriptor >= 0:
                os.close(descriptor)
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass

    def _load_transaction(self) -> dict[str, object] | None:
        try:
            metadata = self.transaction_path.lstat()
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot inspect release transaction: {exc}") from exc
        if (
            not stat.S_ISREG(metadata.st_mode)
            or self.transaction_path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_nlink != 1
        ):
            raise ReleaseTransactionError(
                "release transaction must be a root-owned regular 0600 file"
            )
        if metadata.st_size < 2 or metadata.st_size > MAX_TRANSACTION_BYTES:
            raise ReleaseTransactionError("release transaction size is invalid")
        try:
            flags = os.O_RDONLY | os.O_CLOEXEC
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(self.transaction_path, flags)
            try:
                content = os.read(descriptor, MAX_TRANSACTION_BYTES + 1)
                after = os.fstat(descriptor)
            finally:
                os.close(descriptor)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot read release transaction: {exc}") from exc
        if (metadata.st_dev, metadata.st_ino, metadata.st_size) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
        ):
            raise ReleaseTransactionError("release transaction changed while reading")
        parsed = strict_json_loads(content, label="release transaction")
        if not isinstance(parsed, dict):
            raise ReleaseTransactionError("release transaction root must be an object")
        return self._validate_transaction(parsed)

    def _validate_transaction(self, value: dict[str, object]) -> dict[str, object]:
        if set(value) != TRANSACTION_KEYS:
            raise ReleaseTransactionError("release transaction has an unexpected shape")
        if value.get("schema") != TRANSACTION_SCHEMA:
            raise ReleaseTransactionError("release transaction schema is unsupported")
        transaction_id = require_uuid(value.get("transaction_id"), label="transaction id")
        phase = value.get("phase")
        if not isinstance(phase, str) or phase not in PHASES:
            raise ReleaseTransactionError("release transaction phase is invalid")
        candidate = require_digest(value.get("candidate"), label="candidate")
        current_before = require_optional_digest(
            value.get("current_before"), label="current_before"
        )
        previous_before = require_optional_digest(
            value.get("previous_before"), label="previous_before"
        )
        if current_before == previous_before and current_before is not None:
            raise ReleaseTransactionError("current_before and previous_before must differ")
        if candidate == current_before:
            raise ReleaseTransactionError("candidate is already selected as current")
        candidate_bytes = require_non_negative_integer(
            value.get("candidate_bytes"), label="candidate_bytes"
        )
        reserve_bytes = require_non_negative_integer(
            value.get("reserve_bytes"), label="reserve_bytes"
        )
        created_at = require_timestamp(value.get("created_at"), label="created_at")
        updated_at = require_timestamp(value.get("updated_at"), label="updated_at")
        if updated_at < created_at:
            raise ReleaseTransactionError("release transaction timestamps are reversed")
        transaction_kind = value.get("transaction_kind")
        if not isinstance(transaction_kind, str) or transaction_kind not in TRANSACTION_KINDS:
            raise ReleaseTransactionError("release transaction kind is invalid")
        if transaction_kind == "archive" and candidate == previous_before:
            raise ReleaseTransactionError(
                "archive transaction cannot reuse retained previous release authority"
            )
        host_profile = value.get("host_profile")
        if host_profile is not None and host_profile not in {"common", "managed-local"}:
            raise ReleaseTransactionError("release transaction host profile is invalid")
        rollback_authority_retired = value.get("rollback_authority_retired")
        if not isinstance(rollback_authority_retired, bool):
            raise ReleaseTransactionError(
                "release transaction rollback authority retirement marker is invalid"
            )
        if rollback_authority_retired and phase not in TERMINAL_PHASES:
            raise ReleaseTransactionError(
                "nonterminal transaction cannot retire rollback authority"
            )
        expected_host_paths = (
            ()
            if rollback_authority_retired
            else self._host_paths_for_profile(
                host_profile if isinstance(host_profile, str) else None
            )
        )
        host_artifacts = self._validate_host_artifact_records(
            value.get("host_artifacts"),
            transaction_id=transaction_id,
            expected_paths=expected_host_paths,
        )
        # A journal is not valid authority when any referenced rollback byte
        # copy is missing or corrupt, including after the transaction became
        # terminal and a fresh process loads it.
        for record in host_artifacts:
            if record["kind"] == "file":
                self._load_host_backup(record)
        native_boundary = self._validate_native_boundary_record(
            value.get("native_boundary"),
            transaction_id=transaction_id,
            required=(
                host_profile == "managed-local" and not rollback_authority_retired
            ),
        )
        consumer_enable = value.get("consumer_enable")
        if (
            not isinstance(consumer_enable, list)
            or any(not isinstance(unit, str) for unit in consumer_enable)
            or len(consumer_enable) != len(set(consumer_enable))
            or consumer_enable
            != [unit for unit in CONSUMER_ENABLE_UNITS if unit in consumer_enable]
        ):
            raise ReleaseTransactionError(
                "release transaction consumer enable intent is invalid"
            )
        consumer_rollback_plan = value.get("consumer_rollback_plan")
        if (
            not isinstance(consumer_rollback_plan, list)
            or any(not isinstance(unit, str) for unit in consumer_rollback_plan)
            or len(consumer_rollback_plan) != len(set(consumer_rollback_plan))
            or consumer_rollback_plan
            != [
                unit
                for unit in CONSUMER_ENABLE_UNITS
                if unit in consumer_rollback_plan
            ]
        ):
            raise ReleaseTransactionError(
                "release transaction rollback consumer plan is invalid"
            )
        required_frontends = {
            "trex-webui-api.service",
            "nginx.service",
        }
        if transaction_kind == "archive" and not required_frontends.issubset(
            consumer_rollback_plan
        ):
            raise ReleaseTransactionError(
                "archive rollback plan must include API and Nginx"
            )
        if transaction_kind == "n-minus-one" and consumer_rollback_plan != [
            "trex-webui-api.service",
            "nginx.service",
        ]:
            raise ReleaseTransactionError("N-1 rollback plan is invalid")
        if transaction_kind in {"legacy-baseline", "selector-only"} and consumer_rollback_plan:
            raise ReleaseTransactionError(
                f"{transaction_kind} transaction cannot mutate consumers"
            )
        if transaction_kind == "selector-only" and host_profile is not None:
            raise ReleaseTransactionError(
                "selector-only transactions cannot own production host artifacts"
            )
        consumer_mutation_armed = value.get("consumer_mutation_armed")
        if not isinstance(consumer_mutation_armed, bool):
            raise ReleaseTransactionError(
                "release transaction consumer mutation marker is invalid"
            )
        if not consumer_mutation_armed and (
            value.get("consumer_active_before") or value.get("consumer_baseline")
        ):
            raise ReleaseTransactionError(
                "unarmed release transaction contains baseline consumer state"
            )
        daemon_mutation_started = value.get("daemon_mutation_started")
        if not isinstance(daemon_mutation_started, bool):
            raise ReleaseTransactionError(
                "release transaction daemon mutation marker is invalid"
            )
        consumer_active_before = value.get("consumer_active_before")
        if (
            not isinstance(consumer_active_before, list)
            or any(not isinstance(unit, str) for unit in consumer_active_before)
            or len(consumer_active_before) != len(set(consumer_active_before))
            or consumer_active_before
            != [
                unit
                for unit in CONSUMER_ENABLE_UNITS
                if unit in consumer_active_before
            ]
            or any(
                unit not in consumer_rollback_plan for unit in consumer_active_before
            )
        ):
            raise ReleaseTransactionError(
                "release transaction baseline consumer state is invalid"
            )
        consumer_baseline = self._validate_consumer_baseline_records(
            value.get("consumer_baseline"),
            transaction_id=transaction_id,
            active=list(consumer_active_before),
        )
        consumer_start = value.get("consumer_start")
        if (
            not isinstance(consumer_start, list)
            or any(not isinstance(unit, str) for unit in consumer_start)
            or len(consumer_start) != len(set(consumer_start))
            or consumer_start
            != [unit for unit in CONSUMER_ENABLE_UNITS if unit in consumer_start]
            or any(unit not in consumer_enable for unit in consumer_start)
        ):
            raise ReleaseTransactionError(
                "release transaction consumer start intent is invalid"
            )
        daemon_unit = "trex-daemon-server.service"
        if host_profile != "managed-local" and any(
            daemon_unit in intent
            for intent in (
                consumer_enable,
                consumer_start,
                consumer_rollback_plan,
                consumer_active_before,
            )
        ):
            raise ReleaseTransactionError(
                "external-daemon host profile cannot own daemon consumer intent"
            )
        if daemon_mutation_started and (
            transaction_kind != "archive"
            or host_profile != "managed-local"
            or daemon_unit not in consumer_rollback_plan
            or rollback_authority_retired
            or phase not in DAEMON_MUTATION_PHASES
            or (
                not consumer_mutation_armed
                and phase != "rolled_back"
            )
        ):
            raise ReleaseTransactionError(
                "daemon mutation marker escaped managed archive rollback authority"
            )
        rollback_restored = value.get("rollback_restored")
        if not isinstance(rollback_restored, bool):
            raise ReleaseTransactionError(
                "release transaction rollback restoration marker is invalid"
            )
        if rollback_restored and phase not in {
            "starting_baseline_consumers",
            "rolled_back",
        }:
            raise ReleaseTransactionError(
                "release transaction claims rollback restoration too early"
            )
        if rollback_authority_retired and (
            host_artifacts
            or native_boundary is not None
            or consumer_enable
            or consumer_start
            or consumer_active_before
            or consumer_baseline
            or consumer_mutation_armed
            or daemon_mutation_started
            or rollback_restored
        ):
            raise ReleaseTransactionError(
                "retired terminal transaction retained rollback-only authority"
            )
        return {
            "schema": TRANSACTION_SCHEMA,
            "transaction_id": transaction_id,
            "transaction_kind": transaction_kind,
            "phase": phase,
            "candidate": candidate,
            "current_before": current_before,
            "previous_before": previous_before,
            "rollback_authority_retired": rollback_authority_retired,
            "host_artifacts": host_artifacts,
            "host_profile": host_profile,
            "native_boundary": native_boundary,
            "consumer_enable": list(consumer_enable),
            "consumer_active_before": list(consumer_active_before),
            "consumer_baseline": consumer_baseline,
            "consumer_rollback_plan": list(consumer_rollback_plan),
            "consumer_mutation_armed": consumer_mutation_armed,
            "daemon_mutation_started": daemon_mutation_started,
            "consumer_start": list(consumer_start),
            "rollback_restored": rollback_restored,
            "candidate_bytes": candidate_bytes,
            "reserve_bytes": reserve_bytes,
            "created_at": created_at,
            "updated_at": updated_at,
        }

    def _set_phase(
        self, transaction: dict[str, object], phase: str
    ) -> dict[str, object]:
        if phase not in PHASES:
            raise ReleaseTransactionError(f"unsupported transaction phase {phase!r}")
        updated = dict(transaction)
        updated["phase"] = phase
        updated["updated_at"] = utc_now()
        self._write_transaction(updated)
        self._fault(f"after_phase:{phase}")
        return updated

    @staticmethod
    def _normalized_payload_path(value: object) -> str:
        if not isinstance(value, str) or not value or "\\" in value:
            raise ReleaseTransactionError("release payload path is invalid")
        if value.startswith("/") or any(ord(character) < 32 for character in value):
            raise ReleaseTransactionError(f"release payload path is unsafe: {value!r}")
        path = PurePosixPath(value)
        if str(path) != value or any(part in {"", ".", ".."} for part in path.parts):
            raise ReleaseTransactionError(f"release payload path is not canonical: {value!r}")
        if len(value.encode("utf-8")) > 4096:
            raise ReleaseTransactionError("release payload path is too long")
        return value

    def _manifest_identity(
        self, root: Path
    ) -> tuple[str, list[dict[str, object]], int]:
        manifest_path = root / RELEASE_MANIFEST_NAME
        try:
            metadata = manifest_path.lstat()
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot inspect release manifest: {exc}") from exc
        if (
            not stat.S_ISREG(metadata.st_mode)
            or manifest_path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) != 0o644
            or metadata.st_nlink != 1
            or metadata.st_size > MAX_MANIFEST_BYTES
        ):
            raise ReleaseTransactionError(
                "release manifest must be an owned regular 0644 file of bounded size"
            )
        try:
            content = manifest_path.read_bytes()
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot read release manifest: {exc}") from exc
        parsed = strict_json_loads(content, label="release manifest")
        if not isinstance(parsed, dict) or parsed.get("schema") != RELEASE_MANIFEST_SCHEMA:
            raise ReleaseTransactionError("release manifest schema is unsupported")
        identity = parsed.get("payload_identity")
        if not isinstance(identity, dict) or set(identity) != PAYLOAD_IDENTITY_KEYS:
            raise ReleaseTransactionError("release payload identity has an unexpected shape")
        if identity.get("algorithm") != PAYLOAD_IDENTITY_ALGORITHM:
            raise ReleaseTransactionError("release payload identity algorithm is unsupported")
        if (
            identity.get("manifest_path") != RELEASE_MANIFEST_NAME
            or identity.get("manifest_excluded") is not True
        ):
            raise ReleaseTransactionError(
                "release payload identity must exclude only RELEASE_MANIFEST.json"
            )
        digest = require_digest(identity.get("digest"), label="release payload digest")
        files = identity.get("files")
        if not isinstance(files, list):
            raise ReleaseTransactionError("release payload file manifest must be a list")
        file_count = identity.get("file_count")
        if (
            not isinstance(file_count, int)
            or isinstance(file_count, bool)
            or file_count != len(files)
            or not 1 <= file_count <= MAX_PAYLOAD_FILES
        ):
            raise ReleaseTransactionError("release payload file_count is invalid")

        validated: list[dict[str, object]] = []
        total_bytes = 0
        for item in files:
            if not isinstance(item, dict) or set(item) != PAYLOAD_ENTRY_KEYS:
                raise ReleaseTransactionError("release payload contains a malformed entry")
            path = self._normalized_payload_path(item.get("path"))
            if path == RELEASE_MANIFEST_NAME or item.get("type") != "file":
                raise ReleaseTransactionError(f"release payload entry is not allowed: {path}")
            mode = item.get("mode")
            if not isinstance(mode, str) or not re.fullmatch(r"[0-7]{4}", mode):
                raise ReleaseTransactionError(f"release payload mode is invalid: {path}")
            permissions = int(mode, 8)
            if permissions & 0o7022:
                raise ReleaseTransactionError(f"release payload mode is unsafe: {path}")
            size = item.get("size")
            if (
                not isinstance(size, int)
                or isinstance(size, bool)
                or size < 0
                or size > MAX_PAYLOAD_FILE_BYTES
            ):
                raise ReleaseTransactionError(f"release payload size is invalid: {path}")
            file_digest = require_digest(
                item.get("sha256"), label=f"release payload digest for {path}"
            )
            total_bytes += size
            if total_bytes > MAX_PAYLOAD_BYTES:
                raise ReleaseTransactionError("release payload exceeds the size limit")
            validated.append(
                {
                    "path": path,
                    "type": "file",
                    "mode": mode,
                    "size": size,
                    "sha256": file_digest,
                }
            )
        paths = [str(item["path"]) for item in validated]
        if paths != sorted(paths) or len(paths) != len(set(paths)):
            raise ReleaseTransactionError(
                "release payload file manifest must be sorted and unique"
            )
        calculated = hashlib.sha256(
            canonical_json_bytes(
                {"algorithm": PAYLOAD_IDENTITY_ALGORITHM, "files": validated}
            )
        ).hexdigest()
        if calculated != digest:
            raise ReleaseTransactionError("release payload identity digest does not match")
        return digest, validated, total_bytes + metadata.st_size

    def _scan_release_tree(self, root: Path) -> list[dict[str, object]]:
        actual: list[dict[str, object]] = []
        try:
            root_metadata = root.lstat()
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot inspect release tree {root}: {exc}") from exc
        if (
            not stat.S_ISDIR(root_metadata.st_mode)
            or root.is_symlink()
            or root_metadata.st_uid != self.expected_uid
            or stat.S_IMODE(root_metadata.st_mode) & 0o022
        ):
            raise ReleaseTransactionError(f"release tree root is unsafe: {root}")
        if (
            root.parent == self.releases_root
            and root_metadata.st_dev != self.releases_root.lstat().st_dev
        ):
            raise ReleaseTransactionError("release directory must share the release-store filesystem")
        if root.parent == self.releases_root and os.path.ismount(root):
            raise ReleaseTransactionError("release directory must not be a mountpoint")

        for directory, names, filenames in os.walk(root, topdown=True, followlinks=False):
            directory_path = Path(directory)
            directory_metadata = directory_path.lstat()
            if (
                not stat.S_ISDIR(directory_metadata.st_mode)
                or directory_path.is_symlink()
                or directory_metadata.st_uid != self.expected_uid
                or stat.S_IMODE(directory_metadata.st_mode) & 0o022
            ):
                raise ReleaseTransactionError(f"release directory is unsafe: {directory_path}")
            if directory_path == root:
                runtime_names = [
                    name
                    for name in names
                    if name == ".venv" or name.startswith(".venv.runtime-")
                ]
                for name in runtime_names:
                    self._validate_release_runtime(root / name, release_root=root)
                    names.remove(name)
            for name in names:
                child = directory_path / name
                child_metadata = child.lstat()
                if (
                    not stat.S_ISDIR(child_metadata.st_mode)
                    or child.is_symlink()
                    or child_metadata.st_uid != self.expected_uid
                    or stat.S_IMODE(child_metadata.st_mode) & 0o022
                ):
                    raise ReleaseTransactionError(f"release directory entry is unsafe: {child}")
            for name in filenames:
                path = directory_path / name
                relative = path.relative_to(root).as_posix()
                if relative == ".env":
                    self._validate_dotenv(path)
                    continue
                metadata = path.lstat()
                if (
                    not stat.S_ISREG(metadata.st_mode)
                    or path.is_symlink()
                    or metadata.st_uid != self.expected_uid
                    or metadata.st_nlink != 1
                ):
                    raise ReleaseTransactionError(f"release file is unsafe: {path}")
                mode = stat.S_IMODE(metadata.st_mode)
                if mode & 0o7022:
                    raise ReleaseTransactionError(f"release file mode is unsafe: {path}")
                if relative == RELEASE_MANIFEST_NAME:
                    continue
                flags = os.O_RDONLY | os.O_CLOEXEC
                if hasattr(os, "O_NOFOLLOW"):
                    flags |= os.O_NOFOLLOW
                descriptor = os.open(path, flags)
                try:
                    before = os.fstat(descriptor)
                    digest = hashlib.sha256()
                    size = 0
                    while chunk := os.read(descriptor, 1024 * 1024):
                        digest.update(chunk)
                        size += len(chunk)
                    after = os.fstat(descriptor)
                finally:
                    os.close(descriptor)
                if (
                    (before.st_dev, before.st_ino, before.st_size)
                    != (after.st_dev, after.st_ino, after.st_size)
                    or size != metadata.st_size
                ):
                    raise ReleaseTransactionError(f"release file changed while hashing: {path}")
                actual.append(
                    {
                        "path": relative,
                        "type": "file",
                        "mode": f"{mode:04o}",
                        "size": size,
                        "sha256": digest.hexdigest(),
                    }
                )
        actual.sort(key=lambda item: str(item["path"]))
        return actual

    def _read_exact_marker(self, path: Path, expected: str) -> None:
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(path, flags)
        except OSError as exc:
            raise ReleaseTransactionError(f"release runtime marker is unsafe: {path}: {exc}") from exc
        try:
            metadata = os.fstat(descriptor)
            content = os.read(descriptor, 4097)
        finally:
            os.close(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) != 0o644
            or metadata.st_nlink != 1
            or content != f"{expected}\n".encode("ascii")
        ):
            raise ReleaseTransactionError(f"release runtime marker is invalid: {path}")

    def _validate_dotenv(self, path: Path) -> os.stat_result:
        try:
            metadata = path.lstat()
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect release runtime configuration: {path}: {exc}"
            ) from exc
        if (
            not stat.S_ISREG(metadata.st_mode)
            or path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or metadata.st_gid != self._runtime_config_gid()
            or stat.S_IMODE(metadata.st_mode) != 0o640
            or metadata.st_nlink != 1
            or metadata.st_size > MAX_RUNTIME_CONFIG_BYTES
        ):
            raise ReleaseTransactionError(
                "release .env must be an owned service-group regular 0640 single-link file "
                f"of at most {MAX_RUNTIME_CONFIG_BYTES} bytes"
            )
        return metadata

    def _validate_release_runtime(self, runtime: Path, *, release_root: Path) -> None:
        name = runtime.name
        if name != ".venv" and re.fullmatch(r"\.venv\.runtime-[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*", name) is None:
            raise ReleaseTransactionError(f"release runtime name is invalid: {name}")
        metadata = runtime.lstat()
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or runtime.is_symlink()
            or metadata.st_uid != self.expected_uid
            or stat.S_IMODE(metadata.st_mode) & 0o022
            or metadata.st_dev != release_root.lstat().st_dev
            or os.path.ismount(runtime)
        ):
            raise ReleaseTransactionError(f"release runtime root is unsafe: {runtime}")
        self._read_exact_marker(
            runtime / MANAGED_MARKER_NAME,
            MANAGED_MARKER_VALUE,
        )
        release_marker = runtime / VENV_RELEASE_MARKER_NAME
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(release_marker, flags)
        try:
            marker_metadata = os.fstat(descriptor)
            release_value = os.read(descriptor, 4097)
        finally:
            os.close(descriptor)
        if (
            not stat.S_ISREG(marker_metadata.st_mode)
            or marker_metadata.st_uid != self.expected_uid
            or stat.S_IMODE(marker_metadata.st_mode) != 0o644
            or marker_metadata.st_nlink != 1
            or re.fullmatch(
                rb"trex-webui-venv-release-[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*\n",
                release_value,
            )
            is None
        ):
            raise ReleaseTransactionError(
                f"release runtime release marker is invalid: {release_marker}"
            )
        if name.startswith(".venv.runtime-"):
            self._read_exact_marker(
                runtime / VENV_RUNTIME_MARKER_NAME,
                VENV_RUNTIME_MARKER_VALUE,
            )

        entries = 0
        for directory, names, filenames in os.walk(runtime, topdown=True, followlinks=False):
            directory_path = Path(directory)
            for child_name in [*names, *filenames]:
                entries += 1
                if entries > 250_000:
                    raise ReleaseTransactionError("release runtime exceeds the entry limit")
                child = directory_path / child_name
                child_metadata = child.lstat()
                if child_metadata.st_uid != self.expected_uid:
                    raise ReleaseTransactionError(f"release runtime entry is not owned: {child}")
                if stat.S_ISLNK(child_metadata.st_mode):
                    resolved = Path(os.path.realpath(child))
                    try:
                        resolved_metadata = resolved.stat()
                    except OSError as exc:
                        raise ReleaseTransactionError(
                            f"release runtime link is broken: {child}: {exc}"
                        ) from exc
                    if not (
                        stat.S_ISREG(resolved_metadata.st_mode)
                        or stat.S_ISDIR(resolved_metadata.st_mode)
                    ):
                        raise ReleaseTransactionError(
                            f"release runtime link targets a special file: {child}"
                        )
                    if stat.S_ISDIR(resolved_metadata.st_mode):
                        try:
                            resolved.relative_to(runtime)
                        except ValueError as exc:
                            raise ReleaseTransactionError(
                                f"release runtime directory link escapes its root: {child}"
                            ) from exc
                    else:
                        self._assert_authority_path(
                            resolved,
                            label=f"release runtime link target {child}",
                        )
                        if (
                            resolved_metadata.st_uid not in {0, self.expected_uid}
                            or stat.S_IMODE(resolved_metadata.st_mode) & 0o022
                        ):
                            raise ReleaseTransactionError(
                                f"release runtime link target is writable or unowned: {child}"
                            )
                    continue
                if not (
                    stat.S_ISREG(child_metadata.st_mode)
                    or stat.S_ISDIR(child_metadata.st_mode)
                ):
                    raise ReleaseTransactionError(
                        f"release runtime contains a special file: {child}"
                    )
                if stat.S_IMODE(child_metadata.st_mode) & 0o022:
                    raise ReleaseTransactionError(
                        f"release runtime entry is group/other writable: {child}"
                    )

    def _verify_release_tree(
        self, root: Path, *, expected_digest: str | None = None
    ) -> tuple[str, int]:
        digest, expected_files, logical_bytes = self._manifest_identity(root)
        if expected_digest is not None and digest != expected_digest:
            raise ReleaseTransactionError(
                f"release payload digest mismatch: expected {expected_digest}, got {digest}"
            )
        actual_files = self._scan_release_tree(root)
        if actual_files != expected_files:
            expected_paths = {str(item["path"]) for item in expected_files}
            actual_paths = {str(item["path"]) for item in actual_files}
            missing = sorted(expected_paths - actual_paths)
            extra = sorted(actual_paths - expected_paths)
            if missing:
                raise ReleaseTransactionError(
                    f"release payload is missing manifested file {missing[0]}"
                )
            if extra:
                raise ReleaseTransactionError(
                    f"release payload has unmanifested file {extra[0]}"
                )
            raise ReleaseTransactionError("release payload metadata or content changed")
        return digest, logical_bytes

    def _release_path(self, digest: str) -> Path:
        return self.releases_root / f"sha256-{require_digest(digest, label='release digest')}"

    def _validate_selected_release(self, digest: str) -> None:
        path = self._release_path(digest)
        if path.parent != self.releases_root:
            raise ReleaseTransactionError("release path escaped the release store")
        self._verify_release_tree(path, expected_digest=digest)

    def _selector_digest(self, name: str, *, validate_release: bool = True) -> str | None:
        if name not in {"current", "previous"}:
            raise ReleaseTransactionError(f"unknown release selector {name!r}")
        path = self.install_root / name
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot inspect {name} selector: {exc}") from exc
        if not stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != self.expected_uid:
            raise ReleaseTransactionError(f"{name} selector must be an owned symbolic link")
        try:
            target = os.readlink(path)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot read {name} selector: {exc}") from exc
        match = re.fullmatch(r"releases/sha256-([0-9a-f]{64})", target)
        if match is None:
            raise ReleaseTransactionError(f"{name} selector target is unsafe: {target!r}")
        digest = match.group(1)
        if validate_release:
            self._validate_selected_release(digest)
        return digest

    def _atomic_set_selector(self, name: str, digest: str | None) -> None:
        current = self.install_root / name
        existing = None
        try:
            existing = current.lstat()
        except FileNotFoundError:
            pass
        if existing is not None and (
            not stat.S_ISLNK(existing.st_mode) or existing.st_uid != self.expected_uid
        ):
            raise ReleaseTransactionError(f"refusing to replace unsafe {name} selector")
        if digest is None:
            if existing is not None:
                current.unlink()
                self._fsync_directory(self.install_root)
            return
        self._validate_selected_release(digest)
        temporary = self.install_root / f".{name}.{uuid.uuid4()}.tmp"
        try:
            os.symlink(f"releases/sha256-{digest}", temporary)
            temporary_metadata = temporary.lstat()
            if (
                not stat.S_ISLNK(temporary_metadata.st_mode)
                or temporary_metadata.st_uid != self.expected_uid
            ):
                raise ReleaseTransactionError(f"temporary {name} selector is unsafe")
            os.replace(temporary, current)
            self._fsync_directory(self.install_root)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot publish {name} selector: {exc}") from exc
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass

    def _allocated_tree_bytes(self, root: Path) -> int:
        total = 0
        for directory, names, filenames in os.walk(root, topdown=True, followlinks=False):
            directory_path = Path(directory)
            directory_metadata = directory_path.lstat()
            total += max(directory_metadata.st_size, directory_metadata.st_blocks * 512)
            for name in [*names, *filenames]:
                metadata = (directory_path / name).lstat()
                total += max(metadata.st_size, metadata.st_blocks * 512)
        return total

    def _legacy_snapshot_capacity_preflight(
        self,
        *,
        destination: Path,
        source_bytes: int,
        reserve_bytes: int,
    ) -> None:
        """Reserve both the temporary snapshot and its later release-store copy."""

        source_bytes = require_non_negative_integer(
            source_bytes,
            label="legacy snapshot source bytes",
        )
        reserve_bytes = require_non_negative_integer(
            reserve_bytes,
            label="legacy snapshot reserve bytes",
        )
        destination_device = destination.parent.lstat().st_dev
        release_device = self.releases_root.lstat().st_dev
        destination_copies = 2 if destination_device == release_device else 1
        destination_required = source_bytes * destination_copies + reserve_bytes
        destination_available = self.available_bytes(destination.parent)
        if (
            not isinstance(destination_available, int)
            or isinstance(destination_available, bool)
            or destination_available < 0
        ):
            raise ReleaseTransactionError(
                "legacy snapshot filesystem capacity result is invalid"
            )
        if destination_available < destination_required:
            raise CapacityError(
                "legacy snapshot capacity preflight failed before copy: "
                f"required {destination_required} bytes "
                f"({source_bytes} source x {destination_copies} copies + "
                f"{reserve_bytes} reserve), available {destination_available}"
            )
        if destination_device == release_device:
            return

        release_available = self.available_bytes(self.releases_root)
        if (
            not isinstance(release_available, int)
            or isinstance(release_available, bool)
            or release_available < 0
        ):
            raise ReleaseTransactionError(
                "release filesystem capacity result is invalid"
            )
        release_required = source_bytes + reserve_bytes
        if release_available < release_required:
            raise CapacityError(
                "legacy release-store capacity preflight failed before snapshot copy: "
                f"required {release_required} bytes ({source_bytes} candidate + "
                f"{reserve_bytes} reserve), available {release_available}"
            )

    def _capacity_preflight(self, *, candidate_bytes: int, reserve_bytes: int) -> None:
        candidate_bytes = require_non_negative_integer(
            candidate_bytes, label="candidate bytes"
        )
        reserve_bytes = require_non_negative_integer(reserve_bytes, label="reserve bytes")
        available = self.available_bytes(self.releases_root)
        if not isinstance(available, int) or isinstance(available, bool) or available < 0:
            raise ReleaseTransactionError("filesystem capacity result is invalid")
        required = candidate_bytes + reserve_bytes
        if available < required:
            raise CapacityError(
                "release filesystem capacity preflight failed: "
                f"required {required} bytes ({candidate_bytes} candidate + "
                f"{reserve_bytes} reserve), available {available}"
            )

    def _fsync_tree(self, root: Path) -> None:
        directories: list[Path] = []
        for directory, names, filenames in os.walk(root, topdown=True, followlinks=False):
            directory_path = Path(directory)
            directories.append(directory_path)
            for name in names:
                child = directory_path / name
                relative = child.relative_to(root)
                in_runtime = bool(relative.parts) and (
                    relative.parts[0] == ".venv"
                    or relative.parts[0].startswith(".venv.runtime-")
                )
                if child.is_symlink() and in_runtime:
                    continue
                if child.is_symlink() or not child.is_dir():
                    raise ReleaseTransactionError(f"staged release entry is unsafe: {child}")
            for name in filenames:
                path = directory_path / name
                relative = path.relative_to(root)
                in_runtime = bool(relative.parts) and (
                    relative.parts[0] == ".venv"
                    or relative.parts[0].startswith(".venv.runtime-")
                )
                if path.is_symlink() and in_runtime:
                    continue
                flags = os.O_RDONLY | os.O_CLOEXEC
                if hasattr(os, "O_NOFOLLOW"):
                    flags |= os.O_NOFOLLOW
                descriptor = os.open(path, flags)
                try:
                    metadata = os.fstat(descriptor)
                    if not stat.S_ISREG(metadata.st_mode):
                        raise ReleaseTransactionError(f"staged release file is unsafe: {path}")
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
        for directory in reversed(directories):
            self._fsync_directory(directory)

    def _assert_disjoint_source(self, source: Path) -> None:
        source = self._canonical_absolute(source, "candidate source")
        try:
            resolved = source.resolve(strict=True)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot resolve candidate source: {exc}") from exc
        if resolved != source:
            raise ReleaseTransactionError("candidate source path must not contain symbolic links")
        for protected, label in (
            (self.install_root, "install root"),
            (self.state_root, "deployment state root"),
        ):
            if os.path.commonpath((source, protected)) in {os.fspath(source), os.fspath(protected)}:
                raise ReleaseTransactionError(
                    f"candidate source must be disjoint from the {label}"
                )

    def _copy_candidate(
        self,
        *,
        source: Path,
        transaction: dict[str, object],
    ) -> None:
        digest = str(transaction["candidate"])
        destination = self._release_path(digest)
        staging = self.releases_root / f".staging-{transaction['transaction_id']}"
        if destination.exists() or destination.is_symlink():
            self._verify_release_tree(destination, expected_digest=digest)
            return
        if staging.exists() or staging.is_symlink():
            raise ReleaseTransactionError(f"release staging path already exists: {staging}")
        try:
            # Payload symlinks are rejected before this point. Runtime
            # symlinks are separately authority-checked and must be preserved;
            # dereferencing a venv's interpreter link would silently change
            # both its identity and filesystem-capacity requirements.
            shutil.copytree(source, staging, symlinks=True, copy_function=shutil.copy2)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot stage release payload: {exc}") from exc
        source_dotenv = source / ".env"
        if source_dotenv.exists() or source_dotenv.is_symlink():
            source_dotenv_metadata = self._validate_dotenv(source_dotenv)
            staged_dotenv = staging / ".env"
            try:
                os.chown(
                    staged_dotenv,
                    self.expected_uid,
                    source_dotenv_metadata.st_gid,
                    follow_symlinks=False,
                )
                os.chmod(staged_dotenv, 0o640, follow_symlinks=False)
            except OSError as exc:
                raise ReleaseTransactionError(
                    f"cannot preserve release .env service-group authority: {exc}"
                ) from exc
        self._fsync_tree(staging)
        self._verify_release_tree(staging, expected_digest=digest)
        self._fault("after_stage_copy")
        try:
            os.rename(staging, destination)
        except OSError as exc:
            raise ReleaseTransactionError(f"cannot publish content-addressed release: {exc}") from exc
        self._fsync_directory(self.releases_root)
        self._fault("after_stage_rename")

    def _safe_remove_tree(self, path: Path, *, allowed_pattern: re.Pattern[str]) -> None:
        if path.parent != self.releases_root or allowed_pattern.fullmatch(path.name) is None:
            raise ReleaseTransactionError(f"refusing unsafe release cleanup path: {path}")
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or path.is_symlink()
            or metadata.st_uid != self.expected_uid
            or metadata.st_dev != self.releases_root.lstat().st_dev
            or os.path.ismount(path)
        ):
            raise ReleaseTransactionError(f"refusing unsafe release cleanup tree: {path}")
        self._validate_tree_for_removal(path)
        if not getattr(shutil.rmtree, "avoids_symlink_attacks", False):
            raise ReleaseTransactionError(
                "platform shutil.rmtree is not resistant to symbolic-link attacks"
            )
        shutil.rmtree(path)
        self._fsync_directory(self.releases_root)

    def _validate_tree_for_removal(self, root: Path) -> None:
        """Validate ownership/type boundaries without requiring a healthy runtime.

        A killed installer may leave an incomplete ``.venv`` in the candidate.
        Rollback must still be able to unlink that exact journal-owned release
        without following any of its runtime symlinks.
        """

        for directory, names, filenames in os.walk(root, topdown=True, followlinks=False):
            directory_path = Path(directory)
            metadata = directory_path.lstat()
            if (
                not stat.S_ISDIR(metadata.st_mode)
                or directory_path.is_symlink()
                or metadata.st_uid != self.expected_uid
                or stat.S_IMODE(metadata.st_mode) & 0o022
            ):
                raise ReleaseTransactionError(
                    f"refusing unsafe release cleanup directory: {directory_path}"
                )
            for name in names:
                child = directory_path / name
                child_metadata = child.lstat()
                relative = child.relative_to(root)
                in_runtime = bool(relative.parts) and (
                    relative.parts[0] == ".venv"
                    or relative.parts[0].startswith(".venv.runtime-")
                )
                if stat.S_ISLNK(child_metadata.st_mode) and in_runtime:
                    if child_metadata.st_uid != self.expected_uid:
                        raise ReleaseTransactionError(
                            f"refusing unowned runtime link during cleanup: {child}"
                        )
                    continue
                if (
                    not stat.S_ISDIR(child_metadata.st_mode)
                    or child_metadata.st_uid != self.expected_uid
                    or stat.S_IMODE(child_metadata.st_mode) & 0o022
                ):
                    raise ReleaseTransactionError(
                        f"refusing unsafe release cleanup entry: {child}"
                    )
            for name in filenames:
                child = directory_path / name
                child_metadata = child.lstat()
                relative = child.relative_to(root)
                in_runtime = bool(relative.parts) and (
                    relative.parts[0] == ".venv"
                    or relative.parts[0].startswith(".venv.runtime-")
                )
                if stat.S_ISLNK(child_metadata.st_mode) and in_runtime:
                    if child_metadata.st_uid != self.expected_uid:
                        raise ReleaseTransactionError(
                            f"refusing unowned runtime link during cleanup: {child}"
                        )
                    continue
                if (
                    not stat.S_ISREG(child_metadata.st_mode)
                    or child_metadata.st_uid != self.expected_uid
                    or stat.S_IMODE(child_metadata.st_mode) & 0o7022
                ):
                    raise ReleaseTransactionError(
                        f"refusing unsafe release cleanup entry: {child}"
                    )

    def _cleanup_staging(self, transaction_id: str | None = None) -> None:
        for entry in self.releases_root.iterdir():
            match = STAGING_NAME_RE.fullmatch(entry.name)
            if match is None:
                continue
            if transaction_id is not None and match.group(1) != transaction_id:
                continue
            self._safe_remove_tree(entry, allowed_pattern=STAGING_NAME_RE)

    def _prune_releases(self, retained: set[str]) -> None:
        for digest in retained:
            self._validate_selected_release(digest)
        for entry in self.releases_root.iterdir():
            if STAGING_NAME_RE.fullmatch(entry.name):
                self._safe_remove_tree(entry, allowed_pattern=STAGING_NAME_RE)
                continue
            match = RELEASE_NAME_RE.fullmatch(entry.name)
            if match is None:
                raise ReleaseTransactionError(
                    f"release store contains an unknown entry: {entry.name}"
                )
            digest = match.group(1)
            if digest not in retained:
                self._safe_remove_tree(entry, allowed_pattern=RELEASE_NAME_RE)

    def _strict_prepare_housekeeping(
        self,
        current: str | None,
        previous: str | None,
    ) -> None:
        """Close deferred garbage before publishing any new rollback authority."""

        # Boot availability treats unselected garbage as non-authoritative, but
        # a new prepare must not stack another transaction on top of bytes that
        # cannot be proven safe to remove. These checks run before host
        # snapshots, a new journal, candidate copies, or selector changes.
        self._cleanup_staging()
        self._cleanup_host_snapshots()
        self._prune_releases(
            {digest for digest in (current, previous) if digest is not None}
        )

    @staticmethod
    def _selected_digests(transaction: dict[str, object]) -> set[str]:
        return {
            digest
            for digest in (
                transaction.get("candidate"),
                transaction.get("current_before"),
                transaction.get("previous_before"),
            )
            if isinstance(digest, str)
        }

    def _assert_selectors_belong_to_transaction(
        self,
        transaction: dict[str, object],
        *,
        allow_equal_during_rollback: bool = False,
    ) -> tuple[str | None, str | None]:
        current = self._selector_digest(
            "current", validate_release=not allow_equal_during_rollback
        )
        previous = self._selector_digest(
            "previous", validate_release=not allow_equal_during_rollback
        )
        allowed = self._selected_digests(transaction)
        if current is not None and current not in allowed:
            raise ReleaseTransactionError("current selector escaped the active transaction")
        if previous is not None and previous not in allowed:
            raise ReleaseTransactionError("previous selector escaped the active transaction")
        if (
            current is not None
            and current == previous
            and not allow_equal_during_rollback
        ):
            raise ReleaseTransactionError("current and previous selectors must differ")
        return current, previous

    def _rollback_locked(
        self, transaction: dict[str, object]
    ) -> dict[str, object]:
        phase = str(transaction["phase"])
        if phase in {"finalizing_consumer_enable", "committed"}:
            raise ReleaseTransactionError(
                "a release with durable commit intent cannot be rolled back implicitly"
            )
        if phase == "rolled_back":
            transaction = self._retire_terminal_rollback_authority(transaction)
            self._verify_terminal(transaction)
            retained = {
                digest
                for digest in (
                    transaction.get("current_before"),
                    transaction.get("previous_before"),
                )
                if isinstance(digest, str)
            }
            self._best_effort_terminal_housekeeping(transaction, retained)
            return transaction
        if phase == "starting_baseline_consumers":
            return self._queue_baseline_consumer_starts(transaction)
        self._assert_selectors_belong_to_transaction(
            transaction,
            # Switching two independent selectors necessarily has a brief
            # equal-target window during N-1 reactivation and rollback.  Both
            # targets are still restricted to this journal's exact digests.
            allow_equal_during_rollback=True,
        )
        consumers_armed = transaction["consumer_mutation_armed"] is True
        if not consumers_armed:
            current = self._selector_digest("current")
            previous = self._selector_digest("previous")
            if (
                current != transaction.get("current_before")
                or previous != transaction.get("previous_before")
            ):
                raise ReleaseTransactionError(
                    "unarmed transaction changed selectors or host mutation ordering"
                )
            completed = dict(transaction)
            completed["consumer_active_before"] = []
            completed["consumer_baseline"] = []
            completed["consumer_mutation_armed"] = False
            completed["rollback_restored"] = False
            transaction = self._set_phase(completed, "rolled_back")
            transaction = self._retire_terminal_rollback_authority(transaction)
            retained = {
                digest
                for digest in (
                    transaction.get("current_before"),
                    transaction.get("previous_before"),
                )
                if isinstance(digest, str)
            }
            self._best_effort_terminal_housekeeping(transaction, retained)
            return transaction
        plan = transaction["consumer_rollback_plan"]
        assert isinstance(plan, list)
        daemon_unit = "trex-daemon-server.service"
        managed_daemon_plan = (
            transaction["transaction_kind"] == "archive"
            and transaction["host_profile"] == "managed-local"
            and daemon_unit in plan
        )
        daemon_mutation_started = transaction["daemon_mutation_started"] is True
        effective_plan = [
            unit
            for unit in plan
            if not (
                managed_daemon_plan
                and not daemon_mutation_started
                and unit == daemon_unit
            )
        ]
        if effective_plan:
            transaction = self._set_phase(transaction, "stopping_consumers")
            try:
                stopper = (
                    self.consumer_force_stop
                    if managed_daemon_plan and daemon_mutation_started
                    else self.consumer_stop
                )
                stopper(tuple(str(unit) for unit in effective_plan))
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot quiesce release consumers before rollback: {exc}"
                ) from exc
            self._fault("after_consumers_stopped")
            transaction = self._set_phase(transaction, "consumers_stopped")
        # Restore selectors while the candidate units still retain their hard
        # dependency on the reconciler. Only after the baseline selector is
        # safe do we restore possibly-legacy unit bytes.
        transaction = self._set_phase(transaction, "rolling_back_current")
        self._atomic_set_selector("current", transaction.get("current_before"))  # type: ignore[arg-type]
        self._fault("after_rollback_current_link")
        transaction = self._set_phase(transaction, "rolling_back_previous")
        self._atomic_set_selector("previous", transaction.get("previous_before"))  # type: ignore[arg-type]
        self._fault("after_rollback_previous_link")
        host_restore_planned = (
            transaction["transaction_kind"] == "archive"
            and (not managed_daemon_plan or daemon_mutation_started)
        )
        native_restore_planned = host_restore_planned and (
            daemon_unit in plan
        )
        if native_restore_planned:
            transaction = self._set_phase(
                transaction, "restoring_native_boundary"
            )
            self._restore_native_boundary(transaction)
            transaction = self._set_phase(
                transaction, "native_boundary_restored"
            )
        if host_restore_planned:
            transaction = self._set_phase(transaction, "restoring_host_artifacts")
            self._restore_host_artifacts(transaction)
            transaction = self._set_phase(transaction, "host_artifacts_restored")
        restored = dict(transaction)
        restored["rollback_restored"] = host_restore_planned
        active_before = restored["consumer_active_before"]
        assert isinstance(active_before, list)
        if active_before:
            transaction = self._set_phase(
                restored, "starting_baseline_consumers"
            )
            return self._queue_baseline_consumer_starts(transaction)
        completed = restored
        completed["consumer_mutation_armed"] = False
        transaction = self._set_phase(completed, "rolled_back")
        transaction = self._retire_terminal_rollback_authority(transaction)
        retained = {
            digest
            for digest in (
                transaction.get("current_before"),
                transaction.get("previous_before"),
            )
            if isinstance(digest, str)
        }
        self._best_effort_terminal_housekeeping(transaction, retained)
        return transaction

    def _queue_baseline_consumer_starts(
        self, transaction: dict[str, object]
    ) -> dict[str, object]:
        if transaction["phase"] != "starting_baseline_consumers":
            raise ReleaseTransactionError(
                "baseline consumer starts require durable pending intent"
            )
        current = self._selector_digest("current")
        previous = self._selector_digest("previous")
        if (
            current != transaction.get("current_before")
            or previous != transaction.get("previous_before")
        ):
            raise ReleaseTransactionError(
                "baseline selectors changed while consumer starts were pending"
            )
        if transaction["rollback_restored"] is True:
            self._verify_restored_host_artifacts(transaction)
            plan = transaction["consumer_rollback_plan"]
            assert isinstance(plan, list)
            if "trex-daemon-server.service" in plan:
                self._verify_native_boundary(transaction)
        active_before = transaction["consumer_active_before"]
        assert isinstance(active_before, list)
        for index, unit in enumerate(active_before):
            if (
                unit == "trex-daemon-server.service"
                and transaction["transaction_kind"] == "archive"
                and transaction["host_profile"] == "managed-local"
                and transaction["daemon_mutation_started"] is False
            ):
                # The durable intent boundary proves this transaction never
                # took ownership of the baseline daemon. Leave it untouched;
                # only frontend consumers actually fenced by the transaction
                # are queued for restoration.
                continue
            try:
                self.consumer_start(str(unit))
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot restore baseline consumer {unit}: {exc}"
                ) from exc
            self._fault(f"after_baseline_consumer_start:{index}")
        return transaction

    def acknowledge_consumers(self) -> dict[str, object] | None:
        """Clear durable rollback start intent only after every unit is active."""

        with self._locked():
            transaction = self._load_transaction()
            if transaction is None or transaction["phase"] != "starting_baseline_consumers":
                return transaction
            active_before = transaction["consumer_active_before"]
            assert isinstance(active_before, list)
            baselines = transaction["consumer_baseline"]
            assert isinstance(baselines, list)
            for unit, baseline in zip(active_before, baselines):
                if (
                    unit == "trex-daemon-server.service"
                    and transaction["transaction_kind"] == "archive"
                    and transaction["host_profile"] == "managed-local"
                    and transaction["daemon_mutation_started"] is False
                ):
                    continue
                try:
                    active = self.consumer_is_active(str(unit))
                except Exception as exc:
                    raise ReleaseTransactionError(
                        f"cannot acknowledge baseline consumer {unit}: {exc}"
                    ) from exc
                if not active:
                    raise ReleaseTransactionError(
                        f"baseline consumer is not active yet: {unit}"
                    )
                try:
                    assert isinstance(baseline, dict)
                    ready = self.consumer_is_ready(baseline, self.state_root)
                except Exception as exc:
                    raise ReleaseTransactionError(
                        f"cannot prove baseline consumer readiness for {unit}: {exc}"
                    ) from exc
                if not ready:
                    raise ReleaseTransactionError(
                        f"baseline consumer is active but not ready: {unit}"
                    )
            completed = dict(transaction)
            completed["consumer_active_before"] = []
            completed["consumer_baseline"] = []
            completed["consumer_mutation_armed"] = False
            transaction = self._set_phase(completed, "rolled_back")
            transaction = self._retire_terminal_rollback_authority(transaction)
            retained = {
                digest
                for digest in (
                    transaction.get("current_before"),
                    transaction.get("previous_before"),
                )
                if isinstance(digest, str)
            }
            self._best_effort_terminal_housekeeping(transaction, retained)
            return transaction

    def _finalize_commit_locked(
        self, transaction: dict[str, object]
    ) -> dict[str, object]:
        """Idempotently publish boot consumers after durable selector commit intent."""

        if transaction["phase"] != "finalizing_consumer_enable":
            raise ReleaseTransactionError(
                "consumer enable publication requires durable commit intent"
            )
        current, previous = self._assert_selectors_belong_to_transaction(transaction)
        if (
            current != transaction["candidate"]
            or previous != transaction.get("current_before")
        ):
            raise ReleaseTransactionError(
                "commit-intent selectors do not match the transaction"
            )
        desired = transaction["consumer_enable"]
        assert isinstance(desired, list)
        for index, unit in enumerate(desired):
            assert isinstance(unit, str)
            try:
                self.consumer_enable(unit)
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot enable committed consumer {unit}: {exc}"
                ) from exc
            self._fault(f"after_consumer_enable:{index}")
            try:
                enabled = self.consumer_is_enabled(unit)
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot verify committed consumer {unit}: {exc}"
                ) from exc
            if not enabled:
                raise ReleaseTransactionError(
                    f"committed consumer did not become enabled: {unit}"
                )
            self._fault(f"after_consumer_enable_verified:{index}")
        if desired:
            try:
                self.daemon_reload()
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"cannot reload systemd after consumer enable publication: {exc}"
                ) from exc
            self._fault("after_consumer_daemon_reload")
            # Enabling a unit during an already-running boot transaction does
            # not enqueue it. Queue starts without waiting: each consumer is
            # ordered after this transient reconciler and will run only once
            # the committed journal is durable and this unit exits.
            starts = transaction["consumer_start"]
            assert isinstance(starts, list)
            for index, unit in enumerate(starts):
                try:
                    self.consumer_start(str(unit))
                except Exception as exc:
                    raise ReleaseTransactionError(
                        f"cannot queue committed consumer {unit}: {exc}"
                    ) from exc
                self._fault(f"after_consumer_start:{index}")
        completed = dict(transaction)
        # Enable/start intent is a one-shot finalizer, not permanent policy.
        # Operators remain free to disable a service after this transaction.
        completed["consumer_enable"] = []
        completed["consumer_start"] = []
        completed["consumer_active_before"] = []
        completed["consumer_baseline"] = []
        completed["consumer_mutation_armed"] = False
        completed["daemon_mutation_started"] = False
        transaction = self._set_phase(completed, "committed")
        transaction = self._retire_terminal_rollback_authority(transaction)
        retained = {str(transaction["candidate"])}
        if isinstance(transaction.get("current_before"), str):
            retained.add(str(transaction["current_before"]))
        self._best_effort_terminal_housekeeping(transaction, retained)
        return transaction

    def _verify_terminal(self, transaction: dict[str, object]) -> None:
        phase = str(transaction["phase"])
        if phase == "committed":
            expected_current = transaction["candidate"]
            expected_previous = transaction.get("current_before")
        elif phase == "rolled_back":
            expected_current = transaction.get("current_before")
            expected_previous = transaction.get("previous_before")
        else:
            raise ReleaseTransactionError("release transaction is not terminal")
        current = self._selector_digest("current")
        previous = self._selector_digest("previous")
        if current != expected_current or previous != expected_previous:
            raise ReleaseTransactionError(
                f"terminal {phase} selectors do not match the durable journal"
            )
        if phase == "rolled_back" and transaction["rollback_restored"] is True:
            self._verify_restored_host_artifacts(transaction)
            plan = transaction["consumer_rollback_plan"]
            assert isinstance(plan, list)
            if "trex-daemon-server.service" in plan:
                self._verify_native_boundary(transaction)

    def _reconcile_locked(self) -> dict[str, object] | None:
        transaction = self._load_transaction()
        if transaction is None:
            current = self._selector_digest("current")
            previous = self._selector_digest("previous")
            if current is not None and current == previous:
                raise ReleaseTransactionError("current and previous selectors must differ")
            self._best_effort_unjournaled_housekeeping(
                {digest for digest in (current, previous) if digest is not None}
            )
            return None
        phase = str(transaction["phase"])
        if phase == "finalizing_consumer_enable":
            return self._finalize_commit_locked(transaction)
        if phase == "starting_baseline_consumers":
            return self._queue_baseline_consumer_starts(transaction)
        if phase not in TERMINAL_PHASES:
            return self._rollback_locked(transaction)
        transaction = self._retire_terminal_rollback_authority(transaction)
        self._verify_terminal(transaction)
        if phase == "committed":
            retained = {
                str(transaction["candidate"]),
                *(
                    [str(transaction["current_before"])]
                    if transaction.get("current_before") is not None
                    else []
                ),
            }
        else:
            retained = {
                digest
                for digest in (
                    transaction.get("current_before"),
                    transaction.get("previous_before"),
                )
                if isinstance(digest, str)
            }
        self._best_effort_terminal_housekeeping(transaction, retained)
        return transaction

    @staticmethod
    def _stable_file_identity(metadata: os.stat_result) -> tuple[int, ...]:
        return (
            metadata.st_dev,
            metadata.st_ino,
            metadata.st_mode,
            metadata.st_uid,
            metadata.st_gid,
            metadata.st_nlink,
            metadata.st_size,
            metadata.st_mtime_ns,
            metadata.st_ctime_ns,
        )

    def _legacy_regular_file_identity(
        self,
        path: Path,
        *,
        label: str,
        exact_mode: int | None = None,
        expected_gid: int | None = None,
        limit: int = MAX_PAYLOAD_FILE_BYTES,
    ) -> dict[str, object]:
        """Hash one stable legacy file and return only copy-semantic fields."""

        metadata = self._assert_safe_regular_file(
            path,
            label=label,
            exact_mode=exact_mode,
        )
        if expected_gid is not None and metadata.st_gid != expected_gid:
            raise ReleaseTransactionError(
                f"{label} must be owned by gid {expected_gid}: {path}"
            )
        if metadata.st_size > limit:
            raise ReleaseTransactionError(f"{label} exceeds the size limit")
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(path, flags)
            try:
                before = os.fstat(descriptor)
                content = self._read_regular_file(
                    descriptor,
                    limit=limit,
                    label=label,
                )
                after = os.fstat(descriptor)
            finally:
                os.close(descriptor)
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot read {label} {path}: {exc}"
            ) from exc
        expected = self._stable_file_identity(metadata)
        if (
            self._stable_file_identity(before) != expected
            or self._stable_file_identity(after) != expected
            or len(content) != metadata.st_size
        ):
            raise ReleaseTransactionError(
                f"{label} changed while it was hashed: {path}"
            )
        return {
            "type": "file",
            "mode": f"{stat.S_IMODE(metadata.st_mode):04o}",
            "uid": metadata.st_uid,
            "gid": metadata.st_gid,
            "size": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }

    def _legacy_tree_identity(
        self,
        root: Path,
        *,
        label: str,
    ) -> list[dict[str, object]]:
        """Capture exact copy semantics for a live legacy directory tree."""

        self._assert_safe_directory(root, label=label)
        records: list[dict[str, object]] = []
        total_bytes = 0
        entries = 0
        try:
            walker = os.walk(root, topdown=True, followlinks=False)
            for directory, names, filenames in walker:
                directory_path = Path(directory)
                directory_metadata = self._assert_safe_directory(
                    directory_path,
                    label=label,
                )
                relative_directory = directory_path.relative_to(root).as_posix()
                records.append(
                    {
                        "path": "." if relative_directory == "." else relative_directory,
                        "type": "directory",
                        "mode": f"{stat.S_IMODE(directory_metadata.st_mode):04o}",
                        "uid": directory_metadata.st_uid,
                        "gid": directory_metadata.st_gid,
                    }
                )
                names.sort()
                filenames.sort()
                for name in list(names):
                    child = directory_path / name
                    child_metadata = child.lstat()
                    if stat.S_ISLNK(child_metadata.st_mode):
                        names.remove(name)
                        entries += 1
                        if entries > 250_000:
                            raise ReleaseTransactionError(
                                f"{label} exceeds the entry limit"
                            )
                        target = os.readlink(child)
                        after = child.lstat()
                        if (
                            child_metadata.st_uid != self.expected_uid
                            or child_metadata.st_nlink != 1
                            or self._stable_file_identity(child_metadata)
                            != self._stable_file_identity(after)
                        ):
                            raise ReleaseTransactionError(
                                f"{label} symbolic link is unsafe or changed: {child}"
                            )
                        records.append(
                            {
                                "path": child.relative_to(root).as_posix(),
                                "type": "symlink",
                                "mode": f"{stat.S_IMODE(child_metadata.st_mode):04o}",
                                "uid": child_metadata.st_uid,
                                "gid": child_metadata.st_gid,
                                "target": target,
                            }
                        )
                    elif not stat.S_ISDIR(child_metadata.st_mode):
                        raise ReleaseTransactionError(
                            f"{label} contains a special entry: {child}"
                        )
                for name in filenames:
                    child = directory_path / name
                    child_metadata = child.lstat()
                    entries += 1
                    if entries > 250_000:
                        raise ReleaseTransactionError(
                            f"{label} exceeds the entry limit"
                        )
                    relative = child.relative_to(root).as_posix()
                    if stat.S_ISLNK(child_metadata.st_mode):
                        target = os.readlink(child)
                        after = child.lstat()
                        if (
                            child_metadata.st_uid != self.expected_uid
                            or child_metadata.st_nlink != 1
                            or self._stable_file_identity(child_metadata)
                            != self._stable_file_identity(after)
                        ):
                            raise ReleaseTransactionError(
                                f"{label} symbolic link is unsafe or changed: {child}"
                            )
                        records.append(
                            {
                                "path": relative,
                                "type": "symlink",
                                "mode": f"{stat.S_IMODE(child_metadata.st_mode):04o}",
                                "uid": child_metadata.st_uid,
                                "gid": child_metadata.st_gid,
                                "target": target,
                            }
                        )
                        continue
                    if not stat.S_ISREG(child_metadata.st_mode):
                        raise ReleaseTransactionError(
                            f"{label} contains a special entry: {child}"
                        )
                    record = self._legacy_regular_file_identity(
                        child,
                        label=label,
                    )
                    total_bytes += int(record["size"])
                    if total_bytes > MAX_PAYLOAD_BYTES:
                        raise ReleaseTransactionError(
                            f"{label} exceeds the size limit"
                        )
                    records.append({"path": relative, **record})
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot scan {label} {root}: {exc}"
            ) from exc
        records.sort(key=lambda item: str(item["path"]))
        return records

    def _legacy_optional_tree_identity(
        self,
        path: Path,
        *,
        label: str,
    ) -> list[dict[str, object]] | None:
        try:
            path.lstat()
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect {label} {path}: {exc}"
            ) from exc
        self._assert_authority_path(path, label=label)
        return self._legacy_tree_identity(path, label=label)

    def _legacy_optional_dotenv_identity(
        self,
        path: Path,
    ) -> dict[str, object] | None:
        try:
            path.lstat()
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise ReleaseTransactionError(
                f"cannot inspect legacy runtime configuration {path}: {exc}"
            ) from exc
        self._assert_authority_path(path, label="legacy runtime configuration")
        metadata = self._validate_dotenv(path)
        return self._legacy_regular_file_identity(
            path,
            label="legacy runtime configuration",
            exact_mode=0o640,
            expected_gid=metadata.st_gid,
            limit=MAX_RUNTIME_CONFIG_BYTES,
        )

    @staticmethod
    def _assert_legacy_copy_identity(
        *,
        label: str,
        before: object,
        after: object,
        snapshot: object,
    ) -> None:
        if before != after:
            raise ReleaseTransactionError(
                f"{label} changed while the legacy rollback baseline was copied"
            )
        if after != snapshot:
            raise ReleaseTransactionError(
                f"legacy rollback snapshot differs from {label}"
            )

    def _assert_legacy_profiles_identity(
        self,
        *,
        before: list[dict[str, object]] | None,
        after: list[dict[str, object]] | None,
        snapshot: list[dict[str, object]],
    ) -> None:
        if before != after:
            raise ReleaseTransactionError(
                "legacy profiles changed while the legacy rollback baseline was copied"
            )
        if after is None:
            if len(snapshot) != 1 or snapshot[0].get("type") != "directory":
                raise ReleaseTransactionError(
                    "legacy rollback snapshot differs from absent profiles"
                )
            return
        self._assert_legacy_copy_identity(
            label="legacy profiles",
            before=before,
            after=after,
            snapshot=snapshot,
        )

    def snapshot_legacy(
        self,
        *,
        destination: Path,
        static_root: Path,
        runtime_root: Path,
        reserve_bytes: int = DEFAULT_RESERVE_BYTES,
    ) -> dict[str, object]:
        """Build a minimal, complete serving bundle for first migration rollback.

        The snapshot is created outside the install tree and then consumed by
        the normal verified ``prepare`` path. It intentionally captures the
        API source, profiles, currently served static tree, and the exact
        loaded Python runtime as ``.venv`` so the stable post-migration unit
        remains runnable after a pre-commit crash.
        """

        destination = self._canonical_absolute(destination, "legacy snapshot")
        static_root = self._canonical_absolute(static_root, "legacy static root")
        runtime_root = self._canonical_absolute(runtime_root, "legacy runtime root")
        with self._locked():
            reconciled = self._reconcile_locked()
            if reconciled is not None and reconciled["phase"] not in TERMINAL_PHASES:
                raise ReleaseTransactionError(
                    "consumer recovery is still pending; acknowledge it before prepare"
                )
            if self._selector_digest("current") is not None or self._selector_digest(
                "previous"
            ) is not None:
                raise ReleaseTransactionError(
                    "legacy snapshot is only valid before the first release selector"
                )
            for path, label in (
                (destination.parent, "legacy snapshot parent"),
                (self.install_root / "apps" / "api", "legacy API source"),
                (static_root, "legacy static root"),
                (runtime_root, "legacy runtime root"),
            ):
                self._assert_authority_path(path, label=label)
                self._assert_safe_directory(path, label=label)
            if destination.exists() or destination.is_symlink():
                raise ReleaseTransactionError(
                    f"legacy snapshot destination already exists: {destination}"
                )
            if not (static_root / "index.html").is_file():
                raise ReleaseTransactionError(
                    "legacy static root has no index.html serving entrypoint"
                )
            api_root = self.install_root / "apps" / "api"
            profiles = self.install_root / "profiles"
            api_before = self._legacy_tree_identity(
                api_root,
                label="legacy API source",
            )
            static_before = self._legacy_tree_identity(
                static_root,
                label="legacy static root",
            )
            profiles_before = self._legacy_optional_tree_identity(
                profiles,
                label="legacy profiles",
            )
            runtime_before = self._legacy_tree_identity(
                runtime_root,
                label="legacy runtime root",
            )
            legacy_dotenv = self.install_root / ".env"
            dotenv_before = self._legacy_optional_dotenv_identity(legacy_dotenv)
            source_roots = [
                api_root,
                static_root,
                runtime_root,
            ]
            if profiles_before is not None:
                source_roots.append(profiles)
            dotenv_metadata: os.stat_result | None = None
            if dotenv_before is not None:
                dotenv_metadata = self._validate_dotenv(legacy_dotenv)
            source_bytes = sum(
                self._allocated_tree_bytes(path) for path in source_roots
            )
            if dotenv_metadata is not None:
                source_bytes += max(
                    dotenv_metadata.st_size,
                    dotenv_metadata.st_blocks * 512,
                )
            self._legacy_snapshot_capacity_preflight(
                destination=destination,
                source_bytes=source_bytes,
                reserve_bytes=reserve_bytes,
            )
            try:
                destination.mkdir(mode=0o755)
                (destination / "apps" / "web").mkdir(parents=True, mode=0o755)
                shutil.copytree(
                    api_root,
                    destination / "apps" / "api",
                    symlinks=True,
                    copy_function=shutil.copy2,
                )
                self._fault("after_legacy_api_copy")
                shutil.copytree(
                    static_root,
                    destination / "apps" / "web" / "dist",
                    symlinks=True,
                    copy_function=shutil.copy2,
                )
                self._fault("after_legacy_static_copy")
                if profiles_before is not None:
                    shutil.copytree(
                        profiles,
                        destination / "profiles",
                        symlinks=True,
                        copy_function=shutil.copy2,
                    )
                else:
                    (destination / "profiles").mkdir(mode=0o755)
                    (destination / "profiles").chmod(0o755)
                self._fault("after_legacy_profiles_copy")
                shutil.copytree(
                    runtime_root,
                    destination / ".venv",
                    symlinks=True,
                    copy_function=shutil.copy2,
                )
                self._fault("after_legacy_runtime_copy")
                if dotenv_metadata is not None:
                    snapshot_dotenv = destination / ".env"
                    shutil.copy2(legacy_dotenv, snapshot_dotenv)
                    os.chown(
                        snapshot_dotenv,
                        self.expected_uid,
                        dotenv_metadata.st_gid,
                        follow_symlinks=False,
                    )
                    os.chmod(snapshot_dotenv, 0o640, follow_symlinks=False)
                self._fault("after_legacy_dotenv_copy")

                # The API remains live during first-migration capture. Close
                # every sequential-copy window before creating a manifest or
                # any release transaction: live source must be unchanged and
                # the snapshot must exactly match its serving authority.
                api_after = self._legacy_tree_identity(
                    api_root,
                    label="legacy API source",
                )
                static_after = self._legacy_tree_identity(
                    static_root,
                    label="legacy static root",
                )
                profiles_after = self._legacy_optional_tree_identity(
                    profiles,
                    label="legacy profiles",
                )
                runtime_after = self._legacy_tree_identity(
                    runtime_root,
                    label="legacy runtime root",
                )
                dotenv_after = self._legacy_optional_dotenv_identity(legacy_dotenv)
                api_snapshot = self._legacy_tree_identity(
                    destination / "apps" / "api",
                    label="legacy API snapshot",
                )
                static_snapshot = self._legacy_tree_identity(
                    destination / "apps" / "web" / "dist",
                    label="legacy static snapshot",
                )
                profiles_snapshot = self._legacy_tree_identity(
                    destination / "profiles",
                    label="legacy profiles snapshot",
                )
                runtime_snapshot = self._legacy_tree_identity(
                    destination / ".venv",
                    label="legacy runtime snapshot",
                )
                dotenv_snapshot = self._legacy_optional_dotenv_identity(
                    destination / ".env"
                )
                self._assert_legacy_copy_identity(
                    label="legacy API source",
                    before=api_before,
                    after=api_after,
                    snapshot=api_snapshot,
                )
                self._assert_legacy_copy_identity(
                    label="legacy static root",
                    before=static_before,
                    after=static_after,
                    snapshot=static_snapshot,
                )
                self._assert_legacy_profiles_identity(
                    before=profiles_before,
                    after=profiles_after,
                    snapshot=profiles_snapshot,
                )
                self._assert_legacy_copy_identity(
                    label="legacy runtime root",
                    before=runtime_before,
                    after=runtime_after,
                    snapshot=runtime_snapshot,
                )
                self._assert_legacy_copy_identity(
                    label="legacy runtime configuration",
                    before=dotenv_before,
                    after=dotenv_after,
                    snapshot=dotenv_snapshot,
                )
                entries = self._scan_release_tree(destination)
                if not entries:
                    raise ReleaseTransactionError("legacy snapshot payload is empty")
                digest = hashlib.sha256(
                    canonical_json_bytes(
                        {
                            "algorithm": PAYLOAD_IDENTITY_ALGORITHM,
                            "files": entries,
                        }
                    )
                ).hexdigest()
                manifest = {
                    "schema": RELEASE_MANIFEST_SCHEMA,
                    "legacy_baseline": True,
                    "payload_identity": {
                        "algorithm": PAYLOAD_IDENTITY_ALGORITHM,
                        "digest": digest,
                        "file_count": len(entries),
                        "manifest_path": RELEASE_MANIFEST_NAME,
                        "manifest_excluded": True,
                        "files": entries,
                    },
                }
                manifest_path = destination / RELEASE_MANIFEST_NAME
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
                if hasattr(os, "O_NOFOLLOW"):
                    flags |= os.O_NOFOLLOW
                descriptor = os.open(manifest_path, flags, 0o644)
                try:
                    content = canonical_json_bytes(manifest) + b"\n"
                    offset = 0
                    while offset < len(content):
                        offset += os.write(descriptor, content[offset:])
                    os.fchmod(descriptor, 0o644)
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
                self._fsync_tree(destination)
                verified_digest, logical_bytes = self._verify_release_tree(destination)
            except BaseException:
                if destination.is_dir() and not destination.is_symlink():
                    shutil.rmtree(destination)
                raise
            return {
                "schema": "trex-webui-legacy-release-snapshot/v1",
                "destination": os.fspath(destination),
                "digest": verified_digest,
                "logical_bytes": logical_bytes,
            }

    def verify_legacy_snapshot(
        self,
        *,
        snapshot: Path,
        static_root: Path,
        runtime_root: Path,
    ) -> dict[str, object]:
        """Re-prove every live first-migration authority against its snapshot."""

        snapshot = self._canonical_absolute(snapshot, "legacy snapshot")
        static_root = self._canonical_absolute(static_root, "legacy static root")
        runtime_root = self._canonical_absolute(runtime_root, "legacy runtime root")
        with self._locked():
            reconciled = self._reconcile_locked()
            if reconciled is not None and reconciled["phase"] not in TERMINAL_PHASES:
                raise ReleaseTransactionError(
                    "consumer recovery is still pending; cannot verify legacy snapshot"
                )
            self._assert_authority_path(snapshot, label="legacy snapshot")
            self._assert_safe_directory(snapshot, label="legacy snapshot")
            digest, _logical_bytes = self._verify_release_tree(snapshot)
            api_root = self.install_root / "apps" / "api"
            profiles = self.install_root / "profiles"
            legacy_dotenv = self.install_root / ".env"
            for path, label in (
                (api_root, "legacy API source"),
                (static_root, "legacy static root"),
                (runtime_root, "legacy runtime root"),
            ):
                self._assert_authority_path(path, label=label)
                self._assert_safe_directory(path, label=label)

            api_before = self._legacy_tree_identity(
                api_root, label="legacy API source"
            )
            static_before = self._legacy_tree_identity(
                static_root, label="legacy static root"
            )
            profiles_before = self._legacy_optional_tree_identity(
                profiles, label="legacy profiles"
            )
            runtime_before = self._legacy_tree_identity(
                runtime_root, label="legacy runtime root"
            )
            dotenv_before = self._legacy_optional_dotenv_identity(legacy_dotenv)

            api_snapshot = self._legacy_tree_identity(
                snapshot / "apps" / "api", label="legacy API snapshot"
            )
            static_snapshot = self._legacy_tree_identity(
                snapshot / "apps" / "web" / "dist",
                label="legacy static snapshot",
            )
            profiles_snapshot = self._legacy_tree_identity(
                snapshot / "profiles", label="legacy profiles snapshot"
            )
            runtime_snapshot = self._legacy_tree_identity(
                snapshot / ".venv", label="legacy runtime snapshot"
            )
            dotenv_snapshot = self._legacy_optional_dotenv_identity(
                snapshot / ".env"
            )

            api_after = self._legacy_tree_identity(
                api_root, label="legacy API source"
            )
            static_after = self._legacy_tree_identity(
                static_root, label="legacy static root"
            )
            profiles_after = self._legacy_optional_tree_identity(
                profiles, label="legacy profiles"
            )
            runtime_after = self._legacy_tree_identity(
                runtime_root, label="legacy runtime root"
            )
            dotenv_after = self._legacy_optional_dotenv_identity(legacy_dotenv)

            self._assert_legacy_copy_identity(
                label="legacy API source",
                before=api_before,
                after=api_after,
                snapshot=api_snapshot,
            )
            self._assert_legacy_copy_identity(
                label="legacy static root",
                before=static_before,
                after=static_after,
                snapshot=static_snapshot,
            )
            self._assert_legacy_profiles_identity(
                before=profiles_before,
                after=profiles_after,
                snapshot=profiles_snapshot,
            )
            self._assert_legacy_copy_identity(
                label="legacy runtime root",
                before=runtime_before,
                after=runtime_after,
                snapshot=runtime_snapshot,
            )
            self._assert_legacy_copy_identity(
                label="legacy runtime configuration",
                before=dotenv_before,
                after=dotenv_after,
                snapshot=dotenv_snapshot,
            )
            return {
                "schema": "trex-webui-legacy-snapshot-verification/v1",
                "digest": digest,
            }

    def attach_dotenv(
        self,
        *,
        transaction_id: str,
        source: Path,
    ) -> dict[str, object]:
        """Attach the operator's optional runtime config to a prepared bundle."""

        transaction_id = require_uuid(transaction_id, label="transaction id")
        source = self._canonical_absolute(source, "runtime configuration source")
        with self._locked():
            transaction = self._load_transaction()
            if transaction is None or transaction["transaction_id"] != transaction_id:
                raise ReleaseTransactionError("release transaction id does not match")
            if transaction["phase"] != "prepared":
                raise ReleaseTransactionError(
                    "runtime configuration can only attach to a prepared release"
                )
            self._assert_authority_path(
                source,
                label="runtime configuration source",
            )
            source_metadata = self._validate_dotenv(source)
            candidate = self._release_path(str(transaction["candidate"]))
            self._verify_release_tree(
                candidate,
                expected_digest=str(transaction["candidate"]),
            )
            destination = candidate / ".env"
            if destination.exists() or destination.is_symlink():
                raise ReleaseTransactionError(
                    "prepared release already has runtime configuration"
                )
            temporary = candidate / f".env.{uuid.uuid4()}.tmp"
            source_flags = os.O_RDONLY | os.O_CLOEXEC
            destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
            if hasattr(os, "O_NOFOLLOW"):
                source_flags |= os.O_NOFOLLOW
                destination_flags |= os.O_NOFOLLOW
            source_descriptor = os.open(source, source_flags)
            destination_descriptor = -1
            digest = hashlib.sha256()
            try:
                observed = os.fstat(source_descriptor)
                if (
                    observed.st_dev,
                    observed.st_ino,
                    observed.st_size,
                    observed.st_uid,
                    observed.st_gid,
                ) != (
                    source_metadata.st_dev,
                    source_metadata.st_ino,
                    source_metadata.st_size,
                    source_metadata.st_uid,
                    source_metadata.st_gid,
                ):
                    raise ReleaseTransactionError(
                        "runtime configuration changed before it could be copied"
                    )
                destination_descriptor = os.open(
                    temporary,
                    destination_flags,
                    0o640,
                )
                total = 0
                while chunk := os.read(source_descriptor, 65536):
                    total += len(chunk)
                    if total > MAX_RUNTIME_CONFIG_BYTES:
                        raise ReleaseTransactionError(
                            "runtime configuration exceeds the size limit"
                        )
                    digest.update(chunk)
                    offset = 0
                    while offset < len(chunk):
                        offset += os.write(destination_descriptor, chunk[offset:])
                os.fchown(
                    destination_descriptor,
                    self.expected_uid,
                    source_metadata.st_gid,
                )
                os.fchmod(destination_descriptor, 0o640)
                os.fsync(destination_descriptor)
                os.close(destination_descriptor)
                destination_descriptor = -1
                os.replace(temporary, destination)
                self._fsync_directory(candidate)
            finally:
                os.close(source_descriptor)
                if destination_descriptor >= 0:
                    os.close(destination_descriptor)
                try:
                    temporary.unlink()
                except FileNotFoundError:
                    pass
            self._verify_release_tree(
                candidate,
                expected_digest=str(transaction["candidate"]),
            )
            return {
                "schema": "trex-webui-release-runtime-config/v1",
                "transaction_id": transaction_id,
                "sha256": digest.hexdigest(),
                "size": source_metadata.st_size,
            }

    def prepare(
        self,
        source: Path,
        *,
        reserve_bytes: int = DEFAULT_RESERVE_BYTES,
        consumer_enable: tuple[str, ...] = (),
        consumer_start: tuple[str, ...] = (),
        consumer_rollback_plan: tuple[str, ...] = (),
        host_profile: str | None = None,
        transaction_kind: str = "selector-only",
    ) -> dict[str, object]:
        """Stage a verified source tree and durably record a prepared upgrade."""

        source = self._canonical_absolute(Path(source), "candidate source")
        desired_consumers = [
            unit for unit in CONSUMER_ENABLE_UNITS if unit in consumer_enable
        ]
        if (
            len(consumer_enable) != len(set(consumer_enable))
            or len(desired_consumers) != len(consumer_enable)
        ):
            raise ReleaseTransactionError("consumer enable intent is invalid")
        desired_starts = [
            unit for unit in CONSUMER_ENABLE_UNITS if unit in consumer_start
        ]
        if (
            len(consumer_start) != len(set(consumer_start))
            or len(desired_starts) != len(consumer_start)
            or any(unit not in desired_consumers for unit in desired_starts)
        ):
            raise ReleaseTransactionError("consumer start intent is invalid")
        rollback_plan = [
            unit for unit in CONSUMER_ENABLE_UNITS if unit in consumer_rollback_plan
        ]
        if (
            len(consumer_rollback_plan) != len(set(consumer_rollback_plan))
            or len(rollback_plan) != len(consumer_rollback_plan)
        ):
            raise ReleaseTransactionError("consumer rollback plan is invalid")
        if transaction_kind not in TRANSACTION_KINDS - {"n-minus-one"}:
            raise ReleaseTransactionError("release transaction kind is invalid")
        required_frontends = {
            "trex-webui-api.service",
            "nginx.service",
        }
        if transaction_kind == "archive" and not required_frontends.issubset(
            rollback_plan
        ):
            raise ReleaseTransactionError(
                "archive rollback plan must include API and Nginx"
            )
        if transaction_kind in {"legacy-baseline", "selector-only"} and rollback_plan:
            raise ReleaseTransactionError(
                f"{transaction_kind} transaction cannot mutate consumers"
            )
        daemon_unit = "trex-daemon-server.service"
        if host_profile != "managed-local" and any(
            daemon_unit in intent
            for intent in (desired_consumers, desired_starts, rollback_plan)
        ):
            raise ReleaseTransactionError(
                "external-daemon host profile cannot own daemon consumer intent"
            )
        with self._locked():
            reconciled = self._reconcile_locked()
            if reconciled is not None and reconciled["phase"] not in TERMINAL_PHASES:
                raise ReleaseTransactionError(
                    "consumer recovery is still pending; acknowledge it before prepare"
                )
            self._assert_disjoint_source(source)
            current = self._selector_digest("current")
            previous = self._selector_digest("previous")
            self._strict_prepare_housekeeping(current, previous)
            digest, logical_bytes = self._verify_release_tree(source)
            if digest == current:
                raise ReleaseTransactionError("candidate release is already current")
            if transaction_kind == "archive" and digest == previous:
                raise ReleaseTransactionError(
                    "archive candidate is the retained previous release; use guarded N-1 rollback"
                )
            destination = self._release_path(digest)
            candidate_bytes = 0
            if destination.exists() or destination.is_symlink():
                self._verify_release_tree(destination, expected_digest=digest)
            else:
                candidate_bytes = max(
                    self._allocated_tree_bytes(source),
                    logical_bytes,
                )
            self._capacity_preflight(
                candidate_bytes=candidate_bytes,
                reserve_bytes=reserve_bytes,
            )
            now = utc_now()
            transaction_id = str(uuid.uuid4())
            host_paths = self._host_paths_for_profile(host_profile)
            host_artifacts = self._snapshot_host_artifacts(
                transaction_id, host_paths
            )
            native_boundary = (
                self._snapshot_native_boundary(transaction_id)
                if host_profile == "managed-local"
                else None
            )
            transaction: dict[str, object] = {
                "schema": TRANSACTION_SCHEMA,
                "transaction_id": transaction_id,
                "transaction_kind": transaction_kind,
                "phase": "staging",
                "candidate": digest,
                "current_before": current,
                "previous_before": previous,
                "host_artifacts": host_artifacts,
                "host_profile": host_profile,
                "native_boundary": native_boundary,
                "consumer_enable": desired_consumers,
                "consumer_active_before": [],
                "consumer_baseline": [],
                "consumer_rollback_plan": rollback_plan,
                "consumer_mutation_armed": False,
                "daemon_mutation_started": False,
                "consumer_start": desired_starts,
                "rollback_authority_retired": False,
                "rollback_restored": False,
                "candidate_bytes": candidate_bytes,
                "reserve_bytes": reserve_bytes,
                "created_at": now,
                "updated_at": now,
            }
            self._write_transaction(transaction)
            # The new durable journal is now the sole rollback authority. Its
            # snapshot remains strict until a terminal compact journal fsyncs.
            self._cleanup_host_snapshots_except(transaction_id)
            self._fault("after_phase:staging")
            self._copy_candidate(source=source, transaction=transaction)
            return self._set_phase(transaction, "prepared")

    def prepare_previous(
        self, *, host_profile: str | None = None
    ) -> dict[str, object]:
        """Prepare the complete retained N-1 release for a guarded reactivation."""

        with self._locked():
            reconciled = self._reconcile_locked()
            if reconciled is not None and reconciled["phase"] not in TERMINAL_PHASES:
                raise ReleaseTransactionError(
                    "consumer recovery is still pending; acknowledge it before prepare"
                )
            current = self._selector_digest("current")
            previous = self._selector_digest("previous")
            if current is None or previous is None:
                raise ReleaseTransactionError(
                    "a current and complete previous release are required for N-1 rollback"
                )
            self._strict_prepare_housekeeping(current, previous)
            self._validate_selected_release(current)
            self._validate_selected_release(previous)
            now = utc_now()
            transaction_id = str(uuid.uuid4())
            host_paths = self._host_paths_for_profile(host_profile)
            host_artifacts = self._snapshot_host_artifacts(
                transaction_id, host_paths
            )
            transaction: dict[str, object] = {
                "schema": TRANSACTION_SCHEMA,
                "transaction_id": transaction_id,
                "transaction_kind": "n-minus-one",
                "phase": "staging",
                "candidate": previous,
                "current_before": current,
                "previous_before": previous,
                "host_artifacts": host_artifacts,
                "host_profile": host_profile,
                "native_boundary": None,
                "consumer_enable": [],
                "consumer_active_before": [],
                "consumer_baseline": [],
                "consumer_rollback_plan": [
                    "trex-webui-api.service",
                    "nginx.service",
                ],
                "consumer_mutation_armed": False,
                "daemon_mutation_started": False,
                "consumer_start": [],
                "rollback_authority_retired": False,
                "rollback_restored": False,
                "candidate_bytes": 0,
                "reserve_bytes": 0,
                "created_at": now,
                "updated_at": now,
            }
            self._write_transaction(transaction)
            self._cleanup_host_snapshots_except(transaction_id)
            self._fault("after_phase:staging")
            return self._set_phase(transaction, "prepared")

    def activate(self, transaction_id: str) -> dict[str, object]:
        """Select a prepared candidate; the caller must still commit readiness."""

        transaction_id = require_uuid(transaction_id, label="transaction id")
        with self._locked():
            transaction = self._load_transaction()
            if transaction is None:
                raise ReleaseTransactionError("there is no prepared release transaction")
            if transaction["transaction_id"] != transaction_id:
                raise ReleaseTransactionError("release transaction id does not match")
            if transaction["phase"] == "activated":
                current, previous = self._assert_selectors_belong_to_transaction(
                    transaction
                )
                if (
                    current != transaction["candidate"]
                    or previous != transaction.get("current_before")
                ):
                    raise ReleaseTransactionError(
                        "activated selectors do not match the transaction"
                    )
                return transaction
            if transaction["phase"] != "prepared":
                self._reconcile_locked()
                raise ReleaseTransactionError(
                    "interrupted release transaction was rolled back; prepare it again"
                )
            if transaction["consumer_mutation_armed"] is not True:
                raise ReleaseTransactionError(
                    "release consumers must be durably armed before activation"
                )
            plan = transaction["consumer_rollback_plan"]
            assert isinstance(plan, list)
            if (
                transaction["transaction_kind"] == "archive"
                and transaction["host_profile"] == "managed-local"
                and "trex-daemon-server.service" in plan
                and transaction["daemon_mutation_started"] is not True
            ):
                raise ReleaseTransactionError(
                    "managed archive daemon mutation intent must be durable before activation"
                )
            self._assert_selectors_belong_to_transaction(transaction)
            self._validate_selected_release(str(transaction["candidate"]))
            transaction = self._set_phase(transaction, "switching_current")
            self._atomic_set_selector("current", str(transaction["candidate"]))
            self._fault("after_current_link")
            transaction = self._set_phase(transaction, "current_switched")
            transaction = self._set_phase(transaction, "switching_previous")
            previous = transaction.get("current_before")
            self._atomic_set_selector(
                "previous", previous if isinstance(previous, str) else None
            )
            self._fault("after_previous_link")
            return self._set_phase(transaction, "activated")

    def mark_daemon_mutation_started(
        self, transaction_id: str
    ) -> dict[str, object]:
        """Durably take ownership immediately before managed daemon mutation."""

        transaction_id = require_uuid(transaction_id, label="transaction id")
        with self._locked():
            transaction = self._load_transaction()
            if transaction is None or transaction["transaction_id"] != transaction_id:
                raise ReleaseTransactionError("release transaction id does not match")
            if transaction["daemon_mutation_started"] is True:
                return transaction
            plan = transaction["consumer_rollback_plan"]
            assert isinstance(plan, list)
            if (
                transaction["phase"] != "prepared"
                or transaction["consumer_mutation_armed"] is not True
                or transaction["transaction_kind"] != "archive"
                or transaction["host_profile"] != "managed-local"
                or "trex-daemon-server.service" not in plan
            ):
                raise ReleaseTransactionError(
                    "daemon mutation intent requires an armed managed archive"
                )
            # Re-close rollback byte authority at the exact durable intent
            # edge. A crash after this fsync is treated as ambiguous mutation
            # and therefore grants the reconciler force-stop/restore scope.
            self._verify_host_artifacts_exact(transaction)
            self._verify_native_boundary(transaction)
            active_before = transaction["consumer_active_before"]
            assert isinstance(active_before, list)
            try:
                self.daemon_mutation_preflight(
                    "trex-daemon-server.service" in active_before
                )
            except Exception as exc:
                raise ReleaseTransactionError(
                    f"managed daemon changed before mutation intent: {exc}"
                ) from exc
            updated = dict(transaction)
            updated["daemon_mutation_started"] = True
            updated["updated_at"] = utc_now()
            self._write_transaction(updated)
            self._fault("after_daemon_mutation_started")
            return updated

    def arm_consumers(
        self, transaction_id: str, *, consumers: tuple[str, ...]
    ) -> dict[str, object]:
        """Persist exact live-state rollback authority before any consumer mutation."""

        transaction_id = require_uuid(transaction_id, label="transaction id")
        requested = [unit for unit in CONSUMER_ENABLE_UNITS if unit in consumers]
        if len(consumers) != len(set(consumers)) or len(requested) != len(consumers):
            raise ReleaseTransactionError("rollback consumer scope is invalid")
        with self._locked():
            transaction = self._load_transaction()
            if transaction is None or transaction["transaction_id"] != transaction_id:
                raise ReleaseTransactionError("release transaction id does not match")
            plan = transaction["consumer_rollback_plan"]
            assert isinstance(plan, list)
            if requested != plan:
                raise ReleaseTransactionError(
                    "consumer arm scope must exactly match the immutable rollback plan"
                )
            if transaction["consumer_mutation_armed"] is True:
                return transaction
            if transaction["phase"] != "prepared":
                raise ReleaseTransactionError(
                    "consumers can be armed only for a prepared release"
                )
            # The snapshot/arm window is read-only. Refuse to overwrite a
            # concurrent host or nftables update with older journal bytes.
            self._verify_host_artifacts_exact(transaction)
            self._verify_native_boundary(transaction)
            self._cleanup_unarmed_consumer_baseline(transaction_id)
            active = self._capture_consumer_active_before(tuple(requested))
            baseline = self._capture_consumer_baseline(transaction_id, active)
            self._fault("after_consumer_baseline_capture")
            # Consumer probes can take seconds.  Re-close the read-only
            # snapshot window after the final probe so concurrent host/native
            # drift is rejected before armed intent becomes durable.
            self._verify_host_artifacts_exact(transaction)
            self._verify_native_boundary(transaction)
            observed_active = self._capture_consumer_active_before(tuple(requested))
            if observed_active != active:
                raise ReleaseTransactionError(
                    "consumer active-state authority changed during baseline capture"
                )
            for unit, record in zip(active, baseline):
                try:
                    ready = self.consumer_is_ready(record, self.state_root)
                except Exception as exc:
                    raise ReleaseTransactionError(
                        f"cannot revalidate baseline consumer {unit}: {exc}"
                    ) from exc
                if not ready:
                    raise ReleaseTransactionError(
                        f"baseline consumer changed during rollback capture: {unit}"
                    )
            if self._capture_consumer_active_before(tuple(requested)) != active:
                raise ReleaseTransactionError(
                    "consumer active-state authority changed during readiness revalidation"
                )
            armed = dict(transaction)
            armed["consumer_active_before"] = active
            armed["consumer_baseline"] = baseline
            armed["consumer_mutation_armed"] = True
            armed["updated_at"] = utc_now()
            self._write_transaction(armed)
            self._fault("after_consumers_armed")
            return armed

    def commit(self, transaction_id: str) -> dict[str, object]:
        """Commit a candidate only after external readiness/evidence succeeds."""

        transaction_id = require_uuid(transaction_id, label="transaction id")
        with self._locked():
            transaction = self._load_transaction()
            if transaction is None or transaction["transaction_id"] != transaction_id:
                raise ReleaseTransactionError("release transaction id does not match")
            if transaction["phase"] == "committed":
                transaction = self._retire_terminal_rollback_authority(transaction)
                self._verify_terminal(transaction)
                retained = {str(transaction["candidate"])}
                if isinstance(transaction.get("current_before"), str):
                    retained.add(str(transaction["current_before"]))
                self._best_effort_terminal_housekeeping(transaction, retained)
                return transaction
            if transaction["phase"] == "finalizing_consumer_enable":
                return self._finalize_commit_locked(transaction)
            if transaction["phase"] != "activated":
                self._reconcile_locked()
                raise ReleaseTransactionError(
                    "only an activated release can be committed"
                )
            current, previous = self._assert_selectors_belong_to_transaction(transaction)
            if current != transaction["candidate"] or previous != transaction.get("current_before"):
                raise ReleaseTransactionError("activated selectors do not match the transaction")
            commit_intent = dict(transaction)
            commit_intent["daemon_mutation_started"] = False
            transaction = self._set_phase(
                commit_intent, "finalizing_consumer_enable"
            )
            return self._finalize_commit_locked(transaction)

    def rollback(self, transaction_id: str) -> dict[str, object]:
        transaction_id = require_uuid(transaction_id, label="transaction id")
        with self._locked():
            transaction = self._load_transaction()
            if transaction is None or transaction["transaction_id"] != transaction_id:
                raise ReleaseTransactionError("release transaction id does not match")
            return self._rollback_locked(transaction)

    def reconcile(self) -> dict[str, object] | None:
        """Idempotently roll back uncommitted work or verify committed state."""

        with self._locked():
            return self._reconcile_locked()

    def status(self) -> dict[str, object]:
        with self._locked():
            transaction = self._load_transaction()
            return {
                "schema": "trex-webui-release-selection-status/v1",
                "current": self._selector_digest("current"),
                "previous": self._selector_digest("previous"),
                "transaction": transaction,
            }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage the durable TRex WebUI content-addressed release selector."
    )
    parser.add_argument("--install-root", type=Path, default=INSTALL_ROOT)
    parser.add_argument("--state-root", type=Path, default=STATE_ROOT)
    parser.add_argument(
        "--deployment-lock",
        type=Path,
        help="skip boot reconciliation while the outer deployment lock is held",
    )
    parser.add_argument(
        "--retry-on-lock-busy",
        action="store_true",
        help=(
            "return EX_TEMPFAIL while the outer deployment lock is held; "
            "reserved for the independent retry unit"
        ),
    )
    parser.add_argument(
        "--supervise-errors",
        action="store_true",
        help=(
            "retry reconciliation errors inside one systemd start job so "
            "ordered consumers remain queued during boot"
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare", help="stage a verified candidate tree")
    prepare.add_argument("--source", required=True, type=Path)
    prepare.add_argument("--reserve-bytes", type=int, default=DEFAULT_RESERVE_BYTES)
    prepare.add_argument(
        "--enable-consumer",
        action="append",
        choices=CONSUMER_ENABLE_UNITS,
        default=[],
        help="durably publish this systemd boot consumer only after commit intent",
    )
    prepare.add_argument(
        "--start-consumer",
        action="append",
        choices=CONSUMER_ENABLE_UNITS,
        default=[],
        help="queue this enabled consumer after durable publication",
    )
    prepare.add_argument(
        "--host-profile",
        choices=("common", "managed-local"),
    )
    prepare.add_argument(
        "--transaction-kind",
        choices=("archive", "legacy-baseline", "selector-only"),
        default="selector-only",
    )
    prepare.add_argument(
        "--rollback-consumer",
        action="append",
        choices=CONSUMER_ENABLE_UNITS,
        default=[],
        help="immutable exact consumer scope captured by arm-consumers",
    )

    for command in ("activate", "commit", "rollback"):
        transition = subparsers.add_parser(command)
        transition.add_argument("--transaction-id", required=True)
    arm = subparsers.add_parser(
        "arm-consumers",
        help="durably capture consumer rollback scope immediately before mutation",
    )
    arm.add_argument("--transaction-id", required=True)
    arm.add_argument(
        "--consumer",
        action="append",
        choices=CONSUMER_ENABLE_UNITS,
        default=[],
    )
    daemon_mutation = subparsers.add_parser(
        "mark-daemon-mutation-started",
        help="durably arm managed daemon force-stop/restore immediately before mutation",
    )
    daemon_mutation.add_argument("--transaction-id", required=True)
    subparsers.add_parser("reconcile")
    subparsers.add_parser(
        "ack-consumers",
        help="acknowledge durable rollback start intent after consumers are active",
    )
    prepare_previous = subparsers.add_parser(
        "prepare-previous", help="prepare the retained N-1 release for reactivation"
    )
    prepare_previous.add_argument(
        "--host-profile",
        choices=("common", "managed-local"),
    )
    legacy = subparsers.add_parser(
        "snapshot-legacy",
        help="build a verified serving baseline before first selector migration",
    )
    legacy.add_argument("--destination", required=True, type=Path)
    legacy.add_argument("--static-root", required=True, type=Path)
    legacy.add_argument("--runtime-root", required=True, type=Path)
    legacy.add_argument("--reserve-bytes", type=int, default=DEFAULT_RESERVE_BYTES)
    legacy_verify = subparsers.add_parser(
        "verify-legacy-snapshot",
        help="exactly compare every live legacy authority with its snapshot",
    )
    legacy_verify.add_argument("--snapshot", required=True, type=Path)
    legacy_verify.add_argument("--static-root", required=True, type=Path)
    legacy_verify.add_argument("--runtime-root", required=True, type=Path)
    dotenv = subparsers.add_parser(
        "attach-dotenv",
        help="attach an optional operator runtime configuration to a candidate",
    )
    dotenv.add_argument("--transaction-id", required=True)
    dotenv.add_argument("--source", required=True, type=Path)
    subparsers.add_parser("status")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.supervise_errors and (
        args.command != "reconcile" or args.deployment_lock is None
    ):
        raise ReleaseTransactionError(
            "--supervise-errors requires --deployment-lock reconcile"
        )
    if os.geteuid() != 0:
        raise ReleaseTransactionError("release selection must run as root")
    production_host_transaction = (
        args.install_root == INSTALL_ROOT and args.state_root == STATE_ROOT
    )
    if (args.install_root == INSTALL_ROOT) != (args.state_root == STATE_ROOT):
        raise ReleaseTransactionError(
            "production install and release-state roots must be used as an exact pair"
        )
    if (
        args.command == "prepare"
        and (args.enable_consumer or args.start_consumer)
        and not production_host_transaction
    ):
        raise ReleaseTransactionError(
            "systemd consumer publication is supported only by the production host transaction"
        )
    host_profile = getattr(args, "host_profile", None)
    if args.command in {"prepare", "prepare-previous"}:
        if production_host_transaction and host_profile is None:
            raise ReleaseTransactionError(
                "production release prepare requires an explicit host profile"
            )
        if not production_host_transaction and host_profile is not None:
            raise ReleaseTransactionError(
                "host artifact profiles are supported only by the production transaction"
            )
    if (
        args.command == "prepare"
        and production_host_transaction
        and args.transaction_kind == "selector-only"
    ):
        raise ReleaseTransactionError(
            "production prepare requires an explicit archive or legacy-baseline kind"
        )
    engine = ReleaseTransactionEngine(
        install_root=args.install_root,
        state_root=args.state_root,
        host_artifact_paths=(
            HOST_ARTIFACT_PATHS if production_host_transaction else ()
        ),
        host_artifact_relabel=(
            restore_host_artifact_selinux
            if production_host_transaction
            else None
        ),
        daemon_reload=(reload_systemd_manager if production_host_transaction else None),
        consumer_enable=(
            enable_systemd_consumer if production_host_transaction else None
        ),
        consumer_is_enabled=(
            systemd_consumer_is_enabled if production_host_transaction else None
        ),
        consumer_start=(
            start_systemd_consumer_no_block
            if production_host_transaction
            else None
        ),
        consumer_is_active=(
            systemd_consumer_is_active if production_host_transaction else None
        ),
        consumer_capture=(
            capture_systemd_consumer_baseline
            if production_host_transaction
            else None
        ),
        consumer_is_ready=(
            systemd_consumer_is_ready if production_host_transaction else None
        ),
        consumer_stop=(
            stop_systemd_consumers if production_host_transaction else None
        ),
        consumer_force_stop=(
            force_stop_owned_systemd_consumers
            if production_host_transaction
            else None
        ),
        daemon_mutation_preflight=(
            verify_systemd_daemon_mutation_boundary
            if production_host_transaction
            else None
        ),
    )
    if args.deployment_lock is not None:
        if args.command != "reconcile":
            raise ReleaseTransactionError(
                "--deployment-lock is only valid with reconcile"
            )
        with engine.deployment_guard(args.deployment_lock) as acquired:
            if not acquired:
                print(
                    json.dumps(
                        {
                            "schema": "trex-webui-release-reconcile/v1",
                            "status": "deployment-active",
                        },
                        sort_keys=True,
                    )
                )
                # Consumer units Require the ordinary reconciler.  It must
                # treat an in-progress trusted deployment as success so it
                # cannot poison candidate startup.  Only the independent
                # retry unit asks for EX_TEMPFAIL and an unbounded retry loop.
                return 75 if args.retry_on_lock_busy else 0
            result = engine.reconcile()
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    if args.retry_on_lock_busy:
        raise ReleaseTransactionError(
            "--retry-on-lock-busy requires --deployment-lock reconcile"
        )
    if args.command == "prepare":
        result = engine.prepare(
            args.source,
            reserve_bytes=args.reserve_bytes,
            consumer_enable=tuple(args.enable_consumer),
            consumer_start=tuple(args.start_consumer),
            consumer_rollback_plan=tuple(args.rollback_consumer),
            host_profile=host_profile,
            transaction_kind=args.transaction_kind,
        )
    elif args.command == "snapshot-legacy":
        result = engine.snapshot_legacy(
            destination=args.destination,
            static_root=args.static_root,
            runtime_root=args.runtime_root,
            reserve_bytes=args.reserve_bytes,
        )
    elif args.command == "verify-legacy-snapshot":
        result = engine.verify_legacy_snapshot(
            snapshot=args.snapshot,
            static_root=args.static_root,
            runtime_root=args.runtime_root,
        )
    elif args.command == "attach-dotenv":
        result = engine.attach_dotenv(
            transaction_id=args.transaction_id,
            source=args.source,
        )
    elif args.command == "prepare-previous":
        result = engine.prepare_previous(
            host_profile=host_profile,
        )
    elif args.command == "arm-consumers":
        result = engine.arm_consumers(
            args.transaction_id,
            consumers=tuple(args.consumer),
        )
    elif args.command == "mark-daemon-mutation-started":
        result = engine.mark_daemon_mutation_started(args.transaction_id)
    elif args.command == "activate":
        result = engine.activate(args.transaction_id)
    elif args.command == "commit":
        result = engine.commit(args.transaction_id)
    elif args.command == "rollback":
        result = engine.rollback(args.transaction_id)
    elif args.command == "reconcile":
        result = engine.reconcile()
    elif args.command == "ack-consumers":
        result = engine.acknowledge_consumers()
    else:
        result = engine.status()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


def run_cli(argv: list[str] | None = None) -> int:
    effective_argv = list(sys.argv[1:] if argv is None else argv)
    supervise_errors = "--supervise-errors" in effective_argv
    while True:
        try:
            return main(effective_argv)
        except Exception as exc:
            if isinstance(exc, ReleaseTransactionError):
                print(f"error: {exc}", file=sys.stderr, flush=True)
            else:
                print(
                    f"error: transient reconciliation exception "
                    f"{type(exc).__name__}: {exc}",
                    file=sys.stderr,
                    flush=True,
                )
            if not supervise_errors:
                if isinstance(exc, ReleaseTransactionError):
                    return 1
                raise
            # Stay in the same Type=oneshot start job.  If the prerequisite
            # job failed and systemd started a replacement job, its Requires
            # dependents would already have been cancelled for this boot.
            time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(run_cli())
