from __future__ import annotations

import base64
import binascii
import difflib
import getpass
import hashlib
import json
import posixpath
import re
import shlex
import subprocess
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from ipaddress import ip_address
from pathlib import Path
from typing import Callable

import httpx
from app.core.settings import TrexEnvironment, format_host_for_url, trex_host_error
from app.trex.result import TrexCallResult, public_result_payload
from app.trex.daemon_validation import (
    DAEMON_COMMAND_TIMEOUT_MAX_SECONDS,
    DAEMON_CONFIG_AUDIT_MAX_BYTES,
    DAEMON_CONFIG_AUDIT_MAX_RECORDS,
    DAEMON_CONFIG_DIFF_MAX_CHARS,
    DAEMON_CONFIG_MAX_BYTES,
    DAEMON_CONFIG_VERSION_MAX_FILES,
    DAEMON_CONFIG_VERSION_NAME_MAX_CHARS,
    DAEMON_CONFIG_VERSION_NOTE_MAX_CHARS,
    DAEMON_CONFIG_VERSION_SOURCE_MAX_CHARS,
    DAEMON_FILE_CONTENT_MAX_BYTES,
    DAEMON_FILE_PATH_MAX_CHARS,
    DAEMON_JSON_RESULT_MAX_BYTES,
    DAEMON_LOG_MAX_BYTES,
    DAEMON_RESERVATION_USER_MAX_CHARS,
    DAEMON_RPC_RESPONSE_MAX_BYTES,
    DAEMON_RPC_TIMEOUT_MAX_SECONDS,
    DAEMON_VERSION_MAX_BYTES,
    base64_payload_exceeds_limit,
    clean_daemon_config_version_name,
    clean_daemon_config_version_note,
    clean_daemon_config_version_source,
    daemon_path_has_nul,
    daemon_path_too_long,
    daemon_rpc_error_message,
    is_clean_absolute_local_path,
    is_clean_daemon_text,
    is_daemon_config_audit_record,
    is_daemon_devices_info,
    is_daemon_file_list_entry,
    is_daemon_files_path_result,
    is_daemon_metadata_field_list,
    is_invalid_generated_config_preview,
    is_trex_command_pair_list,
    is_trex_running_status,
    is_valid_tcp_port,
    json_payload_exceeds_limit,
    load_strict_daemon_json,
    local_path_exists,
    text_has_edge_whitespace,
    text_has_nul,
    valid_byte_limit,
)


ALLOWED_DAEMON_ACTIONS = {"show", "start", "stop", "restart", "start-live"}
DESTRUCTIVE_ACTIONS = {"stop", "restart", "start-live"}
DAEMON_DIALOG_ACTIONS = ("show", "start", "stop", "restart", "start-live")
_DAEMON_MUTATION_LOCK = threading.RLock()
DAEMON_START_RPC_GRACE_SECONDS = 5
DAEMON_START_RECONCILIATION_RPC_TIMEOUT_SECONDS = 5
ALLOWED_DAEMON_RPC_METHODS = {
    "connectivity_check",
    "force_trex_kill",
    "get_devices_info",
    "get_file",
    "get_files_list",
    "get_files_path",
    "get_latest_dump",
    "get_running_info",
    "get_running_status",
    "get_trex_cmds",
    "get_trex_config",
    "get_trex_config_metadata",
    "get_trex_daemon_log",
    "get_trex_log",
    "get_trex_version",
    "cancel_reservation",
    "is_reserved",
    "is_running",
    "push_file",
    "reserve_trex",
    "start_trex",
}


@dataclass(frozen=True)
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    blocker: str | None = None
    recovered_from_timeout: bool = False

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and self.blocker is None


Runner = Callable[[list[str], Path, int], CommandResult]
DaemonRpcCaller = Callable[[str, dict[str, object], float], dict[str, object]]
LifecycleDisconnect = Callable[[], TrexCallResult]


class DaemonRpcTimeoutError(ValueError):
    pass


class DaemonConfigurationError(ValueError):
    def __init__(self, message: str, blocker: str) -> None:
        super().__init__(message)
        self.blocker = blocker


def subprocess_runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        return CommandResult(command, 127, "", str(exc), blocker="command_not_found")
    except PermissionError as exc:
        return CommandResult(command, 126, "", str(exc), blocker="permission_denied")
    except subprocess.TimeoutExpired as exc:
        return CommandResult(command, 124, exc.stdout or "", exc.stderr or "", blocker="timeout")
    return CommandResult(command, completed.returncode, completed.stdout, completed.stderr)


