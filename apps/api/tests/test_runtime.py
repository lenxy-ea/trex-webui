from __future__ import annotations

import base64
import hashlib
import json
import threading
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from app.core.settings import TREX_HOST_ERROR, TrexEnvironment
from app.trex.runtime import (
    DAEMON_COMMAND_TIMEOUT_MAX_SECONDS,
    DAEMON_CONFIG_MAX_BYTES,
    DAEMON_FILE_CONTENT_MAX_BYTES,
    DAEMON_FILE_PATH_MAX_CHARS,
    DAEMON_JSON_RESULT_MAX_BYTES,
    DAEMON_LOG_MAX_BYTES,
    DAEMON_RPC_RESPONSE_MAX_BYTES,
    DAEMON_RESERVATION_USER_MAX_CHARS,
    DAEMON_START_RPC_GRACE_SECONDS,
    DAEMON_VERSION_MAX_BYTES,
    CommandResult,
    RuntimeManager,
    httpx_rpc_caller,
)
from app.trex.result import TrexCallResult


def env(tmp_path: Path, require_confirmation: bool = True) -> TrexEnvironment:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    daemon_bin = scripts_dir / "trex_daemon_server"
    daemon_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    return TrexEnvironment(
        host="127.0.0.1",
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=scripts_dir,
        daemon_bin=daemon_bin,
        config_path=tmp_path / "trex_cfg.yaml",
        daemon_log=tmp_path / "trex_daemon_server.log",
        profile_roots=[tmp_path / "profiles"],
        command_timeout_seconds=3,
        require_confirmation=require_confirmation,
    )


class FakeStreamResponse:
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks

    def __enter__(self) -> "FakeStreamResponse":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    def iter_bytes(self):
        yield from self.chunks


class FakeHttpxClient:
    def __init__(self, stream) -> None:
        self._stream = stream

    def __enter__(self) -> "FakeHttpxClient":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def stream(self, method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return self._stream(method, url, json, timeout)


def patch_httpx_client(monkeypatch, stream, client_calls: list[dict[str, object]] | None = None) -> None:
    def client(**kwargs: object) -> FakeHttpxClient:
        if client_calls is not None:
            client_calls.append(kwargs)
        return FakeHttpxClient(stream)

    monkeypatch.setattr("app.trex.runtime.httpx.Client", client)


def test_daemon_command_is_allowlisted(tmp_path: Path) -> None:
    manager = RuntimeManager(env(tmp_path))

    assert manager.daemon_command("show")[-1] == "show"

    try:
        manager.daemon_command("rm -rf /")
    except ValueError as exc:
        assert "unsupported daemon action" in str(exc)
    else:
        raise AssertionError("unsupported daemon action was accepted")


def test_httpx_rpc_caller_streams_bounded_json_response(monkeypatch) -> None:
    calls: list[tuple[str, str, dict[str, object], float]] = []
    client_calls: list[dict[str, object]] = []
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("NO_PROXY", "")

    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        calls.append((method, url, json, timeout))
        return FakeStreamResponse([b'{"jsonrpc":"2.0",', b'"id":"1","result":true}'])

    patch_httpx_client(monkeypatch, stream, client_calls)

    result = httpx_rpc_caller("http://127.0.0.1:8090", {"id": "1"}, 3.0)

    assert result == {"jsonrpc": "2.0", "id": "1", "result": True}
    assert calls == [("POST", "http://127.0.0.1:8090", {"id": "1"}, 3.0)]
    assert client_calls == [{"trust_env": False}]


def test_httpx_rpc_caller_rejects_oversized_response_before_json_parse(monkeypatch) -> None:
    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return FakeStreamResponse([b"x" * (DAEMON_RPC_RESPONSE_MAX_BYTES + 1)])

    patch_httpx_client(monkeypatch, stream)

    try:
        httpx_rpc_caller("http://127.0.0.1:8090", {"id": "1"}, 3.0)
    except ValueError as exc:
        assert str(exc) == f"daemon RPC HTTP response exceeds {DAEMON_RPC_RESPONSE_MAX_BYTES} bytes"
    else:
        raise AssertionError("oversized daemon RPC response was accepted")


def test_httpx_rpc_caller_reports_invalid_utf8_json(monkeypatch) -> None:
    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return FakeStreamResponse([b'{"jsonrpc":"2.0","result":"\xff"}'])

    patch_httpx_client(monkeypatch, stream)

    try:
        httpx_rpc_caller("http://127.0.0.1:8090", {"id": "1"}, 3.0)
    except ValueError as exc:
        assert str(exc) == "daemon RPC HTTP response is not valid UTF-8 JSON"
    else:
        raise AssertionError("invalid daemon RPC UTF-8 JSON was accepted")


def test_httpx_rpc_caller_reports_invalid_json(monkeypatch) -> None:
    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return FakeStreamResponse([b"{not json"])

    patch_httpx_client(monkeypatch, stream)

    try:
        httpx_rpc_caller("http://127.0.0.1:8090", {"id": "1"}, 3.0)
    except ValueError as exc:
        assert str(exc) == "daemon RPC returned invalid JSON"
    else:
        raise AssertionError("invalid daemon RPC JSON was accepted")


def test_httpx_rpc_caller_rejects_non_finite_json(monkeypatch) -> None:
    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return FakeStreamResponse([b'{"jsonrpc":"2.0","id":"1","result":NaN}'])

    patch_httpx_client(monkeypatch, stream)

    try:
        httpx_rpc_caller("http://127.0.0.1:8090", {"id": "1"}, 3.0)
    except ValueError as exc:
        assert str(exc) == "daemon RPC returned invalid JSON"
    else:
        raise AssertionError("non-finite daemon RPC JSON was accepted")


def test_daemon_connectivity_reports_oversized_transport_response(monkeypatch, tmp_path: Path) -> None:
    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return FakeStreamResponse([b"x" * (DAEMON_RPC_RESPONSE_MAX_BYTES + 1)])

    patch_httpx_client(monkeypatch, stream)

    result = RuntimeManager(env(tmp_path)).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == f"daemon RPC HTTP response exceeds {DAEMON_RPC_RESPONSE_MAX_BYTES} bytes"


def test_daemon_connectivity_reports_invalid_transport_json(monkeypatch, tmp_path: Path) -> None:
    def stream(method: str, url: str, json: dict[str, object], timeout: float) -> FakeStreamResponse:
        return FakeStreamResponse([b"{not json"])

    patch_httpx_client(monkeypatch, stream)

    result = RuntimeManager(env(tmp_path)).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned invalid JSON"


def test_destructive_action_requires_confirmation(tmp_path: Path) -> None:
    manager = RuntimeManager(env(tmp_path))

    result = manager.run_daemon_action("restart")

    assert not result.ok
    assert result.blocker == "confirmation_required"


def test_systemd_supervisor_blocks_wrapper_lifecycle_before_runner(tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        calls.append(command)
        raise AssertionError("managed daemon lifecycle must not execute the wrapper")

    environment = replace(env(tmp_path), daemon_supervisor="systemd")
    manager = RuntimeManager(environment, runner=runner)

    result = manager.run_daemon_action("start", confirmation="start")
    preview = manager.preview_daemon_action("restart")

    assert result.ok is False
    assert result.returncode == 409
    assert result.blocker == "daemon_lifecycle_managed_by_systemd"
    assert preview["available"] is False
    assert preview["blocker"] == "daemon_lifecycle_managed_by_systemd"
    assert calls == []


def test_runner_receives_safe_argument_list(tmp_path: Path) -> None:
    calls: list[tuple[list[str], int]] = []

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        calls.append((command, timeout))
        return CommandResult(command, 0, "TRex server daemon is running", "")

    manager = RuntimeManager(env(tmp_path), runner=runner)
    result = manager.run_daemon_action("show")

    assert result.ok
    assert calls == [
        ([str(tmp_path / "scripts" / "trex_daemon_server"), "--daemon-port", "8090", "show"], 3)
    ]


def test_daemon_action_rejects_relative_daemon_bin_before_command(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), daemon_bin=Path("trex_daemon_server"))

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("relative daemon binary path should not run command")

    result = RuntimeManager(environment, runner=runner).run_daemon_action("show")

    assert result.ok is False
    assert result.returncode == 400
    assert result.blocker == "daemon_bin_path_invalid"


def test_daemon_action_rejects_relative_scripts_dir_before_command(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), scripts_dir=Path("scripts"))

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("relative scripts directory path should not run command")

    result = RuntimeManager(environment, runner=runner).run_daemon_action("show")

    assert result.ok is False
    assert result.returncode == 400
    assert result.blocker == "scripts_dir_path_invalid"


def test_daemon_action_can_override_timeout(tmp_path: Path) -> None:
    calls: list[int] = []

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        calls.append(timeout)
        return CommandResult(command, 0, "TRex server daemon is running", "")

    result = RuntimeManager(env(tmp_path), runner=runner).run_daemon_action("start", timeout_seconds=40)

    assert result.ok
    assert calls == [40]


def test_daemon_start_timeout_recovers_when_status_reports_running(tmp_path: Path) -> None:
    calls: list[tuple[str, int]] = []
    rpc_calls: list[str] = []

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        calls.append((command[-1], timeout))
        if command[-1] == "start":
            return CommandResult(command, 124, "starting\n", "", blocker="timeout")
        raise AssertionError("daemon timeout recovery must not execute root-only CLI show")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        rpc_calls.append(str(payload["method"]))
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), runner=runner, rpc_caller=rpc_caller).run_daemon_action("start")

    assert result.ok
    assert result.returncode == 0
    assert result.blocker is None
    assert result.recovered_from_timeout is True
    assert result.stdout == "starting\n"
    assert "status check reports running" in result.stderr
    assert calls == [("start", 3)]
    assert rpc_calls == ["connectivity_check"]


def test_daemon_action_rejects_invalid_request_timeout_before_command(tmp_path: Path) -> None:
    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("invalid daemon action timeout should not run command")

    result = RuntimeManager(env(tmp_path), runner=runner).run_daemon_action("start", timeout_seconds=0)

    assert not result.ok
    assert result.returncode == 400
    assert result.blocker == "daemon_action_timeout_invalid"
    assert result.stderr == f"daemon action timeout must be between 1 and {DAEMON_COMMAND_TIMEOUT_MAX_SECONDS} seconds"


