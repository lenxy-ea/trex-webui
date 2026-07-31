#!/usr/bin/env python3.11
"""Publish the fixed release-recovery ABI without mixed generations."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import uuid
from pathlib import Path


SHA256_HEX = set("0123456789abcdef")


SCHEMA = "trex-webui-release-infrastructure/v1"
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 256 * 1024


class BootstrapError(RuntimeError):
    pass


def fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_DIRECTORY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def sync_all_filesystems(label: str) -> None:
    try:
        os.sync()
    except OSError as exc:
        raise BootstrapError(f"unable to persist {label}: {exc}") from exc


def safe_directory(path: Path, *, mode: int | None = None) -> os.stat_result:
    metadata = path.lstat()
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or path.is_symlink()
        or metadata.st_uid != 0
        or metadata.st_mode & 0o022
        or (mode is not None and stat.S_IMODE(metadata.st_mode) != mode)
    ):
        raise BootstrapError(f"unsafe root-owned directory: {path}")
    return metadata


def assert_parent_authority(path: Path) -> None:
    for component in [Path("/"), *list(path.parents)[::-1]]:
        if component == path:
            break
        if component.exists():
            safe_directory(component)


def read_file(path: Path, *, label: str, expected_mode: int | None = None) -> bytes:
    metadata = path.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode)
        or path.is_symlink()
        or metadata.st_uid != 0
        or metadata.st_nlink != 1
        or metadata.st_mode & 0o022
        or metadata.st_size > MAX_FILE_BYTES
        or (
            expected_mode is not None
            and stat.S_IMODE(metadata.st_mode) != expected_mode
        )
    ):
        raise BootstrapError(f"unsafe {label}: {path}")
    flags = os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        chunks: list[bytes] = []
        observed_size = 0
        while True:
            chunk = os.read(
                descriptor,
                min(1024 * 1024, MAX_FILE_BYTES + 1 - observed_size),
            )
            if not chunk:
                break
            chunks.append(chunk)
            observed_size += len(chunk)
            if observed_size > MAX_FILE_BYTES:
                break
        content = b"".join(chunks)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    if len(content) > MAX_FILE_BYTES:
        raise BootstrapError(f"{label} exceeds size limit: {path}")
    identity = (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mode,
        metadata.st_uid,
        metadata.st_gid,
        metadata.st_nlink,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )
    before_identity = (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mode,
        before.st_uid,
        before.st_gid,
        before.st_nlink,
        before.st_mtime_ns,
        before.st_ctime_ns,
    )
    after_identity = (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mode,
        after.st_uid,
        after.st_gid,
        after.st_nlink,
        after.st_mtime_ns,
        after.st_ctime_ns,
    )
    if (
        identity != before_identity
        or identity != after_identity
        or len(content) != metadata.st_size
    ):
        raise BootstrapError(f"{label} changed while read: {path}")
    return content


def parse_artifact(value: str) -> tuple[Path, Path, int]:
    try:
        source_text, target_text, mode_text = value.split("::", 2)
        mode = int(mode_text, 8)
    except (ValueError, TypeError) as exc:
        raise argparse.ArgumentTypeError(
            "artifact must be SOURCE::TARGET::MODE"
        ) from exc
    source = Path(source_text)
    target = Path(target_text)
    if (
        not source.is_absolute()
        or not target.is_absolute()
        or source != Path(os.path.normpath(source))
        or target != Path(os.path.normpath(target))
        or mode not in {0o644, 0o755}
    ):
        raise argparse.ArgumentTypeError("artifact paths/mode are not canonical")
    return source, target, mode


def parse_expected(value: str) -> tuple[Path, int, str]:
    try:
        target_text, mode_text, activation_class = value.split("::", 2)
        mode = int(mode_text, 8)
    except (ValueError, TypeError) as exc:
        raise argparse.ArgumentTypeError(
            "expected artifact must be TARGET::MODE::ACTIVATION_CLASS"
        ) from exc
    target = Path(target_text)
    if (
        not target.is_absolute()
        or target != Path(os.path.normpath(target))
        or mode not in {0o644, 0o755}
        or activation_class not in {"prerequisite", "consumer-dropin"}
    ):
        raise argparse.ArgumentTypeError("expected artifact contract is invalid")
    return target, mode, activation_class


def strict_json(content: bytes) -> object:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise BootstrapError(f"manifest contains duplicate key {key!r}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise BootstrapError(f"manifest contains non-finite value {value}")

    try:
        return json.loads(
            content,
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise BootstrapError(f"manifest is invalid JSON: {exc}") from exc


def validate_manifest_document(value: object) -> list[dict[str, object]]:
    if not isinstance(value, dict) or set(value) != {"artifacts", "schema"}:
        raise BootstrapError("manifest root has an unexpected shape")
    if value.get("schema") != SCHEMA:
        raise BootstrapError("manifest schema is unsupported")
    artifacts = value.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise BootstrapError("manifest artifact list is empty or invalid")
    records: list[dict[str, object]] = []
    targets: set[Path] = set()
    for raw_record in artifacts:
        if not isinstance(raw_record, dict) or set(raw_record) != {
            "activation_class",
            "mode",
            "sha256",
            "size",
            "target",
        }:
            raise BootstrapError("manifest artifact record has an unexpected shape")
        activation_class = raw_record.get("activation_class")
        mode = raw_record.get("mode")
        digest = raw_record.get("sha256")
        size = raw_record.get("size")
        target_text = raw_record.get("target")
        if activation_class not in {"prerequisite", "consumer-dropin"}:
            raise BootstrapError("manifest artifact activation class is invalid")
        if isinstance(mode, bool) or mode not in {0o644, 0o755}:
            raise BootstrapError("manifest artifact mode is invalid")
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in SHA256_HEX for character in digest)
        ):
            raise BootstrapError("manifest artifact digest is invalid")
        if (
            isinstance(size, bool)
            or not isinstance(size, int)
            or size < 0
            or size > MAX_FILE_BYTES
        ):
            raise BootstrapError("manifest artifact size is invalid")
        if not isinstance(target_text, str):
            raise BootstrapError("manifest artifact target is invalid")
        target = Path(target_text)
        if (
            not target.is_absolute()
            or target != Path(os.path.normpath(target))
            or target in targets
        ):
            raise BootstrapError("manifest artifact target is unsafe or duplicated")
        targets.add(target)
        records.append(raw_record)
    if records != sorted(records, key=lambda record: str(record["target"])):
        raise BootstrapError("manifest artifact records are not canonical")
    return records


def verify_installed_manifest(
    manifest: Path,
    expected: list[tuple[Path, int, str]],
) -> None:
    content = read_file(
        manifest,
        label="infrastructure manifest",
        expected_mode=0o600,
    )
    if len(content) > MAX_MANIFEST_BYTES:
        raise BootstrapError("infrastructure manifest exceeds size limit")
    records = validate_manifest_document(strict_json(content))
    expected_contract = {
        (str(target), mode, activation_class)
        for target, mode, activation_class in expected
    }
    if len(expected_contract) != len(expected):
        raise BootstrapError("expected infrastructure contract contains duplicates")
    observed_contract = {
        (
            str(record["target"]),
            int(record["mode"]),
            str(record["activation_class"]),
        )
        for record in records
    }
    if observed_contract != expected_contract:
        raise BootstrapError(
            "manifest artifacts differ from the exact expected profile contract"
        )
    for record in records:
        target = Path(str(record["target"]))
        installed = read_file(
            target,
            label="installed infrastructure artifact",
            expected_mode=int(record["mode"]),
        )
        if (
            len(installed) != record["size"]
            or hashlib.sha256(installed).hexdigest() != record["sha256"]
        ):
            raise BootstrapError(f"installed infrastructure artifact drifted: {target}")


def publish(target: Path, content: bytes, mode: int) -> None:
    parent = target.parent
    safe_directory(parent)
    temporary = parent / f".{target.name}.new-{uuid.uuid4()}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(temporary, flags, 0o600)
    try:
        offset = 0
        while offset < len(content):
            offset += os.write(descriptor, content[offset:])
        os.fchown(descriptor, 0, 0)
        os.fchmod(descriptor, mode)
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = -1
        os.replace(temporary, target)
        fsync_directory(parent)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def canonical_records(
    prerequisites: list[tuple[Path, Path, int]],
    consumer_dropins: list[tuple[Path, Path, int]],
) -> tuple[
    list[dict[str, object]],
    list[dict[str, object]],
    dict[Path, bytes],
]:
    targets: set[Path] = set()
    records: list[dict[str, object]] = []
    publication_order: list[dict[str, object]] = []
    contents: dict[Path, bytes] = {}
    for activation_class, artifacts in (
        ("prerequisite", prerequisites),
        ("consumer-dropin", consumer_dropins),
    ):
        for source, target, mode in artifacts:
            if target in targets:
                raise BootstrapError(f"duplicate infrastructure target: {target}")
            targets.add(target)
            content = read_file(source, label="infrastructure source")
            contents[target] = content
            record = {
                "activation_class": activation_class,
                "mode": mode,
                "sha256": hashlib.sha256(content).hexdigest(),
                "size": len(content),
                "target": str(target),
            }
            records.append(record)
            publication_order.append(record)
    records.sort(key=lambda record: str(record["target"]))
    return records, publication_order, contents


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--artifact", type=parse_artifact, action="append", default=[])
    parser.add_argument(
        "--consumer-dropin",
        type=parse_artifact,
        action="append",
        default=[],
        help=(
            "publish this consumer dependency only after every prerequisite "
            "runtime and unit is durable"
        ),
    )
    parser.add_argument("--fault-after", type=int)
    parser.add_argument(
        "--verify-installed",
        action="store_true",
        help="verify an established immutable ABI using only its root-owned manifest",
    )
    parser.add_argument(
        "--expected",
        type=parse_expected,
        action="append",
        default=[],
        help="exact TARGET::MODE::ACTIVATION_CLASS member required by the profile",
    )
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise BootstrapError("root is required")
    manifest: Path = args.manifest
    if not manifest.is_absolute() or manifest != Path(os.path.normpath(manifest)):
        raise BootstrapError("manifest path must be canonical and absolute")
    safe_directory(manifest.parent, mode=0o700)
    if args.verify_installed:
        if args.artifact or args.consumer_dropin or args.fault_after is not None:
            raise BootstrapError(
                "--verify-installed cannot be combined with publication arguments"
            )
        if not args.expected:
            raise BootstrapError(
                "--verify-installed requires an exact non-empty --expected profile"
            )
        verify_installed_manifest(manifest, args.expected)
        return 0
    if args.expected:
        raise BootstrapError("--expected is valid only with --verify-installed")
    records, publication_order, contents = canonical_records(
        args.artifact,
        args.consumer_dropin,
    )
    document = {"artifacts": records, "schema": SCHEMA}
    if manifest.exists() or manifest.is_symlink():
        observed = strict_json(
            read_file(
                manifest,
                label="infrastructure manifest",
                expected_mode=0o600,
            )
        )
        validate_manifest_document(observed)
        if observed != document:
            raise BootstrapError(
                "fixed release infrastructure ABI differs from this archive"
            )
        for record in records:
            target = Path(str(record["target"]))
            content = read_file(
                target,
                label="installed infrastructure artifact",
                expected_mode=int(record["mode"]),
            )
            if (
                len(content) != record["size"]
                or hashlib.sha256(content).hexdigest() != record["sha256"]
            ):
                raise BootstrapError(
                    f"installed infrastructure artifact drifted: {target}"
                )
        return 0
    # Publication order is an activation barrier: no consumer may acquire a
    # Requires= edge until the reconciler runtime, validators, helpers, and
    # units it needs are all individually fsynced.  v1 bytes are immutable
    # once the manifest exists; a future ABI must use a new path/schema.
    activation_barrier_crossed = False
    for index, record in enumerate(publication_order):
        if (
            record["activation_class"] == "consumer-dropin"
            and not activation_barrier_crossed
        ):
            # Parent directories may have just been created on a different
            # /usr filesystem.  A global durability barrier is intentionally
            # simple: no /etc consumer dependency can appear before every
            # prerequisite file and ancestor directory is persistent.
            sync_all_filesystems("release infrastructure prerequisites")
            activation_barrier_crossed = True
        target = Path(str(record["target"]))
        content = contents[target]
        if target.exists() or target.is_symlink():
            observed = read_file(
                target,
                label="partial infrastructure artifact",
                expected_mode=int(record["mode"]),
            )
            if observed != content:
                raise BootstrapError(
                    f"refusing to mix release infrastructure generations at {target}"
                )
        else:
            publish(target, content, int(record["mode"]))
        if args.fault_after == index:
            os._exit(91)
    manifest_content = (
        json.dumps(document, separators=(",", ":"), sort_keys=True).encode("utf-8")
        + b"\n"
    )
    if len(manifest_content) > MAX_MANIFEST_BYTES:
        raise BootstrapError("infrastructure manifest exceeds size limit")
    publish(manifest, manifest_content, 0o600)
    sync_all_filesystems("release infrastructure activation and manifest")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BootstrapError as exc:
        raise SystemExit(f"release infrastructure bootstrap failed: {exc}") from exc
