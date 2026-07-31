from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, Callable

from app.core.settings import TrexEnvironment
from app.trex.profile_files import (
    DEFAULT_PROFILE_PREVIEW_BYTES,
    PROFILE_COPY_NAME_ERROR,
    PROFILE_PATH_ERROR,
    PROFILE_ROOT_PATH_ERROR,
    SUPPORTED_PROFILE_SUFFIXES,
    TEXT_PROFILE_SUFFIXES,
    clean_profile_path_text,
    is_allowed_path,
    matching_root,
    next_profile_copy_path,
    normalize_profile_copy_file_name,
    path_exists,
    profile_record,
    profile_root_errors,
    safe_resolve,
    valid_profile_root,
    writable_profile_root,
)
from app.trex.result import TrexCallResult


def resolve_profile_path(env: TrexEnvironment, profile_path: str) -> TrexCallResult:
    if not clean_profile_path_text(profile_path):
        return TrexCallResult(False, blocker="profile_path_invalid", error=PROFILE_PATH_ERROR)
    requested = Path(profile_path).expanduser()
    candidates = [requested] if requested.is_absolute() else [root / requested for root in env.profile_roots]
    root_errors = profile_root_errors(env.profile_roots)

    for candidate in candidates:
        resolved, resolve_error = safe_resolve(candidate, PROFILE_ROOT_PATH_ERROR)
        if resolved is None:
            root_errors.append(resolve_error or PROFILE_ROOT_PATH_ERROR)
            continue
        if not is_allowed_path(resolved, env.profile_roots):
            continue
        if not path_exists(resolved):
            continue
        try:
            is_file = resolved.is_file()
        except (OSError, ValueError) as exc:
            return TrexCallResult(False, blocker="profile_path_failed", error=str(exc))
        if not is_file:
            return TrexCallResult(False, blocker="profile_not_file", error=str(resolved))
        return TrexCallResult(True, data=resolved)

    if root_errors and not any(valid_profile_root(root) for root in env.profile_roots):
        return TrexCallResult(False, blocker="profile_root_path_invalid", error=root_errors[0])

    allowed = ", ".join(str(root) for root in env.profile_roots)
    return TrexCallResult(
        False,
        blocker="profile_path_denied_or_missing",
        error=f"profile '{profile_path}' was not found under allowed roots: {allowed}",
    )


def list_profiles(env: TrexEnvironment) -> TrexCallResult:
    roots: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []

    for configured_root in env.profile_roots:
        root, root_error = safe_resolve(configured_root, PROFILE_ROOT_PATH_ERROR)
        if root is None:
            roots.append(
                {
                    "path": str(configured_root),
                    "exists": False,
                    "readable": False,
                    "profile_count": 0,
                    "blocker": "profile_root_path_invalid",
                    "error": root_error,
                }
            )
            continue
        root_record: dict[str, Any] = {
            "path": str(root),
            "exists": path_exists(root),
            "readable": False,
            "profile_count": 0,
            "blocker": None,
            "error": None,
        }

        if not path_exists(root):
            root_record["blocker"] = "profile_root_missing"
            roots.append(root_record)
            continue

        try:
            is_dir = root.is_dir()
        except (OSError, ValueError) as exc:
            root_record["blocker"] = "profile_root_path_invalid"
            root_record["error"] = str(exc)
            roots.append(root_record)
            continue

        if not is_dir:
            root_record["blocker"] = "profile_root_not_directory"
            roots.append(root_record)
            continue

        root_record["readable"] = os.access(root, os.R_OK | os.X_OK)
        if not root_record["readable"]:
            root_record["blocker"] = "profile_root_unreadable"
            roots.append(root_record)
            continue

        try:
            candidates = sorted(root.rglob("*"), key=lambda path: path.as_posix())
            for candidate in candidates:
                try:
                    if not candidate.is_file():
                        continue
                    if candidate.suffix.lower() not in SUPPORTED_PROFILE_SUFFIXES:
                        continue
                    resolved = candidate.resolve()
                    if not is_allowed_path(resolved, [root]):
                        continue
                    profiles.append(profile_record(resolved, root))
                    root_record["profile_count"] += 1
                except (OSError, ValueError) as exc:
                    root_record["blocker"] = "profile_scan_partial"
                    root_record["error"] = str(exc)
        except (OSError, ValueError) as exc:
            root_record["blocker"] = "profile_root_scan_failed"
            root_record["error"] = str(exc)

        roots.append(root_record)

    profiles.sort(key=lambda profile: (str(profile["relative_path"]), str(profile["root"])))
    return TrexCallResult(
        True,
        data={
            "roots": roots,
            "profiles": profiles,
            "supported_suffixes": sorted(SUPPORTED_PROFILE_SUFFIXES),
        },
    )