def test_daemon_action_rejects_invalid_configured_daemon_port_before_command(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        configuration_errors={"TREX_WEBUI_TREX_DAEMON_PORT": "TREX_WEBUI_TREX_DAEMON_PORT must be an integer"},
    )

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("invalid configured daemon port should not run command")

    result = RuntimeManager(environment, runner=runner).run_daemon_action("show")

    assert result.ok is False
    assert result.returncode == 400
    assert result.blocker == "daemon_port_invalid"
    assert result.stderr == "TREX_WEBUI_TREX_DAEMON_PORT must be an integer"


def test_daemon_action_rejects_out_of_range_daemon_port_before_command(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), daemon_port=0)

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("out-of-range daemon port should not run command")

    result = RuntimeManager(environment, runner=runner).run_daemon_action("show")

    assert result.ok is False
    assert result.returncode == 400
    assert result.blocker == "daemon_port_invalid"
    assert result.stderr == "daemon port must be between 1 and 65535"


def test_daemon_action_rejects_invalid_configured_timeout_before_command(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        configuration_errors={"TREX_WEBUI_COMMAND_TIMEOUT_SECONDS": "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer"},
    )

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("invalid configured daemon timeout should not run command")

    result = RuntimeManager(environment, runner=runner).run_daemon_action("show")

    assert result.ok is False
    assert result.returncode == 400
    assert result.blocker == "daemon_action_timeout_invalid"
    assert result.stderr == "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer"


def test_daemon_action_rejects_invalid_environment_timeout_before_command(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment = TrexEnvironment(
        host=environment.host,
        sync_port=environment.sync_port,
        async_port=environment.async_port,
        daemon_port=environment.daemon_port,
        scripts_dir=environment.scripts_dir,
        daemon_bin=environment.daemon_bin,
        config_path=environment.config_path,
        daemon_log=environment.daemon_log,
        profile_roots=environment.profile_roots,
        command_timeout_seconds=0,
        require_confirmation=environment.require_confirmation,
    )

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("invalid daemon environment timeout should not run command")

    result = RuntimeManager(environment, runner=runner).run_daemon_action("show")

    assert not result.ok
    assert result.returncode == 400
    assert result.blocker == "daemon_action_timeout_invalid"


def test_daemon_status_uses_rpc_as_single_authority_without_executing_cli(tmp_path: Path) -> None:
    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("daemon status must not execute root-only CLI show")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    status = RuntimeManager(env(tmp_path), runner=runner, rpc_caller=rpc_caller).daemon_status()

    assert status["ok"] is True
    assert status["running"] is True
    assert status["source"] == "daemon:connectivity_check"
    assert status["command_executed"] is False
    assert status["command"][-1] == "show"
    assert status["returncode"] is None
    assert status["stdout"] == ""
    assert status["stderr"] == ""
    assert status["blocker"] is None
    assert status["error"] is None


def test_daemon_cli_show_remains_an_explicit_diagnostic_action(tmp_path: Path) -> None:
    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        return CommandResult(command, 1, "", "Please run as root")

    result = RuntimeManager(env(tmp_path), runner=runner).run_daemon_action("show")

    assert result.ok is False
    assert result.returncode == 1
    assert result.stderr == "Please run as root"


def test_daemon_status_reports_rpc_failure_without_executing_cli(tmp_path: Path) -> None:
    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        raise AssertionError("offline daemon status must not execute root-only CLI show")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    status = RuntimeManager(env(tmp_path), runner=runner, rpc_caller=rpc_caller).daemon_status()

    assert status["ok"] is False
    assert status["running"] is False
    assert status["command_executed"] is False
    assert status["returncode"] is None
    assert status["blocker"] == "daemon_unreachable"
    assert status["stderr"] == "Unable to access http://127.0.0.1:8090"
    assert status["error"] == "Unable to access http://127.0.0.1:8090"


def test_daemon_default_config_loads_base64_yaml_from_rpc(tmp_path: Path) -> None:
    calls: list[tuple[str, dict[str, object], float]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append((url, payload, timeout))
        encoded = base64.b64encode(b"port_limit: 2\n").decode("ascii")
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is True
    assert result["content"] == "port_limit: 2\n"
    assert calls[0][0] == "http://127.0.0.1:8090"
    assert calls[0][1]["method"] == "get_trex_config"


def test_daemon_default_config_loads_utf8_yaml_from_rpc(tmp_path: Path) -> None:
    config_content = "port_limit: 2\n# lab note: 测试\n"

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        encoded = base64.b64encode(config_content.encode("utf-8")).decode("ascii")
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is True
    assert result["content"] == config_content


def test_daemon_default_config_reports_rpc_error_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        return {"jsonrpc": "2.0", "id": payload["id"], "error": {"message": "daemon unavailable"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_rpc_error"
    assert result["error"] == "daemon unavailable"
    assert result["content"] == ""


def test_daemon_default_config_rejects_non_string_result_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"content": "port_limit: 2\n"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_result_invalid"
    assert result["content"] == ""


def test_daemon_default_config_rejects_invalid_base64_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not base64"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_decode_failed"
    assert result["content"] == ""


def test_daemon_default_config_rejects_invalid_utf8_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"port_limit: \xff\n").decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_decode_failed"
    assert result["content"] == ""


def test_daemon_default_config_rejects_nul_content_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"port_limit: 2\n\x00").decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_result_invalid"
    assert result["content"] == ""


def test_daemon_default_config_rejects_blank_content_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b" \n\t\n").decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_result_invalid"
    assert result["error"] == "daemon config content must not be blank"
    assert result["content"] == ""


def test_daemon_default_config_rejects_oversized_rpc_result_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"x" * (DAEMON_CONFIG_MAX_BYTES + 1)).decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_config"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_default_config()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_result_too_large"
    assert result["content"] == ""


def test_daemon_log_from_rpc_loads_base64_tail_without_fake_content(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        encoded = base64.b64encode(b"first\nsecond\nthird\n").decode("ascii")
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_log_from_rpc(max_bytes=12)

    assert result["ok"] is True
    assert result["source"] == "daemon:get_trex_daemon_log"
    assert result["max_bytes"] == 12
    assert result["readable"] is True
    assert result["truncated"] is True
    assert "third" in result["content"]
    assert calls[0]["method"] == "get_trex_daemon_log"


def test_daemon_log_from_rpc_rejects_non_string_result_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_daemon_log"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"content": "daemon log\n"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_log_from_rpc()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_log_result_invalid"
    assert result["content"] == ""


def test_daemon_log_from_rpc_reports_decode_error_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not base64"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_log_from_rpc()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_log_decode_failed"
    assert result["content"] == ""


def test_daemon_log_from_rpc_rejects_oversized_result_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"x" * (DAEMON_LOG_MAX_BYTES + 1)).decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_daemon_log"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_log_from_rpc()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_log_result_too_large"
    assert result["content"] == ""


def test_daemon_log_from_rpc_rejects_invalid_max_bytes_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid max_bytes should not call daemon log RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_log_from_rpc(max_bytes=0)

    assert result["ok"] is False
    assert result["blocker"] == "daemon_log_max_bytes_invalid"
    assert result["max_bytes"] == 0
    assert result["content"] == ""


