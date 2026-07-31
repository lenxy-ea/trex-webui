from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.settings import TrexEnvironment
from app.trex.result import TrexCallResult
from app.trex.run_reports import (
    RUN_REPORT_ARCHIVE_MAX_BYTES,
    RUN_REPORT_FILE_NAME_ERROR,
    RUN_REPORT_TREND_MAX_FILES,
    RunReportValidationError,
    normalize_run_report_file_name,
    normalize_run_report_markdown,
    normalize_run_report_title,
    run_report_default_file_name,
    run_report_file_record,
    run_report_output_root,
    run_report_trend_record,
    run_report_trends_payload,
)


def _run_report_validation_error_result(exc: RunReportValidationError) -> TrexCallResult:
    return TrexCallResult(False, blocker=exc.blocker, error=exc.error)


def list_run_reports(env: TrexEnvironment) -> TrexCallResult:
    root = run_report_output_root(env)
    if not root.exists():
        return TrexCallResult(True, data={"root": str(root), "files": []})
    try:
        is_dir = root.is_dir()
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="run_report_root_invalid", error=str(exc))
    if not is_dir:
        return TrexCallResult(False, blocker="run_report_root_invalid", error=f"{root} is not a directory")

    files: list[dict[str, Any]] = []
    try:
        for candidate in sorted(root.iterdir(), key=lambda path: path.name):
            if not candidate.is_file() or candidate.suffix.lower() != ".json":
                continue
            resolved = candidate.resolve()
            resolved.relative_to(root.resolve())
            files.append(run_report_file_record(resolved, include_content=False))
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="run_report_list_failed", error=str(exc))
    files.sort(key=lambda record: str(record.get("generated_at") or record.get("modified_time") or ""), reverse=True)
    return TrexCallResult(True, data={"root": str(root), "files": files})


def save_run_report(
    env: TrexEnvironment,
    title: str,
    markdown: str,
    payload: dict[str, Any],
    file_name: str | None = None,
) -> TrexCallResult:
    try:
        normalized_title = normalize_run_report_title(title)
        normalized_markdown = normalize_run_report_markdown(markdown)
    except RunReportValidationError as exc:
        return _run_report_validation_error_result(exc)
    if not isinstance(payload, dict):
        return TrexCallResult(False, blocker="run_report_payload_invalid", error="report payload must be an object")

    generated_at = datetime.now(timezone.utc).isoformat()
    try:
        normalized_file_name = normalize_run_report_file_name(file_name or run_report_default_file_name(generated_at))
    except RunReportValidationError as exc:
        return _run_report_validation_error_result(exc)
    root = run_report_output_root(env)
    try:
        root.mkdir(parents=True, exist_ok=True)
        resolved_root = root.resolve()
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="run_report_root_invalid", error=str(exc))

    target = (resolved_root / normalized_file_name).resolve()
    try:
        target.relative_to(resolved_root)
    except ValueError:
        return TrexCallResult(False, blocker="run_report_file_name_invalid", error=RUN_REPORT_FILE_NAME_ERROR)

    archive = {
        "version": 1,
        "title": normalized_title,
        "generated_at": generated_at,
        "markdown": normalized_markdown,
        "payload": payload,
    }
    try:
        content = json.dumps(archive, ensure_ascii=False, indent=2, allow_nan=False)
    except (TypeError, ValueError) as exc:
        return TrexCallResult(False, blocker="run_report_payload_invalid", error=str(exc))

    content_bytes = content.encode("utf-8")
    if len(content_bytes) > RUN_REPORT_ARCHIVE_MAX_BYTES:
        return TrexCallResult(
            False,
            blocker="run_report_too_large",
            error=f"report archive exceeds {RUN_REPORT_ARCHIVE_MAX_BYTES} byte limit",
        )

    try:
        target.write_bytes(content_bytes)
    except OSError as exc:
        return TrexCallResult(False, blocker="run_report_write_failed", error=str(exc))
    return TrexCallResult(True, data={"accepted": True, "file": run_report_file_record(target, include_content=True)})


def download_run_report(env: TrexEnvironment, file_name: str) -> TrexCallResult:
    try:
        normalized_file_name = normalize_run_report_file_name(file_name)
    except RunReportValidationError as exc:
        return _run_report_validation_error_result(exc)
    root = run_report_output_root(env).resolve()
    target = (root / normalized_file_name).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        return TrexCallResult(False, blocker="run_report_file_name_invalid", error=RUN_REPORT_FILE_NAME_ERROR)
    if not target.exists():
        return TrexCallResult(False, blocker="run_report_missing", error=f"{normalized_file_name} does not exist")
    if not target.is_file():
        return TrexCallResult(False, blocker="run_report_not_file", error=f"{normalized_file_name} is not a file")
    return TrexCallResult(True, data={"accepted": True, "file": run_report_file_record(target, include_content=True)})


def run_report_trends(env: TrexEnvironment, limit: int = 30) -> TrexCallResult:
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1 or limit > RUN_REPORT_TREND_MAX_FILES:
        return TrexCallResult(
            False,
            blocker="run_report_trend_limit_invalid",
            error=f"report trend limit must be an integer between 1 and {RUN_REPORT_TREND_MAX_FILES}",
        )
    root = run_report_output_root(env)
    if not root.exists():
        return TrexCallResult(True, data=run_report_trends_payload(root, [], skipped=0))
    try:
        is_dir = root.is_dir()
        resolved_root = root.resolve()
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="run_report_root_invalid", error=str(exc))
    if not is_dir:
        return TrexCallResult(False, blocker="run_report_root_invalid", error=f"{root} is not a directory")

    records: list[dict[str, Any]] = []
    skipped = 0
    try:
        candidates = [
            candidate.resolve()
            for candidate in root.iterdir()
            if candidate.is_file() and candidate.suffix.lower() == ".json"
        ]
        for candidate in candidates:
            candidate.relative_to(resolved_root)
            record = run_report_trend_record(candidate)
            if record is None:
                skipped += 1
                continue
            records.append(record)
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="run_report_list_failed", error=str(exc))
    records.sort(key=lambda record: str(record.get("generated_at") or record.get("modified_time") or ""), reverse=True)
    return TrexCallResult(True, data=run_report_trends_payload(root, records[:limit], skipped=skipped))
