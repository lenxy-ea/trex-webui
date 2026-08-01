#!/usr/bin/env python3.11
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import posixpath
import re
import stat
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO


MAX_ARCHIVE_ENTRIES = 50_000
MAX_ARCHIVE_FILE_BYTES = 1_000_000_000
MAX_ARCHIVE_TOTAL_BYTES = 2_000_000_000
MAX_RELEASE_MANIFEST_BYTES = 32 * 1024 * 1024
RELEASE_MANIFEST_NAME = "RELEASE_MANIFEST.json"
RELEASE_MANIFEST_SCHEMA = "trex-webui-release/v3"
PAYLOAD_IDENTITY_ALGORITHM = "sha256(canonical-json(release-file-manifest)-v1)"
SOURCE_IDENTITY_ALGORITHM = "sha256(canonical-json(git-sha,path,type,mode,size,content-sha256)-v1)"
SAFE_TOP_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
GIT_SHA_RE = re.compile(r"[0-9a-f]{40,64}\Z")
REQUIRED_FILES = {
    RELEASE_MANIFEST_NAME: False,
    "LICENSE": False,
    "NOTICE": False,
    "THIRD_PARTY_NOTICES.md": False,
    "SBOM.python.cdx.json": False,
    "SBOM.web.cdx.json": False,
    "apps/api/requirements-dev.lock": False,
    "apps/api/requirements-dev.txt": False,
    "apps/api/requirements.lock": False,
    "apps/api/requirements.txt": False,
    "apps/web/package-lock.json": False,
    "apps/web/package.json": False,
    "apps/web/dist/index.html": False,
    "deploy/archive_safety.py": False,
    "deploy/bootstrap_release_infrastructure.py": True,
    "deploy/daemon_rpc_probe.py": True,
    "deploy/install.sh": True,
    "deploy/logrotate/trex-daemon-server": False,
    "deploy/path_safety.sh": False,
    "deploy/release_transaction.py": True,
    "deploy/systemd/trex-daemon-server.service": False,
    "deploy/systemd/nftables-trex-webui.conf": False,
    "deploy/systemd/nginx-trex-webui-release-reconcile.conf": False,
    "deploy/systemd/trex-webui-api.service": False,
    "deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf": False,
    "deploy/systemd/trex-webui-release-consumer-ack-v2.service": False,
    "deploy/systemd/trex-webui-release-consumer-ack.service": False,
    "deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf": False,
    "deploy/systemd/trex-webui-release-reconcile-v2.conf": False,
    "deploy/systemd/trex-webui-release-reconcile-v2.service": False,
    "deploy/systemd/trex-webui-release-reconcile.service": False,
    "deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf": False,
    "deploy/systemd/trex-webui-release-retry-v2.service": False,
    "deploy/systemd/trex-webui-release-retry.service": False,
    "deploy/trex_daemon_supervisor.py": True,
    "deploy/trex_native_boundary.sh": True,
    "deploy/trex_overview_contract.py": True,
    "deploy/trex_persisted_state_contract.py": True,
    "deploy/upgrade.sh": True,
    "deploy/verified_upgrade.sh": True,
    "deploy/verify.sh": True,
    "scripts/release_contract.py": True,
    "scripts/release_evidence.py": True,
    "scripts/release_metadata.py": True,
}
PAYLOAD_ENTRY_KEYS = {"mode", "path", "sha256", "size", "type"}
PAYLOAD_IDENTITY_KEYS = {
    "algorithm",
    "digest",
    "file_count",
    "files",
    "manifest_excluded",
    "manifest_path",
}


class ArchiveSafetyError(ValueError):
    pass


def load_release_contract_module() -> Any:
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "release_contract.py"
    try:
        metadata = module_path.lstat()
    except OSError as exc:
        raise ArchiveSafetyError(
            f"release provenance validator is missing: {module_path}: {exc}"
        ) from exc
    if not stat.S_ISREG(metadata.st_mode) or module_path.is_symlink():
        raise ArchiveSafetyError(
            f"release provenance validator is unsafe: {module_path}"
        )
    try:
        spec = importlib.util.spec_from_file_location(
            "trex_webui_release_contract",
            module_path,
        )
        if spec is None or spec.loader is None:
            raise ArchiveSafetyError(
                f"cannot load release provenance validator: {module_path}"
            )
        module = importlib.util.module_from_spec(spec)
        previous_dont_write_bytecode = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        try:
            spec.loader.exec_module(module)
        finally:
            sys.dont_write_bytecode = previous_dont_write_bytecode
    except ArchiveSafetyError:
        raise
    except Exception as exc:
        raise ArchiveSafetyError(
            f"cannot load release provenance validator: {exc}"
        ) from exc
    if module.RELEASE_MANIFEST_SCHEMA != RELEASE_MANIFEST_SCHEMA:
        raise ArchiveSafetyError(
            "release provenance validator and archive validator schemas disagree"
        )
    return module


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_stream(source: BinaryIO) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    while chunk := source.read(1024 * 1024):
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size