def httpx_rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
    chunks: list[bytes] = []
    total_bytes = 0
    with httpx.Client(trust_env=False) as client:
        with client.stream("POST", url, json=payload, timeout=timeout) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                total_bytes += len(chunk)
                if total_bytes > DAEMON_RPC_RESPONSE_MAX_BYTES:
                    raise ValueError(f"daemon RPC HTTP response exceeds {DAEMON_RPC_RESPONSE_MAX_BYTES} bytes")
                chunks.append(chunk)
    try:
        body = b"".join(chunks).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("daemon RPC HTTP response is not valid UTF-8 JSON") from exc
    try:
        parsed = load_strict_daemon_json(body)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError("daemon RPC returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("daemon RPC returned a non-object response")
    return parsed


class RuntimeManager:
    def __init__(
        self,
        env: TrexEnvironment,
        runner: Runner = subprocess_runner,
        rpc_caller: DaemonRpcCaller | None = None,
        lifecycle_disconnect: LifecycleDisconnect | None = None,
    ) -> None:
        self.env = env
        self.runner = runner
        self.rpc_caller = rpc_caller
        self.lifecycle_disconnect = lifecycle_disconnect

    def daemon_command(self, action: str) -> list[str]:
        if action not in ALLOWED_DAEMON_ACTIONS:
            raise ValueError(f"unsupported daemon action: {action}")
        return [
            str(self.env.daemon_bin),
            "--daemon-port",
            str(self.env.daemon_port),
            action,
        ]

    def preview_daemon_action(self, action: str) -> dict[str, object]:
        command = self.daemon_command(action)
        lifecycle_managed = self.env.daemon_supervisor == "systemd"
        return {
            "action": action,
            "command": command,
            "requires_confirmation": action in DESTRUCTIVE_ACTIONS and self.env.require_confirmation,
            "daemon_bin_exists": local_path_exists(self.env.daemon_bin),
            "working_directory": str(self.env.scripts_dir),
            "available": not lifecycle_managed,
            "blocker": "daemon_lifecycle_managed_by_systemd" if lifecycle_managed else None,
        }

    def run_daemon_action(
        self,
        action: str,
        confirmation: str | None = None,
        timeout_seconds: int | None = None,
    ) -> CommandResult:
        if action == "show":
            return self._run_daemon_action(action, confirmation, timeout_seconds)
        with _DAEMON_MUTATION_LOCK:
            return self._run_daemon_action(action, confirmation, timeout_seconds)

    def _run_daemon_action(
        self,
        action: str,
        confirmation: str | None = None,
        timeout_seconds: int | None = None,
    ) -> CommandResult:
        if self.env.daemon_supervisor == "systemd":
            return CommandResult(
                self.daemon_command(action),
                409,
                "",
                "daemon lifecycle is owned by systemd; use the host supervisor",
                blocker="daemon_lifecycle_managed_by_systemd",
            )
        if action in DESTRUCTIVE_ACTIONS and self.env.require_confirmation and confirmation != action:
            command = self.daemon_command(action)
            return CommandResult(command, 400, "", "confirmation token required", blocker="confirmation_required")
        if "TREX_WEBUI_TREX_DAEMON_PORT" in self.env.configuration_errors or not is_valid_tcp_port(self.env.daemon_port):
            command = self.daemon_command(action)
            error = self.env.configuration_errors.get(
                "TREX_WEBUI_TREX_DAEMON_PORT",
                "daemon port must be between 1 and 65535",
            )
            return CommandResult(command, 400, "", error, blocker="daemon_port_invalid")
        timeout = timeout_seconds if timeout_seconds is not None else self.env.command_timeout_seconds
        if timeout_seconds is None and "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS" in self.env.configuration_errors:
            command = self.daemon_command(action)
            return CommandResult(
                command,
                400,
                "",
                self.env.configuration_errors["TREX_WEBUI_COMMAND_TIMEOUT_SECONDS"],
                blocker="daemon_action_timeout_invalid",
            )
        if not valid_byte_limit(timeout, DAEMON_COMMAND_TIMEOUT_MAX_SECONDS):
            command = self.daemon_command(action)
            return CommandResult(
                command,
                400,
                "",
                f"daemon action timeout must be between 1 and {DAEMON_COMMAND_TIMEOUT_MAX_SECONDS} seconds",
                blocker="daemon_action_timeout_invalid",
            )
        if not is_clean_absolute_local_path(self.env.daemon_bin):
            command = self.daemon_command(action)
            return CommandResult(
                command,
                400,
                "",
                "daemon binary path must be a clean absolute path",
                blocker="daemon_bin_path_invalid",
            )
        if not is_clean_absolute_local_path(self.env.scripts_dir):
            command = self.daemon_command(action)
            return CommandResult(
                command,
                400,
                "",
                "scripts directory path must be a clean absolute path",
                blocker="scripts_dir_path_invalid",
            )
        if not local_path_exists(self.env.daemon_bin):
            command = self.daemon_command(action)
            return CommandResult(command, 127, "", f"{self.env.daemon_bin} does not exist", blocker="daemon_bin_missing")
        if not local_path_exists(self.env.scripts_dir):
            command = self.daemon_command(action)
            return CommandResult(command, 127, "", f"{self.env.scripts_dir} does not exist", blocker="scripts_dir_missing")
        result = self.runner(self.daemon_command(action), self.env.scripts_dir, timeout)
        if action == "start" and result.blocker == "timeout":
            status = self.daemon_status()
            if status["running"] is True:
                recovery_note = "daemon start timed out before returning; status check reports running"
                stderr = "\n".join(part for part in (result.stderr.strip(), recovery_note) if part)
                stdout = status["stdout"] if isinstance(status["stdout"], str) and status["stdout"] else result.stdout
                return CommandResult(
                    result.command,
                    0,
                    stdout,
                    stderr,
                    recovered_from_timeout=True,
                )
        return result

    def daemon_status(self, connectivity: dict[str, object] | None = None) -> dict[str, object]:
        rpc = connectivity if connectivity is not None else self.daemon_connectivity()
        connected = rpc.get("connected") is True
        rpc_error = rpc.get("error")
        return {
            "ok": connected,
            "running": connected,
            "source": "daemon:connectivity_check",
            "command_executed": False,
            "command": self.daemon_command("show"),
            "returncode": None,
            "stdout": "",
            "stderr": str(rpc_error) if not connected and rpc_error else "",
            "blocker": None if connected else rpc.get("blocker"),
            "error": None if connected else rpc_error,
        }

    def daemon_rpc_url(self) -> str:
        return f"http://{format_host_for_url(self.env.host)}:{self.env.daemon_port}"

    def daemon_rpc_call(
        self,
        method: str,
        params: dict[str, object] | None = None,
        timeout_seconds: int | None = None,
    ) -> dict[str, object]:
        if method not in ALLOWED_DAEMON_RPC_METHODS:
            raise ValueError(f"unsupported daemon RPC method: {method}")
        if "TREX_WEBUI_TREX_HOST" in self.env.configuration_errors:
            raise DaemonConfigurationError(self.env.configuration_errors["TREX_WEBUI_TREX_HOST"], "daemon_host_invalid")
        host_error = trex_host_error(self.env.host)
        if host_error is not None:
            raise DaemonConfigurationError(host_error, "daemon_host_invalid")
        if "TREX_WEBUI_TREX_DAEMON_PORT" in self.env.configuration_errors or not is_valid_tcp_port(self.env.daemon_port):
            error = self.env.configuration_errors.get(
                "TREX_WEBUI_TREX_DAEMON_PORT",
                "daemon port must be between 1 and 65535",
            )
            raise DaemonConfigurationError(error, "daemon_port_invalid")
        payload: dict[str, object] = {
            "jsonrpc": "2.0",
            "id": uuid.uuid4().hex[:8],
            "method": method,
            "params": params or {},
        }
        selected_timeout = timeout_seconds if timeout_seconds is not None else self.env.command_timeout_seconds
        if timeout_seconds is None and "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS" in self.env.configuration_errors:
            raise DaemonRpcTimeoutError(self.env.configuration_errors["TREX_WEBUI_COMMAND_TIMEOUT_SECONDS"])
        if not valid_byte_limit(selected_timeout, DAEMON_RPC_TIMEOUT_MAX_SECONDS):
            raise DaemonRpcTimeoutError(
                f"daemon RPC timeout must be between 1 and {DAEMON_RPC_TIMEOUT_MAX_SECONDS} seconds"
            )
        caller = self.rpc_caller or httpx_rpc_caller
        response = caller(self.daemon_rpc_url(), payload, float(selected_timeout))
        if not isinstance(response, dict):
            raise ValueError("daemon RPC returned a non-object response")
        if response.get("jsonrpc") != "2.0":
            raise ValueError("daemon RPC returned an invalid JSON-RPC version")
        if response.get("id") != payload["id"]:
            raise ValueError("daemon RPC returned a mismatched response id")
        has_result = "result" in response
        has_error = "error" in response
        error_value = response.get("error")
        if has_result and has_error:
            raise ValueError("daemon RPC returned both result and error")
        if not has_result and not has_error:
            raise ValueError("daemon RPC response missing result and error")
        if has_error and (not isinstance(error_value, dict) or not error_value):
            raise ValueError("daemon RPC returned an invalid error object")
        return response

    def daemon_rpc_payload(self, source: str) -> dict[str, object]:
        return {
            "ok": False,
            "source": source,
            "host": self.env.host,
            "port": self.env.daemon_port,
            "blocker": None,
            "error": None,
        }

    def daemon_rpc_error_payload(self, source: str, exc: Exception) -> dict[str, object]:
        payload = self.daemon_rpc_payload(source)
        if isinstance(exc, DaemonRpcTimeoutError):
            payload["blocker"] = "daemon_rpc_timeout_invalid"
        elif isinstance(exc, DaemonConfigurationError):
            payload["blocker"] = exc.blocker
        elif isinstance(exc, httpx.HTTPStatusError):
            payload["blocker"] = "daemon_rpc_http_error"
        elif isinstance(exc, httpx.TimeoutException):
            payload["blocker"] = "daemon_rpc_timeout"
        else:
            payload["blocker"] = "daemon_rpc_failed"
        payload["error"] = str(exc)
        return payload

    def daemon_connectivity(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:connectivity_check")
        payload["connected"] = False
        try:
            response = self.daemon_rpc_call("connectivity_check")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:connectivity_check", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        result = response.get("result")
        if not isinstance(result, bool):
            payload["blocker"] = "daemon_connectivity_result_invalid"
            payload["error"] = "daemon did not return a boolean connectivity result"
            return payload
        connected = result
        payload["ok"] = connected
        payload["connected"] = connected
        if not connected:
            payload["blocker"] = "daemon_unreachable"
            payload["error"] = f"Unable to access {self.daemon_rpc_url()}"
        return payload

    def daemon_metadata(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_trex_config_metadata")
        payload["metadata"] = None
        payload["devices_info"] = None
        try:
            metadata_response = self.daemon_rpc_call("get_trex_config_metadata")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_trex_config_metadata", exc))
            return payload

        if metadata_response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(metadata_response.get("error"))
            return payload

        metadata = metadata_response.get("result")
        if not is_daemon_metadata_field_list(metadata):
            payload["blocker"] = "daemon_metadata_result_invalid"
            payload["error"] = "daemon did not return a metadata field list"
            return payload
        if json_payload_exceeds_limit(metadata, DAEMON_JSON_RESULT_MAX_BYTES):
            payload["blocker"] = "daemon_metadata_result_too_large"
            payload["error"] = f"daemon metadata result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            return payload

        payload["metadata"] = metadata
        try:
            devices_response = self.daemon_rpc_call("get_devices_info")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload["blocker"] = "daemon_devices_info_unavailable"
            payload["error"] = str(exc)
            payload["ok"] = True
            return payload

        if devices_response.get("error"):
            payload["blocker"] = "daemon_devices_info_unavailable"
            payload["error"] = daemon_rpc_error_message(devices_response.get("error"))
            payload["ok"] = True
            return payload

        devices_info = devices_response.get("result")
        if not is_daemon_devices_info(devices_info):
            payload["blocker"] = "daemon_devices_info_result_invalid"
            payload["error"] = "daemon did not return a device-info object"
            payload["ok"] = True
            return payload
        if json_payload_exceeds_limit(devices_info, DAEMON_JSON_RESULT_MAX_BYTES):
            payload["blocker"] = "daemon_devices_info_result_too_large"
            payload["error"] = f"daemon devices info result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            payload["ok"] = True
            return payload

        payload["devices_info"] = devices_info
        payload["ok"] = True
        return payload

    def daemon_devices_info(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_devices_info")
        payload["devices_info"] = None
        try:
            response = self.daemon_rpc_call("get_devices_info")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload["blocker"] = "daemon_devices_info_unavailable"
            payload["error"] = str(exc)
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_devices_info_unavailable"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload

        result = response.get("result")
        if not is_daemon_devices_info(result):
            payload["blocker"] = "daemon_devices_info_result_invalid"
            payload["error"] = "daemon did not return a device-info object"
            return payload
        if json_payload_exceeds_limit(result, DAEMON_JSON_RESULT_MAX_BYTES):
            payload["blocker"] = "daemon_devices_info_result_too_large"
            payload["error"] = f"daemon devices info result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            return payload

        payload["ok"] = True
        payload["devices_info"] = result
        return payload

    def daemon_files_list(self, path: object | None = None) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_files_list")
        payload.update({"path": path, "directories": None, "files": None})

        selected_path = path
        if selected_path is not None and not isinstance(selected_path, str):
            payload["blocker"] = "daemon_files_path_invalid"
            payload["error"] = "files path must be a string"
            return payload
        if selected_path is not None and selected_path != "" and selected_path.strip() == "":
            payload["blocker"] = "daemon_files_path_missing"
            payload["error"] = "files path is required"
            return payload
        if selected_path is not None and selected_path != "" and text_has_edge_whitespace(selected_path):
            payload["blocker"] = "daemon_files_path_invalid"
            payload["error"] = "files path must not have leading or trailing whitespace"
            return payload
        if selected_path is not None and daemon_path_has_nul(selected_path):
            payload["blocker"] = "daemon_files_path_invalid"
            payload["error"] = "files path must not contain NUL"
            return payload
        if selected_path is not None and daemon_path_too_long(selected_path):
            payload["blocker"] = "daemon_files_path_too_long"
            payload["error"] = f"files path must be at most {DAEMON_FILE_PATH_MAX_CHARS} characters"
            return payload
        if selected_path is not None and selected_path != "" and not posixpath.isabs(selected_path):
            payload["blocker"] = "daemon_files_path_invalid"
            payload["error"] = "files path must be absolute"
            return payload
        if selected_path is None or selected_path == "":
            try:
                path_response = self.daemon_rpc_call("get_files_path")
            except (httpx.HTTPError, OSError, ValueError) as exc:
                payload.update(self.daemon_rpc_error_payload("daemon:get_files_path", exc))
                return payload

            if path_response.get("error"):
                payload["blocker"] = "daemon_files_path_failed"
                payload["error"] = daemon_rpc_error_message(path_response.get("error"))
                return payload
            selected_path = path_response.get("result")
            if not is_daemon_files_path_result(selected_path):
                payload["blocker"] = "daemon_files_path_result_invalid"
                payload["error"] = "daemon did not return a clean absolute files path"
                return payload

        payload["path"] = selected_path
        try:
            response = self.daemon_rpc_call("get_files_list", {"path": selected_path})
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_files_list", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_files_list_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload

        result = response.get("result")
        if (
            not isinstance(result, list)
            or len(result) != 2
            or not isinstance(result[0], list)
            or not isinstance(result[1], list)
            or not all(is_daemon_file_list_entry(entry) for entry in result[0])
            or not all(is_daemon_file_list_entry(entry) for entry in result[1])
        ):
            payload["blocker"] = "daemon_files_list_result_invalid"
            payload["error"] = "daemon did not return clean [directories, files] entry-name lists"
            return payload

        payload["ok"] = True
        payload["directories"] = result[0]
        payload["files"] = result[1]
        return payload

    def daemon_file_content(
        self,
        path: object,
        max_bytes: int = 131_072,
        rpc_timeout_seconds: int | None = None,
    ) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_file")
        payload.update(
            {
                "path": path,
                "max_bytes": max_bytes,
                "size_bytes": None,
                "truncated": False,
                "content": "",
                "content_base64": "",
            }
        )
        if not isinstance(path, str):
            payload["blocker"] = "daemon_file_path_invalid"
            payload["error"] = "file path must be a string"
            return payload
        if path.strip() == "":
            payload["blocker"] = "daemon_file_path_missing"
            payload["error"] = "file path is required"
            return payload
        if text_has_edge_whitespace(path):
            payload["blocker"] = "daemon_file_path_invalid"
            payload["error"] = "file path must not have leading or trailing whitespace"
            return payload
        if daemon_path_has_nul(path):
            payload["blocker"] = "daemon_file_path_invalid"
            payload["error"] = "file path must not contain NUL"
            return payload
        if daemon_path_too_long(path):
            payload["blocker"] = "daemon_file_path_too_long"
            payload["error"] = f"file path must be at most {DAEMON_FILE_PATH_MAX_CHARS} characters"
            return payload
        if not posixpath.isabs(path):
            payload["blocker"] = "daemon_file_path_invalid"
            payload["error"] = "file path must be absolute"
            return payload
        if not valid_byte_limit(max_bytes, DAEMON_FILE_CONTENT_MAX_BYTES):
            payload["blocker"] = "daemon_file_max_bytes_invalid"
            payload["error"] = f"max_bytes must be between 1 and {DAEMON_FILE_CONTENT_MAX_BYTES}"
            return payload

        try:
            response = self.daemon_rpc_call(
                "get_file",
                {"filepath": path},
                timeout_seconds=rpc_timeout_seconds,
            )
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_file", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_file_read_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        encoded = response.get("result")
        if not isinstance(encoded, str):
            payload["blocker"] = "daemon_file_result_invalid"
            payload["error"] = "daemon RPC response did not include a base64 file string"
            return payload

        if base64_payload_exceeds_limit(encoded, DAEMON_FILE_CONTENT_MAX_BYTES):
            payload["blocker"] = "daemon_file_result_too_large"
            payload["error"] = f"daemon file result exceeds {DAEMON_FILE_CONTENT_MAX_BYTES} decoded bytes"
            return payload

        try:
            decoded = base64.b64decode(encoded.strip(), validate=True)
        except (binascii.Error, ValueError) as exc:
            payload["blocker"] = "daemon_file_decode_failed"
            payload["error"] = str(exc)
            return payload
        if len(decoded) > DAEMON_FILE_CONTENT_MAX_BYTES:
            payload["blocker"] = "daemon_file_result_too_large"
            payload["error"] = f"daemon file result exceeds {DAEMON_FILE_CONTENT_MAX_BYTES} decoded bytes"
            return payload

        content = decoded[:max_bytes]
        payload["ok"] = True
        payload["size_bytes"] = len(decoded)
        payload["truncated"] = len(decoded) > max_bytes
        payload["content"] = content.decode("utf-8", errors="replace")
        payload["content_base64"] = base64.b64encode(content).decode("ascii")
        return payload

    def daemon_default_config(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_trex_config")
        payload["content"] = ""
        try:
            response = self.daemon_rpc_call("get_trex_config")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_trex_config", exc))
            payload["content"] = ""
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        encoded = response.get("result")
        if not isinstance(encoded, str):
            payload["blocker"] = "daemon_config_result_invalid"
            payload["error"] = "daemon RPC response did not include a base64 config string"
            return payload

        if base64_payload_exceeds_limit(encoded, DAEMON_CONFIG_MAX_BYTES):
            payload["blocker"] = "daemon_config_result_too_large"
            payload["error"] = f"daemon config result exceeds {DAEMON_CONFIG_MAX_BYTES} decoded bytes"
            return payload

        try:
            decoded_bytes = base64.b64decode(encoded.strip(), validate=True)
            decoded = decoded_bytes.decode("utf-8")
        except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
            payload["blocker"] = "daemon_config_decode_failed"
            payload["error"] = str(exc)
            return payload
        if len(decoded_bytes) > DAEMON_CONFIG_MAX_BYTES:
            payload["blocker"] = "daemon_config_result_too_large"
            payload["error"] = f"daemon config result exceeds {DAEMON_CONFIG_MAX_BYTES} decoded bytes"
            payload["content"] = ""
            return payload
        if text_has_nul(decoded):
            payload["blocker"] = "daemon_config_result_invalid"
            payload["error"] = "daemon config content must not contain NUL"
            payload["content"] = ""
            return payload
        if decoded.strip() == "":
            payload["blocker"] = "daemon_config_result_invalid"
            payload["error"] = "daemon config content must not be blank"
            payload["content"] = ""
            return payload

        payload["ok"] = True
        payload["content"] = decoded
        return payload

    def daemon_log_from_rpc(self, max_bytes: int = 65_536) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_trex_daemon_log")
        payload.update(
            {
                "path": str(self.env.daemon_log),
                "max_bytes": max_bytes,
                "exists": False,
                "readable": False,
                "size_bytes": None,
                "modified_time": None,
                "content": "",
                "truncated": False,
            }
        )
        if not valid_byte_limit(max_bytes, DAEMON_LOG_MAX_BYTES):
            payload["blocker"] = "daemon_log_max_bytes_invalid"
            payload["error"] = f"max_bytes must be between 1 and {DAEMON_LOG_MAX_BYTES}"
            return payload
        try:
            response = self.daemon_rpc_call("get_trex_daemon_log")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_trex_daemon_log", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        encoded = response.get("result")
        if not isinstance(encoded, str):
            payload["blocker"] = "daemon_log_result_invalid"
            payload["error"] = "daemon RPC response did not include a base64 log string"
            return payload

        if base64_payload_exceeds_limit(encoded, DAEMON_LOG_MAX_BYTES):
            payload["blocker"] = "daemon_log_result_too_large"
            payload["error"] = f"daemon log result exceeds {DAEMON_LOG_MAX_BYTES} decoded bytes"
            return payload

        try:
            decoded = base64.b64decode(encoded.strip(), validate=True)
        except (binascii.Error, ValueError) as exc:
            payload["blocker"] = "daemon_log_decode_failed"
            payload["error"] = str(exc)
            return payload
        if len(decoded) > DAEMON_LOG_MAX_BYTES:
            payload["blocker"] = "daemon_log_result_too_large"
            payload["error"] = f"daemon log result exceeds {DAEMON_LOG_MAX_BYTES} decoded bytes"
            return payload

        payload["ok"] = True
        payload["exists"] = True
        payload["readable"] = True
        payload["size_bytes"] = len(decoded)
        payload["truncated"] = len(decoded) > max_bytes
        payload["content"] = decoded[-max_bytes:].decode("utf-8", errors="replace")
        return payload

    def daemon_trex_runtime_status(self, rpc_timeout_seconds: int | None = None) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:trex_runtime_status")
        payload.update(
            {
                "running": None,
                "status": None,
                "commands": None,
            }
        )

        try:
            running_response = self.daemon_rpc_call("is_running", timeout_seconds=rpc_timeout_seconds)
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:is_running", exc))
            return payload

        if running_response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(running_response.get("error"))
            return payload
        running = running_response.get("result")
        if not isinstance(running, bool):
            payload["blocker"] = "daemon_running_result_invalid"
            payload["error"] = "daemon did not return a boolean running result"
            return payload
        payload["running"] = running

        try:
            status_response = self.daemon_rpc_call("get_running_status", timeout_seconds=rpc_timeout_seconds)
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_running_status", exc))
            return payload

        if status_response.get("error"):
            payload["blocker"] = "daemon_running_status_failed"
            payload["error"] = daemon_rpc_error_message(status_response.get("error"))
            return payload
        status = status_response.get("result")
        if not is_trex_running_status(status):
            payload["blocker"] = "daemon_running_status_result_invalid"
            payload["error"] = "daemon did not return a valid TRex running status"
            return payload
        payload["status"] = status

        try:
            cmds_response = self.daemon_rpc_call("get_trex_cmds", timeout_seconds=rpc_timeout_seconds)
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_trex_cmds", exc))
            return payload

        if cmds_response.get("error"):
            payload["blocker"] = "daemon_trex_cmds_failed"
            payload["error"] = daemon_rpc_error_message(cmds_response.get("error"))
            return payload
        commands = cmds_response.get("result")
        if not is_trex_command_pair_list(commands):
            payload["blocker"] = "daemon_trex_cmds_result_invalid"
            payload["error"] = "daemon did not return [pid, command] TRex command pairs"
            return payload

        payload["commands"] = commands
        payload["ok"] = True
        return payload

    def daemon_trex_version(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_trex_version")
        payload["version"] = None
        try:
            response = self.daemon_rpc_call("get_trex_version")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_trex_version", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        encoded = response.get("result")
        if not isinstance(encoded, str):
            payload["blocker"] = "daemon_version_result_invalid"
            payload["error"] = "daemon RPC response did not include a base64 version string"
            return payload

        if base64_payload_exceeds_limit(encoded, DAEMON_VERSION_MAX_BYTES):
            payload["blocker"] = "daemon_version_result_too_large"
            payload["error"] = f"daemon version result exceeds {DAEMON_VERSION_MAX_BYTES} decoded bytes"
            return payload

        try:
            decoded_bytes = base64.b64decode(encoded.strip(), validate=True)
        except (binascii.Error, ValueError) as exc:
            payload["blocker"] = "daemon_version_decode_failed"
            payload["error"] = str(exc)
            return payload
        if len(decoded_bytes) > DAEMON_VERSION_MAX_BYTES:
            payload["blocker"] = "daemon_version_result_too_large"
            payload["error"] = f"daemon version result exceeds {DAEMON_VERSION_MAX_BYTES} decoded bytes"
            return payload

        try:
            version = decoded_bytes.decode("utf-8").strip()
        except UnicodeDecodeError as exc:
            payload["blocker"] = "daemon_version_decode_failed"
            payload["error"] = str(exc)
            return payload
        if version == "":
            payload["blocker"] = "daemon_version_result_invalid"
            payload["error"] = "daemon version content must not be blank"
            return payload

        payload["ok"] = True
        payload["version"] = version
        return payload

    def daemon_trex_log_from_rpc(self, max_bytes: int = 65_536) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_trex_log")
        payload.update(
            {
                "max_bytes": max_bytes,
                "content": "",
                "size_bytes": None,
                "truncated": False,
            }
        )
        if not valid_byte_limit(max_bytes, DAEMON_LOG_MAX_BYTES):
            payload["blocker"] = "daemon_trex_log_max_bytes_invalid"
            payload["error"] = f"max_bytes must be between 1 and {DAEMON_LOG_MAX_BYTES}"
            return payload
        try:
            response = self.daemon_rpc_call("get_trex_log")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_trex_log", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_rpc_error"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        encoded = response.get("result")
        if not isinstance(encoded, str):
            payload["blocker"] = "daemon_trex_log_result_invalid"
            payload["error"] = "daemon RPC response did not include a base64 TRex log string"
            return payload

        if base64_payload_exceeds_limit(encoded, DAEMON_LOG_MAX_BYTES):
            payload["blocker"] = "daemon_trex_log_result_too_large"
            payload["error"] = f"daemon TRex log result exceeds {DAEMON_LOG_MAX_BYTES} decoded bytes"
            return payload

        try:
            decoded = base64.b64decode(encoded.strip(), validate=True)
        except (binascii.Error, ValueError) as exc:
            payload["blocker"] = "daemon_trex_log_decode_failed"
            payload["error"] = str(exc)
            return payload
        if len(decoded) > DAEMON_LOG_MAX_BYTES:
            payload["blocker"] = "daemon_trex_log_result_too_large"
            payload["error"] = f"daemon TRex log result exceeds {DAEMON_LOG_MAX_BYTES} decoded bytes"
            return payload

        payload["ok"] = True
        payload["size_bytes"] = len(decoded)
        payload["truncated"] = len(decoded) > max_bytes
        payload["content"] = decoded[-max_bytes:].decode("utf-8", errors="replace")
        return payload

    def daemon_trex_running_info(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_running_info")
        payload["data"] = None
        try:
            response = self.daemon_rpc_call("get_running_info")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_running_info", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_running_info_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        result = response.get("result")
        if not isinstance(result, str):
            payload["blocker"] = "daemon_running_info_result_invalid"
            payload["error"] = "daemon did not return a JSON string running info result"
            return payload
        if len(result.encode("utf-8")) > DAEMON_JSON_RESULT_MAX_BYTES:
            payload["blocker"] = "daemon_running_info_result_too_large"
            payload["error"] = f"daemon running info result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            return payload
        try:
            result = load_strict_daemon_json(result)
        except (json.JSONDecodeError, ValueError) as exc:
            payload["blocker"] = "daemon_running_info_decode_failed"
            payload["error"] = str(exc)
            return payload

        if not isinstance(result, dict):
            payload["blocker"] = "daemon_running_info_result_invalid"
            payload["error"] = "daemon did not return a JSON object running info result"
            return payload
        if json_payload_exceeds_limit(result, DAEMON_JSON_RESULT_MAX_BYTES):
            payload["blocker"] = "daemon_running_info_result_too_large"
            payload["error"] = f"daemon running info result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            return payload

        payload["ok"] = True
        payload["data"] = result
        return payload

    def daemon_trex_latest_dump(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:get_latest_dump")
        payload["data"] = None
        try:
            response = self.daemon_rpc_call("get_latest_dump")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_latest_dump", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_latest_dump_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        result = response.get("result")
        if not isinstance(result, str):
            payload["blocker"] = "daemon_latest_dump_result_invalid"
            payload["error"] = "daemon did not return a JSON string latest dump result"
            return payload
        if len(result.encode("utf-8")) > DAEMON_JSON_RESULT_MAX_BYTES:
            payload["blocker"] = "daemon_latest_dump_result_too_large"
            payload["error"] = f"daemon latest dump result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            return payload
        try:
            result = load_strict_daemon_json(result)
        except (json.JSONDecodeError, ValueError) as exc:
            payload["blocker"] = "daemon_latest_dump_decode_failed"
            payload["error"] = str(exc)
            return payload

        if not isinstance(result, dict):
            payload["blocker"] = "daemon_latest_dump_result_invalid"
            payload["error"] = "daemon did not return a JSON object latest dump result"
            return payload
        if json_payload_exceeds_limit(result, DAEMON_JSON_RESULT_MAX_BYTES):
            payload["blocker"] = "daemon_latest_dump_result_too_large"
            payload["error"] = f"daemon latest dump result exceeds {DAEMON_JSON_RESULT_MAX_BYTES} bytes"
            return payload

        payload["ok"] = True
        payload["data"] = result
        return payload

    def daemon_trex_reservation(self) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:is_reserved")
        payload["reserved"] = None
        try:
            response = self.daemon_rpc_call("is_reserved")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:is_reserved", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_reservation_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        reserved = response.get("result")
        if not isinstance(reserved, bool):
            payload["blocker"] = "daemon_reservation_result_invalid"
            payload["error"] = "daemon did not return a boolean reservation result"
            return payload

        payload["ok"] = True
        payload["reserved"] = reserved
        return payload

    def daemon_reservation_user(self, user: object | None = None) -> object:
        return self.daemon_user() if user is None else user

    def daemon_user(self) -> str:
        system_user = getpass.getuser() or "trex-webui"
        if not isinstance(system_user, str):
            return "trex-webui"
        user = system_user.strip()
        return user or "trex-webui"

    def daemon_trex_reserve(self, user: object | None = None) -> dict[str, object]:
        reservation_user = self.daemon_reservation_user(user)
        payload = self.daemon_rpc_payload("daemon:reserve_trex")
        payload.update({"action": "reserve", "user": reservation_user, "reserved": None, "result": None})
        if not isinstance(reservation_user, str):
            payload["blocker"] = "daemon_reservation_user_invalid"
            payload["error"] = "reservation user must be a string"
            return payload
        if reservation_user.strip() == "":
            payload["blocker"] = "daemon_reservation_user_missing"
            payload["error"] = "reservation user is required"
            return payload
        if text_has_edge_whitespace(reservation_user):
            payload["blocker"] = "daemon_reservation_user_invalid"
            payload["error"] = "reservation user must not have leading or trailing whitespace"
            return payload
        if text_has_nul(reservation_user):
            payload["blocker"] = "daemon_reservation_user_invalid"
            payload["error"] = "reservation user must not contain NUL"
            return payload
        if len(reservation_user) > DAEMON_RESERVATION_USER_MAX_CHARS:
            payload["blocker"] = "daemon_reservation_user_too_long"
            payload["error"] = f"reservation user must be at most {DAEMON_RESERVATION_USER_MAX_CHARS} characters"
            return payload
        try:
            response = self.daemon_rpc_call("reserve_trex", {"user": reservation_user})
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:reserve_trex", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_reserve_trex_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        result = response.get("result")
        if not isinstance(result, bool):
            payload["blocker"] = "daemon_reserve_trex_result_invalid"
            payload["error"] = "daemon did not return a boolean reserve result"
            return payload
        payload["result"] = result
        if result is False:
            payload["blocker"] = "daemon_reserve_trex_not_reserved"
            payload["error"] = "daemon returned false for reserve request"
            payload["reserved"] = False
            return payload

        payload["ok"] = True
        payload["reserved"] = True
        return payload

    def daemon_trex_cancel_reservation(self, user: object | None = None) -> dict[str, object]:
        reservation_user = self.daemon_reservation_user(user)
        payload = self.daemon_rpc_payload("daemon:cancel_reservation")
        payload.update({"action": "cancel", "user": reservation_user, "canceled": None, "result": None})
        if not isinstance(reservation_user, str):
            payload["blocker"] = "daemon_reservation_user_invalid"
            payload["error"] = "reservation user must be a string"
            return payload
        if reservation_user.strip() == "":
            payload["blocker"] = "daemon_reservation_user_missing"
            payload["error"] = "reservation user is required"
            return payload
        if text_has_edge_whitespace(reservation_user):
            payload["blocker"] = "daemon_reservation_user_invalid"
            payload["error"] = "reservation user must not have leading or trailing whitespace"
            return payload
        if text_has_nul(reservation_user):
            payload["blocker"] = "daemon_reservation_user_invalid"
            payload["error"] = "reservation user must not contain NUL"
            return payload
        if len(reservation_user) > DAEMON_RESERVATION_USER_MAX_CHARS:
            payload["blocker"] = "daemon_reservation_user_too_long"
            payload["error"] = f"reservation user must be at most {DAEMON_RESERVATION_USER_MAX_CHARS} characters"
            return payload
        try:
            response = self.daemon_rpc_call("cancel_reservation", {"user": reservation_user})
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:cancel_reservation", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_cancel_reservation_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        result = response.get("result")
        if not isinstance(result, bool):
            payload["blocker"] = "daemon_cancel_reservation_result_invalid"
            payload["error"] = "daemon did not return a boolean cancel result"
            return payload
        payload["result"] = result
        payload["canceled"] = result
        if result is False:
            payload["blocker"] = "daemon_cancel_reservation_not_canceled"
            payload["error"] = "daemon returned false for cancel reservation request"
            return payload

        payload["ok"] = True
        return payload

    def daemon_config_filename(self, user: str | None = None) -> str:
        user = self.daemon_user() if user is None else user
        filename = re.sub(r"[^A-Za-z0-9_.-]", "_", user)
        if filename == "" or filename.strip(".") == "":
            return "trex-webui"
        return filename

    def daemon_start_config_filename(self, user: str, content: bytes) -> str:
        content_sha256 = hashlib.sha256(content).hexdigest()
        return f"{self.daemon_config_filename(user)}-{content_sha256[:12]}.yaml"

    def daemon_start_rpc_timeout_seconds(self, start_timeout_seconds: int) -> int:
        configured_timeout = self.env.command_timeout_seconds
        if not valid_byte_limit(configured_timeout, DAEMON_RPC_TIMEOUT_MAX_SECONDS):
            configured_timeout = 1
        return min(
            DAEMON_RPC_TIMEOUT_MAX_SECONDS,
            max(configured_timeout, start_timeout_seconds + DAEMON_START_RPC_GRACE_SECONDS),
        )

    @staticmethod
    def daemon_command_uses_config(command: str, expected_config_path: str) -> bool:
        try:
            tokens = shlex.split(command)
        except ValueError:
            return False
        for index, token in enumerate(tokens):
            if token == "--cfg" and index + 1 < len(tokens):
                if tokens[index + 1] == expected_config_path:
                    return True
            elif token.startswith("--cfg=") and token.removeprefix("--cfg=") == expected_config_path:
                return True
        return False

    def prepare_daemon_lifecycle(self, payload: dict[str, object]) -> bool:
        payload["lifecycle_managed"] = self.lifecycle_disconnect is not None
        payload["stl_disconnect"] = None
        if self.lifecycle_disconnect is None:
            return True
        try:
            result = self.lifecycle_disconnect()
        except Exception as exc:
            payload["blocker"] = "daemon_lifecycle_disconnect_failed"
            payload["error"] = f"failed to close the backend STL session before daemon mutation: {exc}"
            return False
        if not isinstance(result, TrexCallResult):
            payload["blocker"] = "daemon_lifecycle_disconnect_failed"
            payload["error"] = "backend STL lifecycle callback returned an invalid result"
            return False
        payload["stl_disconnect"] = public_result_payload(result)
        if not result.ok:
            payload["blocker"] = result.blocker or "daemon_lifecycle_disconnect_failed"
            payload["error"] = result.error or "failed to close the backend STL session before daemon mutation"
            return False
        return True

    def daemon_trex_start_reconciliation(
        self,
        expected_config_path: str,
        expected_config_sha256: str,
    ) -> dict[str, object]:
        configured_timeout = self.env.command_timeout_seconds
        if not valid_byte_limit(configured_timeout, DAEMON_RPC_TIMEOUT_MAX_SECONDS):
            configured_timeout = DAEMON_START_RECONCILIATION_RPC_TIMEOUT_SECONDS
        rpc_timeout = min(configured_timeout, DAEMON_START_RECONCILIATION_RPC_TIMEOUT_SECONDS)
        payload: dict[str, object] = {
            "ok": False,
            "rpc_timeout_seconds": rpc_timeout,
            "running": None,
            "status": None,
            "commands": None,
            "command_matches": False,
            "matched_command": None,
            "expected_config_path": expected_config_path,
            "expected_config_sha256": expected_config_sha256,
            "observed_config_sha256": None,
            "config_hash_matches": False,
            "blocker": None,
            "error": None,
        }

        status = self.daemon_trex_runtime_status(rpc_timeout_seconds=rpc_timeout)
        payload["running"] = status.get("running")
        payload["status"] = status.get("status")
        payload["commands"] = status.get("commands")
        if not status.get("ok"):
            payload["blocker"] = "daemon_start_reconciliation_status_failed"
            payload["error"] = status.get("error") or status.get("blocker") or "unable to reconcile daemon status"
            return payload
        running_status = status.get("status")
        if status.get("running") is not True or not isinstance(running_status, dict) or running_status.get("state") != 3:
            payload["blocker"] = "daemon_start_reconciliation_not_running"
            payload["error"] = "daemon did not report TRex in the Running state after the start RPC timed out"
            return payload

        commands = status.get("commands")
        if not isinstance(commands, list):
            payload["blocker"] = "daemon_start_reconciliation_commands_invalid"
            payload["error"] = "daemon did not return TRex commands during start reconciliation"
            return payload
        matched_command = next(
            (
                str(entry[1])
                for entry in commands
                if isinstance(entry, (list, tuple))
                and len(entry) == 2
                and isinstance(entry[1], str)
                and self.daemon_command_uses_config(entry[1], expected_config_path)
            ),
            None,
        )
        if matched_command is None:
            payload["blocker"] = "daemon_start_reconciliation_command_mismatch"
            payload["error"] = "running TRex command does not reference the uploaded config path"
            return payload
        payload["command_matches"] = True
        payload["matched_command"] = matched_command

        remote_config = self.daemon_file_content(
            expected_config_path,
            max_bytes=DAEMON_CONFIG_MAX_BYTES,
            rpc_timeout_seconds=rpc_timeout,
        )
        if not remote_config.get("ok") or remote_config.get("truncated") is True:
            payload["blocker"] = "daemon_start_reconciliation_config_unavailable"
            payload["error"] = (
                remote_config.get("error")
                or remote_config.get("blocker")
                or "unable to read the uploaded config during start reconciliation"
            )
            return payload
        encoded_config = remote_config.get("content_base64")
        if not isinstance(encoded_config, str):
            payload["blocker"] = "daemon_start_reconciliation_config_invalid"
            payload["error"] = "daemon returned invalid config content during start reconciliation"
            return payload
        try:
            remote_bytes = base64.b64decode(encoded_config, validate=True)
        except (binascii.Error, ValueError) as exc:
            payload["blocker"] = "daemon_start_reconciliation_config_invalid"
            payload["error"] = str(exc)
            return payload
        observed_sha256 = hashlib.sha256(remote_bytes).hexdigest()
        payload["observed_config_sha256"] = observed_sha256
        payload["config_hash_matches"] = observed_sha256 == expected_config_sha256
        if observed_sha256 != expected_config_sha256:
            payload["blocker"] = "daemon_start_reconciliation_config_hash_mismatch"
            payload["error"] = "running TRex config hash does not match the uploaded config"
            return payload

        payload["ok"] = True
        return payload

    def daemon_config_version_payload(self, source: str) -> dict[str, object]:
        return {
            "ok": False,
            "source": source,
            "root_path": None,
            "blocker": None,
            "error": None,
        }

    def daemon_config_audit_path(self, root: Path) -> Path:
        return root / "audit.jsonl"

    def daemon_config_versions_root(self) -> tuple[Path | None, str | None, str | None]:
        daemon_log = self.env.daemon_log
        if not is_clean_absolute_local_path(daemon_log):
            return None, "daemon_config_version_root_invalid", "daemon log path must be a clean absolute path"
        root = daemon_log.parent / "config-versions"
        if not is_clean_absolute_local_path(root):
            return None, "daemon_config_version_root_invalid", "config version root must be a clean absolute path"
        return root, None, None

    def ensure_daemon_config_versions_root(self, payload: dict[str, object]) -> Path | None:
        root, blocker, error = self.daemon_config_versions_root()
        payload["root_path"] = str(root) if root else None
        if root is None:
            payload["blocker"] = blocker
            payload["error"] = error
            return None
        try:
            root.mkdir(parents=True, exist_ok=True)
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return None
        except OSError as exc:
            payload["blocker"] = "daemon_config_version_root_unavailable"
            payload["error"] = str(exc)
            return None
        return root

    def daemon_config_version_content_bytes(
        self,
        config_content: object | None,
        payload: dict[str, object],
        *,
        allow_blank: bool = False,
        reject_generated: bool = True,
    ) -> bytes | None:
        content = config_content
        if content is None:
            snapshot = self.config_snapshot(max_bytes=DAEMON_CONFIG_MAX_BYTES, decode_errors="strict")
            if not snapshot["readable"]:
                payload["blocker"] = snapshot["blocker"] or "config_missing"
                payload["error"] = snapshot["error"] or "No config content available"
                return None
            if snapshot["truncated"]:
                payload["blocker"] = "daemon_config_content_too_large"
                payload["error"] = f"config content exceeds {DAEMON_CONFIG_MAX_BYTES} bytes"
                return None
            content = str(snapshot["content"])
        if not isinstance(content, str):
            payload["blocker"] = "daemon_config_content_invalid"
            payload["error"] = "config content must be a string"
            return None
        if text_has_nul(content):
            payload["blocker"] = "daemon_config_content_invalid"
            payload["error"] = "config content must not contain NUL"
            return None
        if not allow_blank and content.strip() == "":
            payload["blocker"] = "daemon_config_content_missing"
            payload["error"] = "config content is required"
            return None
        if reject_generated and is_invalid_generated_config_preview(content):
            payload["blocker"] = "daemon_config_content_invalid_generated"
            payload["error"] = "generated config preview contains validation errors"
            return None
        try:
            content_bytes = content.encode("utf-8")
        except UnicodeEncodeError as exc:
            payload["blocker"] = "daemon_config_encode_failed"
            payload["error"] = str(exc)
            return None
        if len(content_bytes) > DAEMON_CONFIG_MAX_BYTES:
            payload["blocker"] = "daemon_config_content_too_large"
            payload["error"] = f"config content exceeds {DAEMON_CONFIG_MAX_BYTES} bytes"
            return None
        return content_bytes

    def daemon_config_version_record(self, target: Path) -> dict[str, object] | None:
        name = clean_daemon_config_version_name(target.name)
        if name is None:
            return None
        try:
            stat = target.stat()
            if not target.is_file() or stat.st_size > DAEMON_CONFIG_MAX_BYTES:
                return None
            content = target.read_bytes()
        except OSError:
            return None

        sha256 = hashlib.sha256(content).hexdigest()
        modified_time = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
        metadata: dict[str, object] = {}
        sidecar = target.with_suffix(".json")
        try:
            if sidecar.is_file() and sidecar.stat().st_size <= 16_384:
                loaded = json.loads(sidecar.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    metadata = loaded
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            metadata = {}

        created_at = metadata.get("created_at")
        if not isinstance(created_at, str) or created_at.strip() == "":
            created_at = modified_time
        source = metadata.get("version_source")
        if not isinstance(source, str) or source.strip() == "":
            source = "unknown"
        note = metadata.get("note")
        if not isinstance(note, str):
            note = None
        config_path = metadata.get("config_path")
        if not isinstance(config_path, str):
            config_path = str(self.env.config_path)
        return {
            "name": name,
            "path": str(target),
            "created_at": created_at,
            "modified_time": modified_time,
            "size_bytes": stat.st_size,
            "sha256": sha256,
            "source": source,
            "note": note,
            "config_path": config_path,
            "host": metadata.get("host") if isinstance(metadata.get("host"), str) else self.env.host,
            "daemon_port": metadata.get("daemon_port")
            if isinstance(metadata.get("daemon_port"), int) and not isinstance(metadata.get("daemon_port"), bool)
            else self.env.daemon_port,
        }

    def daemon_config_versions(self, limit: int = 50) -> dict[str, object]:
        payload = self.daemon_config_version_payload("local:daemon_config_versions")
        payload.update({"limit": limit, "versions": []})
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1 or limit > DAEMON_CONFIG_VERSION_MAX_FILES:
            payload["blocker"] = "daemon_config_version_limit_invalid"
            payload["error"] = f"limit must be between 1 and {DAEMON_CONFIG_VERSION_MAX_FILES}"
            return payload

        root = self.ensure_daemon_config_versions_root(payload)
        if root is None:
            return payload

        records: list[dict[str, object]] = []
        try:
            targets = list(root.glob("*.yaml"))
        except OSError as exc:
            payload["blocker"] = "daemon_config_version_list_failed"
            payload["error"] = str(exc)
            return payload

        for target in targets:
            record = self.daemon_config_version_record(target)
            if record is not None:
                records.append(record)
        records.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
        payload["ok"] = True
        payload["versions"] = records[:limit]
        return payload

    def daemon_config_audit(self, limit: int = 50) -> dict[str, object]:
        payload = self.daemon_config_version_payload("local:daemon_config_audit")
        payload.update({"limit": limit, "audit_path": None, "records": [], "truncated": False, "skipped_lines": 0})
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1 or limit > DAEMON_CONFIG_AUDIT_MAX_RECORDS:
            payload["blocker"] = "daemon_config_audit_limit_invalid"
            payload["error"] = f"limit must be between 1 and {DAEMON_CONFIG_AUDIT_MAX_RECORDS}"
            return payload

        root = self.ensure_daemon_config_versions_root(payload)
        if root is None:
            return payload
        audit_path = self.daemon_config_audit_path(root)
        payload["audit_path"] = str(audit_path)
        if not local_path_exists(audit_path):
            payload["ok"] = True
            return payload
        try:
            if not audit_path.is_file():
                payload["blocker"] = "daemon_config_audit_path_invalid"
                payload["error"] = "config audit path must be a regular file"
                return payload
            stat = audit_path.stat()
            with audit_path.open("rb") as handle:
                if stat.st_size > DAEMON_CONFIG_AUDIT_MAX_BYTES:
                    handle.seek(-DAEMON_CONFIG_AUDIT_MAX_BYTES, 2)
                    handle.readline()
                    payload["truncated"] = True
                raw = handle.read(DAEMON_CONFIG_AUDIT_MAX_BYTES + 1)
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return payload
        except OSError as exc:
            payload["blocker"] = "daemon_config_audit_read_failed"
            payload["error"] = str(exc)
            return payload
        if len(raw) > DAEMON_CONFIG_AUDIT_MAX_BYTES:
            raw = raw[:DAEMON_CONFIG_AUDIT_MAX_BYTES]
            payload["truncated"] = True
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            payload["blocker"] = "daemon_config_audit_decode_failed"
            payload["error"] = str(exc)
            return payload

        records: list[dict[str, object]] = []
        skipped = 0
        for line in reversed(text.splitlines()):
            if len(records) >= limit:
                break
            if line.strip() == "":
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            if not is_daemon_config_audit_record(entry):
                skipped += 1
                continue
            record = {
                "action": entry["action"],
                "created_at": entry["created_at"],
                "config_path": entry["config_path"],
                "host": entry["host"],
                "daemon_port": entry["daemon_port"],
            }
            if entry["action"] == "restore":
                record.update(
                    {
                        "restored_name": entry["restored_name"],
                        "restored_sha256": entry["restored_sha256"],
                        "before_name": entry.get("before_name"),
                    }
                )
            else:
                record.update(
                    {
                        "version_name": entry["version_name"],
                        "version_sha256": entry["version_sha256"],
                        "sequence": entry["sequence"],
                        "config_filename": entry.get("config_filename"),
                        "files_path": entry.get("files_path"),
                        "user": entry.get("user"),
                    }
                )
                if "recovered_from_timeout" in entry:
                    record["recovered_from_timeout"] = entry["recovered_from_timeout"]
                if "reconciliation" in entry:
                    record["reconciliation"] = entry["reconciliation"]
            records.append(record)

        payload["ok"] = True
        payload["records"] = records
        payload["skipped_lines"] = skipped
        return payload

    def daemon_config_version_path(self, name: object, payload: dict[str, object]) -> Path | None:
        clean_name = clean_daemon_config_version_name(name)
        if clean_name is None:
            payload["blocker"] = "daemon_config_version_name_invalid"
            payload["error"] = "config version name is invalid"
            return None
        root = self.ensure_daemon_config_versions_root(payload)
        if root is None:
            return None
        target = root / clean_name
        try:
            if target.resolve().parent != root.resolve():
                payload["blocker"] = "daemon_config_version_name_invalid"
                payload["error"] = "config version name escapes the version root"
                return None
        except OSError as exc:
            payload["blocker"] = "daemon_config_version_name_invalid"
            payload["error"] = str(exc)
            return None
        return target

    def daemon_config_version_save(
        self,
        config_content: object | None = None,
        source: object | None = "manual",
        note: object | None = None,
    ) -> dict[str, object]:
        payload = self.daemon_config_version_payload("local:daemon_config_version_save")
        payload.update({"saved": False, "version": None})
        clean_source = clean_daemon_config_version_source(source)
        if clean_source is None:
            payload["blocker"] = "daemon_config_version_source_invalid"
            payload["error"] = "config version source is invalid"
            return payload
        clean_note = clean_daemon_config_version_note(note)
        if note is not None and clean_note is None:
            payload["blocker"] = "daemon_config_version_note_invalid"
            payload["error"] = f"config version note must be at most {DAEMON_CONFIG_VERSION_NOTE_MAX_CHARS} characters and contain no NUL"
            return payload

        root = self.ensure_daemon_config_versions_root(payload)
        if root is None:
            return payload

        content_bytes = self.daemon_config_version_content_bytes(config_content, payload)
        if content_bytes is None:
            return payload

        created_at = datetime.now(timezone.utc).isoformat()
        filename_stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        sha256 = hashlib.sha256(content_bytes).hexdigest()
        name = f"{filename_stamp}-{clean_source}-{sha256[:12]}.yaml"
        target = root / name
        metadata = {
            "name": name,
            "created_at": created_at,
            "version_source": clean_source,
            "note": clean_note,
            "size_bytes": len(content_bytes),
            "sha256": sha256,
            "config_path": str(self.env.config_path),
            "host": self.env.host,
            "daemon_port": self.env.daemon_port,
        }
        tmp_suffix = uuid.uuid4().hex
        tmp_target = root / f".{name}.{tmp_suffix}.tmp"
        tmp_sidecar = root / f".{name}.{tmp_suffix}.json.tmp"
        sidecar = target.with_suffix(".json")
        try:
            tmp_target.write_bytes(content_bytes)
            tmp_sidecar.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
            tmp_target.replace(target)
            tmp_sidecar.replace(sidecar)
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return payload
        except OSError as exc:
            payload["blocker"] = "daemon_config_version_write_failed"
            payload["error"] = str(exc)
            return payload
        finally:
            for leftover in (tmp_target, tmp_sidecar):
                try:
                    if leftover.exists():
                        leftover.unlink()
                except OSError:
                    pass

        record = self.daemon_config_version_record(target)
        payload["ok"] = True
        payload["saved"] = True
        payload["version"] = record
        return payload

    def daemon_config_version_load(self, name: object) -> dict[str, object]:
        payload = self.daemon_config_version_payload("local:daemon_config_version_load")
        payload.update({"name": name, "version": None, "content": ""})
        target = self.daemon_config_version_path(name, payload)
        if target is None:
            return payload
        try:
            stat = target.stat()
            if not target.is_file():
                payload["blocker"] = "daemon_config_version_missing"
                payload["error"] = "config version does not exist"
                return payload
            if stat.st_size > DAEMON_CONFIG_MAX_BYTES:
                payload["blocker"] = "daemon_config_version_too_large"
                payload["error"] = f"config version exceeds {DAEMON_CONFIG_MAX_BYTES} bytes"
                return payload
            content = target.read_bytes()
        except FileNotFoundError:
            payload["blocker"] = "daemon_config_version_missing"
            payload["error"] = "config version does not exist"
            return payload
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return payload
        except OSError as exc:
            payload["blocker"] = "daemon_config_version_read_failed"
            payload["error"] = str(exc)
            return payload

        try:
            decoded = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            payload["blocker"] = "daemon_config_version_decode_failed"
            payload["error"] = str(exc)
            return payload
        if text_has_nul(decoded):
            payload["blocker"] = "daemon_config_version_invalid"
            payload["error"] = "config version content must not contain NUL"
            return payload

        payload["ok"] = True
        payload["content"] = decoded
        payload["version"] = self.daemon_config_version_record(target)
        return payload

    def daemon_config_version_diff(self, name: object, config_content: object | None = None) -> dict[str, object]:
        payload = self.daemon_config_version_payload("local:daemon_config_version_diff")
        payload.update({"name": name, "version": None, "diff": "", "truncated": False, "compared_to": None})
        loaded = self.daemon_config_version_load(name)
        if not loaded["ok"]:
            payload.update(
                {
                    "root_path": loaded.get("root_path"),
                    "blocker": loaded.get("blocker"),
                    "error": loaded.get("error"),
                    "version": loaded.get("version"),
                }
            )
            return payload

        current_bytes = self.daemon_config_version_content_bytes(
            config_content,
            payload,
            allow_blank=True,
            reject_generated=False,
        )
        if current_bytes is None:
            return payload
        current = current_bytes.decode("utf-8")
        baseline = str(loaded["content"])
        diff_iter = difflib.unified_diff(
            baseline.splitlines(keepends=True),
            current.splitlines(keepends=True),
            fromfile=str(name),
            tofile="current-config",
        )
        parts: list[str] = []
        total = 0
        truncated = False
        for line in diff_iter:
            next_total = total + len(line)
            if next_total > DAEMON_CONFIG_DIFF_MAX_CHARS:
                remaining = max(0, DAEMON_CONFIG_DIFF_MAX_CHARS - total)
                if remaining:
                    parts.append(line[:remaining])
                truncated = True
                break
            parts.append(line)
            total = next_total

        payload["ok"] = True
        payload["version"] = loaded["version"]
        payload["diff"] = "".join(parts)
        payload["truncated"] = truncated
        payload["compared_to"] = "request" if config_content is not None else str(self.env.config_path)
        return payload

    def daemon_config_version_restore(
        self,
        name: object,
        confirmation: object | None = None,
    ) -> dict[str, object]:
        with _DAEMON_MUTATION_LOCK:
            return self._daemon_config_version_restore(name, confirmation)

    def _daemon_config_version_restore(
        self,
        name: object,
        confirmation: object | None = None,
    ) -> dict[str, object]:
        payload = self.daemon_config_version_payload("local:daemon_config_version_restore")
        payload.update(
            {
                "name": name,
                "restored": False,
                "config_path": str(self.env.config_path),
                "before_version": None,
                "restored_version": None,
                "audit_record": None,
                "audit_written": False,
            }
        )
        if self.env.require_confirmation and confirmation != "restore-config":
            payload["blocker"] = "confirmation_required"
            payload["error"] = "confirmation token required: restore-config"
            return payload

        loaded = self.daemon_config_version_load(name)
        if not loaded["ok"]:
            payload.update(
                {
                    "root_path": loaded.get("root_path"),
                    "blocker": loaded.get("blocker"),
                    "error": loaded.get("error"),
                    "restored_version": loaded.get("version"),
                }
            )
            return payload
        payload["root_path"] = loaded.get("root_path")
        payload["restored_version"] = loaded.get("version")

        config_path = self.env.config_path
        if not is_clean_absolute_local_path(config_path):
            payload["blocker"] = "config_path_invalid"
            payload["error"] = "config path must be a clean absolute path"
            return payload
        if not is_clean_absolute_local_path(config_path.parent):
            payload["blocker"] = "config_path_invalid"
            payload["error"] = "config parent path must be a clean absolute path"
            return payload
        if not local_path_exists(config_path.parent):
            payload["blocker"] = "config_parent_missing"
            payload["error"] = f"{config_path.parent} does not exist"
            return payload
        try:
            if config_path.exists() and not config_path.is_file():
                payload["blocker"] = "config_path_invalid"
                payload["error"] = "config path must be a regular file"
                return payload
        except OSError as exc:
            payload["blocker"] = "config_path_invalid"
            payload["error"] = str(exc)
            return payload

        content_bytes = self.daemon_config_version_content_bytes(str(loaded["content"]), payload)
        if content_bytes is None:
            return payload

        before_backup: dict[str, object] | None = None
        if local_path_exists(config_path):
            before_backup = self.daemon_config_version_save(
                None,
                source="restore_before",
                note=f"before restore {loaded['name']}",
            )
            payload["before_version"] = before_backup.get("version")
            if not before_backup["ok"]:
                payload["blocker"] = "daemon_config_restore_backup_failed"
                payload["error"] = before_backup.get("error") or before_backup.get("blocker") or "failed to save current config backup"
                return payload

        existing_mode = 0o644
        try:
            if config_path.exists():
                existing_mode = config_path.stat().st_mode & 0o777
        except OSError:
            existing_mode = 0o644

        tmp_path = config_path.parent / f".{config_path.name}.{uuid.uuid4().hex}.tmp"
        try:
            tmp_path.write_bytes(content_bytes)
            tmp_path.chmod(existing_mode)
            tmp_path.replace(config_path)
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return payload
        except OSError as exc:
            payload["blocker"] = "daemon_config_restore_write_failed"
            payload["error"] = str(exc)
            return payload
        finally:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass

        root = Path(str(payload["root_path"])) if isinstance(payload.get("root_path"), str) else None
        audit_record = {
            "action": "restore",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "config_path": str(config_path),
            "restored_name": loaded["name"],
            "restored_sha256": hashlib.sha256(content_bytes).hexdigest(),
            "before_name": payload["before_version"]["name"] if isinstance(payload.get("before_version"), dict) else None,
            "host": self.env.host,
            "daemon_port": self.env.daemon_port,
        }
        payload["audit_record"] = audit_record
        if root is not None:
            audit_path = self.daemon_config_audit_path(root)
            try:
                with audit_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(audit_record, ensure_ascii=False, sort_keys=True) + "\n")
                payload["audit_written"] = True
            except OSError as exc:
                payload["audit_written"] = False
                payload["error"] = f"config restored but audit write failed: {exc}"

        payload["ok"] = True
        payload["restored"] = True
        return payload

    def daemon_trex_start(
        self,
        config_content: object | None = None,
        timeout_seconds: int | None = None,
        confirmation: str | None = None,
    ) -> dict[str, object]:
        with _DAEMON_MUTATION_LOCK:
            return self._daemon_trex_start(config_content, timeout_seconds, confirmation)

    def _daemon_trex_start(
        self,
        config_content: object | None = None,
        timeout_seconds: int | None = None,
        confirmation: str | None = None,
    ) -> dict[str, object]:
        start_user = self.daemon_user()
        payload = self.daemon_rpc_payload("daemon:start_trex")
        payload.update(
            {
                "action": "start",
                "config_filename": self.daemon_config_filename(start_user),
                "config_uploaded": False,
                "files_path": None,
                "trex_cmd_options": None,
                "user": start_user,
                "timeout_seconds": None,
                "rpc_timeout_seconds": None,
                "sequence": None,
                "result": None,
                "config_sha256": None,
                "config_version": None,
                "audit_record": None,
                "audit_written": False,
                "recovered_from_timeout": False,
                "reconciliation": None,
                "lifecycle_managed": self.lifecycle_disconnect is not None,
                "stl_disconnect": None,
            }
        )
        if self.env.require_confirmation and confirmation != "start-trex":
            payload["blocker"] = "confirmation_required"
            payload["error"] = "confirmation token required: start-trex"
            return payload
        if len(start_user) > DAEMON_RESERVATION_USER_MAX_CHARS:
            payload["blocker"] = "daemon_start_user_too_long"
            payload["error"] = f"daemon start user must be at most {DAEMON_RESERVATION_USER_MAX_CHARS} characters"
            return payload
        if text_has_nul(start_user):
            payload["blocker"] = "daemon_start_user_invalid"
            payload["error"] = "daemon start user must not contain NUL"
            return payload

        timeout = timeout_seconds if timeout_seconds is not None else self.env.command_timeout_seconds
        if timeout_seconds is None and "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS" in self.env.configuration_errors:
            payload["blocker"] = "daemon_start_timeout_invalid"
            payload["error"] = self.env.configuration_errors["TREX_WEBUI_COMMAND_TIMEOUT_SECONDS"]
            return payload
        if not isinstance(timeout, int) or isinstance(timeout, bool) or timeout < 1 or timeout > 600:
            payload["blocker"] = "daemon_start_timeout_invalid"
            payload["error"] = "start timeout must be between 1 and 600 seconds"
            return payload
        payload["timeout_seconds"] = timeout

        content = config_content
        if content is None:
            snapshot = self.config_snapshot(max_bytes=DAEMON_CONFIG_MAX_BYTES, decode_errors="strict")
            if not snapshot["readable"]:
                payload["blocker"] = snapshot["blocker"] or "config_missing"
                payload["error"] = snapshot["error"] or "No config content available"
                return payload
            if snapshot["truncated"]:
                payload["blocker"] = "daemon_config_content_too_large"
                payload["error"] = f"config content exceeds {DAEMON_CONFIG_MAX_BYTES} bytes"
                return payload
            content = str(snapshot["content"])
        if not isinstance(content, str):
            payload["blocker"] = "daemon_config_content_invalid"
            payload["error"] = "config content must be a string"
            return payload
        if text_has_nul(content):
            payload["blocker"] = "daemon_config_content_invalid"
            payload["error"] = "config content must not contain NUL"
            return payload
        if content.strip() == "":
            payload["blocker"] = "daemon_config_content_missing"
            payload["error"] = "config content is required"
            return payload
        if is_invalid_generated_config_preview(content):
            payload["blocker"] = "daemon_config_content_invalid_generated"
            payload["error"] = "generated config preview contains validation errors"
            return payload

        try:
            content_bytes = content.encode("utf-8")
        except UnicodeEncodeError as exc:
            payload["blocker"] = "daemon_config_encode_failed"
            payload["error"] = str(exc)
            return payload
        if len(content_bytes) > DAEMON_CONFIG_MAX_BYTES:
            payload["blocker"] = "daemon_config_content_too_large"
            payload["error"] = f"config content exceeds {DAEMON_CONFIG_MAX_BYTES} bytes"
            return payload
        content_sha256 = hashlib.sha256(content_bytes).hexdigest()
        payload["config_sha256"] = content_sha256
        payload["config_filename"] = self.daemon_start_config_filename(start_user, content_bytes)
        encoded_config = base64.b64encode(content_bytes).decode("ascii")

        backup = self.daemon_config_version_save(
            content,
            source="start",
            note=f"pre-start upload {payload['config_filename']}",
        )
        payload["config_version"] = backup.get("version")
        if not backup["ok"]:
            payload["blocker"] = "daemon_config_backup_failed"
            payload["error"] = backup.get("error") or backup.get("blocker") or "failed to save config backup"
            return payload

        try:
            upload_response = self.daemon_rpc_call(
                "push_file",
                {
                    "filename": payload["config_filename"],
                    "bin_data": encoded_config,
                },
            )
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:push_file", exc))
            return payload

        if upload_response.get("error"):
            payload["blocker"] = "daemon_config_upload_failed"
            payload["error"] = daemon_rpc_error_message(upload_response.get("error"))
            return payload
        upload_result = upload_response.get("result")
        if not isinstance(upload_result, bool):
            payload["blocker"] = "daemon_config_upload_result_invalid"
            payload["error"] = "daemon did not return a boolean config upload result"
            return payload
        if upload_result is False:
            payload["blocker"] = "daemon_config_upload_failed"
            payload["error"] = "TRex Daemon IO error"
            return payload
        payload["config_uploaded"] = True

        try:
            path_response = self.daemon_rpc_call("get_files_path")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:get_files_path", exc))
            return payload

        files_path = path_response.get("result")
        if path_response.get("error") or not is_daemon_files_path_result(files_path):
            payload["blocker"] = "daemon_files_path_unavailable"
            payload["error"] = daemon_rpc_error_message(path_response.get("error")) or (
                "daemon did not return a clean absolute files path"
            )
            return payload
        payload["files_path"] = files_path

        trex_cmd_options = {"cfg": posixpath.join(files_path, str(payload["config_filename"]))}
        payload["trex_cmd_options"] = trex_cmd_options
        if not self.prepare_daemon_lifecycle(payload):
            return payload

        rpc_timeout = self.daemon_start_rpc_timeout_seconds(timeout)
        payload["rpc_timeout_seconds"] = rpc_timeout
        recovered_from_timeout = False
        reconciliation: dict[str, object] | None = None
        try:
            start_response = self.daemon_rpc_call(
                "start_trex",
                {
                    "trex_cmd_options": trex_cmd_options,
                    "user": payload["user"],
                    "stateless": True,
                    "timeout": timeout,
                },
                timeout_seconds=rpc_timeout,
            )
        except httpx.TimeoutException as exc:
            reconciliation = self.daemon_trex_start_reconciliation(
                trex_cmd_options["cfg"],
                content_sha256,
            )
            payload["reconciliation"] = reconciliation
            if not reconciliation.get("ok"):
                payload.update(self.daemon_rpc_error_payload("daemon:start_trex", exc))
                payload["reconciliation"] = reconciliation
                return payload
            recovered_from_timeout = True
            payload["recovered_from_timeout"] = True
            start_response = None
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:start_trex", exc))
            return payload

        if start_response is not None and start_response.get("error"):
            payload["blocker"] = "daemon_start_trex_failed"
            payload["error"] = daemon_rpc_error_message(start_response.get("error"))
            return payload

        sequence = start_response.get("result") if start_response is not None else None
        payload["result"] = sequence
        if not recovered_from_timeout and (
            not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1
        ):
            payload["blocker"] = "daemon_start_sequence_invalid"
            payload["error"] = "daemon did not return a positive integer TRex run sequence"
            return payload

        payload["ok"] = True
        payload["sequence"] = sequence
        config_version = payload.get("config_version")
        if isinstance(config_version, dict):
            version_name = config_version.get("name")
            version_sha256 = config_version.get("sha256")
            audit_record = {
                "action": "start",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "config_path": trex_cmd_options["cfg"],
                "version_name": version_name,
                "version_sha256": version_sha256,
                "sequence": sequence,
                "recovered_from_timeout": recovered_from_timeout,
                "reconciliation": None,
                "config_filename": payload["config_filename"],
                "files_path": files_path,
                "user": payload["user"],
                "host": self.env.host,
                "daemon_port": self.env.daemon_port,
            }
            if recovered_from_timeout and reconciliation is not None:
                audit_record["reconciliation"] = {
                    "running": reconciliation.get("running"),
                    "status": reconciliation.get("status"),
                    "matched_command": reconciliation.get("matched_command"),
                    "expected_config_sha256": reconciliation.get("expected_config_sha256"),
                    "observed_config_sha256": reconciliation.get("observed_config_sha256"),
                }
            payload["audit_record"] = audit_record
            root_path = backup.get("root_path")
            root = Path(root_path) if isinstance(root_path, str) else None
            if root is not None:
                audit_path = self.daemon_config_audit_path(root)
                try:
                    with audit_path.open("a", encoding="utf-8") as handle:
                        handle.write(json.dumps(audit_record, ensure_ascii=False, sort_keys=True) + "\n")
                    payload["audit_written"] = True
                except OSError as exc:
                    payload["audit_written"] = False
                    payload["error"] = f"TRex started but audit write failed: {exc}"
        return payload

    def daemon_trex_stop(self, confirmation: str | None = None) -> dict[str, object]:
        with _DAEMON_MUTATION_LOCK:
            return self._daemon_trex_stop(confirmation)

    def _daemon_trex_stop(self, confirmation: str | None = None) -> dict[str, object]:
        payload = self.daemon_rpc_payload("daemon:force_trex_kill")
        payload.update(
            {
                "action": "stop",
                "stopped": None,
                "result": None,
                "lifecycle_managed": self.lifecycle_disconnect is not None,
                "stl_disconnect": None,
            }
        )
        if self.env.require_confirmation and confirmation != "stop-trex":
            payload["blocker"] = "confirmation_required"
            payload["error"] = "confirmation token required: stop-trex"
            return payload
        if not self.prepare_daemon_lifecycle(payload):
            return payload
        try:
            response = self.daemon_rpc_call("force_trex_kill")
        except (httpx.HTTPError, OSError, ValueError) as exc:
            payload.update(self.daemon_rpc_error_payload("daemon:force_trex_kill", exc))
            return payload

        if response.get("error"):
            payload["blocker"] = "daemon_force_trex_kill_failed"
            payload["error"] = daemon_rpc_error_message(response.get("error"))
            return payload
        stopped = response.get("result")
        payload["result"] = stopped
        if not isinstance(stopped, bool):
            payload["blocker"] = "daemon_stop_result_invalid"
            payload["error"] = "daemon did not return a boolean stop result"
            return payload
        payload["stopped"] = stopped
        payload["ok"] = True
        return payload

    def config_snapshot(self, max_bytes: int = 131_072, decode_errors: str = "replace") -> dict[str, object]:
        path = self.env.config_path
        payload: dict[str, object] = {
            "path": str(path),
            "max_bytes": max_bytes,
            "decode_errors": decode_errors,
            "exists": False,
            "readable": False,
            "size_bytes": None,
            "modified_time": None,
            "content": "",
            "truncated": False,
            "blocker": None,
            "error": None,
        }
        if not valid_byte_limit(max_bytes, DAEMON_CONFIG_MAX_BYTES):
            payload["blocker"] = "config_max_bytes_invalid"
            payload["error"] = f"max_bytes must be between 1 and {DAEMON_CONFIG_MAX_BYTES}"
            return payload
        if decode_errors not in {"replace", "strict"}:
            payload["blocker"] = "config_decode_mode_invalid"
            payload["error"] = "decode_errors must be replace or strict"
            return payload
        if not is_clean_absolute_local_path(path):
            payload["blocker"] = "config_path_invalid"
            payload["error"] = "config path must be a clean absolute path"
            return payload
        exists = local_path_exists(path)
        payload["exists"] = exists
        if not exists:
            payload["blocker"] = "config_missing"
            payload["error"] = f"{path} does not exist"
            return payload
        try:
            stat = path.stat()
            payload["size_bytes"] = stat.st_size
            payload["modified_time"] = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
            with path.open("rb") as handle:
                content = handle.read(max_bytes + 1)
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return payload
        except OSError as exc:
            payload["blocker"] = "config_read_failed"
            payload["error"] = str(exc)
            return payload

        payload["readable"] = True
        payload["truncated"] = len(content) > max_bytes
        try:
            payload["content"] = content[:max_bytes].decode("utf-8", errors=decode_errors)
        except UnicodeDecodeError as exc:
            payload["readable"] = False
            payload["blocker"] = "config_decode_failed"
            payload["error"] = str(exc)
        return payload

    def daemon_log_tail(self, max_bytes: int = 65_536) -> dict[str, object]:
        path = self.env.daemon_log
        payload: dict[str, object] = {
            "source": "local:daemon_log",
            "path": str(path),
            "max_bytes": max_bytes,
            "exists": False,
            "readable": False,
            "size_bytes": None,
            "modified_time": None,
            "content": "",
            "truncated": False,
            "blocker": None,
            "error": None,
        }
        if not valid_byte_limit(max_bytes, DAEMON_LOG_MAX_BYTES):
            payload["blocker"] = "log_max_bytes_invalid"
            payload["error"] = f"max_bytes must be between 1 and {DAEMON_LOG_MAX_BYTES}"
            return payload
        if not is_clean_absolute_local_path(path):
            payload["blocker"] = "log_path_invalid"
            payload["error"] = "daemon log path must be a clean absolute path"
            return payload
        exists = local_path_exists(path)
        payload["exists"] = exists
        if not exists:
            payload["blocker"] = "log_missing"
            payload["error"] = f"{path} does not exist"
            return payload
        try:
            stat = path.stat()
            payload["size_bytes"] = stat.st_size
            payload["modified_time"] = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
            with path.open("rb") as handle:
                if stat.st_size > max_bytes:
                    handle.seek(-max_bytes, 2)
                    payload["truncated"] = True
                content = handle.read(max_bytes)
        except PermissionError as exc:
            payload["blocker"] = "permission_denied"
            payload["error"] = str(exc)
            return payload
        except OSError as exc:
            payload["blocker"] = "log_read_failed"
            payload["error"] = str(exc)
            return payload

        payload["readable"] = True
        payload["content"] = content.decode("utf-8", errors="replace")
        return payload

    def daemon_host_is_loopback(self) -> bool:
        if self.env.host == "localhost":
            return True
        try:
            return ip_address(self.env.host).is_loopback
        except ValueError:
            return False

    def daemon_overview(self) -> dict[str, object]:
        rpc = self.daemon_connectivity()
        metadata = self.daemon_metadata() if rpc["connected"] else self.daemon_rpc_payload("daemon:get_trex_config_metadata")
        metadata.setdefault("metadata", None)
        metadata.setdefault("devices_info", None)
        log = (
            self.daemon_log_tail()
            if self.daemon_host_is_loopback()
            else self.daemon_log_from_rpc()
            if rpc["connected"]
            else self.daemon_log_tail()
        )
        trex = self.daemon_trex_runtime_status() if rpc["connected"] else self.daemon_rpc_payload("daemon:trex_runtime_status")
        trex.setdefault("running", None)
        trex.setdefault("status", None)
        trex.setdefault("commands", None)
        trex_version = self.daemon_trex_version() if rpc["connected"] else self.daemon_rpc_payload("daemon:get_trex_version")
        trex_version.setdefault("version", None)
        trex_reservation = self.daemon_trex_reservation() if rpc["connected"] else self.daemon_rpc_payload("daemon:is_reserved")
        trex_reservation.setdefault("reserved", None)
        return {
            "environment": self.env.readiness(),
            "status": self.daemon_status(rpc),
            "rpc": rpc,
            "trex": trex,
            "trex_version": trex_version,
            "trex_reservation": trex_reservation,
            "metadata": metadata,
            "previews": {action: self.preview_daemon_action(action) for action in DAEMON_DIALOG_ACTIONS},
            "config": self.config_snapshot(),
            "log": log,
        }
