from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.settings import TrexEnvironment

RUN_REPORT_FILE_NAME_ERROR = "report file name must be a clean .json file name"
RUN_REPORT_TITLE_MAX_CHARS = 128
RUN_REPORT_MARKDOWN_MAX_CHARS = 1_000_000
RUN_REPORT_ARCHIVE_MAX_BYTES = 4_000_000
RUN_REPORT_TREND_MAX_FILES = 200


@dataclass(frozen=True)
class RunReportValidationError(Exception):
    blocker: str
    error: str


def normalize_run_report_file_name(value: object) -> str:
    if not isinstance(value, str):
        raise RunReportValidationError("run_report_file_name_invalid", RUN_REPORT_FILE_NAME_ERROR)
    candidate = value.strip()
    if candidate == "" or candidate != value or "\x00" in candidate or "/" in candidate or "\\" in candidate:
        raise RunReportValidationError("run_report_file_name_invalid", RUN_REPORT_FILE_NAME_ERROR)
    path = Path(candidate)
    if path.name in {".", ".."}:
        raise RunReportValidationError("run_report_file_name_invalid", RUN_REPORT_FILE_NAME_ERROR)
    if path.suffix == "":
        candidate = f"{candidate}.json"
        path = Path(candidate)
    if path.suffix.lower() != ".json":
        raise RunReportValidationError("run_report_file_name_invalid", RUN_REPORT_FILE_NAME_ERROR)
    return path.name


def normalize_run_report_title(value: object) -> str:
    if not isinstance(value, str):
        raise RunReportValidationError("run_report_title_invalid", "report title must be clean text")
    candidate = value.strip()
    if candidate == "" or "\x00" in candidate:
        raise RunReportValidationError("run_report_title_invalid", "report title must be clean text")
    if len(candidate) > RUN_REPORT_TITLE_MAX_CHARS:
        raise RunReportValidationError("run_report_title_invalid", "report title is too long")
    return candidate


def normalize_run_report_markdown(value: object) -> str:
    if not isinstance(value, str) or "\x00" in value:
        raise RunReportValidationError("run_report_markdown_invalid", "report markdown must be clean text")
    if len(value) > RUN_REPORT_MARKDOWN_MAX_CHARS:
        raise RunReportValidationError("run_report_markdown_invalid", "report markdown is too long")
    return value


def run_report_default_file_name(generated_at: str) -> str:
    timestamp = generated_at.replace("-", "").replace(":", "").replace("+00:00", "Z")
    timestamp = re.sub(r"[^0-9TZ]", "", timestamp)
    return f"run-report-{timestamp}.json"


def run_report_file_record(target: Path, include_content: bool) -> dict[str, Any]:
    stats = target.stat()
    size_bytes = stats.st_size
    metadata = run_report_metadata(target) if size_bytes <= RUN_REPORT_ARCHIVE_MAX_BYTES else {}
    record: dict[str, Any] = {
        "path": str(target),
        "name": target.name,
        "size_bytes": size_bytes,
        "modified_time": datetime.fromtimestamp(stats.st_mtime, timezone.utc).isoformat(),
        "title": metadata.get("title"),
        "generated_at": metadata.get("generated_at"),
        "download_available": False,
        "content": None,
        "download_error": None,
    }
    if size_bytes <= RUN_REPORT_ARCHIVE_MAX_BYTES:
        record["download_available"] = True
        if include_content:
            try:
                record["content"] = target.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                record["download_available"] = False
                record["download_error"] = str(exc)
    else:
        record["download_error"] = f"report archive exceeds {RUN_REPORT_ARCHIVE_MAX_BYTES} byte browser download limit"
    return record