def sha256_file(path: Path) -> tuple[str, int]:
    try:
        with path.open("rb") as source:
            return sha256_stream(source)
    except OSError as exc:
        raise ArchiveSafetyError(f"cannot hash release payload file {path}: {exc}") from exc


def normalized_member_name(name: str) -> str:
    if not name or "\\" in name or any(ord(character) < 32 for character in name):
        raise ArchiveSafetyError(f"archive entry has an unsafe name: {name!r}")
    try:
        name.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise ArchiveSafetyError(f"archive entry name is not valid UTF-8: {name!r}") from exc
    if name.startswith("/"):
        raise ArchiveSafetyError(f"archive entry is absolute: {name}")
    stripped = name.rstrip("/")
    normalized = posixpath.normpath(stripped)
    if normalized != stripped or normalized in {"", ".", ".."}:
        raise ArchiveSafetyError(f"archive entry is not canonical: {name}")
    path = PurePosixPath(normalized)
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ArchiveSafetyError(f"archive entry escapes its package root: {name}")
    if len(normalized.encode("utf-8")) > 4096:
        raise ArchiveSafetyError(f"archive entry path is too long: {name[:120]}")
    return normalized


def normalized_payload_path(name: str) -> str:
    normalized = normalized_member_name(name)
    if len(PurePosixPath(normalized).parts) < 1:
        raise ArchiveSafetyError(f"release payload path is empty: {name!r}")
    return normalized


def validated_mode(mode: int, path: str) -> str:
    permissions = stat.S_IMODE(mode)
    if permissions & 0o7000:
        raise ArchiveSafetyError(f"release payload has special permission bits: {path}")
    if permissions & 0o022:
        raise ArchiveSafetyError(f"release payload is writable by group/other: {path}")
    return f"{permissions:04o}"


def payload_entry(path: str, mode: int, size: int, digest: str) -> dict[str, object]:
    return {
        "path": normalized_payload_path(path),
        "type": "file",
        "mode": validated_mode(mode, path),
        "size": size,
        "sha256": digest,
    }


def payload_digest(files: list[dict[str, object]]) -> str:
    material = {"algorithm": PAYLOAD_IDENTITY_ALGORITHM, "files": files}
    return sha256_bytes(canonical_json_bytes(material))


