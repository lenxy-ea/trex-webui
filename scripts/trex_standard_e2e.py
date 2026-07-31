#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import os
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from trex_real_acceptance import (
    AcceptanceError,
    active_port_ids,
    capture_decode_summary,
    capture_packet_count,
    capture_recorder_count,
    clean_file_timestamp,
    compact_stats_sample,
    ensure_report_archive_has_no_binary_payloads,
    port_ids,
    request_json,
    require_ok,
    sanitize_report_payload,
    write_local_report,
    utc_now,
)


DEFAULT_BASE_URL = "http://127.0.0.1"
DEFAULT_LATENCY_PROFILE = "gui_example.yaml"
DEFAULT_CAPTURE_PROFILE = "udp_1pkt_simple.py"
DEFAULT_LATENCY_MULTIPLIER = "5kpps"
DEFAULT_CAPTURE_MULTIPLIER = "5kpps"
DEFAULT_EXPECTED_CAPTURE_CHAIN = "Ethernet > IPv4 > UDP"
DEFAULT_REPORT_PREFIX = "standard-e2e"
DEFAULT_HTTP_TIMEOUT_SECONDS = 20.0
DEFAULT_DAEMON_TIMEOUT_SECONDS = 60
DEFAULT_POLL_INTERVAL_SECONDS = 0.5
DEFAULT_STATS_TIMEOUT_SECONDS = 12.0
DEFAULT_CAPTURE_LIMIT = 256
DEFAULT_CAPTURE_PACKETS = 64
DEFAULT_CAPTURE_BPF = "udp"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_IDENTITY_SCHEMA = "trex-webui-evidence/v1"
SOURCE_IDENTITY_ALGORITHM = "sha256(canonical-json(git-sha,path,type,mode,size,content-sha256)-v1)"
BUILD_IDENTITY_ALGORITHM = "sha256(canonical-json(vite-static-dist-manifest)-v1)"
FRONTEND_ASSET_MANIFEST_ALGORITHM = "sha256(canonical-json(path,size,content-sha256)-v1)"
RELEASE_MANIFEST_NAME = "RELEASE_MANIFEST.json"
RELEASE_RUNTIME_EXCLUDED_TOP_LEVEL = frozenset(
    {
        ".env",
        ".logs",
        ".trex-webui-managed",
        ".venv",
        "node_modules",
        "profiles",
    }
)
RELEASE_RUNTIME_EXCLUDED_DIRECTORY_NAMES = frozenset({"__pycache__", "node_modules"})
RELEASE_RUNTIME_EXCLUDED_FILE_SUFFIXES = (".pyc", ".pyo")
RELEASE_VERSIONED_RUNTIME_PREFIX = ".venv.runtime-"
RELEASE_MANAGED_MARKER_NAME = ".trex-webui-managed"
RELEASE_MANAGED_MARKER_VALUE = "trex-webui-managed-v1"
RELEASE_VENV_RUNTIME_MARKER_NAME = ".trex-webui-venv-runtime"
RELEASE_VENV_RUNTIME_MARKER_VALUE = "trex-webui-venv-runtime-v1"
RELEASE_VENV_RELEASE_MARKER_NAME = ".trex-webui-venv-release"
API_CONFIG_SUMMARY_KEYS = (
    "host",
    "sync_port",
    "async_port",
    "scapy_port",
    "client_name",
    "connect_timeout_seconds",
    "daemon_port",
    "scripts_dir",
    "daemon_bin",
    "config_path",
    "daemon_log",
    "profile_roots",
    "command_timeout_seconds",
    "require_confirmation",
    "configuration_errors",
)
STANDARD_E2E_CONSTRAINT = (
    "RX capture enables service mode on the receiver, which cannot coexist with "
    "latency/flow_stats on this TRex build; latency and capture are validated as "
    "two real phases inside one E2E archive."
)