def run_report_trend_record(target: Path) -> dict[str, Any] | None:
    try:
        stats = target.stat()
        if stats.st_size > RUN_REPORT_ARCHIVE_MAX_BYTES:
            return None
        archive = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(archive, dict):
        return None
    payload = archive.get("payload")
    if not isinstance(payload, dict):
        return None
    generated_at = archive.get("generated_at") if isinstance(archive.get("generated_at"), str) else None
    title = archive.get("title") if isinstance(archive.get("title"), str) else None
    conclusion = payload.get("conclusion")
    conclusion_record = conclusion if isinstance(conclusion, dict) else {}
    verdict = _run_report_payload_verdict(payload, conclusion_record)
    summary = _run_report_payload_summary(payload, conclusion_record, verdict)
    metrics = _run_report_trend_metrics(payload.get("metrics"))
    if not metrics:
        metrics = _run_report_acceptance_trend_metrics(payload)
    traffic_session = payload.get("traffic_session") if isinstance(payload.get("traffic_session"), dict) else {}
    return {
        "name": target.name,
        "title": title or target.name,
        "generated_at": generated_at,
        "modified_time": datetime.fromtimestamp(stats.st_mtime, timezone.utc).isoformat(),
        "verdict": verdict,
        "summary": summary,
        "profile": _clean_report_scalar(payload.get("profile")),
        "run_duration": _clean_report_scalar(traffic_session.get("duration"))
        or _clean_report_scalar(payload.get("duration_seconds")),
        "metrics": metrics,
    }


def _run_report_payload_verdict(payload: dict[str, Any], conclusion_record: dict[str, Any]) -> str:
    candidates: list[str] = []
    for value in [
        conclusion_record.get("verdict"),
        payload.get("verdict"),
        _run_report_match_status(payload.get("capture_layer_match")),
        _run_report_match_status(payload.get("capture_field_match")),
    ]:
        if value in {"pass", "warn", "fail", "unknown"}:
            candidates.append(str(value))
    if not candidates:
        return "unknown"
    for verdict in ["fail", "warn", "unknown", "pass"]:
        if verdict in candidates:
            return verdict
    return "unknown"


def _run_report_match_status(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    status = value.get("status")
    return status if isinstance(status, str) else None


def _run_report_payload_summary(payload: dict[str, Any], conclusion_record: dict[str, Any], verdict: str) -> str:
    conclusion_summary = conclusion_record.get("summary")
    if isinstance(conclusion_summary, str) and conclusion_summary.strip():
        return conclusion_summary
    failure = payload.get("failure")
    if isinstance(failure, str) and failure.strip():
        return failure.strip()
    if isinstance(failure, dict):
        message = failure.get("message") or failure.get("error") or failure.get("stage")
        if isinstance(message, str) and message.strip():
            return message.strip()
    for key in ["capture_field_match", "capture_layer_match"]:
        match = payload.get(key)
        if not isinstance(match, dict):
            continue
        summary = match.get("summary")
        if isinstance(summary, str) and summary.strip():
            status = match.get("status")
            if isinstance(status, str) and status:
                return f"{status}: {summary.strip()}"
            return summary.strip()
    return f"Acceptance verdict: {verdict}" if payload.get("verdict") in {"pass", "warn", "fail", "unknown"} else ""


def _run_report_trend_metrics(value: object) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list):
        return {}
    metrics: dict[str, dict[str, Any]] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        label = item.get("label")
        metric_value = item.get("value")
        if not isinstance(label, str) or not isinstance(metric_value, str) or "\x00" in label or "\x00" in metric_value:
            continue
        parsed = _parse_report_metric_value(metric_value)
        metrics[label] = {
            "value": metric_value,
            "number": parsed["number"] if parsed else None,
            "unit": parsed["unit"] if parsed else "",
        }
    return metrics