def strict_json_loads(content: bytes) -> object:
    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ArchiveSafetyError(f"release manifest contains duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ArchiveSafetyError(f"release manifest contains non-finite JSON value: {value}")

    try:
        return json.loads(
            content.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_constant,
        )
    except UnicodeDecodeError as exc:
        raise ArchiveSafetyError("release manifest is not valid UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise ArchiveSafetyError(f"release manifest is not valid JSON: {exc}") from exc


def validate_source_identity(manifest: dict[str, object]) -> dict[str, object]:
    source = manifest.get("source_identity")
    if not isinstance(source, dict):
        raise ArchiveSafetyError("release manifest is missing source_identity")
    if source.get("algorithm") != SOURCE_IDENTITY_ALGORITHM:
        raise ArchiveSafetyError("release manifest has an unsupported source identity algorithm")
    source_digest = source.get("digest")
    if not isinstance(source_digest, str) or not SHA256_RE.fullmatch(source_digest):
        raise ArchiveSafetyError("release manifest source identity digest is invalid")
    file_count = source.get("file_count")
    if not isinstance(file_count, int) or isinstance(file_count, bool) or file_count < 1:
        raise ArchiveSafetyError("release manifest source identity file_count is invalid")
    git = source.get("git")
    if not isinstance(git, dict):
        raise ArchiveSafetyError("release manifest source identity is missing Git metadata")
    git_sha = git.get("sha")
    if not isinstance(git_sha, str) or not GIT_SHA_RE.fullmatch(git_sha):
        raise ArchiveSafetyError("release manifest Git SHA is not a full object ID")
    if not isinstance(git.get("dirty"), bool):
        raise ArchiveSafetyError("release manifest Git dirty state is invalid")
    status_digest = git.get("status_sha256")
    if not isinstance(status_digest, str) or not SHA256_RE.fullmatch(status_digest):
        raise ArchiveSafetyError("release manifest Git status digest is invalid")
    if manifest.get("git_commit") != git_sha:
        raise ArchiveSafetyError("release manifest git_commit does not match source identity")
    if manifest.get("git_dirty") is not git.get("dirty"):
        raise ArchiveSafetyError("release manifest git_dirty does not match source identity")
    if manifest.get("source_digest") != source_digest:
        raise ArchiveSafetyError("release manifest source_digest does not match source identity")
    return source


def validated_payload_identity(manifest: object) -> tuple[dict[str, object], list[dict[str, object]]]:
    if not isinstance(manifest, dict):
        raise ArchiveSafetyError("release manifest root must be a JSON object")
    if manifest.get("schema") != RELEASE_MANIFEST_SCHEMA:
        raise ArchiveSafetyError("release manifest schema is missing or unsupported")
    validate_source_identity(manifest)
    release_contract = load_release_contract_module()
    try:
        release_contract.validate_manifest_release_contract(manifest)
    except release_contract.ReleaseContractError as exc:
        raise ArchiveSafetyError(str(exc)) from exc

    identity = manifest.get("payload_identity")
    if not isinstance(identity, dict) or set(identity) != PAYLOAD_IDENTITY_KEYS:
        raise ArchiveSafetyError("release manifest payload_identity shape is invalid")
    if identity.get("algorithm") != PAYLOAD_IDENTITY_ALGORITHM:
        raise ArchiveSafetyError("release manifest has an unsupported payload identity algorithm")
    if identity.get("manifest_path") != RELEASE_MANIFEST_NAME or identity.get("manifest_excluded") is not True:
        raise ArchiveSafetyError("release manifest must explicitly exclude only its own file from payload identity")
    stored_digest = identity.get("digest")
    if not isinstance(stored_digest, str) or not SHA256_RE.fullmatch(stored_digest):
        raise ArchiveSafetyError("release payload digest is invalid")
    files = identity.get("files")
    if not isinstance(files, list):
        raise ArchiveSafetyError("release payload file manifest is not a list")
    file_count = identity.get("file_count")
    if not isinstance(file_count, int) or isinstance(file_count, bool) or file_count != len(files):
        raise ArchiveSafetyError("release payload file_count does not match its file manifest")
    if file_count < 1 or file_count > MAX_ARCHIVE_ENTRIES:
        raise ArchiveSafetyError("release payload file_count is outside the supported range")

    validated_files: list[dict[str, object]] = []
    total_bytes = 0
    for item in files:
        if not isinstance(item, dict) or set(item) != PAYLOAD_ENTRY_KEYS:
            raise ArchiveSafetyError("release payload contains a malformed file entry")
        path = item.get("path")
        if not isinstance(path, str):
            raise ArchiveSafetyError("release payload file path is invalid")
        path = normalized_payload_path(path)
        if path == RELEASE_MANIFEST_NAME:
            raise ArchiveSafetyError("release payload file manifest must not contain RELEASE_MANIFEST.json")
        if item.get("type") != "file":
            raise ArchiveSafetyError(f"release payload entry type is not allowed: {path}")
        mode = item.get("mode")
        if not isinstance(mode, str) or not re.fullmatch(r"[0-7]{4}", mode):
            raise ArchiveSafetyError(f"release payload file mode is invalid: {path}")
        validated_mode(int(mode, 8), path)
        size = item.get("size")
        if (
            not isinstance(size, int)
            or isinstance(size, bool)
            or size < 0
            or size > MAX_ARCHIVE_FILE_BYTES
        ):
            raise ArchiveSafetyError(f"release payload file size is invalid: {path}")
        digest = item.get("sha256")
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            raise ArchiveSafetyError(f"release payload file digest is invalid: {path}")
        total_bytes += size
        if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
            raise ArchiveSafetyError(f"release payload exceeds {MAX_ARCHIVE_TOTAL_BYTES} bytes")
        validated_files.append(
            {"path": path, "type": "file", "mode": mode, "size": size, "sha256": digest}
        )

    paths = [str(item["path"]) for item in validated_files]
    if paths != sorted(paths):
        raise ArchiveSafetyError("release payload file manifest is not canonically sorted")
    if len(paths) != len(set(paths)):
        raise ArchiveSafetyError("release payload file manifest contains duplicate paths")
    actual_digest = payload_digest(validated_files)
    if stored_digest != actual_digest:
        raise ArchiveSafetyError(
            f"release payload digest mismatch: expected {stored_digest}, recalculated {actual_digest}"
        )
    return identity, validated_files


def compare_payload_files(
    expected_files: list[dict[str, object]], actual_files: list[dict[str, object]]
) -> None:
    expected = {str(item["path"]): item for item in expected_files}
    actual = {str(item["path"]): item for item in actual_files}
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    if missing:
        raise ArchiveSafetyError(f"release payload is missing manifested file: {missing[0]}")
    if extra:
        raise ArchiveSafetyError(f"release payload contains unmanifested file: {extra[0]}")
    for path in sorted(expected):
        if expected[path] != actual[path]:
            changed = [key for key in ("type", "mode", "size", "sha256") if expected[path][key] != actual[path][key]]
            raise ArchiveSafetyError(f"release payload file changed ({', '.join(changed)}): {path}")


def read_release_manifest(content: bytes) -> tuple[dict[str, object], list[dict[str, object]]]:
    if not content or len(content) > MAX_RELEASE_MANIFEST_BYTES:
        raise ArchiveSafetyError("release manifest is empty or too large")
    parsed = strict_json_loads(content)
    identity, files = validated_payload_identity(parsed)
    return identity, files


def validate_archive(archive_path: str) -> str:
    seen: set[str] = set()
    top_level: str | None = None
    total_bytes = 0
    required = dict(REQUIRED_FILES)
    actual_files: list[dict[str, object]] = []
    manifest_content: bytes | None = None

    try:
        archive = tarfile.open(archive_path, mode="r:gz")
    except (OSError, tarfile.TarError) as exc:
        raise ArchiveSafetyError(f"cannot read gzip tar archive: {exc}") from exc

    with archive:
        for index, member in enumerate(archive, start=1):
            if index > MAX_ARCHIVE_ENTRIES:
                raise ArchiveSafetyError(f"archive exceeds {MAX_ARCHIVE_ENTRIES} entries")
            name = normalized_member_name(member.name)
            if name in seen:
                raise ArchiveSafetyError(f"archive contains duplicate entry: {name}")
            seen.add(name)

            member_top = PurePosixPath(name).parts[0]
            if not SAFE_TOP_RE.fullmatch(member_top) or member_top in {".", ".."}:
                raise ArchiveSafetyError(f"archive top-level directory is unsafe: {member_top}")
            if top_level is None:
                top_level = member_top
            elif member_top != top_level:
                raise ArchiveSafetyError("archive must contain exactly one top-level directory")

            if member.issym() or member.islnk():
                raise ArchiveSafetyError(f"archive links are not allowed: {name}")
            if member.isdev() or member.isfifo():
                raise ArchiveSafetyError(f"archive device/FIFO entries are not allowed: {name}")
            if not member.isfile() and not member.isdir():
                raise ArchiveSafetyError(f"archive entry type is not allowed: {name}")
            validated_mode(member.mode, name)
            if name == member_top and not member.isdir():
                raise ArchiveSafetyError("archive top-level entry must be a directory")

            relative_name = name[len(member_top) + 1 :] if name != member_top else ""
            if member.isfile():
                if member.size < 0 or member.size > MAX_ARCHIVE_FILE_BYTES:
                    raise ArchiveSafetyError(f"archive file has an unsafe size: {name}")
                total_bytes += member.size
                if total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
                    raise ArchiveSafetyError(f"archive exceeds {MAX_ARCHIVE_TOTAL_BYTES} uncompressed bytes")
                source = archive.extractfile(member)
                if source is None:
                    raise ArchiveSafetyError(f"cannot read archive file: {name}")
                with source:
                    digest, extracted_size = sha256_stream(source)
                if extracted_size != member.size:
                    raise ArchiveSafetyError(f"archive file size changed while reading: {name}")
                if relative_name == RELEASE_MANIFEST_NAME:
                    if member.mode & 0o7777 != 0o644:
                        raise ArchiveSafetyError("release manifest must have mode 0644")
                    if member.size > MAX_RELEASE_MANIFEST_BYTES:
                        raise ArchiveSafetyError("release manifest is too large")
                    manifest_source = archive.extractfile(member)
                    if manifest_source is None:
                        raise ArchiveSafetyError("cannot read release manifest")
                    with manifest_source:
                        manifest_content = manifest_source.read(MAX_RELEASE_MANIFEST_BYTES + 1)
                elif relative_name:
                    actual_files.append(payload_entry(relative_name, member.mode, member.size, digest))

            if relative_name in required:
                if not member.isfile():
                    raise ArchiveSafetyError(f"required archive entry is not a regular file: {relative_name}")
                if required[relative_name] and member.mode & 0o111 == 0:
                    raise ArchiveSafetyError(f"required archive entry is not executable: {relative_name}")
                required.pop(relative_name)

    if top_level is None:
        raise ArchiveSafetyError("archive is empty")
    if required:
        missing = ", ".join(sorted(required))
        raise ArchiveSafetyError(f"archive is missing required files: {missing}")
    if manifest_content is None:
        raise ArchiveSafetyError("archive is missing its release manifest content")
    _identity, expected_files = read_release_manifest(manifest_content)
    actual_files.sort(key=lambda item: str(item["path"]))
    compare_payload_files(expected_files, actual_files)
    return top_level


def scan_payload_tree(root: Path) -> list[dict[str, object]]:
    try:
        root_metadata = root.lstat()
    except OSError as exc:
        raise ArchiveSafetyError(f"cannot inspect release payload root {root}: {exc}") from exc
    if not stat.S_ISDIR(root_metadata.st_mode) or root.is_symlink():
        raise ArchiveSafetyError(f"release payload root is not a real directory: {root}")
    validated_mode(root_metadata.st_mode, str(root))

    files: list[dict[str, object]] = []
    pending = [root]
    while pending:
        directory = pending.pop()
        try:
            children = sorted(os.scandir(directory), key=lambda entry: entry.name)
        except OSError as exc:
            raise ArchiveSafetyError(f"cannot scan release payload directory {directory}: {exc}") from exc
        for child in children:
            path = Path(child.path)
            relative = path.relative_to(root).as_posix()
            normalized_payload_path(relative)
            try:
                metadata = child.stat(follow_symlinks=False)
            except OSError as exc:
                raise ArchiveSafetyError(f"cannot inspect release payload path {relative}: {exc}") from exc
            if stat.S_ISLNK(metadata.st_mode):
                raise ArchiveSafetyError(f"release payload symbolic links are not allowed: {relative}")
            if stat.S_ISDIR(metadata.st_mode):
                validated_mode(metadata.st_mode, relative)
                pending.append(path)
                continue
            if not stat.S_ISREG(metadata.st_mode):
                raise ArchiveSafetyError(f"release payload special files are not allowed: {relative}")
            if relative == RELEASE_MANIFEST_NAME:
                continue
            if metadata.st_size < 0 or metadata.st_size > MAX_ARCHIVE_FILE_BYTES:
                raise ArchiveSafetyError(f"release payload file has an unsafe size: {relative}")
            digest, size = sha256_file(path)
            if size != metadata.st_size:
                raise ArchiveSafetyError(f"release payload file changed while hashing: {relative}")
            files.append(payload_entry(relative, metadata.st_mode, size, digest))
    files.sort(key=lambda item: str(item["path"]))
    if len(files) > MAX_ARCHIVE_ENTRIES:
        raise ArchiveSafetyError(f"release payload exceeds {MAX_ARCHIVE_ENTRIES} files")
    if sum(int(item["size"]) for item in files) > MAX_ARCHIVE_TOTAL_BYTES:
        raise ArchiveSafetyError(f"release payload exceeds {MAX_ARCHIVE_TOTAL_BYTES} bytes")
    return files


def manifest_from_tree(root: Path) -> tuple[dict[str, object], list[dict[str, object]]]:
    manifest_path = root / RELEASE_MANIFEST_NAME
    try:
        metadata = manifest_path.lstat()
    except OSError as exc:
        raise ArchiveSafetyError(f"cannot inspect {RELEASE_MANIFEST_NAME}: {exc}") from exc
    if not stat.S_ISREG(metadata.st_mode) or manifest_path.is_symlink():
        raise ArchiveSafetyError(f"{RELEASE_MANIFEST_NAME} must be a regular non-symlink file")
    if stat.S_IMODE(metadata.st_mode) != 0o644:
        raise ArchiveSafetyError(f"{RELEASE_MANIFEST_NAME} must have mode 0644")
    if metadata.st_size > MAX_RELEASE_MANIFEST_BYTES:
        raise ArchiveSafetyError("release manifest is too large")
    try:
        content = manifest_path.read_bytes()
    except OSError as exc:
        raise ArchiveSafetyError(f"cannot read {RELEASE_MANIFEST_NAME}: {exc}") from exc
    parsed = strict_json_loads(content)
    _identity, expected_files = validated_payload_identity(parsed)
    if not isinstance(parsed, dict):
        raise ArchiveSafetyError("release manifest root must be a JSON object")
    return parsed, expected_files


def verify_payload_tree(root: Path) -> str:
    manifest, expected_files = manifest_from_tree(root)
    actual_files = scan_payload_tree(root)
    compare_payload_files(expected_files, actual_files)
    identity = manifest["payload_identity"]
    if not isinstance(identity, dict) or not isinstance(identity.get("digest"), str):
        raise ArchiveSafetyError("release payload identity is invalid")
    return identity["digest"]


def compute_packaging_source_identity(source_root: Path) -> dict[str, object]:
    script_path = source_root / "scripts" / "trex_standard_e2e.py"
    if not script_path.is_file():
        raise ArchiveSafetyError(f"source identity implementation is missing: {script_path}")
    scripts_path = str(script_path.parent)
    sys.path.insert(0, scripts_path)
    try:
        spec = importlib.util.spec_from_file_location("trex_webui_release_source_identity", script_path)
        if spec is None or spec.loader is None:
            raise ArchiveSafetyError(f"cannot load source identity implementation: {script_path}")
        module = importlib.util.module_from_spec(spec)
        previous_dont_write_bytecode = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        try:
            spec.loader.exec_module(module)
            identity = module.compute_source_identity(source_root)
        finally:
            sys.dont_write_bytecode = previous_dont_write_bytecode
        git = identity.get("git") if isinstance(identity, dict) else None
        if isinstance(git, dict):
            # Release identity is bound to the commit and source contents,
            # not the local branch name used to check out that commit.
            git.pop("branch", None)
    except ArchiveSafetyError:
        raise
    except Exception as exc:
        raise ArchiveSafetyError(f"cannot compute package-time Git/source identity: {exc}") from exc
    finally:
        if sys.path and sys.path[0] == scripts_path:
            sys.path.pop(0)
    probe = {
        "schema": RELEASE_MANIFEST_SCHEMA,
        "source_identity": identity,
        "git_commit": identity.get("git", {}).get("sha") if isinstance(identity, dict) else None,
        "git_dirty": identity.get("git", {}).get("dirty") if isinstance(identity, dict) else None,
        "source_digest": identity.get("digest") if isinstance(identity, dict) else None,
    }
    validate_source_identity(probe)
    return identity


def write_release_manifest(
    root: Path,
    source_root: Path,
    *,
    name: str,
    version: str,
    created_at: str,
    release_repository: str | None = None,
    release_ref: str | None = None,
    signer_workflow_ref: str | None = None,
    signer_workflow_sha: str | None = None,
    require_publishable: bool = False,
) -> str:
    manifest_path = root / RELEASE_MANIFEST_NAME
    if manifest_path.exists() or manifest_path.is_symlink():
        raise ArchiveSafetyError(f"refusing to replace existing {RELEASE_MANIFEST_NAME}")
    source_identity = compute_packaging_source_identity(source_root)
    files = scan_payload_tree(root)
    digest = payload_digest(files)
    git = source_identity["git"]
    if not isinstance(git, dict):
        raise ArchiveSafetyError("package-time source identity has no Git metadata")
    release_contract = load_release_contract_module()
    try:
        release_provenance = release_contract.build_release_provenance(
            version=version,
            source_sha=git["sha"],
            source_dirty=git["dirty"],
            repository=release_repository,
            release_ref=release_ref,
            signer_workflow_ref=signer_workflow_ref,
            signer_workflow_sha=signer_workflow_sha,
            require_publishable=require_publishable,
        )
    except release_contract.ReleaseContractError as exc:
        raise ArchiveSafetyError(str(exc)) from exc
    manifest = {
        "schema": RELEASE_MANIFEST_SCHEMA,
        "name": name,
        "version": version,
        "git_commit": git["sha"],
        "git_dirty": git["dirty"],
        "source_digest": source_identity["digest"],
        "source_identity": source_identity,
        "release_repository": release_provenance.get("repository"),
        "release_ref": release_provenance.get("release_ref"),
        "signer_workflow": release_provenance.get("signer_workflow"),
        "release_provenance": release_provenance,
        "created_at": created_at,
        "payload_identity": {
            "algorithm": PAYLOAD_IDENTITY_ALGORITHM,
            "digest": digest,
            "file_count": len(files),
            "manifest_path": RELEASE_MANIFEST_NAME,
            "manifest_excluded": True,
            "files": files,
        },
        "web_dist": "apps/web/dist",
        "api_requirements": "apps/api/requirements.lock",
        "api_requirements_source": "apps/api/requirements.txt",
        "api_development_requirements": "apps/api/requirements-dev.lock",
        "sbom_files": ["SBOM.web.cdx.json", "SBOM.python.cdx.json"],
        "install_command": "deploy/install.sh --skip-build --install-python-deps",
        "upgrade_command": "deploy/upgrade.sh --skip-build --install-python-deps",
        "archive_upgrade_command": "deploy/upgrade.sh --archive trex-webui-<version>.tar.gz --install-python-deps --verify",
        "verify_command": "deploy/verify.sh --base-url http://127.0.0.1",
        "verify_trex_command": "deploy/verify.sh --base-url http://127.0.0.1 --trex",
    }
    content = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{RELEASE_MANIFEST_NAME}.", dir=root.parent, delete=False
        ) as target:
            temporary_path = Path(target.name)
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temporary_path, 0o644)
        os.replace(temporary_path, manifest_path)
    except OSError as exc:
        try:
            temporary_path.unlink(missing_ok=True)
        except (OSError, UnboundLocalError):
            pass
        raise ArchiveSafetyError(f"cannot publish {RELEASE_MANIFEST_NAME}: {exc}") from exc
    verified_digest = verify_payload_tree(root)
    if verified_digest != digest:
        raise ArchiveSafetyError("published release payload digest changed during manifest creation")
    return digest


