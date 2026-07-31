#!/usr/bin/env python3.11
"""Stable, app-independent N-1 persisted runtime safety contract."""

from __future__ import annotations

import argparse
import json
import os
import stat
from pathlib import Path


MAX_RUNTIME_BYTES = 1024 * 1024
MAX_QUICK_VALIDATION_BYTES = 512 * 1024
RUNTIME_KEYS = {
    "capture_leases",
    "connection",
    "revision",
    "traffic_groups",
    "traffic_mutation_intent",
    "traffic_plan_revision",
    "traffic_session",
    "updated_at",
    "version",
}
QUICK_VALIDATION_KEYS = {"revision", "run", "updated_at", "version"}
TERMINAL_QUICK_VALIDATION_PHASES = {"pass", "fail", "cancelled"}


class ContractError(RuntimeError):
    pass


def require_non_negative_integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ContractError(f"{label} must be a non-negative integer")
    return value


def strict_json(content: bytes, label: str) -> object:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ContractError(f"{label} contains duplicate key {key!r}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ContractError(f"{label} contains non-finite value {value}")

    try:
        return json.loads(
            content,
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise ContractError(f"{label} is not valid JSON: {exc}") from exc


def read_authority(path: Path, *, limit: int, label: str) -> object | None:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return None
    if (
        not stat.S_ISREG(metadata.st_mode)
        or path.is_symlink()
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) & 0o022
        or metadata.st_size > limit
    ):
        raise ContractError(f"{label} file authority is unsafe")
    flags = os.O_RDONLY | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags)
    try:
        observed = os.fstat(descriptor)
        content = os.read(descriptor, limit + 1)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    if len(content) > limit:
        raise ContractError(f"{label} exceeds the size limit")
    identity = (metadata.st_dev, metadata.st_ino, metadata.st_size)
    if identity != (observed.st_dev, observed.st_ino, observed.st_size) or identity != (
        after.st_dev,
        after.st_ino,
        after.st_size,
    ):
        raise ContractError(f"{label} changed while it was read")
    return strict_json(content, label)


def validate_runtime(value: object | None) -> None:
    if value is None:
        return
    if not isinstance(value, dict) or set(value) != RUNTIME_KEYS:
        raise ContractError("runtime state root has an unexpected shape")
    if value.get("version") != 2:
        raise ContractError("runtime state version is unsupported")
    require_non_negative_integer(value.get("revision"), "runtime revision")
    require_non_negative_integer(
        value.get("traffic_plan_revision"), "traffic plan revision"
    )
    if value.get("traffic_mutation_intent") is not None:
        raise ContractError("traffic mutation recovery is pending")
    capture_leases = value.get("capture_leases")
    if not isinstance(capture_leases, list) or capture_leases:
        raise ContractError("capture recovery or ownership is still persisted")
    session = value.get("traffic_session")
    if session is not None:
        if not isinstance(session, dict) or session.get("state") != "stopped":
            raise ContractError("traffic session is active or unknown")
    if not isinstance(value.get("traffic_groups"), list):
        raise ContractError("traffic groups have an invalid shape")
    if value.get("connection") is not None and not isinstance(
        value.get("connection"), dict
    ):
        raise ContractError("runtime connection has an invalid shape")
    if value.get("updated_at") is not None and not isinstance(
        value.get("updated_at"), str
    ):
        raise ContractError("runtime update timestamp has an invalid shape")


def validate_quick_validation(value: object | None) -> None:
    if value is None:
        return
    if not isinstance(value, dict) or set(value) != QUICK_VALIDATION_KEYS:
        raise ContractError("quick-validation state root has an unexpected shape")
    if value.get("version") != 1:
        raise ContractError("quick-validation state version is unsupported")
    require_non_negative_integer(
        value.get("revision"), "quick-validation revision"
    )
    if not isinstance(value.get("updated_at"), str):
        raise ContractError("quick-validation update timestamp is invalid")
    run = value.get("run")
    if run is None:
        return
    if not isinstance(run, dict):
        raise ContractError("quick-validation run has an invalid shape")
    if run.get("phase") not in TERMINAL_QUICK_VALIDATION_PHASES:
        raise ContractError("quick validation is still active or unknown")
    if run.get("recovery_required") is not False:
        raise ContractError("quick-validation recovery is still pending")
    if run.get("idle_verified") is not True:
        raise ContractError("quick-validation cleanup is not idle-verified")
    if run.get("pending_terminal") is not None:
        raise ContractError("quick-validation terminal transition is pending")
    if not isinstance(run.get("cleanup"), dict) or not isinstance(
        run.get("ended_at"), str
    ):
        raise ContractError("quick-validation terminal cleanup evidence is incomplete")


def quick_validation_path(runtime_path: Path) -> Path:
    suffix = runtime_path.suffix or ".json"
    stem = runtime_path.stem if runtime_path.suffix else runtime_path.name
    return runtime_path.with_name(f"{stem}-quick-validation{suffix}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("runtime_state", type=Path)
    args = parser.parse_args()
    runtime_path = args.runtime_state
    if not runtime_path.is_absolute() or runtime_path != Path(
        os.path.normpath(runtime_path)
    ):
        raise ContractError("runtime state path must be canonical and absolute")
    validate_runtime(
        read_authority(
            runtime_path,
            limit=MAX_RUNTIME_BYTES,
            label="runtime state",
        )
    )
    validate_quick_validation(
        read_authority(
            quick_validation_path(runtime_path),
            limit=MAX_QUICK_VALIDATION_BYTES,
            label="quick-validation state",
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractError as exc:
        raise SystemExit(f"persisted runtime contract failed: {exc}") from exc