def _run_report_acceptance_trend_metrics(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    samples = payload.get("stats_samples")
    last_sample = samples[-1] if isinstance(samples, list) and samples and isinstance(samples[-1], dict) else {}
    metrics: dict[str, dict[str, Any]] = {}
    for label, key, unit in [
        ("Tx PPS", "tx_pps", "pps"),
        ("Rx PPS", "rx_pps", "pps"),
        ("Tx L2", "tx_bps", "b/s"),
        ("Rx L2", "rx_bps", "b/s"),
        ("Drop rate", "drop_bps", "b/s"),
    ]:
        value = _format_acceptance_metric(last_sample.get(key), unit)
        if value is not None:
            parsed = _parse_report_metric_value(value)
            metrics[label] = {
                "value": value,
                "number": parsed["number"] if parsed else None,
                "unit": parsed["unit"] if parsed else "",
            }
    packet_count = _acceptance_capture_packet_count(payload)
    if packet_count is not None:
        value = str(packet_count)
        parsed = _parse_report_metric_value(value)
        metrics["Monitor packets"] = {
            "value": value,
            "number": parsed["number"] if parsed else None,
            "unit": parsed["unit"] if parsed else "",
        }
    return metrics


def _format_acceptance_metric(value: object, unit: str) -> str | None:
    if not _finite_number(value):
        return None
    number = float(value)
    if abs(number) < 1e-9:
        number = 0.0
    return f"{number:g} {unit}"


def _acceptance_capture_packet_count(payload: dict[str, Any]) -> int | None:
    for key in ["capture_decode_summary", "capture_field_summary"]:
        value = payload.get(key)
        if not isinstance(value, dict):
            continue
        packet_count = value.get("packet_count")
        if isinstance(packet_count, int) and not isinstance(packet_count, bool) and packet_count >= 0:
            return packet_count
    return None


def _parse_report_metric_value(value: str) -> dict[str, Any] | None:
    candidate = value.strip()
    if candidate == "" or candidate == "-":
        return None
    match = re.match(r"^(-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(?:\s+(.*)|$)", candidate, re.IGNORECASE)
    if not match:
        return None
    number = float(match.group(1))
    if not _finite_number(number):
        return None
    unit = match.group(2) or ""
    return {"number": number, "unit": unit.strip()}


def _finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and value not in {float("inf"), float("-inf")}


def _clean_report_scalar(value: object) -> str | None:
    if isinstance(value, (str, int, float, bool)) and not isinstance(value, bool):
        text = str(value)
        return text if "\x00" not in text else None
    if isinstance(value, bool):
        return str(value).lower()
    return None


def run_report_trends_payload(root: Path, records: list[dict[str, Any]], *, skipped: int) -> dict[str, Any]:
    verdict_counts = {verdict: 0 for verdict in ["pass", "warn", "fail", "unknown"]}
    for record in records:
        verdict = record.get("verdict")
        if verdict in verdict_counts:
            verdict_counts[str(verdict)] += 1
        else:
            verdict_counts["unknown"] += 1
    metric_trends = [
        _run_report_metric_trend(records, label)
        for label in ["Tx PPS", "Rx PPS", "Tx L2", "Rx L2", "Drop rate", "Latency avg", "Monitor packets", "Active ports"]
    ]
    metric_trends = [trend for trend in metric_trends if trend is not None]
    conclusion = _run_report_trend_conclusion(records, verdict_counts, skipped, metric_trends)
    return {
        "root": str(root),
        "total": len(records),
        "skipped": skipped,
        "verdict_counts": verdict_counts,
        "conclusion": conclusion,
        "metric_trends": metric_trends,
        "records": records,
    }


def _run_report_metric_trend(records: list[dict[str, Any]], label: str) -> dict[str, Any] | None:
    values = [
        record.get("metrics", {}).get(label)
        for record in records
        if isinstance(record.get("metrics"), dict) and isinstance(record.get("metrics", {}).get(label), dict)
    ]
    if not values:
        return None
    latest = values[0]
    previous = values[1] if len(values) > 1 else None
    direction = "unknown"
    delta: float | None = None
    if previous and latest.get("unit") == previous.get("unit") and _finite_number(latest.get("number")) and _finite_number(previous.get("number")):
        delta = float(latest["number"]) - float(previous["number"])
        if abs(delta) < 1e-9:
            direction = "flat"
        elif delta > 0:
            direction = "up"
        else:
            direction = "down"
    elif previous and latest.get("value") != previous.get("value"):
        direction = "changed"
    elif previous:
        direction = "flat"
    return {
        "label": label,
        "latest": latest.get("value"),
        "previous": previous.get("value") if previous else None,
        "delta": delta,
        "unit": latest.get("unit") or "",
        "direction": direction,
        "samples": len(values),
    }


def _run_report_trend_conclusion(
    records: list[dict[str, Any]],
    verdict_counts: dict[str, int],
    skipped: int,
    metric_trends: list[dict[str, Any]],
) -> dict[str, Any]:
    if not records:
        return {
            "verdict": "unknown",
            "title": "No Report History",
            "summary": "No run report archives are available for trend analysis",
            "reasons": ["Save a run report after a real traffic run to build history"],
        }
    latest = records[0]
    reasons: list[str] = []
    if latest.get("verdict") == "fail":
        reasons.append(f"Latest report failed: {latest.get('summary') or latest.get('name')}")
    if verdict_counts.get("fail", 0) > 0:
        reasons.append(f"{verdict_counts['fail']} failed report(s) in the selected history window")
    if verdict_counts.get("warn", 0) > 0:
        reasons.append(f"{verdict_counts['warn']} warning report(s) in the selected history window")
    if verdict_counts.get("unknown", 0) > 0:
        reasons.append(f"{verdict_counts['unknown']} report(s) have unknown verdicts in the selected history window")
    if skipped > 0:
        reasons.append(f"{skipped} archive(s) were skipped because they were unreadable or oversized")
    trend_reasons, trend_has_fail, trend_has_warn = _run_report_metric_trend_reasons(metric_trends)
    reasons.extend(trend_reasons)
    if not reasons:
        reasons.append("No failed or warning verdicts in the selected history window")
    if latest.get("verdict") == "fail" or verdict_counts.get("fail", 0) > 0 or trend_has_fail:
        verdict = "fail"
        title = "History Failing"
    elif verdict_counts.get("warn", 0) > 0 or verdict_counts.get("unknown", 0) > 0 or skipped > 0 or trend_has_warn:
        verdict = "warn"
        title = "History Warning"
    else:
        verdict = "pass"
        title = "History Clean"
    return {
        "verdict": verdict,
        "title": title,
        "summary": reasons[0],
        "reasons": reasons[:6],
    }


def _run_report_metric_trend_reasons(metric_trends: list[dict[str, Any]]) -> tuple[list[str], bool, bool]:
    by_label = {
        trend.get("label"): trend
        for trend in metric_trends
        if isinstance(trend.get("label"), str)
    }
    reasons: list[str] = []
    has_fail = False
    has_warn = False

    drop_trend = by_label.get("Drop rate")
    if drop_trend:
        latest_drop = _parse_report_metric_value(str(drop_trend.get("latest") or ""))
        if latest_drop and float(latest_drop["number"]) > 0:
            reasons.append(f"Latest drop rate is non-zero: {drop_trend.get('latest')}")
            has_fail = True
        elif drop_trend.get("direction") == "up" and _finite_number(drop_trend.get("delta")) and float(drop_trend["delta"]) > 0:
            reasons.append(f"Drop rate increased by {_format_report_trend_delta(drop_trend)}")
            has_warn = True

    latency_trend = by_label.get("Latency avg")
    if latency_trend and latency_trend.get("direction") == "up" and _finite_number(latency_trend.get("delta")) and float(latency_trend["delta"]) > 0:
        reasons.append(f"Latency avg increased by {_format_report_trend_delta(latency_trend)}")
        has_warn = True

    for label in ["Rx PPS", "Rx L2"]:
        trend = by_label.get(label)
        if trend and trend.get("direction") == "down" and _finite_number(trend.get("delta")):
            reasons.append(f"{label} decreased by {_format_report_trend_delta(trend, absolute=True)}")
            has_warn = True

    monitor_trend = by_label.get("Monitor packets")
    if monitor_trend and monitor_trend.get("direction") == "down" and _finite_number(monitor_trend.get("delta")):
        reasons.append(f"Monitor packet evidence decreased by {_format_report_trend_delta(monitor_trend, absolute=True)}")
        has_warn = True

    return reasons[:4], has_fail, has_warn


def _format_report_trend_delta(trend: dict[str, Any], *, absolute: bool = False) -> str:
    delta = trend.get("delta")
    if not _finite_number(delta):
        return "changed"
    number = abs(float(delta)) if absolute else float(delta)
    unit = str(trend.get("unit") or "")
    if unit in {"b/s", "pps"}:
        prefixes = ["", "K", "M", "G", "T"]
        prefix_index = 0
        while abs(number) >= 1000 and prefix_index < len(prefixes) - 1:
            number /= 1000
            prefix_index += 1
        unit = f"{prefixes[prefix_index]}{unit}"
    formatted = f"{number:.3f}".rstrip("0").rstrip(".")
    return f"{formatted} {unit}".strip()


def run_report_metadata(target: Path) -> dict[str, str | None]:
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    title = payload.get("title")
    generated_at = payload.get("generated_at")
    return {
        "title": title if isinstance(title, str) and "\x00" not in title else None,
        "generated_at": generated_at if isinstance(generated_at, str) and "\x00" not in generated_at else None,
    }


def run_report_output_root(env: TrexEnvironment) -> Path:
    root = env.daemon_log.parent
    if not _clean_path_text(root):
        root = Path.cwd() / ".logs"
    return root / "reports"


def _clean_path_text(path: Path) -> bool:
    value = str(path)
    return value.strip() != "" and value == value.strip() and "\x00" not in value