def build_parser(command: str) -> argparse.ArgumentParser:
    if command == "source-identity":
        parser = argparse.ArgumentParser(
            description="Print canonical package-time Git/source identity"
        )
        parser.add_argument("command")
        parser.add_argument("root")
        return parser
    if command == "write-manifest":
        parser = argparse.ArgumentParser(description="Write a canonical TRex WebUI release payload manifest")
        parser.add_argument("command")
        parser.add_argument("root")
        parser.add_argument("--source-root", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument("--version", required=True)
        parser.add_argument("--created-at", required=True)
        parser.add_argument("--release-repository")
        parser.add_argument("--release-ref")
        parser.add_argument("--signer-workflow-ref")
        parser.add_argument("--signer-workflow-sha")
        parser.add_argument("--require-publishable", action="store_true")
        return parser
    if command == "verify-tree":
        parser = argparse.ArgumentParser(description="Verify an extracted TRex WebUI release payload")
        parser.add_argument("command")
        parser.add_argument("root")
        return parser
    parser = argparse.ArgumentParser(description="Validate a TRex WebUI release archive before extraction")
    parser.add_argument("archive")
    return parser


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    parser = build_parser(command)
    args = parser.parse_args()
    try:
        if command == "source-identity":
            identity = compute_packaging_source_identity(Path(args.root))
            print(
                json.dumps(
                    identity,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                )
            )
            return 0
        if command == "write-manifest":
            digest = write_release_manifest(
                Path(args.root),
                Path(args.source_root),
                name=args.name,
                version=args.version,
                created_at=args.created_at,
                release_repository=args.release_repository,
                release_ref=args.release_ref,
                signer_workflow_ref=args.signer_workflow_ref,
                signer_workflow_sha=args.signer_workflow_sha,
                require_publishable=args.require_publishable,
            )
            print(digest)
            return 0
        if command == "verify-tree":
            print(verify_payload_tree(Path(args.root)))
            return 0
        print(validate_archive(args.archive))
        return 0
    except (ArchiveSafetyError, OSError) as exc:
        prefix = (
            "archive safety error"
            if command not in {"source-identity", "write-manifest", "verify-tree"}
            else "release payload error"
        )
        print(f"{prefix}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
