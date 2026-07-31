#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def request_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 30) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        content = exc.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "data": None,
            "blocker": f"http_{exc.code}",
            "error": content,
        }
    except Exception as exc:
        return {
            "ok": False,
            "data": None,
            "blocker": "request_failed",
            "error": str(exc),
        }
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "data": None,
            "blocker": "json_decode_failed",
            "error": f"{exc}: {content[:200]}",
        }


def api_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}{path}"


def cleanup_port(base_url: str, ports: list[int], timeout: float) -> list[dict[str, Any]]:
    actions = []
    stop = request_json(
        "POST",
        api_url(base_url, "/api/trex/traffic/stop"),
        {"ports": ports, "confirmation": "stop"},
        timeout=timeout,
    )
    actions.append({"action": "stop", "result": stop})
    reset = request_json(
        "POST",
        api_url(base_url, "/api/trex/ports/reset"),
        {"ports": ports, "restart": False, "confirmation": "reset"},
        timeout=timeout,
    )
    actions.append({"action": "reset", "result": reset})
    release = request_json(
        "POST",
        api_url(base_url, "/api/trex/ports/release"),
        {"ports": ports},
        timeout=timeout,
    )
    actions.append({"action": "release", "result": release})
    return actions


def audit_profiles(
    base_url: str,
    ports: list[int],
    multiplier: str,
    duration: float,
    timeout: float,
    limit: int | None,
    profile_filters: list[str],
    tunables: dict[str, Any],
    output: Path,
) -> int:
    catalog = request_json("GET", api_url(base_url, "/api/trex/profiles"), timeout=timeout)
    if not catalog.get("ok"):
        print(json.dumps(catalog, indent=2))
        return 2

    profiles = sorted(
        catalog.get("data", {}).get("profiles", []),
        key=lambda profile: str(profile.get("relative_path", "")),
    )
    if profile_filters:
        requested = set(profile_filters)
        profiles = [
            profile
            for profile in profiles
            if str(profile.get("relative_path", "")) in requested or str(profile.get("name", "")) in requested
        ]
        found = {str(profile.get("relative_path", "")) for profile in profiles} | {
            str(profile.get("name", "")) for profile in profiles
        }
        missing = sorted(requested - found)
        if missing:
            print(f"Missing requested profiles: {', '.join(missing)}")
            return 2
    if limit is not None:
        profiles = profiles[:limit]
    if not profiles:
        print("No profiles selected for audit")
        return 2

    output.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    started_at = datetime.now(timezone.utc).isoformat()

    cleanup_port(base_url, ports, timeout)
    for index, profile in enumerate(profiles, start=1):
        relative_path = str(profile.get("relative_path", ""))
        kind = str(profile.get("kind", "unknown"))
        payload = {
            "profile_path": relative_path,
            "ports": ports,
            "multiplier": multiplier,
            "duration": duration,
            "force": False,
            "total": False,
            "synchronized": False,
            "clear_existing": True,
            "confirmation": "start-traffic",
            "tunables": dict(tunables),
        }
        print(f"[{index:03d}/{len(profiles):03d}] start {relative_path} ({kind})")
        start_time = time.monotonic()
        result = request_json("POST", api_url(base_url, "/api/trex/traffic/start"), payload, timeout=timeout)
        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        cleanup = cleanup_port(base_url, ports, timeout)
        record = {
            "index": index,
            "profile": relative_path,
            "kind": kind,
            "ok": bool(result.get("ok")),
            "blocker": result.get("blocker"),
            "error": result.get("error"),
            "elapsed_ms": elapsed_ms,
            "start_result": result,
            "cleanup": cleanup,
        }
        records.append(record)
        status = "OK" if record["ok"] else f"FAIL {record['blocker']}: {record['error']}"
        print(f"    {status}")
        output.write_text(
            json.dumps(
                {
                    "started_at": started_at,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "base_url": base_url,
                    "ports": ports,
                    "multiplier": multiplier,
                    "duration": duration,
                    "profile_filters": profile_filters,
                    "tunables": tunables,
                    "records": records,
                },
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
        )

    summary = Counter("ok" if record["ok"] else str(record["blocker"]) for record in records)
    print("\nSummary")
    for key, value in summary.most_common():
        print(f"  {key}: {value}")
    print(f"\nWrote {output}")
    return 0 if all(record["ok"] for record in records) else 1


def parse_ports(value: str) -> list[int]:
    ports = [int(part.strip()) for part in value.split(",") if part.strip()]
    if not ports:
        raise argparse.ArgumentTypeError("at least one port is required")
    return ports


def parse_tunables_json(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError as exc:
        raise argparse.ArgumentTypeError(f"tunables must be valid JSON: {exc}") from exc
    if not isinstance(decoded, dict):
        raise argparse.ArgumentTypeError("tunables JSON must be an object")
    return decoded


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a controlled real TRex start smoke for every Traffic Profile.")
    parser.add_argument("--base-url", default="http://127.0.0.1", help="WebUI base URL, usually the Nginx origin")
    parser.add_argument("--ports", default="0", type=parse_ports, help="Comma-separated TRex ports to use")
    parser.add_argument("--multiplier", default="1pps", help="TRex start multiplier")
    parser.add_argument("--duration", default=0.5, type=float, help="Traffic duration in seconds")
    parser.add_argument("--timeout", default=30.0, type=float, help="HTTP timeout per command")
    parser.add_argument("--limit", default=None, type=int, help="Only audit the first N profiles")
    parser.add_argument(
        "--profile",
        action="append",
        default=[],
        help="Only audit the named profile; can be repeated and matches name or relative path",
    )
    parser.add_argument(
        "--tunables-json",
        default={},
        type=parse_tunables_json,
        help='JSON object forwarded as Python profile tunables, for example \'{"src":"16.0.0.1"}\'',
    )
    parser.add_argument(
        "--output",
        default=f".logs/traffic-profile-audit-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json",
        type=Path,
        help="Audit JSON output path",
    )
    args = parser.parse_args()
    return audit_profiles(
        base_url=args.base_url,
        ports=args.ports,
        multiplier=args.multiplier,
        duration=args.duration,
        timeout=args.timeout,
        limit=args.limit,
        profile_filters=args.profile,
        tunables=args.tunables_json,
        output=args.output,
    )


if __name__ == "__main__":
    raise SystemExit(main())