class EvidenceIdentityError(RuntimeError):
    pass


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def git_output(project_root: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=project_root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = exc.stderr.decode("utf-8", errors="replace").strip() if isinstance(exc, subprocess.CalledProcessError) else str(exc)
        raise EvidenceIdentityError(f"unable to run git {' '.join(args)}: {detail}") from exc
    return result.stdout


def source_file_manifest(project_root: Path) -> list[dict[str, object]]:
    raw_paths = git_output(project_root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    relative_paths = sorted(path.decode("utf-8") for path in raw_paths.split(b"\0") if path)
    manifest: list[dict[str, object]] = []
    for relative_path in relative_paths:
        path = project_root / relative_path
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            manifest.append(
                {
                    "path": relative_path,
                    "type": "missing",
                    "mode": None,
                    "size": 0,
                    "sha256": None,
                }
            )
            continue

        if stat.S_ISLNK(metadata.st_mode):
            link_target = os.readlink(path).encode("utf-8")
            entry_type = "symlink"
            mode = "0777"
            size = len(link_target)
            digest = sha256_bytes(link_target)
        elif stat.S_ISREG(metadata.st_mode):
            entry_type = "file"
            # Git records only executable intent for regular files. Ignore
            # checkout umask differences such as 0600 versus 0644.
            mode = "0755" if stat.S_IMODE(metadata.st_mode) & 0o111 else "0644"
            size = metadata.st_size
            digest = sha256_file(path)
        else:
            entry_type = "other"
            mode = None
            size = metadata.st_size
            digest = None
        manifest.append(
            {
                "path": relative_path,
                "type": entry_type,
                "mode": mode,
                "size": size,
                "sha256": digest,
            }
        )
    return manifest


def compute_git_source_identity(project_root: Path) -> dict[str, object]:
    git_sha = git_output(project_root, "rev-parse", "HEAD").decode("ascii").strip()
    git_branch = git_output(project_root, "rev-parse", "--abbrev-ref", "HEAD").decode("utf-8").strip()
    git_status = git_output(project_root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    manifest = source_file_manifest(project_root)
    digest = sha256_bytes(canonical_json_bytes({"git_sha": git_sha, "files": manifest}))
    return {
        "algorithm": SOURCE_IDENTITY_ALGORITHM,
        "digest": digest,
        "file_count": len(manifest),
        "path_set": "git ls-files --cached --others --exclude-standard",
        "git": {
            "sha": git_sha,
            "branch": git_branch,
            "dirty": bool(git_status),
            "status_sha256": sha256_bytes(git_status),
        },
        "provenance": {"kind": "git-checkout"},
    }


def load_archive_safety_module(project_root: Path) -> Any:
    module_path = project_root / "deploy" / "archive_safety.py"
    if not module_path.is_file() or module_path.is_symlink():
        raise EvidenceIdentityError(f"release payload verifier is missing or unsafe: {module_path}")
    try:
        spec = importlib.util.spec_from_file_location("trex_webui_evidence_archive_safety", module_path)
        if spec is None or spec.loader is None:
            raise EvidenceIdentityError(f"unable to load release payload verifier: {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except EvidenceIdentityError:
        raise
    except Exception as exc:
        raise EvidenceIdentityError(f"unable to load release payload verifier: {exc}") from exc
    return module


def release_runtime_path_is_excluded(relative_path: str, *, is_directory: bool) -> bool:
    parts = Path(relative_path).parts
    if not parts:
        return False
    if parts[0] in RELEASE_RUNTIME_EXCLUDED_TOP_LEVEL:
        return True
    if is_directory and any(part in RELEASE_RUNTIME_EXCLUDED_DIRECTORY_NAMES for part in parts):
        return True
    return not is_directory and relative_path.endswith(RELEASE_RUNTIME_EXCLUDED_FILE_SUFFIXES)


def release_versioned_runtime_suffix(name: str) -> str | None:
    if not name.startswith(RELEASE_VERSIONED_RUNTIME_PREFIX):
        return None
    suffix = name.removeprefix(RELEASE_VERSIONED_RUNTIME_PREFIX)
    timestamp_text, separator, process_id = suffix.rpartition("-")
    if not separator or not process_id.isascii() or not process_id.isdigit() or process_id.startswith("0"):
        return None
    try:
        parsed_timestamp = datetime.strptime(timestamp_text, "%Y%m%dT%H%M%SZ")
    except ValueError:
        return None
    if parsed_timestamp.strftime("%Y%m%dT%H%M%SZ") != timestamp_text:
        return None
    return suffix


def release_path_is_mountpoint(path: Path) -> bool:
    try:
        if os.path.ismount(path):
            return True
    except OSError:
        return True
    try:
        result = subprocess.run(
            ["mountpoint", "-q", "--", str(path)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        return False
    except OSError:
        return True
    return result.returncode == 0


def validate_release_versioned_runtime(
    path: Path,
    relative_path: str,
    archive_safety: Any,
) -> None:
    def reject(reason: str) -> None:
        raise archive_safety.ArchiveSafetyError(
            f"untrusted versioned runtime exclusion {relative_path}: {reason}"
        )

    suffix = release_versioned_runtime_suffix(path.name)
    if suffix is None:
        reject("invalid versioned runtime name")
    try:
        metadata = path.lstat()
    except OSError as exc:
        reject(f"cannot inspect directory: {exc}")
        return
    if not stat.S_ISDIR(metadata.st_mode):
        reject("versioned runtime must be a real directory, not a symlink or special file")
    if release_path_is_mountpoint(path):
        reject("versioned runtime must not be a mount point")
    if metadata.st_uid != 0 or metadata.st_gid != 0:
        reject("versioned runtime must be root-owned")
    if stat.S_IMODE(metadata.st_mode) & 0o022:
        reject("versioned runtime must not be group/other writable")

    expected_markers = (
        (RELEASE_MANAGED_MARKER_NAME, RELEASE_MANAGED_MARKER_VALUE, "managed"),
        (RELEASE_VENV_RUNTIME_MARKER_NAME, RELEASE_VENV_RUNTIME_MARKER_VALUE, "runtime"),
        (
            RELEASE_VENV_RELEASE_MARKER_NAME,
            f"trex-webui-venv-release-{suffix}",
            "release",
        ),
    )
    for marker_name, expected_value, label in expected_markers:
        marker = path / marker_name
        try:
            marker_metadata = marker.lstat()
        except OSError:
            reject(f"versioned runtime has no trusted {label} marker")
            return
        if not stat.S_ISREG(marker_metadata.st_mode) or marker_metadata.st_size > 256:
            reject(f"versioned runtime has no trusted {label} marker")
        if marker_metadata.st_uid != 0 or marker_metadata.st_gid != 0:
            reject(f"versioned runtime {label} marker must be root-owned")
        if stat.S_IMODE(marker_metadata.st_mode) & 0o022:
            reject(f"versioned runtime {label} marker must not be group/other writable")
        try:
            marker_value = marker.read_bytes().rstrip(b"\n")
        except OSError:
            reject(f"versioned runtime has no trusted {label} marker")
            return
        if marker_value != expected_value.encode("utf-8"):
            reject(f"versioned runtime has no trusted {label} marker")


def verified_release_manifest(project_root: Path) -> tuple[dict[str, object], dict[str, object]]:
    archive_safety = load_archive_safety_module(project_root)
    try:
        manifest, expected_files = archive_safety.manifest_from_tree(project_root)
        actual_files: list[dict[str, object]] = []
        pending = [project_root]
        while pending:
            directory = pending.pop()
            for child in sorted(os.scandir(directory), key=lambda entry: entry.name):
                path = Path(child.path)
                relative_path = path.relative_to(project_root).as_posix()
                metadata = child.stat(follow_symlinks=False)
                is_directory = stat.S_ISDIR(metadata.st_mode)

                if relative_path == RELEASE_MANIFEST_NAME:
                    continue
                if directory == project_root and child.name.startswith(RELEASE_VERSIONED_RUNTIME_PREFIX):
                    validate_release_versioned_runtime(path, relative_path, archive_safety)
                    continue
                if release_runtime_path_is_excluded(relative_path, is_directory=is_directory):
                    if stat.S_ISLNK(metadata.st_mode):
                        raise archive_safety.ArchiveSafetyError(
                            f"release runtime exclusion must not be a symbolic link: {relative_path}"
                        )
                    if relative_path in {".env", ".trex-webui-managed"} or relative_path.endswith(
                        RELEASE_RUNTIME_EXCLUDED_FILE_SUFFIXES
                    ):
                        if not stat.S_ISREG(metadata.st_mode):
                            raise archive_safety.ArchiveSafetyError(
                                f"release runtime exclusion must be a regular file: {relative_path}"
                            )
                        continue
                    if is_directory:
                        continue
                    raise archive_safety.ArchiveSafetyError(
                        f"release runtime exclusion has an unexpected type: {relative_path}"
                    )
                if stat.S_ISLNK(metadata.st_mode):
                    raise archive_safety.ArchiveSafetyError(
                        f"installed release payload symbolic links are not allowed: {relative_path}"
                    )
                if is_directory:
                    archive_safety.validated_mode(metadata.st_mode, relative_path)
                    pending.append(path)
                    continue
                if not stat.S_ISREG(metadata.st_mode):
                    raise archive_safety.ArchiveSafetyError(
                        f"installed release payload special files are not allowed: {relative_path}"
                    )
                digest, size = archive_safety.sha256_file(path)
                if size != metadata.st_size:
                    raise archive_safety.ArchiveSafetyError(
                        f"installed release payload file changed while hashing: {relative_path}"
                    )
                actual_files.append(
                    archive_safety.payload_entry(relative_path, metadata.st_mode, size, digest)
                )

        actual_files.sort(key=lambda item: str(item["path"]))
        archive_safety.compare_payload_files(expected_files, actual_files)
    except Exception as exc:
        if isinstance(exc, EvidenceIdentityError):
            raise
        raise EvidenceIdentityError(f"installed release payload identity verification failed: {exc}") from exc

    payload_identity = manifest.get("payload_identity")
    if not isinstance(payload_identity, dict):
        raise EvidenceIdentityError("verified release manifest has no payload identity")
    return manifest, payload_identity


def compute_release_source_identity(project_root: Path) -> dict[str, object]:
    manifest, payload_identity = verified_release_manifest(project_root)
    source = manifest.get("source_identity")
    if not isinstance(source, dict):
        raise EvidenceIdentityError("verified release manifest has no source identity")
    identity = dict(source)
    git = source.get("git")
    if isinstance(git, dict):
        identity["git"] = dict(git)
    identity["provenance"] = {
        "kind": "verified-release-payload",
        "release_schema": manifest.get("schema"),
        "release_manifest": RELEASE_MANIFEST_NAME,
        "release_name": manifest.get("name"),
        "release_version": manifest.get("version"),
        "payload_algorithm": payload_identity.get("algorithm"),
        "payload_digest": payload_identity.get("digest"),
        "payload_file_count": payload_identity.get("file_count"),
        "runtime_exclusions": sorted(RELEASE_RUNTIME_EXCLUDED_TOP_LEVEL),
        "validated_versioned_runtime_exclusion": {
            "pattern": ".venv.runtime-*",
            "scope": "top-level",
            "checks": [
                "installer-generated-name",
                "root-owned-directory-and-markers",
                "no-group-or-world-write",
                "non-symlink-directory-and-markers",
                "non-mountpoint-directory",
                "managed-runtime-release-marker-values",
            ],
        },
        "runtime_cache_exclusions": ["**/__pycache__", "**/*.pyc", "**/*.pyo", "**/node_modules"],
    }
    return identity


def compute_source_identity(project_root: Path = PROJECT_ROOT) -> dict[str, object]:
    git_marker = project_root / ".git"
    try:
        git_metadata = git_marker.lstat()
    except FileNotFoundError:
        git_metadata = None
    except OSError as exc:
        raise EvidenceIdentityError(f"unable to inspect Git metadata at {git_marker}: {exc}") from exc

    if git_metadata is not None:
        if stat.S_ISLNK(git_metadata.st_mode):
            raise EvidenceIdentityError(f"Git metadata must not be a symbolic link: {git_marker}")
        if not (stat.S_ISDIR(git_metadata.st_mode) or stat.S_ISREG(git_metadata.st_mode)):
            raise EvidenceIdentityError(f"Git metadata has an unsupported type: {git_marker}")
        return compute_git_source_identity(project_root)
    if (project_root / RELEASE_MANIFEST_NAME).is_file():
        return compute_release_source_identity(project_root)
    raise EvidenceIdentityError(
        f"source identity requires either local Git metadata or a verified {RELEASE_MANIFEST_NAME}: {project_root}"
    )


def frontend_asset_manifest(dist_root: Path) -> list[dict[str, object]]:
    if not dist_root.is_dir():
        raise EvidenceIdentityError(f"frontend production build is missing: {dist_root}")
    manifest = [
        {
            "path": path.relative_to(dist_root).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for path in sorted(dist_root.rglob("*"))
        if path.is_file()
    ]
    if not manifest or not (dist_root / "index.html").is_file():
        raise EvidenceIdentityError(f"frontend production build has no index.html asset: {dist_root}")
    return manifest


def compute_build_identity(project_root: Path = PROJECT_ROOT) -> dict[str, object]:
    dist_root = project_root / "apps" / "web" / "dist"
    manifest = frontend_asset_manifest(dist_root)
    manifest_hash = sha256_bytes(canonical_json_bytes(manifest))
    build_material = {
        "kind": "vite-static-dist",
        "frontend_asset_manifest_hash": manifest_hash,
        "frontend_asset_manifest": manifest,
    }
    return {
        "algorithm": BUILD_IDENTITY_ALGORITHM,
        "digest": sha256_bytes(canonical_json_bytes(build_material)),
        "frontend": {
            "root": "apps/web/dist",
            "asset_count": len(manifest),
            "asset_manifest_algorithm": FRONTEND_ASSET_MANIFEST_ALGORITHM,
            "asset_manifest_hash": manifest_hash,
            "asset_manifest": manifest,
        },
    }


def local_api_source_summary(project_root: Path = PROJECT_ROOT) -> dict[str, object]:
    source_path = project_root / "apps" / "api" / "app" / "main.py"
    try:
        source = source_path.read_text(encoding="utf-8")
        module = ast.parse(source)
    except (OSError, SyntaxError) as exc:
        raise EvidenceIdentityError(f"unable to inspect API source metadata: {exc}") from exc

    title: str | None = None
    version: str | None = None
    for node in ast.walk(module):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or node.func.id != "FastAPI":
            continue
        values: dict[str, object] = {}
        for keyword in node.keywords:
            if keyword.arg in {"title", "version"}:
                try:
                    values[keyword.arg] = ast.literal_eval(keyword.value)
                except (ValueError, SyntaxError):
                    continue
        title = values.get("title") if isinstance(values.get("title"), str) else None
        version = values.get("version") if isinstance(values.get("version"), str) else None
        break
    if not title or not version:
        raise EvidenceIdentityError("API FastAPI title/version metadata is missing from apps/api/app/main.py")
    return {
        "title": title,
        "version": version,
        "source": "apps/api/app/main.py",
        "source_sha256": sha256_bytes(source.encode("utf-8")),
    }


def api_config_identity(environment: dict[str, Any]) -> dict[str, object]:
    summary = {key: environment.get(key) for key in API_CONFIG_SUMMARY_KEYS}
    return {
        "algorithm": "sha256(canonical-json(api-config-summary)-v1)",
        "digest": sha256_bytes(canonical_json_bytes(summary)),
        "summary": summary,
    }


def trex_config_summary(config_content: str) -> dict[str, object]:
    try:
        payload = yaml.safe_load(config_content)
    except yaml.YAMLError as exc:
        raise EvidenceIdentityError(f"unable to parse TRex config YAML: {exc}") from exc
    if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
        raise EvidenceIdentityError("TRex config YAML must contain exactly one top-level mapping entry")

    config = payload[0]
    interfaces = config.get("interfaces")
    if not isinstance(interfaces, list) or any(not isinstance(interface, str) for interface in interfaces):
        raise EvidenceIdentityError("TRex config interfaces must be a YAML sequence of strings")
    return {
        "port_limit": config.get("port_limit"),
        "interfaces": list(interfaces),
        "port_bandwidth_gb": config.get("port_bandwidth_gb"),
    }


def trex_config_identity(args: argparse.Namespace, config_content: str) -> dict[str, object]:
    config_summary = trex_config_summary(config_content)
    summary = {
        "source": str(args.config_file) if args.config_file else "generated",
        **config_summary,
        "tx_port": args.tx_port,
        "rx_port": args.rx_port,
        "latency_profile": args.latency_profile,
        "capture_profile": args.capture_profile,
    }
    return {
        "content_sha256": sha256_bytes(config_content.encode("utf-8")),
        "content_size": len(config_content.encode("utf-8")),
        "summary": summary,
    }


def collect_evidence_identity(
    args: argparse.Namespace,
    config_content: str,
    gate_id: str,
    project_root: Path = PROJECT_ROOT,
) -> dict[str, object]:
    return {
        "schema": EVIDENCE_IDENTITY_SCHEMA,
        "gate_id": gate_id,
        "source": compute_source_identity(project_root),
        "build": compute_build_identity(project_root),
        "api": local_api_source_summary(project_root),
        "trex_config": trex_config_identity(args, config_content),
    }


def require_expected_evidence_identity(args: argparse.Namespace, evidence: dict[str, object]) -> None:
    source = evidence.get("source") if isinstance(evidence.get("source"), dict) else {}
    build = evidence.get("build") if isinstance(evidence.get("build"), dict) else {}
    expected = [
        ("source", args.expected_source_identity, source.get("digest")),
        ("build", args.expected_build_identity, build.get("digest")),
    ]
    for label, expected_digest, actual_digest in expected:
        if expected_digest and expected_digest != actual_digest:
            raise AcceptanceError(
                "evidence identity",
                f"{label} identity changed before Standard E2E",
                {"expected": expected_digest, "actual": actual_digest},
            )


def update_api_config_evidence(run: dict[str, Any], environment: dict[str, Any]) -> None:
    evidence = run.get("evidence_identity")
    if not isinstance(evidence, dict):
        return
    api = evidence.get("api")
    if isinstance(api, dict):
        api["configuration"] = api_config_identity(environment)


def finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and value not in {
        float("inf"),
        float("-inf"),
    }


def format_metric(value: object, unit: str) -> str:
    if not finite_number(value):
        return f"0 {unit}".strip()
    number = float(value)
    if abs(number) < 1e-9:
        number = 0.0
    return f"{number:g} {unit}".strip()


def format_latency_us(value: object) -> str:
    if not finite_number(value):
        return "-"
    number = float(value)
    return f"{number:.1f} us" if number < 10 else f"{number:g} us"


def read_path(source: object, path: str) -> object | None:
    cursor = source
    for part in path.split("."):
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(part)
    return cursor


def read_number(source: object, paths: list[str]) -> float | None:
    for path in paths:
        value = read_path(source, path)
        if finite_number(value):
            return float(value)
        if isinstance(value, str) and value.strip():
            try:
                parsed = float(value)
            except ValueError:
                continue
            if finite_number(parsed):
                return parsed
    return None


def default_trex_config(
    *,
    port_limit: int,
    interfaces: list[str],
    port0_ip: str,
    port0_gw: str,
    port1_ip: str,
    port1_gw: str,
    port_bandwidth_gb: int | None,
) -> str:
    interface_lines = ", ".join(f"'{interface}'" for interface in interfaces)
    bandwidth_line = f"  port_bandwidth_gb: {port_bandwidth_gb}\n" if port_bandwidth_gb else ""
    return (
        "- port_limit: {port_limit}\n"
        "  version: 2\n"
        "  interfaces: [{interface_lines}]\n"
        "{bandwidth_line}"
        "  port_info:\n"
        "    - ip: {port0_ip}\n"
        "      default_gw: {port0_gw}\n"
        "    - ip: {port1_ip}\n"
        "      default_gw: {port1_gw}\n"
        "  platform:\n"
        "    master_thread_id: 0\n"
        "    latency_thread_id: 1\n"
        "    dual_if:\n"
        "      - socket: 0\n"
        "        threads: [2, 3, 4, 5]\n"
    ).format(
        bandwidth_line=bandwidth_line,
        interface_lines=interface_lines,
        port0_gw=port0_gw,
        port0_ip=port0_ip,
        port1_gw=port1_gw,
        port1_ip=port1_ip,
        port_limit=port_limit,
    )


def config_content_from_args(args: argparse.Namespace) -> str:
    if args.config_file:
        try:
            return Path(args.config_file).read_text(encoding="utf-8")
        except OSError as exc:
            raise AcceptanceError("config", f"unable to read config file: {args.config_file}", str(exc)) from exc
    return default_trex_config(
        port_limit=args.port_limit,
        interfaces=args.interfaces,
        port0_ip=args.port0_ip,
        port0_gw=args.port0_gw,
        port1_ip=args.port1_ip,
        port1_gw=args.port1_gw,
        port_bandwidth_gb=args.port_bandwidth_gb,
    )


def require_action_ok(stage: str, payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("ok") is True:
        return payload
    raise AcceptanceError(stage, payload.get("stderr") or payload.get("error") or payload.get("blocker") or "request failed", payload)


def ensure_daemon_server(args: argparse.Namespace, run: dict[str, Any]) -> None:
    overview = request_json(args.base_url, "GET", "/api/system/daemon", None, args.timeout)
    run["daemon_server_before"] = overview
    rpc = overview.get("rpc") if isinstance(overview.get("rpc"), dict) else {}
    if rpc.get("ok") is True and rpc.get("connected") is True:
        return
    raise AcceptanceError(
        "daemon server prerequisite",
        (
            "root-owned trex_daemon_server RPC is not reachable; start it outside the hardened API "
            f"from {getattr(args, 'scripts_dir', '/opt/trex-core/scripts')}, for example: "
            "cd /opt/trex-core/scripts && sudo ./trex_daemon_server --daemon-port 8090 "
            "--trex-host 127.0.0.1 start-live; "
            "the API NoNewPrivileges sandbox cannot bootstrap this privileged prerequisite"
        ),
        overview,
    )


def ensure_trex_runtime(args: argparse.Namespace, run: dict[str, Any], config_content: str) -> None:
    status = request_json(args.base_url, "GET", "/api/system/daemon/trex/status", None, args.timeout)
    run["daemon_trex_status_before"] = status
    if args.restart_trex and status.get("running") is True:
        run["daemon_trex_stop_before_start"] = require_action_ok(
            "daemon TRex stop",
            request_json(
                args.base_url,
                "POST",
                "/api/system/daemon/trex/stop",
                {"confirmation": "stop-trex"},
                args.timeout,
            ),
        )
        wait_until(
            "daemon TRex stop",
            args,
            lambda: request_json(args.base_url, "GET", "/api/system/daemon/trex/status", None, args.timeout),
            lambda payload: payload.get("running") is False,
        )
        status = run["daemon_trex_status_before_start"] = request_json(
            args.base_url,
            "GET",
            "/api/system/daemon/trex/status",
            None,
            args.timeout,
        )

    if status.get("running") is True and not args.restart_trex:
        run["daemon_custom_yaml_start"] = {
            "started": False,
            "reason": "TRex was already running; use --restart-trex to force a custom YAML start",
            "runtime_status": status,
        }
        return

    start = require_action_ok(
        "daemon TRex start",
        request_json(
            args.base_url,
            "POST",
            "/api/system/daemon/trex/start",
            {
                "config_content": config_content,
                "timeout_seconds": args.daemon_timeout,
                "confirmation": "start-trex",
            },
            max(args.timeout, float(args.daemon_timeout)),
        ),
    )
    run["daemon_custom_yaml_start"] = {
        "started": True,
        "sequence": start.get("sequence"),
        "config_filename": start.get("config_filename"),
        "config_uploaded": start.get("config_uploaded"),
        "config_path": read_path(start, "trex_cmd_options.cfg"),
        "trex_cmd_options": start.get("trex_cmd_options"),
        "audit_written": start.get("audit_written"),
        "config_version": start.get("config_version"),
    }
    wait_until(
        "daemon TRex start",
        args,
        lambda: request_json(args.base_url, "GET", "/api/system/daemon/trex/status", None, args.timeout),
        lambda payload: payload.get("running") is True,
    )


def wait_until(
    stage: str,
    args: argparse.Namespace,
    producer,
    predicate,
) -> dict[str, Any]:
    deadline = time.monotonic() + args.stats_timeout
    last_payload: dict[str, Any] | None = None
    while time.monotonic() <= deadline:
        try:
            payload = producer()
        except AcceptanceError as exc:
            last_payload = exc.to_record()
            time.sleep(args.poll_interval)
            continue
        last_payload = payload if isinstance(payload, dict) else None
        if isinstance(payload, dict) and predicate(payload):
            return payload
        time.sleep(args.poll_interval)
    raise AcceptanceError(stage, "timed out while waiting for expected state", last_payload)


def environment_payload(args: argparse.Namespace) -> dict[str, Any]:
    payload = request_json(args.base_url, "GET", "/api/system/environment", None, args.timeout)
    return payload if isinstance(payload, dict) else {}


def env_int(payload: dict[str, Any], key: str, fallback: int) -> int:
    value = payload.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else fallback


def refresh_backend_trex_connection(args: argparse.Namespace, run: dict[str, Any]) -> None:
    env = environment_payload(args)
    run["environment"] = env
    update_api_config_evidence(run, env)
    body = {
        "host": args.trex_host or payload_text(env.get("host")) or "127.0.0.1",
        "sync_port": args.sync_port or env_int(env, "sync_port", 4501),
        "async_port": args.async_port or env_int(env, "async_port", 4500),
        "scapy_port": args.scapy_port or env_int(env, "scapy_port", 4507),
        "client_name": args.client_name or payload_text(env.get("client_name")) or "Client1",
        "timeout_seconds": args.connect_timeout or env_int(env, "connect_timeout_seconds", 3),
    }
    run["backend_connect_request"] = body
    run["backend_connect"] = request_json(args.base_url, "POST", "/api/trex/connect", body, max(args.timeout, float(body["timeout_seconds"])))
    connected_env = environment_payload(args)
    run["environment_after_connect"] = connected_env
    update_api_config_evidence(run, connected_env)


def payload_text(value: object) -> str:
    return str(value) if isinstance(value, (str, int, float, bool)) and not isinstance(value, bool) else ""


def wait_for_ports(args: argparse.Namespace, requested_ports: set[int]) -> dict[str, Any]:
    return wait_until(
        "TRex ports",
        args,
        lambda: require_ok("ports", request_json(args.base_url, "GET", "/api/trex/ports", None, args.timeout)),
        lambda payload: requested_ports.issubset(port_ids(payload)),
    )


def clear_stats(args: argparse.Namespace) -> dict[str, Any]:
    return require_ok(
        "stats clear",
        request_json(
            args.base_url,
            "POST",
            "/api/trex/stats/clear",
            {"ports": [args.tx_port, args.rx_port]},
            args.timeout,
        ),
    )


def required_traffic_session_id(payload: dict[str, Any], stage: str) -> str:
    session_id = read_path(payload, "data.session.id")
    if not isinstance(session_id, str) or not session_id:
        raise AcceptanceError(
            stage,
            "traffic response did not include a persisted session id",
            payload,
        )
    return session_id


def stop_traffic(args: argparse.Namespace, run: dict[str, Any], stage: str) -> dict[str, Any]:
    session_id = run.get("active_traffic_session_id")
    if not isinstance(session_id, str) or not session_id:
        raise AcceptanceError(
            stage,
            "no exact managed traffic session id is available for stop",
            {"active_traffic_session_id": session_id},
        )
    result = require_ok(
        stage,
        request_json(
            args.base_url,
            "POST",
            "/api/trex/traffic/stop",
            {
                "ports": [args.tx_port],
                "confirmation": "stop",
                "expected_session_id": session_id,
            },
            args.timeout,
        ),
    )
    observed_session_id = required_traffic_session_id(result, stage)
    if observed_session_id != session_id:
        raise AcceptanceError(
            stage,
            "traffic stop response belongs to a different managed session",
            {
                "expected_session_id": session_id,
                "observed_session_id": observed_session_id,
                "response": result,
            },
        )
    run["active_traffic_session_id"] = None
    run.setdefault("traffic_stops", []).append({"stage": stage, "result": result})
    return result


def sample_stats_until(
    args: argparse.Namespace,
    run: dict[str, Any],
    phase: str,
    predicate,
    observe_seconds: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    started = time.monotonic()
    minimum_end = started + max(0.0, observe_seconds)
    deadline = started + max(args.stats_timeout, observe_seconds + args.poll_interval)
    last_stats: dict[str, Any] | None = None
    while time.monotonic() <= deadline:
        time.sleep(args.poll_interval)
        stats = require_ok("stats", request_json(args.base_url, "GET", "/api/trex/stats", None, args.timeout))
        last_stats = stats
        sample = compact_stats_sample(stats)
        sample["phase"] = phase
        samples.append(sample)
        run.setdefault("stats_samples", []).append(sample)
        if predicate(stats, sample) and time.monotonic() >= minimum_end:
            return samples, stats
    raise AcceptanceError(f"{phase} stats", "timed out while waiting for stats evidence", samples[-5:])


def latency_records(stats_payload: dict[str, Any]) -> list[dict[str, Any]]:
    latency = read_path(stats_payload, "data.latency")
    if not isinstance(latency, dict):
        return []
    records: list[dict[str, Any]] = []
    for pg_id, value in latency.items():
        if pg_id in {"global", "total"} or not isinstance(value, dict):
            continue
        avg = read_number(value, ["lat.average", "lat.avg", "latency.average", "latency.avg", "average", "avg"])
        max_value = read_number(value, ["lat.total_max", "latency.total_max", "total_max", "max_latency", "max"])
        jitter = read_number(value, ["lat.jit", "lat.jitter", "latency.jit", "latency.jitter", "jit", "jitter"])
        records.append(
            {
                "pg_id": str(pg_id),
                "average_us": avg,
                "max_us": max_value,
                "jitter_us": jitter,
                "raw": sanitize_report_payload(value),
            }
        )
    return records


def latency_evidence(stats_payload: dict[str, Any]) -> dict[str, Any]:
    records = latency_records(stats_payload)
    averages = [record["average_us"] for record in records if finite_number(record.get("average_us"))]
    return {
        "latency_pg_ids": [record["pg_id"] for record in records],
        "latency_avg_us": min(float(value) for value in averages) if averages else None,
        "records": records,
    }


def capture_layer_chain(decode_summary: dict[str, Any]) -> str:
    chains = decode_summary.get("layer_chains")
    if isinstance(chains, list):
        for chain in chains:
            if isinstance(chain, str) and chain.strip():
                return chain.strip()
    return "-"


def stats_have_packets(_stats: dict[str, Any], sample: dict[str, Any]) -> bool:
    return float(sample.get("opackets") or 0) > 0 and float(sample.get("ipackets") or 0) > 0


def stats_have_latency(stats: dict[str, Any], sample: dict[str, Any]) -> bool:
    if not stats_have_packets(stats, sample):
        return False
    evidence = latency_evidence(stats)
    return bool(evidence["latency_pg_ids"]) and finite_number(evidence.get("latency_avg_us"))


def run_latency_phase(args: argparse.Namespace, run: dict[str, Any]) -> dict[str, Any]:
    clear_stats(args)
    if run.get("active_traffic_session_id") is not None:
        raise AcceptanceError(
            "latency traffic start",
            "another managed traffic session is already marked active",
            {"active_traffic_session_id": run.get("active_traffic_session_id")},
        )
    start = require_ok(
        "latency traffic start",
        request_json(
            args.base_url,
            "POST",
            "/api/trex/traffic/start",
            {
                "profile_path": args.latency_profile,
                "ports": [args.tx_port],
                "expected_session_id": None,
                "multiplier": args.latency_multiplier,
                "duration": -1,
                "force": True,
                "confirmation": "start-traffic",
                "tunables": {},
            },
            args.timeout,
        ),
    )
    session_id = required_traffic_session_id(start, "latency traffic start")
    run["active_traffic_session_id"] = session_id
    phase: dict[str, Any] = {
        "profile": args.latency_profile,
        "tx_port": args.tx_port,
        "rx_port": args.rx_port,
        "multiplier": args.latency_multiplier,
        "started_at": utc_now(),
        "start_result": start,
        "session_id": session_id,
    }
    traffic_active = True
    try:
        samples, stats_last = sample_stats_until(
            args,
            run,
            "latency",
            stats_have_latency,
            args.latency_observe_seconds,
        )
        phase["stats_samples"] = samples
        phase["stats_last"] = sanitize_report_payload(stats_last)
        phase.update(latency_evidence(stats_last))
        last = samples[-1] if samples else {}
        phase["tx_packets"] = last.get("opackets", 0)
        phase["rx_packets"] = last.get("ipackets", 0)
        phase["tx_bps"] = last.get("tx_bps", 0)
        phase["rx_bps"] = last.get("rx_bps", 0)
        phase["tx_pps"] = last.get("tx_pps", 0)
        phase["rx_pps"] = last.get("rx_pps", 0)
        return phase
    finally:
        if traffic_active:
            try:
                phase["stop_result"] = stop_traffic(args, run, "latency traffic stop")
                phase["ended_at"] = utc_now()
                traffic_active = False
            except AcceptanceError as exc:
                phase["stop_error"] = exc.to_record()


def run_capture_phase(args: argparse.Namespace, run: dict[str, Any], run_id: str) -> dict[str, Any]:
    capture_name = f"{args.report_prefix}-{run_id}.pcap"
    require_ok("capture remove all", request_json(args.base_url, "POST", "/api/trex/capture/remove-all", {}, args.timeout))
    clear_stats(args)
    capture_id: int | None = None
    traffic_active = False
    phase: dict[str, Any] = {
        "profile": args.capture_profile,
        "tx_port": args.tx_port,
        "rx_port": args.rx_port,
        "multiplier": args.capture_multiplier,
        "expected_layer_chain": args.expected_capture_chain,
        "pcap": capture_name if args.save_pcap else None,
        "capture_bpf_filter": args.capture_bpf_filter,
    }
    try:
        capture_start = require_ok(
            "capture start",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/capture/start",
                {
                    "rx_ports": [args.rx_port],
                    "limit": args.capture_limit,
                    "mode": "fixed",
                    "bpf_filter": args.capture_bpf_filter,
                    "snaplen": args.snaplen,
                },
                args.timeout,
            ),
        )
        phase["capture_start"] = capture_start
        capture_data = capture_start.get("data")
        if not isinstance(capture_data, dict) or not isinstance(capture_data.get("id"), int):
            raise AcceptanceError("capture start", "capture start did not return an id", capture_start)
        capture_id = capture_data["id"]

        if run.get("active_traffic_session_id") is not None:
            raise AcceptanceError(
                "capture traffic start",
                "another managed traffic session is already marked active",
                {"active_traffic_session_id": run.get("active_traffic_session_id")},
            )
        start = require_ok(
            "capture traffic start",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/traffic/start",
                {
                    "profile_path": args.capture_profile,
                    "ports": [args.tx_port],
                    "expected_session_id": None,
                    "multiplier": args.capture_multiplier,
                    "duration": -1,
                    "force": True,
                    "confirmation": "start-traffic",
                    "tunables": {},
                },
                args.timeout,
            ),
        )
        session_id = required_traffic_session_id(start, "capture traffic start")
        run["active_traffic_session_id"] = session_id
        traffic_active = True
        phase["started_at"] = utc_now()
        phase["start_result"] = start
        phase["session_id"] = session_id
        samples, stats_last = sample_stats_until(
            args,
            run,
            "capture",
            stats_have_packets,
            args.capture_observe_seconds,
        )
        phase["stats_samples"] = samples
        phase["stats_last"] = sanitize_report_payload(stats_last)
        last = samples[-1] if samples else {}
        phase["tx_packets"] = last.get("opackets", 0)
        phase["rx_packets"] = last.get("ipackets", 0)
        phase["tx_bps"] = last.get("tx_bps", 0)
        phase["rx_bps"] = last.get("rx_bps", 0)
        phase["tx_pps"] = last.get("tx_pps", 0)
        phase["rx_pps"] = last.get("rx_pps", 0)
        phase["drop_bps"] = last.get("drop_bps", 0)
        phase["queue_full"] = last.get("queue_full", 0)

        capture_stop = require_ok(
            "capture stop",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/capture/stop",
                {
                    "capture_id": capture_id,
                    "pkt_count": args.capture_packets,
                    "save_pcap": args.save_pcap,
                    "file_name": capture_name if args.save_pcap else None,
                    "snaplen": args.snaplen,
                },
                args.timeout,
            ),
        )
        capture_id = None
        phase["capture_stop"] = capture_stop
        packet_count = capture_packet_count(capture_stop)
        if packet_count <= 0:
            raise AcceptanceError("capture stop", "capture did not return any packets", capture_stop)
        decode_summary = capture_decode_summary(capture_stop)
        if decode_summary.get("decoded_packets", 0) <= 0:
            raise AcceptanceError("capture decode", "capture packets did not include backend decoded layers", capture_stop)
        layer_chain = capture_layer_chain(decode_summary)
        if args.expected_capture_chain and args.expected_capture_chain not in set(decode_summary.get("layer_chains") or []):
            raise AcceptanceError(
                "capture decode",
                f"capture did not include expected layer chain: {args.expected_capture_chain}",
                decode_summary,
            )
        phase["packet_count"] = packet_count
        phase["decoded_packets"] = decode_summary.get("decoded_packets", 0)
        phase["layer_chain"] = layer_chain
        phase["layer_chains"] = decode_summary.get("layer_chains", [])
        phase["capture_decode_summary"] = decode_summary
        if args.save_pcap:
            files = require_ok("capture files", request_json(args.base_url, "GET", "/api/trex/capture/files", None, args.timeout))
            phase["capture_files"] = files
            file_records = read_path(files, "data.files")
            names = {record.get("name") for record in file_records if isinstance(record, dict)} if isinstance(file_records, list) else set()
            if capture_name not in names:
                raise AcceptanceError("capture files", f"{capture_name} was not listed after capture stop", files)
        return phase
    finally:
        if capture_id is not None:
            cleanup_result = request_json(
                args.base_url,
                "POST",
                "/api/trex/capture/stop",
                {"capture_id": capture_id, "pkt_count": 1, "save_pcap": False, "snaplen": args.snaplen},
                args.timeout,
            )
            phase["capture_cleanup_stop"] = cleanup_result
        if traffic_active:
            try:
                phase["stop_result"] = stop_traffic(args, run, "capture traffic stop")
                phase["ended_at"] = utc_now()
            except AcceptanceError as exc:
                phase["stop_error"] = exc.to_record()


def post_conditions(args: argparse.Namespace) -> dict[str, Any]:
    stats = request_json(args.base_url, "GET", "/api/trex/stats", None, args.timeout)
    capture_status = request_json(args.base_url, "GET", "/api/trex/capture/status", None, args.timeout)
    ports = request_json(args.base_url, "GET", "/api/trex/ports", None, args.timeout)
    active = active_port_ids(ports if isinstance(ports, dict) else {}).intersection({args.tx_port})
    active_recorders = capture_recorder_count(capture_status if isinstance(capture_status, dict) else {})
    return {
        "stats_after_stop": stats,
        "capture_status_after_stop": capture_status,
        "ports_after_stop": ports,
        "traffic_ports_idle": not active,
        "active_ports_after_stop": sorted(active),
        "capture_recorders_after_stop": active_recorders,
    }


def report_metrics(run: dict[str, Any]) -> list[dict[str, str]]:
    latency = run.get("latency_phase") if isinstance(run.get("latency_phase"), dict) else {}
    capture = run.get("capture_phase") if isinstance(run.get("capture_phase"), dict) else {}
    post = run.get("post_conditions") if isinstance(run.get("post_conditions"), dict) else {}
    profiles = " + ".join(
        item for item in [str(latency.get("profile") or ""), str(capture.get("profile") or "")] if item
    ) or "-"
    run_duration = "-"
    started = latency.get("started_at")
    ended = capture.get("ended_at")
    if isinstance(started, str) and isinstance(ended, str):
        try:
            seconds = (
                datetime.fromisoformat(ended.replace("Z", "+00:00"))
                - datetime.fromisoformat(started.replace("Z", "+00:00"))
            ).total_seconds()
            if seconds >= 0:
                run_duration = f"{seconds:.1f} s"
        except ValueError:
            pass
    saved_captures = 1 if capture.get("pcap") else 0
    return [
        {"label": "TRex host", "value": str(run.get("base_url") or "-")},
        {"label": "Profile", "value": profiles},
        {"label": "Run ports", "value": f"{run.get('tx_port', '-')} -> {run.get('rx_port', '-')}"},
        {"label": "Run duration", "value": run_duration},
        {"label": "Runtime rate", "value": str(capture.get("multiplier") or latency.get("multiplier") or "-")},
        {"label": "Streams", "value": str(len(capture.get("stream_ids") or latency.get("stream_ids") or [])) if isinstance(capture.get("stream_ids") or latency.get("stream_ids"), list) else "-"},
        {"label": "Ports", "value": str(len(port_ids(run.get("ports_before") if isinstance(run.get("ports_before"), dict) else {})))},
        {"label": "Active ports", "value": str(len(post.get("active_ports_after_stop") or []))},
        {"label": "Tx L2", "value": format_metric(capture.get("tx_bps") or latency.get("tx_bps"), "b/s")},
        {"label": "Rx L2", "value": format_metric(capture.get("rx_bps") or latency.get("rx_bps"), "b/s")},
        {"label": "Tx PPS", "value": format_metric(capture.get("tx_pps") or latency.get("tx_pps"), "pps")},
        {"label": "Rx PPS", "value": format_metric(capture.get("rx_pps") or latency.get("rx_pps"), "pps")},
        {"label": "Drop rate", "value": format_metric(capture.get("drop_bps"), "b/s")},
        {"label": "Queue full", "value": str(capture.get("queue_full") or 0)},
        {"label": "Latency avg", "value": format_latency_us(latency.get("latency_avg_us"))},
        {"label": "Monitor packets", "value": str(capture.get("packet_count") or 0)},
        {"label": "Saved captures", "value": str(saved_captures)},
        {"label": "Field matches", "value": str(capture.get("layer_chain") or "-")},
    ]


def report_checks(run: dict[str, Any]) -> list[dict[str, str]]:
    latency = run.get("latency_phase") if isinstance(run.get("latency_phase"), dict) else {}
    capture = run.get("capture_phase") if isinstance(run.get("capture_phase"), dict) else {}
    post = run.get("post_conditions") if isinstance(run.get("post_conditions"), dict) else {}
    failure = run.get("failure")
    return [
        {
            "label": "Daemon custom YAML",
            "status": "pass" if run.get("daemon_custom_yaml_start") else "unknown",
            "detail": "TRex was started or verified through the daemon runtime path",
        },
        {
            "label": "Latency stream",
            "status": "pass" if finite_number(latency.get("latency_avg_us")) else "fail",
            "detail": f"PG IDs: {', '.join(latency.get('latency_pg_ids') or []) or '-'}",
        },
        {
            "label": "Capture workflow",
            "status": "pass" if (capture.get("packet_count") or 0) > 0 else "fail",
            "detail": f"{capture.get('packet_count') or 0} packets, {capture.get('layer_chain') or '-'}",
        },
        {
            "label": "Stop and cleanup",
            "status": "pass" if post.get("traffic_ports_idle") is True and post.get("capture_recorders_after_stop") == 0 else "fail",
            "detail": f"active ports {post.get('active_ports_after_stop') or []}, recorders {post.get('capture_recorders_after_stop', '-')}",
        },
        {
            "label": "Failure state",
            "status": "fail" if failure else "pass",
            "detail": str(read_path(failure, "message") or "No failure captured"),
        },
    ]


def report_conclusion(run: dict[str, Any], checks: list[dict[str, str]]) -> dict[str, Any]:
    verdict = "fail" if run.get("verdict") == "fail" or any(check["status"] == "fail" for check in checks) else "pass"
    title = "Standard E2E Pass" if verdict == "pass" else "Standard E2E Fail"
    summary = (
        "Daemon custom YAML, latency stream, packet capture, traffic stop, and report archive completed."
        if verdict == "pass"
        else str(read_path(run.get("failure"), "message") or "Standard E2E did not complete")
    )
    reasons = [check["detail"] for check in checks if check["status"] != "pass"] or [
        "Real TRex ports produced TX/RX packet evidence",
        "Latency and capture were validated in separate real phases",
        "Traffic and capture cleanup postconditions passed",
    ]
    return {
        "verdict": verdict,
        "title": title,
        "summary": summary,
        "reasons": reasons[:6],
        "evidence": report_metrics(run)[:8],
        "checks": checks,
    }


def report_diagnostics(run: dict[str, Any]) -> list[dict[str, Any]]:
    capture = run.get("capture_phase") if isinstance(run.get("capture_phase"), dict) else {}
    latency = run.get("latency_phase") if isinstance(run.get("latency_phase"), dict) else {}
    return [
        {
            "label": "Two-phase validation",
            "status": "pass",
            "summary": "Latency and capture were sequenced to avoid TRex service-mode conflict",
            "action": STANDARD_E2E_CONSTRAINT,
            "evidence": [
                {"label": "Latency profile", "value": str(latency.get("profile") or "-")},
                {"label": "Capture profile", "value": str(capture.get("profile") or "-")},
            ],
        },
        {
            "label": "Capture decode",
            "status": "pass" if capture.get("decoded_packets", 0) else "fail",
            "summary": f"{capture.get('decoded_packets') or 0} decoded packets; {capture.get('layer_chain') or '-'}",
            "action": "Inspect the saved PCAP if layer evidence is missing or unexpected.",
            "evidence": [
                {"label": "PCAP", "value": str(capture.get("pcap") or "-")},
                {"label": "BPF", "value": str(capture.get("capture_bpf_filter") or "-")},
            ],
        },
    ]


def report_markdown(run: dict[str, Any]) -> str:
    latency = run.get("latency_phase") if isinstance(run.get("latency_phase"), dict) else {}
    capture = run.get("capture_phase") if isinstance(run.get("capture_phase"), dict) else {}
    daemon_start = run.get("daemon_custom_yaml_start") if isinstance(run.get("daemon_custom_yaml_start"), dict) else {}
    identity = run.get("evidence_identity") if isinstance(run.get("evidence_identity"), dict) else {}
    source_identity = identity.get("source") if isinstance(identity.get("source"), dict) else {}
    build_identity = identity.get("build") if isinstance(identity.get("build"), dict) else {}
    git_identity = source_identity.get("git") if isinstance(source_identity.get("git"), dict) else {}
    command = run.get("trex_command") or read_path(daemon_start, "trex_cmd_options.cfg") or "-"
    rows = [
        ("Verdict", str(run.get("verdict", "unknown"))),
        ("Gate ID", str(identity.get("gate_id") or "-")),
        ("Git SHA", str(git_identity.get("sha") or "-")),
        ("Git dirty", str(git_identity.get("dirty"))),
        ("Source identity", str(source_identity.get("digest") or "-")),
        ("Build identity", str(build_identity.get("digest") or "-")),
        ("Daemon custom YAML", str(read_path(daemon_start, "config_path") or read_path(daemon_start, "reason") or "-")),
        ("TRex command/config", str(command)),
        ("Latency profile", str(latency.get("profile") or "-")),
        ("Latency PG IDs", ", ".join(latency.get("latency_pg_ids") or []) or "-"),
        ("Latency avg", format_latency_us(latency.get("latency_avg_us"))),
        ("Latency packets TX/RX", f"{latency.get('tx_packets', 0)} / {latency.get('rx_packets', 0)}"),
        ("Capture profile", str(capture.get("profile") or "-")),
        ("Capture packets", str(capture.get("packet_count") or 0)),
        ("Capture layer chain", str(capture.get("layer_chain") or "-")),
        ("Saved PCAP", str(capture.get("pcap") or "-")),
        ("Traffic stopped", str(read_path(run, "post_conditions.traffic_ports_idle") is True)),
    ]
    table = "\n".join(["| Field | Value |", "| --- | --- |", *[f"| {field} | {value} |" for field, value in rows]])
    return (
        f"# TRex Standard E2E {run['run_id']}\n\n"
        f"{table}\n\n"
        f"Known constraint: {STANDARD_E2E_CONSTRAINT}\n\n"
        "## Checks\n"
        f"{json.dumps(report_checks(run), indent=2, sort_keys=True)}\n"
    )


def build_report_archive(run: dict[str, Any]) -> dict[str, Any]:
    checks = report_checks(run)
    conclusion = report_conclusion(run, checks)
    payload = sanitize_report_payload(run)
    payload["standard_e2e"] = True
    payload["workflow"] = "standard-e2e"
    payload["known_constraint"] = STANDARD_E2E_CONSTRAINT
    payload["metrics"] = report_metrics(run)
    payload["checks"] = checks
    payload["conclusion"] = conclusion
    payload["verdict"] = conclusion["verdict"]
    payload["diagnostics"] = report_diagnostics(run)
    identity = payload.get("evidence_identity") if isinstance(payload.get("evidence_identity"), dict) else {}
    source_identity = identity.get("source") if isinstance(identity.get("source"), dict) else {}
    build_identity = identity.get("build") if isinstance(identity.get("build"), dict) else {}
    git_identity = source_identity.get("git") if isinstance(source_identity.get("git"), dict) else {}
    frontend = build_identity.get("frontend") if isinstance(build_identity.get("frontend"), dict) else {}
    api_identity = identity.get("api") if isinstance(identity.get("api"), dict) else {}
    api_configuration = api_identity.get("configuration") if isinstance(api_identity.get("configuration"), dict) else {}
    payload.update(
        {
            "gate_id": identity.get("gate_id"),
            "git_sha": git_identity.get("sha"),
            "git_dirty": git_identity.get("dirty"),
            "source_identity": source_identity.get("digest"),
            "build_identity": build_identity.get("digest"),
            "frontend_asset_manifest": frontend.get("asset_manifest"),
            "frontend_asset_hash": frontend.get("asset_manifest_hash"),
            "api_version": api_identity.get("version"),
            "api_config_summary": api_configuration.get("summary"),
            "api_config_hash": api_configuration.get("digest"),
        }
    )
    return {
        "title": f"TRex Standard E2E {run['run_id']}",
        "markdown": report_markdown(run),
        "payload": payload,
        "file_name": f"{run['report_prefix']}-{run['run_id']}.json",
    }


def save_report(args: argparse.Namespace, run: dict[str, Any]) -> dict[str, Any]:
    archive = build_report_archive(run)
    report_save = require_ok(
        "report save",
        request_json(args.base_url, "POST", "/api/trex/reports/save", archive, args.timeout),
    )
    run["report_save"] = report_save
    report_data = report_save.get("data") if isinstance(report_save, dict) else None
    report_file = report_data.get("file") if isinstance(report_data, dict) else None
    saved_name = report_file.get("name") if isinstance(report_file, dict) else archive["file_name"]
    download = require_ok(
        "report download",
        request_json(args.base_url, "POST", "/api/trex/reports/download", {"file_name": saved_name}, args.timeout),
    )
    run["report_download"] = download
    downloaded_file = download.get("data", {}).get("file") if isinstance(download.get("data"), dict) else None
    content = downloaded_file.get("content") if isinstance(downloaded_file, dict) else None
    if not isinstance(content, str) or str(archive["title"]) not in content:
        raise AcceptanceError("report download", "downloaded report did not contain this run title", download)
    ensure_report_archive_has_no_binary_payloads(content)
    run["local_report"] = str(write_local_report(Path(args.output_dir), str(saved_name), content))
    return report_save


def cleanup(args: argparse.Namespace, run: dict[str, Any]) -> None:
    active_session_id = run.get("active_traffic_session_id")
    if isinstance(active_session_id, str) and active_session_id:
        try:
            payload = require_ok(
                "cleanup traffic stop",
                request_json(
                    args.base_url,
                    "POST",
                    "/api/trex/traffic/stop",
                    {
                        "ports": [args.tx_port],
                        "confirmation": "stop",
                        "expected_session_id": active_session_id,
                    },
                    args.timeout,
                ),
            )
            observed_session_id = required_traffic_session_id(
                payload,
                "cleanup traffic stop",
            )
            if observed_session_id != active_session_id:
                raise AcceptanceError(
                    "cleanup traffic stop",
                    "cleanup response belongs to a different managed session",
                    {
                        "expected_session_id": active_session_id,
                        "observed_session_id": observed_session_id,
                        "response": payload,
                    },
                )
            run["active_traffic_session_id"] = None
            run.setdefault("cleanup", []).append(
                {"endpoint": "/api/trex/traffic/stop", "payload": payload}
            )
        except AcceptanceError as exc:
            run.setdefault("cleanup", []).append(
                {"endpoint": "/api/trex/traffic/stop", "error": exc.to_record()}
            )
    try:
        payload = request_json(
            args.base_url,
            "POST",
            "/api/trex/capture/remove-all",
            {},
            args.timeout,
        )
        run.setdefault("cleanup", []).append(
            {"endpoint": "/api/trex/capture/remove-all", "payload": payload}
        )
    except AcceptanceError as exc:
        run.setdefault("cleanup", []).append(
            {"endpoint": "/api/trex/capture/remove-all", "error": exc.to_record()}
        )


def run_standard_e2e(args: argparse.Namespace) -> dict[str, Any]:
    generated_at = utc_now()
    run_id = clean_file_timestamp(generated_at)
    config_content = config_content_from_args(args)
    gate_id = args.gate_id or f"standalone-{run_id}"
    try:
        evidence_identity = collect_evidence_identity(args, config_content, gate_id)
    except EvidenceIdentityError as exc:
        raise AcceptanceError("evidence identity", str(exc)) from exc
    require_expected_evidence_identity(args, evidence_identity)
    run: dict[str, Any] = {
        "run_id": run_id,
        "gate_id": gate_id,
        "report_prefix": args.report_prefix,
        "generated_at": generated_at,
        "base_url": args.base_url,
        "tx_port": args.tx_port,
        "rx_port": args.rx_port,
        "latency_profile": args.latency_profile,
        "capture_profile": args.capture_profile,
        "config_source": str(args.config_file) if args.config_file else "generated",
        "config_content_preview": config_content,
        "evidence_identity": evidence_identity,
        "stats_samples": [],
        "cleanup": [],
        "active_traffic_session_id": None,
    }
    try:
        health = request_json(args.base_url, "GET", "/api/health", None, args.timeout)
        run["health"] = health
        if health.get("status") != "ok":
            raise AcceptanceError("health", "health endpoint did not return ok", health)
        initial_environment = environment_payload(args)
        run["environment_initial"] = initial_environment
        update_api_config_evidence(run, initial_environment)
        ensure_daemon_server(args, run)
        ensure_trex_runtime(args, run, config_content)
        refresh_backend_trex_connection(args, run)
        ports = wait_for_ports(args, {args.tx_port, args.rx_port})
        run["ports_before"] = ports
        run["latency_phase"] = run_latency_phase(args, run)
        run["capture_phase"] = run_capture_phase(args, run, run_id)
        run["post_conditions"] = post_conditions(args)
        post = run["post_conditions"]
        if not post.get("traffic_ports_idle"):
            raise AcceptanceError("postconditions", "traffic port was still active after stop", post)
        if post.get("capture_recorders_after_stop") != 0:
            raise AcceptanceError("postconditions", "capture recorders were still active after stop", post)
        run["daemon_status_after"] = request_json(args.base_url, "GET", "/api/system/daemon/trex/status", None, args.timeout)
        run["verdict"] = "pass"
    except AcceptanceError as exc:
        run["verdict"] = "fail"
        run["failure"] = exc.to_record()
    finally:
        cleanup(args, run)
        if "post_conditions" not in run:
            try:
                run["post_conditions"] = post_conditions(args)
            except AcceptanceError as exc:
                run["post_conditions_error"] = exc.to_record()
    save_report(args, run)
    if run["verdict"] != "pass":
        raise AcceptanceError("standard e2e", "standard E2E workflow failed", sanitize_report_payload(run))
    return run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the standard real TRex WebUI E2E: require an externally managed root-owned daemon, "
            "then validate TRex config, latency, capture, stop, and report archive."
        )
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="WebUI base URL, with or without /api")
    parser.add_argument("--trex-host", default=None, help="Override backend TRex host for the post-daemon-start reconnect")
    parser.add_argument("--sync-port", type=int, default=None, help="Override backend TRex sync port for reconnect")
    parser.add_argument("--async-port", type=int, default=None, help="Override backend TRex async port for reconnect")
    parser.add_argument("--scapy-port", type=int, default=None, help="Override backend TRex Scapy port for reconnect")
    parser.add_argument("--client-name", default=None, help="Override backend TRex client name for reconnect")
    parser.add_argument("--connect-timeout", type=int, default=None, help="Override backend TRex connect timeout for reconnect")
    parser.add_argument("--config-file", default=None, help="Custom trex_cfg.yaml content to upload through TRex Daemon")
    parser.add_argument("--restart-trex", dest="restart_trex", action="store_true", help="Stop running TRex first and start it through daemon custom YAML")
    parser.add_argument("--reuse-running-trex", dest="restart_trex", action="store_false", help="Reuse a running TRex instance instead of restarting it")
    parser.set_defaults(restart_trex=True)
    parser.add_argument("--port-limit", type=int, default=2)
    parser.add_argument("--interfaces", nargs="+", default=["03:00.0", "03:00.1"], help="PCI interfaces for generated YAML")
    parser.add_argument("--port0-ip", default="1.1.1.1")
    parser.add_argument("--port0-gw", default="2.2.2.2")
    parser.add_argument("--port1-ip", default="2.2.2.2")
    parser.add_argument("--port1-gw", default="1.1.1.1")
    parser.add_argument("--port-bandwidth-gb", type=int, default=25)
    parser.add_argument("--tx-port", type=int, default=0)
    parser.add_argument("--rx-port", type=int, default=1)
    parser.add_argument("--latency-profile", default=DEFAULT_LATENCY_PROFILE)
    parser.add_argument("--capture-profile", default=DEFAULT_CAPTURE_PROFILE)
    parser.add_argument("--latency-multiplier", default=DEFAULT_LATENCY_MULTIPLIER)
    parser.add_argument("--capture-multiplier", default=DEFAULT_CAPTURE_MULTIPLIER)
    parser.add_argument("--latency-observe-seconds", type=float, default=1.0)
    parser.add_argument("--capture-observe-seconds", type=float, default=1.0)
    parser.add_argument("--expected-capture-chain", default=DEFAULT_EXPECTED_CAPTURE_CHAIN)
    parser.add_argument("--capture-bpf-filter", default=DEFAULT_CAPTURE_BPF)
    parser.add_argument("--capture-limit", type=int, default=DEFAULT_CAPTURE_LIMIT)
    parser.add_argument("--capture-packets", type=int, default=DEFAULT_CAPTURE_PACKETS)
    parser.add_argument("--snaplen", type=int, default=0)
    parser.add_argument("--no-save-pcap", dest="save_pcap", action="store_false")
    parser.set_defaults(save_pcap=True)
    parser.add_argument("--daemon-timeout", type=int, default=DEFAULT_DAEMON_TIMEOUT_SECONDS)
    parser.add_argument("--stats-timeout", type=float, default=DEFAULT_STATS_TIMEOUT_SECONDS)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS)
    parser.add_argument("--timeout", type=float, default=DEFAULT_HTTP_TIMEOUT_SECONDS)
    parser.add_argument("--report-prefix", default=DEFAULT_REPORT_PREFIX)
    parser.add_argument("--output-dir", default=".logs/standard-e2e", help="Local directory for downloaded report archive")
    parser.add_argument("--gate-id", default=None, help="Major-gate run identity to embed in the report archive")
    parser.add_argument(
        "--expected-source-identity",
        default=None,
        help="Fail before hardware actions unless the recomputed source identity matches this digest",
    )
    parser.add_argument(
        "--expected-build-identity",
        default=None,
        help="Fail before hardware actions unless the recomputed frontend build identity matches this digest",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        run = run_standard_e2e(args)
    except AcceptanceError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        if exc.payload is not None:
            print(json.dumps(exc.payload, indent=2, sort_keys=True), file=sys.stderr)
        return 1
    report_name = read_path(run, "report_save.data.file.name") or f"{run['report_prefix']}-{run['run_id']}.json"
    print(
        "PASS "
        f"latency={run['latency_phase'].get('latency_avg_us')}us "
        f"capture={run['capture_phase'].get('packet_count')}pkts "
        f"report={report_name} local={run.get('local_report')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