def profile_preview(
    env: TrexEnvironment,
    profile_path: str,
    max_bytes: int = DEFAULT_PROFILE_PREVIEW_BYTES,
) -> TrexCallResult:
    resolved = resolve_profile_path(env, profile_path)
    if not resolved.ok:
        return resolved

    profile_file = resolved.data
    root = matching_root(profile_file, env.profile_roots)
    if root is None:
        return TrexCallResult(
            False,
            blocker="profile_path_denied_or_missing",
            error=f"profile '{profile_path}' was not found under allowed profile roots",
        )

    try:
        profile = profile_record(profile_file, root)
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="profile_preview_failed", error=str(exc))
    suffix = profile_file.suffix.lower()
    if suffix not in TEXT_PROFILE_SUFFIXES:
        return TrexCallResult(
            False,
            data={
                "profile": profile,
                "preview_available": False,
                "content": None,
                "truncated": False,
                "bytes_read": 0,
                "max_bytes": max_bytes,
            },
            blocker="profile_preview_binary" if suffix in {".pcap", ".cap"} else "profile_preview_unsupported",
            error=f"profile preview is not textual for suffix '{suffix}'",
        )

    preview_limit = max(1, min(max_bytes, 65536))
    try:
        with profile_file.open("rb") as opened_profile:
            content_bytes = opened_profile.read(preview_limit + 1)
    except OSError as exc:
        return TrexCallResult(False, blocker="profile_preview_failed", error=str(exc), data={"profile": profile})

    truncated = len(content_bytes) > preview_limit
    visible_bytes = content_bytes[:preview_limit]
    return TrexCallResult(
        True,
        data={
            "profile": profile,
            "preview_available": True,
            "content": visible_bytes.decode("utf-8", errors="replace"),
            "truncated": truncated,
            "bytes_read": len(visible_bytes),
            "max_bytes": preview_limit,
        },
    )


def duplicate_profile(env: TrexEnvironment, profile_path: str, target_name: str | None = None) -> TrexCallResult:
    resolved = resolve_profile_path(env, profile_path)
    if not resolved.ok:
        return resolved

    source = resolved.data
    source_root = matching_root(source, env.profile_roots)
    if source_root is None:
        return TrexCallResult(False, blocker="profile_path_denied_or_missing", error=str(source))

    writable_root = source_root if os.access(source_root, os.W_OK | os.X_OK) else writable_profile_root(env.profile_roots)[0]
    if writable_root is None:
        return TrexCallResult(False, blocker="profile_root_path_invalid", error=PROFILE_ROOT_PATH_ERROR)

    normalized_name = normalize_profile_copy_file_name(target_name, source.suffix) if target_name else None
    if target_name and normalized_name is None:
        return TrexCallResult(False, blocker="profile_name_invalid", error=PROFILE_COPY_NAME_ERROR)

    try:
        writable_root.mkdir(parents=True, exist_ok=True)
        target = (
            writable_root / normalized_name
            if normalized_name
            else next_profile_copy_path(writable_root, source.name)
        ).resolve()
        target.relative_to(writable_root.resolve())
        if target.exists():
            return TrexCallResult(False, blocker="profile_target_exists", error=str(target))
        shutil.copy2(source, target)
        profile = profile_record(target, writable_root.resolve())
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="profile_duplicate_failed", error=str(exc))

    return TrexCallResult(
        True,
        data={
            "accepted": True,
            "source": profile_record(source, source_root),
            "profile": profile,
        },
    )


def delete_profile(env: TrexEnvironment, profile_path: str) -> TrexCallResult:
    resolved = resolve_profile_path(env, profile_path)
    if not resolved.ok:
        return resolved

    source = resolved.data
    root = matching_root(source, env.profile_roots)
    if root is None:
        return TrexCallResult(False, blocker="profile_path_denied_or_missing", error=str(source))
    try:
        profile = profile_record(source, root)
        source.unlink()
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="profile_delete_failed", error=str(exc))

    return TrexCallResult(True, data={"accepted": True, "profile": profile})


def export_profile_json(
    profile_path: str,
    load_workbench_profile: Callable[[str], TrexCallResult],
) -> TrexCallResult:
    loaded = load_workbench_profile(profile_path)
    if not loaded.ok:
        return loaded
    if not loaded.data.get("streams"):
        return TrexCallResult(
            False,
            blocker="profile_workbench_unsupported",
            error="selected profile has no editable GUI streams",
        )
    profile = loaded.data.get("profile")
    base_name = "profile"
    if isinstance(profile, dict) and isinstance(profile.get("name"), str):
        base_name = Path(profile["name"]).stem
    content = json.dumps(
        {
            "profile": profile,
            "streams": loaded.data["streams"],
            "stream_summaries": loaded.data.get("stream_summaries", []),
        },
        indent=2,
    )
    return TrexCallResult(
        True,
        data={
            "accepted": True,
            "profile": profile,
            "file_name": f"{base_name}.json",
            "content": content,
            "bytes": len(content.encode("utf-8")),
        },
    )
