from __future__ import annotations

import os
import re
import shlex
import threading
from dataclasses import dataclass, field, replace
from ipaddress import ip_address
from pathlib import Path
from typing import Optional

PROJECT_DOTENV = Path(__file__).resolve().parents[4] / ".env"
ENV_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
HOSTNAME_PATTERN = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$"
)
TREX_HOST_ERROR = "TREX_WEBUI_TREX_HOST must be a clean hostname or IP address without scheme, path, credentials, or port"
TREX_PORT_ERROR = "TRex connection ports must be integers between 1 and 65535"
TREX_CLIENT_NAME_ERROR = "TREX_WEBUI_TREX_CLIENT_NAME must be clean non-empty text up to 64 characters"
TREX_CONNECT_TIMEOUT_ERROR = "TREX_WEBUI_TREX_TIMEOUT_SECONDS must be an integer between 1 and 300"
DAEMON_SUPERVISOR_ERROR = "TREX_WEBUI_DAEMON_SUPERVISOR must be external or systemd"
MANAGED_LOCAL_CONNECTION_ERROR = (
    "managed systemd mode pins the TRex connection to "
    "127.0.0.1:4501/4500/4507; use external-daemon mode for a remote target"
)
_runtime_connection_lock = threading.RLock()
_runtime_connection: "TrexConnectionSettings | None" = None
_runtime_connection_state_path: Path | None = None
_runtime_connection_state_supervisor: str | None = None
_runtime_connection_state_error: str | None = None


def _strip_unquoted_comment(value: str) -> str:
    for index, char in enumerate(value):
        if char == "#" and (index == 0 or value[index - 1].isspace()):
            return value[:index].rstrip()
    return value


