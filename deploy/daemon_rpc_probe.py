#!/usr/bin/env python3
# Managed by TRex WebUI deploy/install.sh.
"""Strict loopback JSON-RPC probes for the privileged TRex daemon."""

from __future__ import annotations

import argparse
import http.client
import json
import math
import socket
import sys
import time
import uuid
from typing import Any


MAX_RESPONSE_BYTES = 1024 * 1024
IDLE_STATE = 1


class ProbeError(RuntimeError):
    pass


def reject_non_finite(value: str) -> None:
    raise ValueError(f"non-finite JSON number is not allowed: {value}")


def rpc_call(host: str, port: int, method: str, timeout: float) -> Any:
    request_id = f"supervisor-{uuid.uuid4().hex[:12]}"
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": {},
        },
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")
    connection = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        connection.request(
            "POST",
            "/",
            body=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        response = connection.getresponse()
        body = response.read(MAX_RESPONSE_BYTES + 1)
    finally:
        connection.close()

    if response.status < 200 or response.status >= 300:
        raise ProbeError(f"{method} returned HTTP {response.status}")
    if len(body) > MAX_RESPONSE_BYTES:
        raise ProbeError(f"{method} response exceeds {MAX_RESPONSE_BYTES} bytes")
    try:
        decoded = body.decode("utf-8")
        result = json.loads(decoded, parse_constant=reject_non_finite)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise ProbeError(f"{method} returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise ProbeError(f"{method} returned a non-object JSON-RPC response")
    if result.get("jsonrpc") != "2.0" or result.get("id") != request_id:
        raise ProbeError(f"{method} returned a mismatched JSON-RPC envelope")
    has_result = "result" in result
    has_error = "error" in result
    if has_result == has_error:
        raise ProbeError(f"{method} must return exactly one JSON-RPC outcome")
    if has_error:
        error = result["error"]
        if not isinstance(error, dict) or not error:
            raise ProbeError(f"{method} returned an invalid JSON-RPC error")
        message = error.get("message")
        raise ProbeError(str(message) if isinstance(message, str) and message else f"{method} failed")
    return result["result"]


def remaining_timeout(deadline: float) -> float:
    return max(0.1, min(2.0, deadline - time.monotonic()))


def wait_ready(host: str, port: int, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            result = rpc_call(host, port, "connectivity_check", remaining_timeout(deadline))
            if result is True:
                return
            last_error = ProbeError("connectivity_check did not return boolean true")
        except (OSError, ProbeError) as exc:
            last_error = exc
        time.sleep(min(0.25, max(0.0, deadline - time.monotonic())))
    raise ProbeError(f"daemon RPC was not ready within {timeout:g}s: {last_error}")


def assert_safe_restart(host: str, port: int, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    wait_ready(host, port, timeout)
    status = rpc_call(host, port, "get_running_status", remaining_timeout(deadline))
    reserved = rpc_call(host, port, "is_reserved", remaining_timeout(deadline))
    if (
        not isinstance(status, dict)
        or isinstance(status.get("state"), bool)
        or not isinstance(status.get("state"), int)
        or not isinstance(status.get("verbose"), str)
    ):
        raise ProbeError("get_running_status returned an invalid status object")
    if not isinstance(reserved, bool):
        raise ProbeError("is_reserved did not return a boolean")
    if status["state"] != IDLE_STATE or reserved:
        raise ProbeError(
            "refusing daemon restart: "
            f"state={status['state']} ({status['verbose']}), reserved={str(reserved).lower()}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("check", choices=("ready", "safe-restart"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not math.isfinite(args.timeout) or args.timeout <= 0 or args.timeout > 300:
        parser.error("--timeout must be finite and between 0 and 300 seconds")
    try:
        addresses = {
            record[4][0]
            for record in socket.getaddrinfo(args.host, args.port, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        parser.error(f"--host cannot be resolved: {exc}")
    if not addresses or any(not address.startswith("127.") and address != "::1" for address in addresses):
        parser.error("--host must resolve only to loopback addresses")
    return args


def main() -> int:
    args = parse_args()
    try:
        if args.check == "ready":
            wait_ready(args.host, args.port, args.timeout)
        else:
            assert_safe_restart(args.host, args.port, args.timeout)
    except (OSError, ProbeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