def test_daemon_connectivity_reports_real_rpc_result(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is True
    assert result["connected"] is True


def test_daemon_connectivity_reports_real_false_result_as_unreachable(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_unreachable"
    assert result["error"] == "Unable to access http://127.0.0.1:8090"


def test_daemon_connectivity_rejects_invalid_environment_timeout_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment = TrexEnvironment(
        host=environment.host,
        sync_port=environment.sync_port,
        async_port=environment.async_port,
        daemon_port=environment.daemon_port,
        scripts_dir=environment.scripts_dir,
        daemon_bin=environment.daemon_bin,
        config_path=environment.config_path,
        daemon_log=environment.daemon_log,
        profile_roots=environment.profile_roots,
        command_timeout_seconds=0,
        require_confirmation=environment.require_confirmation,
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid daemon RPC timeout should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_timeout_invalid"
    assert result["error"] == "daemon RPC timeout must be between 1 and 600 seconds"


def test_daemon_connectivity_rejects_invalid_configured_daemon_port_before_rpc(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        configuration_errors={"TREX_WEBUI_TREX_DAEMON_PORT": "TREX_WEBUI_TREX_DAEMON_PORT must be an integer"},
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid configured daemon port should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_port_invalid"
    assert result["error"] == "TREX_WEBUI_TREX_DAEMON_PORT must be an integer"


def test_daemon_connectivity_rejects_invalid_configured_host_before_rpc(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        host="http://127.0.0.1:8090",
        configuration_errors={"TREX_WEBUI_TREX_HOST": TREX_HOST_ERROR},
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid configured daemon host should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_host_invalid"
    assert result["error"] == TREX_HOST_ERROR


def test_daemon_connectivity_rejects_host_with_embedded_port_before_rpc(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), host="127.0.0.1:8090")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("daemon host with embedded port should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_host_invalid"
    assert result["error"] == TREX_HOST_ERROR


def test_daemon_connectivity_rejects_out_of_range_daemon_port_before_rpc(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), daemon_port=65536)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("out-of-range daemon port should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_port_invalid"
    assert result["error"] == "daemon port must be between 1 and 65535"


def test_daemon_rpc_url_formats_ipv6_host(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), host="2001:db8::1")

    assert RuntimeManager(environment).daemon_rpc_url() == "http://[2001:db8::1]:8090"


def test_daemon_connectivity_rejects_invalid_configured_timeout_before_rpc(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        configuration_errors={"TREX_WEBUI_COMMAND_TIMEOUT_SECONDS": "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer"},
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid configured daemon timeout should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_timeout_invalid"
    assert result["error"] == "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer"


def test_daemon_connectivity_rejects_invalid_result_type(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "connected"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_connectivity_result_invalid"
    assert result["error"] == "daemon did not return a boolean connectivity result"


def test_daemon_connectivity_rejects_non_object_rpc_response(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> object:
        assert payload["method"] == "connectivity_check"
        return ["not", "a", "json-rpc", "object"]

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned a non-object response"


def test_daemon_connectivity_rejects_invalid_rpc_version(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned an invalid JSON-RPC version"


def test_daemon_connectivity_rejects_mismatched_rpc_response_id(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": "wrong-id", "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned a mismatched response id"


def test_daemon_connectivity_rejects_missing_rpc_result_and_error(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC response missing result and error"


def test_daemon_connectivity_rejects_rpc_result_with_error(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {
            "jsonrpc": "2.0",
            "id": payload["id"],
            "result": True,
            "error": {"message": "also failed"},
        }

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned both result and error"


def test_daemon_connectivity_rejects_rpc_result_with_null_error(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True, "error": None}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned both result and error"


def test_daemon_connectivity_rejects_invalid_rpc_error_object(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "error": "daemon unavailable"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned an invalid error object"


def test_daemon_connectivity_rejects_null_rpc_error_object(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "connectivity_check"
        return {"jsonrpc": "2.0", "id": payload["id"], "error": None}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_connectivity()

    assert result["ok"] is False
    assert result["connected"] is False
    assert result["blocker"] == "daemon_rpc_failed"
    assert result["error"] == "daemon RPC returned an invalid error object"


def test_daemon_devices_info_loads_real_daemon_rpc_result(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"0000:02:00.0": {"driver": "i40e"}}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is True
    assert result["source"] == "daemon:get_devices_info"
    assert result["devices_info"] == {"0000:02:00.0": {"driver": "i40e"}}
    assert calls[0]["method"] == "get_devices_info"


def test_daemon_devices_info_reports_rpc_error_as_unavailable_without_fake_devices(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "error": {"message": "devices unavailable"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_unavailable"
    assert result["error"] == "devices unavailable"
    assert result["devices_info"] is None


def test_daemon_devices_info_reports_rpc_exception_as_unavailable_without_fake_devices(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        raise OSError("devices unavailable")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_unavailable"
    assert result["error"] == "devices unavailable"
    assert result["devices_info"] is None


def test_daemon_devices_info_reports_invalid_result_without_fake_devices(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not json data"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_result_invalid"
    assert result["devices_info"] is None


def test_daemon_devices_info_rejects_list_result_without_fake_devices(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [{"Slot": "0000:02:00.0"}]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_result_invalid"
    assert result["devices_info"] is None


def test_daemon_devices_info_rejects_invalid_device_entries_without_fake_devices(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"": {"driver": "i40e"}, "0000:02:00.0": "i40e"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_result_invalid"
    assert result["devices_info"] is None


def test_daemon_devices_info_rejects_dirty_pci_slots_without_fake_devices(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {
            "jsonrpc": "2.0",
            "id": payload["id"],
            "result": {" 0000:02:00.0": {"driver": "i40e"}, "0000:02:00.1/evil": {"driver": "i40e"}},
        }

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_result_invalid"
    assert result["devices_info"] is None


def test_daemon_devices_info_rejects_oversized_result_without_fake_devices(tmp_path: Path) -> None:
    oversized_devices = {"0000:02:00.0": {"payload": "x" * DAEMON_JSON_RESULT_MAX_BYTES}}

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_devices_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": oversized_devices}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_devices_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_devices_info_result_too_large"
    assert result["devices_info"] is None


def test_daemon_metadata_reports_invalid_result_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not metadata fields"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_non_object_field_entries_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {
            "jsonrpc": "2.0",
            "id": payload["id"],
            "result": [{"id": "interfaces", "name": "interfaces", "type": "STRING"}, "bad field"],
        }

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_missing_field_type_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_unknown_field_type_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces", "type": "DEVICE"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_blank_field_name_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": " ", "type": "STRING"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_missing_field_id_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"name": "interfaces", "type": "STRING"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_blank_field_id_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": " ", "name": "interfaces", "type": "STRING"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


@pytest.mark.parametrize(
    "field_update",
    [
        {"id": " interfaces"},
        {"id": "interfaces\x00"},
        {"name": "Interfaces "},
        {"name": "Inter\x00faces"},
        {"type": " STRING"},
        {"mandatory_if_not_set": " dest_mac"},
        {"mandatory_if_not_set": "dest_mac\x00"},
    ],
)
def test_daemon_metadata_rejects_dirty_field_strings_without_device_rpc(
    tmp_path: Path,
    field_update: dict[str, object],
) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces", "type": "STRING", **field_update}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


@pytest.mark.parametrize(
    "field_update",
    [
        {"description": ["not", "text"]},
        {"default": {"not": "scalar"}},
        {"default": float("nan")},
        {"mandatory": "true"},
        {"mandatory_if_not_set": ""},
    ],
)
def test_daemon_metadata_rejects_invalid_optional_field_shapes_without_device_rpc(
    tmp_path: Path,
    field_update: dict[str, object],
) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces", "type": "STRING", **field_update}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_nested_non_object_attribute_entries_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [
        {
            "id": "interfaces",
            "name": "interfaces",
            "type": "OBJECT",
            "attributes": [{"id": "src", "name": "src", "type": "STRING"}, "bad child"],
        }
    ]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_object_without_attributes_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interface", "name": "interface", "type": "OBJECT"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_object_with_non_list_attributes_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interface", "name": "interface", "type": "OBJECT", "attributes": "bad attributes"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_non_object_list_item_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces", "type": "LIST", "item": "bad item"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_list_without_item_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces", "type": "LIST"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_rejects_enum_without_values_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "mode", "name": "mode", "type": "ENUM"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


@pytest.mark.parametrize(
    "enum_values",
    [
        [],
        [""],
        [" stateless"],
        ["state\x00less"],
        [None],
        [{"label": "stateless"}],
        [["stateless"]],
        [float("nan")],
    ],
)
def test_daemon_metadata_rejects_invalid_enum_values_without_device_rpc(
    tmp_path: Path,
    enum_values: list[object],
) -> None:
    calls: list[str] = []
    metadata = [{"id": "mode", "name": "mode", "type": "ENUM", "values": enum_values}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_invalid"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_accepts_nested_object_fields_with_real_devices_info(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [
        {
            "id": "interfaces",
            "name": "interfaces",
            "type": "LIST",
            "item": {
                "name": "interface",
                "type": "OBJECT",
                "attributes": [{"id": "src", "name": "src", "type": "STRING"}],
            },
        },
        {
            "id": "mode",
            "name": "mode",
            "type": "ENUM",
            "values": ["stateless", 1, True],
            "default": 1,
            "mandatory": False,
            "description": "TRex mode",
        },
    ]
    devices_info = {"0000:02:00.0": {"description": "NIC"}}

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": devices_info}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is True
    assert result["blocker"] is None
    assert result["metadata"] == metadata
    assert result["devices_info"] == devices_info
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_metadata_rejects_oversized_metadata_without_device_rpc(tmp_path: Path) -> None:
    calls: list[str] = []
    oversized_metadata = [
        {"id": "interfaces", "name": "interfaces", "type": "STRING", "payload": "x" * DAEMON_JSON_RESULT_MAX_BYTES}
    ]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "get_trex_config_metadata"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": oversized_metadata}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_metadata_result_too_large"
    assert result["metadata"] is None
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata"]


def test_daemon_metadata_reports_invalid_devices_info_without_fake_devices(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [{"id": "interfaces", "name": "interfaces", "type": "STRING"}],
            }
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [{"Slot": "0000:02:00.0"}]}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is True
    assert result["blocker"] == "daemon_devices_info_result_invalid"
    assert result["metadata"] == [{"id": "interfaces", "name": "interfaces", "type": "STRING"}]
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_metadata_rejects_dirty_device_slots_without_fake_devices(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [{"id": "interfaces", "name": "interfaces", "type": "STRING"}],
            }
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"0000:02:00.0\x00": {"driver": "i40e"}}}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is True
    assert result["blocker"] == "daemon_devices_info_result_invalid"
    assert result["metadata"] == [{"id": "interfaces", "name": "interfaces", "type": "STRING"}]
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_metadata_preserves_metadata_when_devices_info_rpc_fails(tmp_path: Path) -> None:
    calls: list[str] = []
    metadata = [{"id": "interfaces", "name": "interfaces", "type": "STRING"}]

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": metadata}
        if payload["method"] == "get_devices_info":
            raise OSError("devices unavailable")
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is True
    assert result["blocker"] == "daemon_devices_info_unavailable"
    assert result["error"] == "devices unavailable"
    assert result["metadata"] == metadata
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_metadata_rejects_oversized_devices_info_without_fake_devices(tmp_path: Path) -> None:
    calls: list[str] = []
    oversized_devices = {"0000:02:00.0": {"payload": "x" * DAEMON_JSON_RESULT_MAX_BYTES}}

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_trex_config_metadata":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [{"id": "interfaces", "name": "interfaces", "type": "STRING"}],
            }
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": oversized_devices}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_metadata()

    assert result["ok"] is True
    assert result["blocker"] == "daemon_devices_info_result_too_large"
    assert result["metadata"] == [{"id": "interfaces", "name": "interfaces", "type": "STRING"}]
    assert result["devices_info"] is None
    assert calls == ["get_trex_config_metadata", "get_devices_info"]


def test_daemon_files_list_uses_real_daemon_files_path_then_lists(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex_files"}
        if payload["method"] == "get_files_list":
            assert payload["params"] == {"path": "/tmp/trex_files"}
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [["configs"], ["trex_cfg.yaml"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list()

    assert result["ok"] is True
    assert result["source"] == "daemon:get_files_list"
    assert result["path"] == "/tmp/trex_files"
    assert result["directories"] == ["configs"]
    assert result["files"] == ["trex_cfg.yaml"]
    assert [call["method"] for call in calls] == ["get_files_path", "get_files_list"]


def test_daemon_files_list_rejects_blank_daemon_files_path_without_list_rpc(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": " \n"}
        raise AssertionError("blank daemon files path should not call get_files_list")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_result_invalid"
    assert result["path"] is None
    assert result["directories"] is None
    assert result["files"] is None
    assert calls == ["get_files_path"]


def test_daemon_files_list_rejects_relative_daemon_files_path_without_list_rpc(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "tmp/trex_files"}
        raise AssertionError("relative daemon files path should not call get_files_list")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_result_invalid"
    assert result["path"] is None
    assert result["directories"] is None
    assert result["files"] is None
    assert calls == ["get_files_path"]


def test_daemon_files_list_reports_invalid_result_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": ["files only"]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_non_string_entries_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [[{"name": "configs"}], ["unit.log"]]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_blank_entries_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [["configs"], [" \n"]]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_edge_whitespace_entries_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [[" configs"], ["unit.log "]]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_nul_entries_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [["configs"], ["unit\x00.log"]]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_path_like_entries_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [["../configs"], ["nested/unit.log"]]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_oversized_entries_without_fake_files(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_files_list"
        assert payload["params"] == {"path": "/tmp/trex_files"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": [["configs"], ["x" * (DAEMON_FILE_PATH_MAX_CHARS + 1)]]}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_list_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_non_string_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("non-string files path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list(123)

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_nul_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing files path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("/tmp/trex_files\x00unit")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_whitespace_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("blank files path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list(" ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_missing"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_edge_whitespace_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("whitespace-padded files path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list(" /tmp/trex_files ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_invalid"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_relative_request_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("relative files path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list("tmp/trex_files")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_invalid"
    assert result["error"] == "files path must be absolute"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_oversized_request_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized files path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list(
        "/" + ("x" * DAEMON_FILE_PATH_MAX_CHARS)
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_too_long"
    assert result["directories"] is None
    assert result["files"] is None


def test_daemon_files_list_rejects_oversized_daemon_files_path_without_list_rpc(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/" + ("x" * DAEMON_FILE_PATH_MAX_CHARS)}
        raise AssertionError("oversized daemon files path should not call get_files_list")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_files_list()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_result_invalid"
    assert result["directories"] is None
    assert result["files"] is None
    assert calls == ["get_files_path"]


def test_daemon_file_content_decodes_real_daemon_rpc_result(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        assert payload["method"] == "get_file"
        assert payload["params"] == {"filepath": "/tmp/trex_files/unit.log"}
        encoded = base64.b64encode(b"first\nsecond\nthird\n").decode("ascii")
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content(
        "/tmp/trex_files/unit.log",
        max_bytes=12,
    )

    assert result["ok"] is True
    assert result["source"] == "daemon:get_file"
    assert result["path"] == "/tmp/trex_files/unit.log"
    assert result["max_bytes"] == 12
    assert result["size_bytes"] == len(b"first\nsecond\nthird\n")
    assert result["truncated"] is True
    assert result["content"] == "first\nsecond"
    assert result["content_base64"] == base64.b64encode(b"first\nsecond").decode("ascii")
    assert calls[0]["method"] == "get_file"


def test_daemon_file_content_reports_decode_error_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_file"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not base64"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content("/tmp/trex_files/unit.log")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_decode_failed"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_non_string_result_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_file"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"content": "unit"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content("/tmp/trex_files/unit.log")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_result_invalid"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_oversized_result_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"x" * (DAEMON_FILE_CONTENT_MAX_BYTES + 1)).decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_file"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content("/tmp/trex_files/unit.log")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_result_too_large"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_invalid_max_bytes_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid max_bytes should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content(
        "/tmp/trex_files/unit.log",
        max_bytes=0,
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_max_bytes_invalid"
    assert result["max_bytes"] == 0
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_non_string_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("non-string file path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content(123)

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_path_invalid"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_nul_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing file path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content("/tmp/trex_files\x00unit.log")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_path_invalid"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_empty_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("empty path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content(" ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_path_missing"
    assert result["content"] == ""


def test_daemon_file_content_rejects_edge_whitespace_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("whitespace-padded file path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content(" /tmp/trex_files/unit.log ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_path_invalid"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_relative_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("relative file path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content("tmp/trex_files/unit.log")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_path_invalid"
    assert result["error"] == "file path must be absolute"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_file_content_rejects_oversized_path_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized file path should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_file_content(
        "/" + ("x" * DAEMON_FILE_PATH_MAX_CHARS)
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_file_path_too_long"
    assert result["content"] == ""
    assert result["content_base64"] == ""


def test_daemon_trex_runtime_status_uses_real_daemon_rpc_methods(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if payload["method"] == "get_trex_cmds":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [["123", "./_t-rex-64 --cfg cfg"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is True
    assert result["source"] == "daemon:trex_runtime_status"
    assert result["running"] is True
    assert result["status"] == {"state": 3, "verbose": "Running"}
    assert result["commands"] == [["123", "./_t-rex-64 --cfg cfg"]]
    assert calls == ["is_running", "get_running_status", "get_trex_cmds"]


def test_daemon_trex_runtime_status_reports_invalid_running_result(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "is_running"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "yes"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_running_result_invalid"
    assert result["running"] is None


def test_daemon_trex_runtime_status_reports_invalid_status_without_cmds(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "running"}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["running"] is True
    assert result["status"] is None
    assert result["commands"] is None
    assert result["blocker"] == "daemon_running_status_result_invalid"
    assert calls == ["is_running", "get_running_status"]


def test_daemon_trex_runtime_status_rejects_missing_status_fields_without_cmds(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3}}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["running"] is True
    assert result["status"] is None
    assert result["commands"] is None
    assert result["blocker"] == "daemon_running_status_result_invalid"
    assert calls == ["is_running", "get_running_status"]


def test_daemon_trex_runtime_status_rejects_unknown_status_state_without_cmds(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 0, "verbose": "Idle"}}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["running"] is True
    assert result["status"] is None
    assert result["commands"] is None
    assert result["blocker"] == "daemon_running_status_result_invalid"
    assert calls == ["is_running", "get_running_status"]


def test_daemon_trex_runtime_status_rejects_non_string_verbose_without_cmds(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": None}}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["running"] is True
    assert result["status"] is None
    assert result["commands"] is None
    assert result["blocker"] == "daemon_running_status_result_invalid"
    assert calls == ["is_running", "get_running_status"]


def test_daemon_trex_runtime_status_rejects_malformed_command_entries(tmp_path: Path) -> None:
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if payload["method"] == "get_trex_cmds":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [["123"], ["", "./_t-rex-64"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["running"] is True
    assert result["status"] == {"state": 3, "verbose": "Running"}
    assert result["commands"] is None
    assert result["blocker"] == "daemon_trex_cmds_result_invalid"
    assert calls == ["is_running", "get_running_status", "get_trex_cmds"]


def test_daemon_trex_runtime_status_rejects_non_numeric_command_pid(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if payload["method"] == "get_trex_cmds":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [["pid-123", "./_t-rex-64"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_trex_cmds_result_invalid"
    assert result["commands"] is None


def test_daemon_trex_runtime_status_rejects_dirty_command_text(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if payload["method"] == "get_trex_cmds":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": [["123", " ./_t-rex-64"], ["124", "./_t-rex-64\x00"]]}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_runtime_status()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_trex_cmds_result_invalid"
    assert result["commands"] is None


def test_daemon_trex_version_decodes_real_daemon_rpc_result(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        encoded = base64.b64encode(b"Version : unit\n").decode("ascii")
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_version()

    assert result["ok"] is True
    assert result["source"] == "daemon:get_trex_version"
    assert result["version"] == "Version : unit"
    assert calls[0]["method"] == "get_trex_version"


def test_daemon_trex_version_rejects_non_string_result_without_fake_version(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_version"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"version": "Version : unit"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_version()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_version_result_invalid"
    assert result["version"] is None


def test_daemon_trex_version_reports_decode_error_without_fake_version(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_version"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not base64"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_version()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_version_decode_failed"
    assert result["version"] is None


def test_daemon_trex_version_rejects_invalid_utf8_without_fake_version(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"Version : \xff\n").decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_version"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_version()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_version_decode_failed"
    assert result["version"] is None


def test_daemon_trex_version_rejects_blank_content_without_fake_version(tmp_path: Path) -> None:
    encoded = base64.b64encode(b" \n\t\n").decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_version"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_version()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_version_result_invalid"
    assert result["error"] == "daemon version content must not be blank"
    assert result["version"] is None


def test_daemon_trex_version_rejects_oversized_result_without_fake_version(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"x" * (DAEMON_VERSION_MAX_BYTES + 1)).decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_version"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_version()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_version_result_too_large"
    assert result["version"] is None


def test_daemon_trex_log_from_rpc_loads_base64_tail_without_fake_content(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        encoded = base64.b64encode(b"boot\nrun\nstop\n").decode("ascii")
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_log_from_rpc(max_bytes=9)

    assert result["ok"] is True
    assert result["source"] == "daemon:get_trex_log"
    assert result["max_bytes"] == 9
    assert result["truncated"] is True
    assert "stop" in result["content"]
    assert calls[0]["method"] == "get_trex_log"


def test_daemon_trex_log_from_rpc_rejects_non_string_result_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_log"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"content": "TRex log\n"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_log_from_rpc()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_trex_log_result_invalid"
    assert result["content"] == ""


def test_daemon_trex_log_from_rpc_reports_decode_error_without_fake_content(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_log"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "not base64"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_log_from_rpc()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_trex_log_decode_failed"
    assert result["content"] == ""


def test_daemon_trex_log_from_rpc_rejects_oversized_result_without_fake_content(tmp_path: Path) -> None:
    encoded = base64.b64encode(b"x" * (DAEMON_LOG_MAX_BYTES + 1)).decode("ascii")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_trex_log"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_log_from_rpc()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_trex_log_result_too_large"
    assert result["content"] == ""


def test_daemon_trex_log_from_rpc_rejects_invalid_max_bytes_without_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid max_bytes should not call TRex log RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_log_from_rpc(max_bytes=0)

    assert result["ok"] is False
    assert result["blocker"] == "daemon_trex_log_max_bytes_invalid"
    assert result["max_bytes"] == 0
    assert result["content"] == ""


def test_daemon_trex_running_info_decodes_real_daemon_rpc_json(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '{"m_tx_bps": 1000}'}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_running_info()

    assert result["ok"] is True
    assert result["source"] == "daemon:get_running_info"
    assert result["data"] == {"m_tx_bps": 1000}
    assert calls[0]["method"] == "get_running_info"


def test_daemon_trex_running_info_rejects_non_string_result_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_running_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"m_tx_bps": 1000}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_running_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_running_info_result_invalid"
    assert result["data"] is None


def test_daemon_trex_running_info_reports_decode_error_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_running_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "{not json"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_running_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_running_info_decode_failed"
    assert result["data"] is None


def test_daemon_trex_running_info_rejects_non_finite_json_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_running_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '{"latency": NaN}'}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_running_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_running_info_decode_failed"
    assert result["error"] == "daemon JSON contains non-finite number: NaN"
    assert result["data"] is None


def test_daemon_trex_running_info_rejects_oversized_json_string_without_fake_data(tmp_path: Path) -> None:
    oversized_json = '{"payload":"' + ("x" * DAEMON_JSON_RESULT_MAX_BYTES) + '"}'

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_running_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": oversized_json}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_running_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_running_info_result_too_large"
    assert result["data"] is None


def test_daemon_trex_running_info_rejects_json_array_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_running_info"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '[{"m_tx_bps": 1000}]'}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_running_info()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_running_info_result_invalid"
    assert result["data"] is None


def test_daemon_trex_latest_dump_decodes_real_daemon_rpc_json(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '{"trex-global": {"data": {"m_tx_bps": 1000}}}'}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_latest_dump()

    assert result["ok"] is True
    assert result["source"] == "daemon:get_latest_dump"
    assert result["data"] == {"trex-global": {"data": {"m_tx_bps": 1000}}}
    assert calls[0]["method"] == "get_latest_dump"


def test_daemon_trex_latest_dump_rejects_non_string_result_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_latest_dump"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": {"trex-global": {"data": {}}}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_latest_dump()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_latest_dump_result_invalid"
    assert result["data"] is None


def test_daemon_trex_latest_dump_reports_decode_error_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_latest_dump"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "{not json"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_latest_dump()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_latest_dump_decode_failed"
    assert result["data"] is None


def test_daemon_trex_latest_dump_rejects_non_finite_json_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_latest_dump"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '{"trex-global": {"latency": Infinity}}'}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_latest_dump()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_latest_dump_decode_failed"
    assert result["error"] == "daemon JSON contains non-finite number: Infinity"
    assert result["data"] is None


def test_daemon_trex_latest_dump_rejects_oversized_json_string_without_fake_data(tmp_path: Path) -> None:
    oversized_json = '{"payload":"' + ("x" * DAEMON_JSON_RESULT_MAX_BYTES) + '"}'

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_latest_dump"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": oversized_json}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_latest_dump()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_latest_dump_result_too_large"
    assert result["data"] is None


def test_daemon_trex_latest_dump_rejects_json_array_without_fake_data(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "get_latest_dump"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": '[{"trex-global": {"data": {}}}]'}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_latest_dump()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_latest_dump_result_invalid"
    assert result["data"] is None


def test_daemon_trex_reservation_uses_real_daemon_rpc_method(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reservation()

    assert result["ok"] is True
    assert result["source"] == "daemon:is_reserved"
    assert result["reserved"] is True
    assert calls[0]["method"] == "is_reserved"


def test_daemon_trex_reservation_reports_invalid_result_without_fake_state(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "is_reserved"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "no"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reservation()

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_result_invalid"
    assert result["reserved"] is None


def test_daemon_trex_reserve_calls_real_daemon_rpc_with_user(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        assert payload["method"] == "reserve_trex"
        assert payload["params"] == {"user": "lab-user"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve("lab-user")

    assert result["ok"] is True
    assert result["source"] == "daemon:reserve_trex"
    assert result["user"] == "lab-user"
    assert result["reserved"] is True
    assert calls[0]["method"] == "reserve_trex"


def test_daemon_trex_reserve_defaults_to_runtime_user(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "lab/user")
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        assert payload["method"] == "reserve_trex"
        assert payload["params"] == {"user": "lab/user"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve()

    assert result["ok"] is True
    assert result["user"] == "lab/user"
    assert calls[0]["params"] == {"user": "lab/user"}


def test_daemon_trex_reserve_rejects_blank_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("blank reserve user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve(" ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_missing"
    assert result["user"] == " "
    assert result["reserved"] is None


def test_daemon_trex_reserve_rejects_edge_whitespace_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("whitespace-padded reserve user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve(" lab-user ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_invalid"
    assert result["error"] == "reservation user must not have leading or trailing whitespace"
    assert result["user"] == " lab-user "
    assert result["reserved"] is None


def test_daemon_trex_reserve_rejects_non_string_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("non-string reserve user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve(123)

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_invalid"
    assert result["user"] == 123
    assert result["reserved"] is None


def test_daemon_trex_reserve_rejects_nul_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing reserve user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve("lab\x00user")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_invalid"
    assert result["user"] == "lab\x00user"
    assert result["reserved"] is None


def test_daemon_trex_reserve_rejects_oversized_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized reserve user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve(
        "x" * (DAEMON_RESERVATION_USER_MAX_CHARS + 1)
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_too_long"
    assert result["reserved"] is None


def test_daemon_trex_reserve_reports_daemon_fault_without_fake_state(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "reserve_trex"
        return {"jsonrpc": "2.0", "id": payload["id"], "error": {"message": "already reserved"}}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve("other")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reserve_trex_failed"
    assert result["reserved"] is None
    assert result["error"] == "already reserved"


def test_daemon_trex_reserve_reports_false_result_with_blocker(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "reserve_trex"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_reserve("lab-user")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reserve_trex_not_reserved"
    assert result["reserved"] is False
    assert result["result"] is False


def test_daemon_trex_cancel_reservation_calls_real_daemon_rpc(tmp_path: Path) -> None:
    calls: list[dict[str, object]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        assert payload["method"] == "cancel_reservation"
        assert payload["params"] == {"user": "lab-user"}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation("lab-user")

    assert result["ok"] is True
    assert result["source"] == "daemon:cancel_reservation"
    assert result["user"] == "lab-user"
    assert result["canceled"] is True
    assert calls[0]["method"] == "cancel_reservation"


def test_daemon_trex_cancel_reservation_reports_false_result_with_blocker(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "cancel_reservation"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation("lab-user")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_cancel_reservation_not_canceled"
    assert result["canceled"] is False
    assert result["result"] is False


def test_daemon_trex_cancel_reservation_rejects_blank_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("blank cancel user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation("")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_missing"
    assert result["user"] == ""
    assert result["canceled"] is None


def test_daemon_trex_cancel_reservation_rejects_edge_whitespace_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("whitespace-padded cancel user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation(" lab-user ")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_invalid"
    assert result["error"] == "reservation user must not have leading or trailing whitespace"
    assert result["user"] == " lab-user "
    assert result["canceled"] is None


def test_daemon_trex_cancel_reservation_rejects_non_string_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("non-string cancel user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation(123)

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_invalid"
    assert result["user"] == 123
    assert result["canceled"] is None


def test_daemon_trex_cancel_reservation_rejects_nul_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing cancel user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation("lab\x00user")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_invalid"
    assert result["user"] == "lab\x00user"
    assert result["canceled"] is None


def test_daemon_trex_cancel_reservation_rejects_oversized_user_before_rpc(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized cancel user should not call daemon RPC")

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_cancel_reservation(
        "x" * (DAEMON_RESERVATION_USER_MAX_CHARS + 1)
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_reservation_user_too_long"
    assert result["canceled"] is None


def test_daemon_trex_start_pushes_config_and_starts_stateless_trex(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "lab/user")
    calls: list[dict[str, object]] = []
    rpc_timeouts: dict[str, float] = {}
    environment = env(tmp_path)
    manager = RuntimeManager(environment)
    assert manager.daemon_config_filename() == "lab_user"
    config_filename = manager.daemon_start_config_filename("lab/user", b"port_limit: 2\n")
    assert config_filename == "lab_user-8d1a6db7c5b1.yaml"

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(payload)
        method = payload["method"]
        rpc_timeouts[str(method)] = timeout
        if method == "push_file":
            params = payload["params"]
            assert isinstance(params, dict)
            assert base64.b64decode(str(params["bin_data"])).decode("ascii") == "port_limit: 2\n"
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if method == "start_trex":
            params = payload["params"]
            assert isinstance(params, dict)
            assert params["stateless"] is True
            assert params["timeout"] == 55
            assert params["user"] == "lab/user"
            assert params["trex_cmd_options"] == {"cfg": f"/tmp/trex-files/{config_filename}"}
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 17}
        raise AssertionError(f"unexpected method {method}")

    manager = RuntimeManager(environment, rpc_caller=rpc_caller)
    result = manager.daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
        timeout_seconds=55,
    )

    assert result["ok"] is True
    assert [call["method"] for call in calls] == ["push_file", "get_files_path", "start_trex"]
    assert result["config_uploaded"] is True
    assert result["user"] == "lab/user"
    assert result["timeout_seconds"] == 55
    assert result["rpc_timeout_seconds"] == 55 + DAEMON_START_RPC_GRACE_SECONDS
    assert rpc_timeouts == {
        "push_file": 3.0,
        "get_files_path": 3.0,
        "start_trex": float(55 + DAEMON_START_RPC_GRACE_SECONDS),
    }
    assert result["sequence"] == 17
    assert result["result"] == 17
    assert isinstance(result["config_version"], dict)
    assert result["config_version"]["source"] == "start"
    assert result["config_version"]["size_bytes"] == len(b"port_limit: 2\n")
    assert result["audit_written"] is True
    audit_record = result["audit_record"]
    assert isinstance(audit_record, dict)
    assert audit_record["action"] == "start"
    assert audit_record["config_path"] == f"/tmp/trex-files/{config_filename}"
    assert audit_record["version_name"] == result["config_version"]["name"]
    assert audit_record["version_sha256"] == result["config_version"]["sha256"]
    assert audit_record["sequence"] == 17

    audit = manager.daemon_config_audit()
    assert audit["ok"] is True
    assert audit["records"] == [audit_record]


def test_daemon_trex_start_recovers_http_timeout_only_after_runtime_command_and_config_hash_match(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "lab/user")
    environment = env(tmp_path)
    manager = RuntimeManager(environment)
    config_content = "port_limit: 6\n"
    config_bytes = config_content.encode()
    config_filename = manager.daemon_start_config_filename("lab/user", config_bytes)
    config_path = f"/tmp/trex-files/{config_filename}"
    calls: list[tuple[str, float]] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        method = str(payload["method"])
        calls.append((method, timeout))
        if method == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if method == "start_trex":
            raise httpx.ReadTimeout("start response timed out")
        if method == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if method == "get_trex_cmds":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [["9321", f"./_t-rex-64 -i --cfg {config_path} --no-key"]],
            }
        if method == "get_file":
            params = payload["params"]
            assert isinstance(params, dict)
            assert params["filepath"] == config_path
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": base64.b64encode(config_bytes).decode(),
            }
        raise AssertionError(f"unexpected method {method}")

    manager = RuntimeManager(environment, rpc_caller=rpc_caller)
    result = manager.daemon_trex_start(
        confirmation="start-trex",
        config_content=config_content,
        timeout_seconds=40,
    )

    assert result["ok"] is True
    assert result["blocker"] is None
    assert result["error"] is None
    assert result["sequence"] is None
    assert result["result"] is None
    assert result["recovered_from_timeout"] is True
    assert result["rpc_timeout_seconds"] == 40 + DAEMON_START_RPC_GRACE_SECONDS
    reconciliation = result["reconciliation"]
    assert isinstance(reconciliation, dict)
    assert reconciliation["ok"] is True
    assert reconciliation["running"] is True
    assert reconciliation["command_matches"] is True
    assert reconciliation["config_hash_matches"] is True
    assert reconciliation["expected_config_sha256"] == hashlib.sha256(config_bytes).hexdigest()
    assert reconciliation["observed_config_sha256"] == reconciliation["expected_config_sha256"]
    assert calls == [
        ("push_file", 3.0),
        ("get_files_path", 3.0),
        ("start_trex", float(40 + DAEMON_START_RPC_GRACE_SECONDS)),
        ("is_running", 3.0),
        ("get_running_status", 3.0),
        ("get_trex_cmds", 3.0),
        ("get_file", 3.0),
    ]
    audit_record = result["audit_record"]
    assert isinstance(audit_record, dict)
    assert audit_record["sequence"] is None
    assert audit_record["recovered_from_timeout"] is True
    assert audit_record["reconciliation"] == {
        "running": True,
        "status": {"state": 3, "verbose": "Running"},
        "matched_command": f"./_t-rex-64 -i --cfg {config_path} --no-key",
        "expected_config_sha256": hashlib.sha256(config_bytes).hexdigest(),
        "observed_config_sha256": hashlib.sha256(config_bytes).hexdigest(),
    }
    audit = manager.daemon_config_audit()
    assert audit["ok"] is True
    assert audit["records"] == [audit_record]


def test_daemon_trex_start_keeps_timeout_failure_when_reconciled_config_hash_differs(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "root")
    environment = env(tmp_path)
    config_content = "port_limit: 6\n"
    config_bytes = config_content.encode()
    config_filename = RuntimeManager(environment).daemon_start_config_filename("root", config_bytes)
    config_path = f"/tmp/trex-files/{config_filename}"

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        method = payload["method"]
        if method == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if method == "start_trex":
            raise httpx.ReadTimeout("start response timed out")
        if method == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if method == "get_trex_cmds":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [["9321", f"./_t-rex-64 -i --cfg={config_path} --no-key"]],
            }
        if method == "get_file":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": base64.b64encode(b"port_limit: 2\n").decode(),
            }
        raise AssertionError(f"unexpected method {method}")

    manager = RuntimeManager(environment, rpc_caller=rpc_caller)
    result = manager.daemon_trex_start(
        confirmation="start-trex",
        config_content=config_content,
        timeout_seconds=40,
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_rpc_timeout"
    assert result["sequence"] is None
    assert result["recovered_from_timeout"] is False
    reconciliation = result["reconciliation"]
    assert isinstance(reconciliation, dict)
    assert reconciliation["ok"] is False
    assert reconciliation["command_matches"] is True
    assert reconciliation["config_hash_matches"] is False
    assert reconciliation["blocker"] == "daemon_start_reconciliation_config_hash_mismatch"
    assert result["audit_written"] is False
    assert manager.daemon_config_audit()["records"] == []


def test_daemon_trex_start_keeps_timeout_failure_when_running_command_uses_other_config(
    tmp_path: Path,
) -> None:
    environment = env(tmp_path)
    methods: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        method = str(payload["method"])
        methods.append(method)
        if method == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if method == "start_trex":
            raise httpx.ReadTimeout("start response timed out")
        if method == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 3, "verbose": "Running"}}
        if method == "get_trex_cmds":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [["9321", "./_t-rex-64 -i --cfg /tmp/trex-files/other.yaml --no-key"]],
            }
        raise AssertionError(f"unexpected method {method}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 6\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_rpc_timeout"
    reconciliation = result["reconciliation"]
    assert isinstance(reconciliation, dict)
    assert reconciliation["blocker"] == "daemon_start_reconciliation_command_mismatch"
    assert "get_file" not in methods


def test_daemon_trex_start_requires_confirmation_before_config_or_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 2\n", encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("daemon TRex start should require confirmation before RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start()

    assert result["ok"] is False
    assert result["blocker"] == "confirmation_required"
    assert result["error"] == "confirmation token required: start-trex"
    assert result["config_uploaded"] is False
    assert result["sequence"] is None


def test_daemon_config_filename_uses_default_for_dot_only_user(tmp_path: Path) -> None:
    manager = RuntimeManager(env(tmp_path))

    assert manager.daemon_config_filename(".") == "trex-webui"
    assert manager.daemon_config_filename("..") == "trex-webui"
    assert manager.daemon_config_filename("...") == "trex-webui"
    assert manager.daemon_config_filename("../lab") == ".._lab"


def test_daemon_trex_start_uses_safe_default_config_filename(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "..")
    environment = env(tmp_path)
    config_filename = RuntimeManager(environment).daemon_start_config_filename("..", b"port_limit: 2\n")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "push_file":
            params = payload["params"]
            assert isinstance(params, dict)
            assert params["filename"] == config_filename
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if payload["method"] == "start_trex":
            params = payload["params"]
            assert isinstance(params, dict)
            assert params["trex_cmd_options"] == {"cfg": f"/tmp/trex-files/{config_filename}"}
            assert params["user"] == ".."
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 23}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is True
    assert result["config_filename"] == config_filename
    assert result["trex_cmd_options"] == {"cfg": f"/tmp/trex-files/{config_filename}"}


def test_daemon_trex_start_serializes_transactions_across_manager_instances(tmp_path: Path) -> None:
    environment = env(tmp_path)
    first_entered_rpc = threading.Event()
    release_first = threading.Event()
    second_attempting_start = threading.Event()
    second_entered_rpc = threading.Event()
    uploaded: dict[str, bytes] = {}
    results: dict[str, dict[str, object]] = {}
    errors: list[BaseException] = []

    def rpc_caller(label: str, sequence: int):
        def call(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
            method = payload["method"]
            if method == "push_file":
                if label == "first":
                    first_entered_rpc.set()
                    assert release_first.wait(timeout=2)
                else:
                    second_entered_rpc.set()
                params = payload["params"]
                assert isinstance(params, dict)
                filename = str(params["filename"])
                uploaded[filename] = base64.b64decode(str(params["bin_data"]))
                return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
            if method == "get_files_path":
                return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
            if method == "start_trex":
                params = payload["params"]
                assert isinstance(params, dict)
                cfg = str(params["trex_cmd_options"]["cfg"])
                assert uploaded[Path(cfg).name]
                return {"jsonrpc": "2.0", "id": payload["id"], "result": sequence}
            raise AssertionError(f"unexpected method {method}")

        return call

    def start(label: str, content: str, sequence: int) -> None:
        try:
            if label == "second":
                second_attempting_start.set()
            results[label] = RuntimeManager(environment, rpc_caller=rpc_caller(label, sequence)).daemon_trex_start(
                confirmation="start-trex",
                config_content=content,
            )
        except BaseException as exc:  # pragma: no cover - asserted through the parent thread
            errors.append(exc)

    first = threading.Thread(target=start, args=("first", "port_limit: 2\n", 17))
    second = threading.Thread(target=start, args=("second", "port_limit: 4\n", 23))
    first.start()
    assert first_entered_rpc.wait(timeout=2)
    second.start()
    assert second_attempting_start.wait(timeout=2)
    assert not second_entered_rpc.wait(timeout=0.1)

    release_first.set()
    first.join(timeout=2)
    second.join(timeout=2)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert results["first"]["ok"] is True
    assert results["second"]["ok"] is True
    assert results["first"]["config_filename"] != results["second"]["config_filename"]
    for result in results.values():
        audit_record = result["audit_record"]
        config_version = result["config_version"]
        assert isinstance(audit_record, dict)
        assert isinstance(config_version, dict)
        assert audit_record["version_sha256"] == config_version["sha256"]
        assert Path(str(audit_record["config_path"])).name == result["config_filename"]


def test_daemon_trex_start_reports_false_config_upload_without_start(tmp_path: Path) -> None:
    environment = env(tmp_path)
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "push_file"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_upload_failed"
    assert result["error"] == "TRex Daemon IO error"
    assert result["config_uploaded"] is False
    assert result["sequence"] is None
    assert calls == ["push_file"]


def test_daemon_trex_start_rejects_invalid_config_upload_result_without_start(tmp_path: Path) -> None:
    environment = env(tmp_path)
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        assert payload["method"] == "push_file"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "ok"}

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_upload_result_invalid"
    assert result["error"] == "daemon did not return a boolean config upload result"
    assert result["config_uploaded"] is False
    assert result["sequence"] is None
    assert calls == ["push_file"]


def test_daemon_trex_start_uses_real_config_snapshot_when_request_has_no_content(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 8\n", encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "push_file":
            params = payload["params"]
            assert isinstance(params, dict)
            assert base64.b64decode(str(params["bin_data"])).decode("ascii") == "port_limit: 8\n"
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if payload["method"] == "start_trex":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 31}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex")

    assert result["ok"] is True
    assert result["timeout_seconds"] == 3
    assert result["sequence"] == 31


def test_daemon_trex_start_uploads_utf8_config_content(tmp_path: Path) -> None:
    environment = env(tmp_path)
    config_content = "port_limit: 2\n# lab note: 测试\n"

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "push_file":
            params = payload["params"]
            assert isinstance(params, dict)
            assert base64.b64decode(str(params["bin_data"])).decode("utf-8") == config_content
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if payload["method"] == "start_trex":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 47}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content=config_content)

    assert result["ok"] is True
    assert result["config_uploaded"] is True
    assert result["sequence"] == 47


def test_daemon_trex_start_rejects_invalid_request_timeout_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid start timeout should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
        timeout_seconds=0,
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_timeout_invalid"
    assert result["timeout_seconds"] is None
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_invalid_environment_timeout_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment = TrexEnvironment(
        host=environment.host,
        sync_port=environment.sync_port,
        async_port=environment.async_port,
        daemon_port=environment.daemon_port,
        scripts_dir=environment.scripts_dir,
        daemon_bin=environment.daemon_bin,
        config_path=environment.config_path,
        daemon_log=environment.daemon_log,
        profile_roots=environment.profile_roots,
        command_timeout_seconds=0,
        require_confirmation=environment.require_confirmation,
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid environment timeout should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_timeout_invalid"
    assert result["timeout_seconds"] is None
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_invalid_configured_timeout_before_rpc(tmp_path: Path) -> None:
    environment = replace(
        env(tmp_path),
        configuration_errors={"TREX_WEBUI_COMMAND_TIMEOUT_SECONDS": "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer"},
    )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid configured start timeout should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_timeout_invalid"
    assert result["error"] == "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer"
    assert result["timeout_seconds"] is None
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_oversized_runtime_user_before_rpc(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "x" * (DAEMON_RESERVATION_USER_MAX_CHARS + 1))
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized daemon start user should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_user_too_long"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_nul_runtime_user_before_rpc(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("app.trex.runtime.getpass.getuser", lambda: "lab\x00user")
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing daemon start user should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_user_invalid"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_blank_request_content_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 8\n", encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("blank request config should not fall back or call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content=" \n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_missing"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_generated_error_preview_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("generated config error previews should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="\n### errors in config:\n# Field port_limit (port_limit) is mandatory\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_invalid_generated"
    assert result["error"] == "generated config preview contains validation errors"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_non_string_request_content_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 8\n", encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("non-string request config should not fall back or call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content=b"port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_invalid"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_nul_request_content_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing request config should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n\x00")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_invalid"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_blank_real_config_snapshot_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("\n", encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("blank real config should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_missing"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_nul_real_config_snapshot_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 2\n\x00", encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("NUL-containing real config should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_invalid"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_oversized_config_content_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized config content should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(
        confirmation="start-trex",
        config_content="x" * (DAEMON_CONFIG_MAX_BYTES + 1)
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_too_large"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_oversized_real_config_snapshot_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("x" * (DAEMON_CONFIG_MAX_BYTES + 1), encoding="utf-8")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("oversized real config should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_too_large"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_invalid_utf8_real_config_before_rpc(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_bytes(b"port_limit: 2\n# invalid: \xff\n")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("invalid UTF-8 real config should not call daemon RPC")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex")

    assert result["ok"] is False
    assert result["blocker"] == "config_decode_failed"
    assert result["config_uploaded"] is False


def test_daemon_trex_start_rejects_blank_daemon_files_path_before_start(tmp_path: Path) -> None:
    environment = env(tmp_path)
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": " \n"}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_unavailable"
    assert result["config_uploaded"] is True
    assert result["files_path"] is None
    assert result["trex_cmd_options"] is None
    assert calls == ["push_file", "get_files_path"]


def test_daemon_trex_start_rejects_relative_daemon_files_path_before_start(tmp_path: Path) -> None:
    environment = env(tmp_path)
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "tmp/trex_files"}
        raise AssertionError("relative daemon files path should not call start_trex")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_unavailable"
    assert result["config_uploaded"] is True
    assert result["files_path"] is None
    assert result["trex_cmd_options"] is None
    assert calls == ["push_file", "get_files_path"]


def test_daemon_trex_start_rejects_oversized_daemon_files_path_before_start(tmp_path: Path) -> None:
    environment = env(tmp_path)
    calls: list[str] = []

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        calls.append(str(payload["method"]))
        if payload["method"] == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/" + ("x" * DAEMON_FILE_PATH_MAX_CHARS)}
        raise AssertionError("oversized daemon files path should not call start_trex")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_files_path_unavailable"
    assert result["config_uploaded"] is True
    assert result["files_path"] is None
    assert result["trex_cmd_options"] is None
    assert calls == ["push_file", "get_files_path"]


def test_daemon_trex_start_rejects_invalid_sequence_without_fake_success(tmp_path: Path) -> None:
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if payload["method"] == "start_trex":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "started"}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_sequence_invalid"
    assert result["sequence"] is None
    assert result["result"] == "started"


def test_daemon_trex_start_rejects_zero_sequence_without_fake_success(tmp_path: Path) -> None:
    environment = env(tmp_path)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if payload["method"] == "start_trex":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 0}
        raise AssertionError(f"unexpected method {payload['method']}")

    result = RuntimeManager(environment, rpc_caller=rpc_caller).daemon_trex_start(confirmation="start-trex", config_content="port_limit: 2\n")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_start_sequence_invalid"
    assert result["error"] == "daemon did not return a positive integer TRex run sequence"
    assert result["sequence"] is None
    assert result["result"] == 0


def test_daemon_trex_start_closes_backend_stl_session_immediately_before_start_rpc(tmp_path: Path) -> None:
    events: list[str] = []

    def lifecycle_disconnect() -> TrexCallResult:
        events.append("disconnect_stl")
        return TrexCallResult(True, data={"disconnected": True, "stats_sampler_closed": True})

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        method = str(payload["method"])
        events.append(method)
        if method == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        if method == "start_trex":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": 17}
        raise AssertionError(f"unexpected method {method}")

    result = RuntimeManager(
        env(tmp_path),
        rpc_caller=rpc_caller,
        lifecycle_disconnect=lifecycle_disconnect,
    ).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
    )

    assert result["ok"] is True
    assert result["lifecycle_managed"] is True
    assert result["stl_disconnect"] == {
        "ok": True,
        "data": {"disconnected": True, "stats_sampler_closed": True},
        "blocker": None,
        "error": None,
    }
    assert events == ["push_file", "get_files_path", "disconnect_stl", "start_trex"]


def test_daemon_trex_start_blocks_daemon_mutation_when_stl_cleanup_fails(tmp_path: Path) -> None:
    methods: list[str] = []

    def lifecycle_disconnect() -> TrexCallResult:
        return TrexCallResult(
            False,
            data={"phase": "capture_remove", "remaining_capture_ids": [7]},
            blocker="trex_disconnect_cleanup_failed",
            error="capture 7 could not be removed",
        )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        method = str(payload["method"])
        methods.append(method)
        if method == "push_file":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if method == "get_files_path":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": "/tmp/trex-files"}
        raise AssertionError("start_trex must not run after STL lifecycle cleanup fails")

    result = RuntimeManager(
        env(tmp_path),
        rpc_caller=rpc_caller,
        lifecycle_disconnect=lifecycle_disconnect,
    ).daemon_trex_start(
        confirmation="start-trex",
        config_content="port_limit: 2\n",
    )

    assert result["ok"] is False
    assert result["blocker"] == "trex_disconnect_cleanup_failed"
    assert result["error"] == "capture 7 could not be removed"
    assert result["stl_disconnect"]["data"]["remaining_capture_ids"] == [7]
    assert methods == ["push_file", "get_files_path"]


def test_daemon_trex_stop_requires_confirmation_before_force_kill(tmp_path: Path) -> None:
    lifecycle_calls: list[bool] = []

    def lifecycle_disconnect() -> TrexCallResult:
        lifecycle_calls.append(True)
        return TrexCallResult(True)

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("daemon TRex stop should require confirmation before RPC")

    result = RuntimeManager(
        env(tmp_path),
        rpc_caller=rpc_caller,
        lifecycle_disconnect=lifecycle_disconnect,
    ).daemon_trex_stop()

    assert result["ok"] is False
    assert result["blocker"] == "confirmation_required"
    assert result["error"] == "confirmation token required: stop-trex"
    assert lifecycle_calls == []


def test_daemon_trex_stop_calls_force_kill_after_confirmation(tmp_path: Path) -> None:
    events: list[str] = []

    def lifecycle_disconnect() -> TrexCallResult:
        events.append("disconnect_stl")
        return TrexCallResult(True, data={"disconnected": True})

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        events.append(str(payload["method"]))
        assert payload["method"] == "force_trex_kill"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": True}

    result = RuntimeManager(
        env(tmp_path),
        rpc_caller=rpc_caller,
        lifecycle_disconnect=lifecycle_disconnect,
    ).daemon_trex_stop(confirmation="stop-trex")

    assert result["ok"] is True
    assert result["stopped"] is True
    assert events == ["disconnect_stl", "force_trex_kill"]


def test_daemon_trex_stop_does_not_force_kill_when_stl_cleanup_fails(tmp_path: Path) -> None:
    def lifecycle_disconnect() -> TrexCallResult:
        return TrexCallResult(
            False,
            data={"phase": "service_mode_restore"},
            blocker="trex_disconnect_cleanup_failed",
            error="service mode restore failed",
        )

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        raise AssertionError("force_trex_kill must not run after STL lifecycle cleanup fails")

    result = RuntimeManager(
        env(tmp_path),
        rpc_caller=rpc_caller,
        lifecycle_disconnect=lifecycle_disconnect,
    ).daemon_trex_stop(confirmation="stop-trex")

    assert result["ok"] is False
    assert result["stopped"] is None
    assert result["blocker"] == "trex_disconnect_cleanup_failed"
    assert result["error"] == "service mode restore failed"


def test_daemon_trex_stop_reports_false_result_as_not_running(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "force_trex_kill"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": False}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_stop(confirmation="stop-trex")

    assert result["ok"] is True
    assert result["blocker"] is None
    assert result["error"] is None
    assert result["stopped"] is False
    assert result["result"] is False


def test_daemon_trex_stop_reports_invalid_result_without_fake_success(tmp_path: Path) -> None:
    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        assert payload["method"] == "force_trex_kill"
        return {"jsonrpc": "2.0", "id": payload["id"], "result": "stopped"}

    result = RuntimeManager(env(tmp_path), rpc_caller=rpc_caller).daemon_trex_stop(confirmation="stop-trex")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_stop_result_invalid"
    assert result["stopped"] is None
    assert result["result"] == "stopped"


def test_config_snapshot_reads_real_yaml_file(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 2\n", encoding="utf-8")

    snapshot = RuntimeManager(environment).config_snapshot()

    assert snapshot["exists"] is True
    assert snapshot["readable"] is True
    assert snapshot["max_bytes"] == 131_072
    assert snapshot["content"] == "port_limit: 2\n"
    assert snapshot["blocker"] is None


def test_config_snapshot_preview_replaces_invalid_utf8_bytes(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_bytes(b"port_limit: 2\n# invalid: \xff\n")

    snapshot = RuntimeManager(environment).config_snapshot()

    assert snapshot["readable"] is True
    assert snapshot["decode_errors"] == "replace"
    assert "invalid: \ufffd" in str(snapshot["content"])
    assert snapshot["blocker"] is None


def test_config_snapshot_reports_missing_file(tmp_path: Path) -> None:
    snapshot = RuntimeManager(env(tmp_path)).config_snapshot()

    assert snapshot["exists"] is False
    assert snapshot["blocker"] == "config_missing"


def test_config_snapshot_rejects_relative_config_path_without_file_read(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), config_path=Path("trex_cfg.yaml"))

    snapshot = RuntimeManager(environment).config_snapshot()

    assert snapshot["readable"] is False
    assert snapshot["exists"] is False
    assert snapshot["blocker"] == "config_path_invalid"


def test_config_snapshot_rejects_invalid_max_bytes_without_file_read(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 2\n", encoding="utf-8")

    snapshot = RuntimeManager(environment).config_snapshot(max_bytes=0)

    assert snapshot["exists"] is False
    assert snapshot["readable"] is False
    assert snapshot["blocker"] == "config_max_bytes_invalid"
    assert snapshot["max_bytes"] == 0
    assert snapshot["content"] == ""


def test_daemon_config_version_save_list_load_and_diff(tmp_path: Path) -> None:
    environment = env(tmp_path)
    manager = RuntimeManager(environment)

    saved = manager.daemon_config_version_save(
        config_content="port_limit: 2\ninterfaces: ['0000:02:00.0']\n",
        source="manual",
        note="unit candidate",
    )

    assert saved["ok"] is True
    version = saved["version"]
    assert isinstance(version, dict)
    assert version["source"] == "manual"
    assert version["note"] == "unit candidate"
    assert version["size_bytes"] == len("port_limit: 2\ninterfaces: ['0000:02:00.0']\n".encode("utf-8"))

    versions = manager.daemon_config_versions()
    assert versions["ok"] is True
    assert versions["versions"] == [version]

    loaded = manager.daemon_config_version_load(version["name"])
    assert loaded["ok"] is True
    assert loaded["content"] == "port_limit: 2\ninterfaces: ['0000:02:00.0']\n"

    diff = manager.daemon_config_version_diff(version["name"], config_content="port_limit: 4\n")
    assert diff["ok"] is True
    assert diff["version"] == version
    assert "--- " in str(diff["diff"])
    assert "-port_limit: 2\n" in str(diff["diff"])
    assert "+port_limit: 4\n" in str(diff["diff"])


def test_daemon_config_version_save_rejects_generated_error_preview(tmp_path: Path) -> None:
    result = RuntimeManager(env(tmp_path)).daemon_config_version_save(
        config_content="### errors in config:\n# bad interface\n",
        source="manual",
    )

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_content_invalid_generated"
    assert result["saved"] is False


def test_daemon_config_version_load_rejects_path_escape(tmp_path: Path) -> None:
    result = RuntimeManager(env(tmp_path)).daemon_config_version_load("../trex_cfg.yaml")

    assert result["ok"] is False
    assert result["blocker"] == "daemon_config_version_name_invalid"


def test_daemon_config_version_restore_backs_up_current_file_and_writes_audit(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 2\n", encoding="utf-8")
    manager = RuntimeManager(environment)
    saved = manager.daemon_config_version_save(
        config_content="port_limit: 4\n",
        source="manual",
        note="restore target",
    )
    assert saved["ok"] is True
    version = saved["version"]
    assert isinstance(version, dict)

    result = manager.daemon_config_version_restore(version["name"], confirmation="restore-config")

    assert result["ok"] is True
    assert result["restored"] is True
    assert environment.config_path.read_text(encoding="utf-8") == "port_limit: 4\n"
    assert result["restored_version"] == version
    before_version = result["before_version"]
    assert isinstance(before_version, dict)
    assert before_version["source"] == "restore_before"
    assert before_version["size_bytes"] == len(b"port_limit: 2\n")
    assert result["audit_written"] is True
    audit_record = result["audit_record"]
    assert isinstance(audit_record, dict)
    assert audit_record["action"] == "restore"
    assert audit_record["restored_name"] == version["name"]
    assert audit_record["before_name"] == before_version["name"]
    audit_path = environment.daemon_log.parent / "config-versions" / "audit.jsonl"
    assert audit_path.is_file()
    audit_lines = audit_path.read_text(encoding="utf-8").splitlines()
    assert len(audit_lines) == 1
    assert json.loads(audit_lines[0])["restored_name"] == version["name"]
    audit = manager.daemon_config_audit()
    assert audit["ok"] is True
    assert audit["audit_path"] == str(audit_path)
    assert audit["records"] == [audit_record]
    assert audit["skipped_lines"] == 0


def test_daemon_config_audit_skips_invalid_jsonl_records(tmp_path: Path) -> None:
    environment = env(tmp_path)
    manager = RuntimeManager(environment)
    root = manager.ensure_daemon_config_versions_root(manager.daemon_config_version_payload("unit"))
    assert root is not None
    valid = {
        "action": "restore",
        "created_at": "2026-06-08T00:00:00+00:00",
        "config_path": str(environment.config_path),
        "restored_name": "20260608T000000000000Z-manual-aaaaaaaaaaaa.yaml",
        "restored_sha256": "a" * 64,
        "before_name": None,
        "host": environment.host,
        "daemon_port": environment.daemon_port,
    }
    (root / "audit.jsonl").write_text(
        "not-json\n"
        + json.dumps({"action": "restore", "created_at": "x"}, sort_keys=True)
        + "\n"
        + json.dumps(valid, sort_keys=True)
        + "\n",
        encoding="utf-8",
    )

    audit = manager.daemon_config_audit()

    assert audit["ok"] is True
    assert audit["records"] == [valid]
    assert audit["skipped_lines"] == 2


def test_daemon_config_audit_accepts_start_records(tmp_path: Path) -> None:
    environment = env(tmp_path)
    manager = RuntimeManager(environment)
    root = manager.ensure_daemon_config_versions_root(manager.daemon_config_version_payload("unit"))
    assert root is not None
    valid = {
        "action": "start",
        "created_at": "2026-06-08T00:00:00+00:00",
        "config_path": "/tmp/trex-files/unit",
        "version_name": "20260608T000000000000Z-start-aaaaaaaaaaaa.yaml",
        "version_sha256": "a" * 64,
        "sequence": 17,
        "config_filename": "unit",
        "files_path": "/tmp/trex-files",
        "user": "unit",
        "host": environment.host,
        "daemon_port": environment.daemon_port,
    }
    (root / "audit.jsonl").write_text(json.dumps(valid, sort_keys=True) + "\n", encoding="utf-8")

    audit = manager.daemon_config_audit()

    assert audit["ok"] is True
    assert audit["records"] == [valid]
    assert audit["skipped_lines"] == 0


def test_daemon_config_version_restore_requires_confirmation_before_file_write(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("port_limit: 2\n", encoding="utf-8")
    manager = RuntimeManager(environment)
    saved = manager.daemon_config_version_save(config_content="port_limit: 4\n")
    assert saved["ok"] is True
    version = saved["version"]
    assert isinstance(version, dict)

    result = manager.daemon_config_version_restore(version["name"])

    assert result["ok"] is False
    assert result["blocker"] == "confirmation_required"
    assert environment.config_path.read_text(encoding="utf-8") == "port_limit: 2\n"


def test_daemon_log_tail_reads_tail_from_real_file(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.daemon_log.write_text("first\nsecond\nthird\n", encoding="utf-8")

    tail = RuntimeManager(environment).daemon_log_tail(max_bytes=12)

    assert tail["exists"] is True
    assert tail["readable"] is True
    assert tail["max_bytes"] == 12
    assert tail["truncated"] is True
    assert "third" in tail["content"]


def test_daemon_log_tail_rejects_relative_log_path_without_file_read(tmp_path: Path) -> None:
    environment = replace(env(tmp_path), daemon_log=Path("trex_daemon_server.log"))

    tail = RuntimeManager(environment).daemon_log_tail()

    assert tail["readable"] is False
    assert tail["exists"] is False
    assert tail["blocker"] == "log_path_invalid"


def test_daemon_log_tail_rejects_invalid_max_bytes_without_file_read(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.daemon_log.write_text("first\nsecond\nthird\n", encoding="utf-8")

    tail = RuntimeManager(environment).daemon_log_tail(max_bytes=0)

    assert tail["exists"] is False
    assert tail["readable"] is False
    assert tail["blocker"] == "log_max_bytes_invalid"
    assert tail["max_bytes"] == 0
    assert tail["content"] == ""


def test_daemon_overview_combines_real_runtime_sources(tmp_path: Path) -> None:
    environment = env(tmp_path)
    environment.config_path.write_text("version: 2\n", encoding="utf-8")
    environment.daemon_log.write_text("daemon ready\n", encoding="utf-8")

    def runner(command: list[str], cwd: Path, timeout: int) -> CommandResult:
        return CommandResult(command, 0, "TRex server daemon is running\n", "")

    def rpc_caller(url: str, payload: dict[str, object], timeout: float) -> dict[str, object]:
        if payload["method"] == "connectivity_check":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": True}
        if payload["method"] == "get_trex_config_metadata":
            return {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": [{"id": "port_limit", "name": "port_limit", "type": "NUMBER"}],
            }
        if payload["method"] == "get_devices_info":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"0000:02:00.0": {"description": "nic"}}}
        if payload["method"] == "get_trex_daemon_log":
            encoded = base64.b64encode(b"rpc daemon ready\n").decode("ascii")
            return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}
        if payload["method"] == "is_running":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": False}
        if payload["method"] == "get_running_status":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": {"state": 1, "verbose": "Idle"}}
        if payload["method"] == "get_trex_cmds":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": []}
        if payload["method"] == "get_trex_version":
            encoded = base64.b64encode(b"Version : unit\n").decode("ascii")
            return {"jsonrpc": "2.0", "id": payload["id"], "result": encoded}
        if payload["method"] == "is_reserved":
            return {"jsonrpc": "2.0", "id": payload["id"], "result": False}
        raise AssertionError(f"unexpected method {payload['method']}")

    overview = RuntimeManager(environment, runner=runner, rpc_caller=rpc_caller).daemon_overview()

    assert overview["environment"]["daemon_port"] == 8090
    assert overview["status"]["running"] is True
    assert overview["rpc"]["connected"] is True
    assert overview["trex"]["running"] is False
    assert overview["trex"]["status"] == {"state": 1, "verbose": "Idle"}
    assert overview["trex_version"]["version"] == "Version : unit"
    assert overview["trex_reservation"]["reserved"] is False
    assert overview["metadata"]["metadata"] == [{"id": "port_limit", "name": "port_limit", "type": "NUMBER"}]
    assert overview["previews"]["restart"]["requires_confirmation"] is True
    assert overview["config"]["content"] == "version: 2\n"
    assert overview["log"]["source"] == "local:daemon_log"
    assert overview["log"]["content"] == "daemon ready\n"