def _parse_dotenv_value(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return _strip_unquoted_comment(value)


def _project_dotenv_values() -> dict[str, str]:
    if not PROJECT_DOTENV.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in PROJECT_DOTENV.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not ENV_NAME_PATTERN.fullmatch(key):
            continue
        values[key] = _parse_dotenv_value(raw_value)
    return values


def _env(name: str, dotenv_values: dict[str, str]) -> Optional[str]:
    raw = os.getenv(name)
    if raw is not None:
        return raw
    return dotenv_values.get(name)


def _int_env(name: str, default: int, dotenv_values: dict[str, str], configuration_errors: dict[str, str]) -> int:
    raw = _env(name, dotenv_values)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        configuration_errors[name] = f"{name} must be an integer"
        return default


def _connection_port_error(value: object) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return TREX_PORT_ERROR
    if value < 1 or value > 65535:
        return TREX_PORT_ERROR
    return None


def _connect_timeout_error(value: object) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return TREX_CONNECT_TIMEOUT_ERROR
    if value < 1 or value > 300:
        return TREX_CONNECT_TIMEOUT_ERROR
    return None


def _client_name_error(value: object) -> str | None:
    if not isinstance(value, str):
        return TREX_CLIENT_NAME_ERROR
    if value.strip() == "" or value != value.strip() or len(value) > 64 or "\x00" in value:
        return TREX_CLIENT_NAME_ERROR
    if any(ord(char) < 32 for char in value):
        return TREX_CLIENT_NAME_ERROR
    return None


def trex_host_error(value: object) -> str | None:
    if not isinstance(value, str):
        return TREX_HOST_ERROR
    if value.strip() == "" or value != value.strip() or "\x00" in value:
        return TREX_HOST_ERROR
    if "://" in value or "/" in value or "@" in value:
        return TREX_HOST_ERROR
    if value.startswith("[") or value.endswith("]"):
        return TREX_HOST_ERROR
    try:
        ip_address(value)
        return None
    except ValueError:
        pass
    if ":" in value:
        return TREX_HOST_ERROR
    if HOSTNAME_PATTERN.fullmatch(value):
        return None
    return TREX_HOST_ERROR


def format_host_for_url(host: str) -> str:
    try:
        parsed = ip_address(host)
    except ValueError:
        return host
    if parsed.version == 6:
        return f"[{host}]"
    return host


@dataclass(frozen=True)
class TrexConnectionSettings:
    host: str
    sync_port: int
    async_port: int
    scapy_port: int
    client_name: str
    connect_timeout_seconds: int


def _validated_connection_settings(
    host: str,
    sync_port: int,
    async_port: int,
    scapy_port: int,
    client_name: str,
    connect_timeout_seconds: int,
) -> TrexConnectionSettings:
    host_error = trex_host_error(host)
    if host_error is not None:
        raise ValueError(host_error)
    for port in (sync_port, async_port, scapy_port):
        port_error = _connection_port_error(port)
        if port_error is not None:
            raise ValueError(port_error)
    client_name_error = _client_name_error(client_name)
    if client_name_error is not None:
        raise ValueError(client_name_error)
    timeout_error = _connect_timeout_error(connect_timeout_seconds)
    if timeout_error is not None:
        raise ValueError(timeout_error)
    return TrexConnectionSettings(
        host=host,
        sync_port=sync_port,
        async_port=async_port,
        scapy_port=scapy_port,
        client_name=client_name,
        connect_timeout_seconds=connect_timeout_seconds,
    )


def validate_trex_connection_settings(
    host: str,
    sync_port: int,
    async_port: int,
    scapy_port: int,
    client_name: str = "Client1",
    connect_timeout_seconds: int = 3,
) -> TrexConnectionSettings:
    return _validated_connection_settings(
        host=host,
        sync_port=sync_port,
        async_port=async_port,
        scapy_port=scapy_port,
        client_name=client_name,
        connect_timeout_seconds=connect_timeout_seconds,
    )


def validate_runtime_trex_connection_settings(
    *,
    environment: "TrexEnvironment",
    host: str,
    sync_port: int,
    async_port: int,
    scapy_port: int,
    client_name: str = "Client1",
    connect_timeout_seconds: int = 3,
) -> TrexConnectionSettings:
    settings = validate_trex_connection_settings(
        host=host,
        sync_port=sync_port,
        async_port=async_port,
        scapy_port=scapy_port,
        client_name=client_name,
        connect_timeout_seconds=connect_timeout_seconds,
    )
    if environment.daemon_supervisor == "systemd" and (
        settings.host,
        settings.sync_port,
        settings.async_port,
        settings.scapy_port,
    ) != ("127.0.0.1", 4501, 4500, 4507):
        raise ValueError(MANAGED_LOCAL_CONNECTION_ERROR)
    return settings


def set_runtime_trex_connection(
    host: str,
    sync_port: int,
    async_port: int,
    scapy_port: int,
    client_name: str = "Client1",
    connect_timeout_seconds: int = 3,
    persist: bool = False,
) -> TrexEnvironment:
    global _runtime_connection, _runtime_connection_state_error, _runtime_connection_state_path
    global _runtime_connection_state_supervisor
    base_environment = TrexEnvironment.from_env()
    settings = validate_runtime_trex_connection_settings(
        environment=base_environment,
        host=host,
        sync_port=sync_port,
        async_port=async_port,
        scapy_port=scapy_port,
        client_name=client_name,
        connect_timeout_seconds=connect_timeout_seconds,
    )
    if persist:
        from app.trex.runtime_state import (
            RuntimeConnectionState,
            RuntimeStateDocument,
            RuntimeStateError,
            RuntimeStateStore,
            utc_now_iso,
        )

        store = RuntimeStateStore(base_environment.runtime_state_path)

        def update_connection(state: RuntimeStateDocument) -> RuntimeStateDocument:
            if state.traffic_mutation_intent is not None:
                raise RuntimeStateError(
                    "cannot change the runtime connection while a traffic "
                    "mutation requires recovery"
                )
            if state.capture_leases:
                raise RuntimeStateError(
                    "cannot change the runtime connection while managed capture recorders exist"
                )
            if (
                state.traffic_session is not None
                and state.traffic_session.state in {"running", "paused", "mixed", "unknown"}
            ):
                raise RuntimeStateError(
                    "cannot change the runtime connection while traffic is active or uncertain"
                )
            state.connection = RuntimeConnectionState(
                host=settings.host,
                sync_port=settings.sync_port,
                async_port=settings.async_port,
                scapy_port=settings.scapy_port,
                client_name=settings.client_name,
                connect_timeout_seconds=settings.connect_timeout_seconds,
                updated_at=utc_now_iso(),
            )
            return state

        store.update(update_connection)
    with _runtime_connection_lock:
        _runtime_connection = settings
        _runtime_connection_state_path = base_environment.runtime_state_path
        _runtime_connection_state_supervisor = base_environment.daemon_supervisor
        _runtime_connection_state_error = None
    return _environment_with_runtime_connection(base_environment, settings)


def clear_runtime_trex_connection() -> None:
    global _runtime_connection, _runtime_connection_state_error, _runtime_connection_state_path
    global _runtime_connection_state_supervisor
    with _runtime_connection_lock:
        _runtime_connection = None
        _runtime_connection_state_path = None
        _runtime_connection_state_supervisor = None
        _runtime_connection_state_error = None


def _host_env(name: str, default: str, dotenv_values: dict[str, str], configuration_errors: dict[str, str]) -> str:
    raw = _env(name, dotenv_values)
    if raw is None or raw == "":
        return default
    error = trex_host_error(raw)
    if error is not None:
        configuration_errors[name] = error
    return raw


def _bool_env(name: str, default: bool, dotenv_values: dict[str, str]) -> bool:
    raw = _env(name, dotenv_values)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _daemon_supervisor_env(
    name: str,
    default: str,
    dotenv_values: dict[str, str],
    configuration_errors: dict[str, str],
) -> str:
    raw = _env(name, dotenv_values)
    value = default if raw is None or raw == "" else raw
    if value not in {"external", "systemd"}:
        configuration_errors[name] = DAEMON_SUPERVISOR_ERROR
    return value


def _client_name_env(name: str, default: str, dotenv_values: dict[str, str], configuration_errors: dict[str, str]) -> str:
    raw = _env(name, dotenv_values)
    value = default if raw is None or raw == "" else raw
    error = _client_name_error(value)
    if error is not None:
        configuration_errors[name] = error
    return value


def _connect_timeout_env(name: str, default: int, dotenv_values: dict[str, str], configuration_errors: dict[str, str]) -> int:
    value = _int_env(name, default, dotenv_values, configuration_errors)
    if name in configuration_errors:
        return value
    error = _connect_timeout_error(value)
    if error is not None:
        configuration_errors[name] = error
    return value


def _path_list_env(name: str, default: list[Path], dotenv_values: dict[str, str]) -> list[Path]:
    raw = _env(name, dotenv_values)
    if raw is None or raw.strip() == "":
        return default
    return [Path(part).expanduser() for part in raw.split(":") if part.strip()]


def _command_env(name: str, dotenv_values: dict[str, str], configuration_errors: dict[str, str]) -> list[str]:
    raw = _env(name, dotenv_values)
    if raw is None or raw.strip() == "":
        return []
    try:
        command = shlex.split(raw.strip())
    except ValueError as exc:
        configuration_errors[name] = f"{name} must be a valid shell-like command: {exc}"
        return []
    if not command or any(part.strip() == "" or "\x00" in part for part in command):
        configuration_errors[name] = f"{name} must be a clean command"
        return []
    executable = command[0]
    if ("/" in executable or "\\" in executable) and not Path(executable).is_absolute():
        configuration_errors[name] = f"{name} executable must be absolute or a PATH executable name"
        return []
    return command


def _path_text_is_clean(path: Path) -> bool:
    value = str(path)
    return value.strip() != "" and value == value.strip() and "\x00" not in value


def _path_exists(path: Path) -> bool:
    if not _path_text_is_clean(path):
        return False
    try:
        return path.exists()
    except (OSError, ValueError):
        return False


def _path_parent_exists(path: Path) -> bool:
    if not _path_text_is_clean(path):
        return False
    try:
        return path.parent.exists()
    except (OSError, ValueError):
        return False


def _path_is_clean_absolute(path: Path) -> bool:
    return _path_text_is_clean(path) and path.is_absolute()


@dataclass(frozen=True)
class TrexEnvironment:
    host: str
    sync_port: int
    async_port: int
    daemon_port: int
    scripts_dir: Path
    daemon_bin: Path
    config_path: Path
    daemon_log: Path
    profile_roots: list[Path]
    command_timeout_seconds: int
    require_confirmation: bool
    daemon_supervisor: str = "external"
    scapy_port: int = 4507
    client_name: str = "Client1"
    connect_timeout_seconds: int = 3
    capture_open_command: list[str] = field(default_factory=list)
    configuration_errors: dict[str, str] = field(default_factory=dict)
    runtime_state_path: Path = Path("/var/lib/trex-webui/runtime-state.json")
    daemon_generation_path: Path = Path("/run/trex-webui/daemon-generation")

    @classmethod
    def from_env(cls) -> "TrexEnvironment":
        dotenv_values = _project_dotenv_values()
        configuration_errors: dict[str, str] = {}
        scripts_dir = Path(_env("TREX_WEBUI_TREX_SCRIPTS_DIR", dotenv_values) or "/opt/trex-core/scripts")
        return cls(
            host=_host_env("TREX_WEBUI_TREX_HOST", "127.0.0.1", dotenv_values, configuration_errors),
            sync_port=_int_env("TREX_WEBUI_TREX_SYNC_PORT", 4501, dotenv_values, configuration_errors),
            async_port=_int_env("TREX_WEBUI_TREX_ASYNC_PORT", 4500, dotenv_values, configuration_errors),
            daemon_port=_int_env("TREX_WEBUI_TREX_DAEMON_PORT", 8090, dotenv_values, configuration_errors),
            scripts_dir=scripts_dir,
            daemon_bin=Path(_env("TREX_WEBUI_TREX_DAEMON_BIN", dotenv_values) or str(scripts_dir / "trex_daemon_server")),
            config_path=Path(_env("TREX_WEBUI_TREX_CONFIG_PATH", dotenv_values) or "/etc/trex_cfg.yaml"),
            daemon_log=Path(_env("TREX_WEBUI_TREX_DAEMON_LOG", dotenv_values) or "/var/log/trex/trex_daemon_server.log"),
            profile_roots=_path_list_env(
                "TREX_WEBUI_PROFILE_ROOTS",
                [scripts_dir / "stl", Path.cwd() / "profiles"],
                dotenv_values,
            ),
            command_timeout_seconds=_int_env(
                "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS",
                20,
                dotenv_values,
                configuration_errors,
            ),
            require_confirmation=_bool_env("TREX_WEBUI_REQUIRE_CONFIRMATION", True, dotenv_values),
            daemon_supervisor=_daemon_supervisor_env(
                "TREX_WEBUI_DAEMON_SUPERVISOR",
                "external",
                dotenv_values,
                configuration_errors,
            ),
            scapy_port=_int_env("TREX_WEBUI_TREX_SCAPY_PORT", 4507, dotenv_values, configuration_errors),
            client_name=_client_name_env("TREX_WEBUI_TREX_CLIENT_NAME", "Client1", dotenv_values, configuration_errors),
            connect_timeout_seconds=_connect_timeout_env(
                "TREX_WEBUI_TREX_TIMEOUT_SECONDS",
                3,
                dotenv_values,
                configuration_errors,
            ),
            capture_open_command=_command_env(
                "TREX_WEBUI_CAPTURE_OPEN_COMMAND",
                dotenv_values,
                configuration_errors,
            ),
            configuration_errors=configuration_errors,
            runtime_state_path=Path(
                _env("TREX_WEBUI_RUNTIME_STATE_PATH", dotenv_values)
                or "/var/lib/trex-webui/runtime-state.json"
            ),
            daemon_generation_path=Path(
                _env("TREX_WEBUI_DAEMON_GENERATION_PATH", dotenv_values)
                or "/run/trex-webui/daemon-generation"
            ),
        )

    def readiness(self) -> dict[str, object]:
        return {
            "host": self.host,
            "sync_port": self.sync_port,
            "async_port": self.async_port,
            "scapy_port": self.scapy_port,
            "client_name": self.client_name,
            "connect_timeout_seconds": self.connect_timeout_seconds,
            "daemon_port": self.daemon_port,
            "scripts_dir": str(self.scripts_dir),
            "daemon_bin": str(self.daemon_bin),
            "config_path": str(self.config_path),
            "daemon_log": str(self.daemon_log),
            "profile_roots": [str(path) for path in self.profile_roots],
            "host_valid": trex_host_error(self.host) is None and "TREX_WEBUI_TREX_HOST" not in self.configuration_errors,
            "scripts_dir_path_valid": _path_is_clean_absolute(self.scripts_dir),
            "daemon_bin_path_valid": _path_is_clean_absolute(self.daemon_bin),
            "config_path_valid": _path_is_clean_absolute(self.config_path),
            "daemon_log_path_valid": _path_is_clean_absolute(self.daemon_log),
            "scripts_dir_exists": _path_exists(self.scripts_dir),
            "daemon_bin_exists": _path_exists(self.daemon_bin),
            "config_parent_exists": _path_parent_exists(self.config_path),
            "daemon_log_parent_exists": _path_parent_exists(self.daemon_log),
            "profile_roots_existing": [str(path) for path in self.profile_roots if _path_exists(path)],
            "command_timeout_seconds": self.command_timeout_seconds,
            "require_confirmation": self.require_confirmation,
            "daemon_supervisor": self.daemon_supervisor,
            "capture_open_command": self.capture_open_command,
            "runtime_state_path": str(self.runtime_state_path),
            "runtime_state_path_valid": _path_is_clean_absolute(self.runtime_state_path),
            "runtime_state_parent_exists": _path_parent_exists(self.runtime_state_path),
            "daemon_generation_path": str(self.daemon_generation_path),
            "daemon_generation_path_valid": _path_is_clean_absolute(
                self.daemon_generation_path
            ),
            "daemon_generation_exists": _path_exists(self.daemon_generation_path),
            "configuration_errors": self.configuration_errors,
        }


def get_environment() -> TrexEnvironment:
    env = TrexEnvironment.from_env()
    _restore_runtime_connection(env)
    with _runtime_connection_lock:
        runtime_connection = _runtime_connection
        runtime_state_error = _runtime_connection_state_error
    if runtime_state_error is not None:
        env = replace(
            env,
            configuration_errors={
                **env.configuration_errors,
                "TREX_WEBUI_RUNTIME_STATE_PATH": runtime_state_error,
            },
        )
    if runtime_connection is None:
        return env
    return _environment_with_runtime_connection(env, runtime_connection)


def _environment_with_runtime_connection(
    env: TrexEnvironment,
    runtime_connection: TrexConnectionSettings,
) -> TrexEnvironment:
    return replace(
        env,
        host=runtime_connection.host,
        sync_port=runtime_connection.sync_port,
        async_port=runtime_connection.async_port,
        scapy_port=runtime_connection.scapy_port,
        client_name=runtime_connection.client_name,
        connect_timeout_seconds=runtime_connection.connect_timeout_seconds,
    )


def _restore_runtime_connection(env: TrexEnvironment) -> None:
    global _runtime_connection, _runtime_connection_state_error, _runtime_connection_state_path
    global _runtime_connection_state_supervisor
    with _runtime_connection_lock:
        if (
            _runtime_connection_state_path == env.runtime_state_path
            and _runtime_connection_state_supervisor == env.daemon_supervisor
        ):
            return
        try:
            from app.trex.runtime_state import RuntimeStateStore

            connection = RuntimeStateStore(env.runtime_state_path).load().connection
            restored = (
                validate_runtime_trex_connection_settings(
                    environment=env,
                    host=connection.host,
                    sync_port=connection.sync_port,
                    async_port=connection.async_port,
                    scapy_port=connection.scapy_port,
                    client_name=connection.client_name,
                    connect_timeout_seconds=connection.connect_timeout_seconds,
                )
                if connection is not None
                else None
            )
        except (OSError, RuntimeError, ValueError) as exc:
            _runtime_connection = None
            _runtime_connection_state_error = str(exc)
        else:
            _runtime_connection = restored
            _runtime_connection_state_error = None
        _runtime_connection_state_path = env.runtime_state_path
        _runtime_connection_state_supervisor = env.daemon_supervisor
