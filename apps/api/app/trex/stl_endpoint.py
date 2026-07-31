from __future__ import annotations

from pathlib import Path

from app.core.settings import TREX_CLIENT_NAME_ERROR, TREX_CONNECT_TIMEOUT_ERROR, TrexEnvironment, trex_host_error


def valid_tcp_port(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 65535


def stl_endpoint_error(env: TrexEnvironment) -> str | None:
    if "TREX_WEBUI_TREX_HOST" in env.configuration_errors:
        return env.configuration_errors["TREX_WEBUI_TREX_HOST"]
    host_error = trex_host_error(env.host)
    if host_error is not None:
        return host_error
    for name in ("TREX_WEBUI_TREX_SYNC_PORT", "TREX_WEBUI_TREX_ASYNC_PORT"):
        if name in env.configuration_errors:
            return env.configuration_errors[name]
    for name in ("TREX_WEBUI_TREX_CLIENT_NAME", "TREX_WEBUI_TREX_TIMEOUT_SECONDS"):
        if name in env.configuration_errors:
            return env.configuration_errors[name]
    if not valid_tcp_port(env.sync_port):
        return "TRex sync port must be between 1 and 65535"
    if not valid_tcp_port(env.async_port):
        return "TRex async port must be between 1 and 65535"
    if env.client_name.strip() == "" or env.client_name != env.client_name.strip() or len(env.client_name) > 64 or "\x00" in env.client_name:
        return TREX_CLIENT_NAME_ERROR
    if any(ord(char) < 32 for char in env.client_name):
        return TREX_CLIENT_NAME_ERROR
    if isinstance(env.connect_timeout_seconds, bool) or not isinstance(env.connect_timeout_seconds, int):
        return TREX_CONNECT_TIMEOUT_ERROR
    if env.connect_timeout_seconds < 1 or env.connect_timeout_seconds > 300:
        return TREX_CONNECT_TIMEOUT_ERROR
    return None


def trex_interactive_path(scripts_dir: Path) -> Path:
    return scripts_dir / "automation" / "trex_control_plane" / "interactive"
