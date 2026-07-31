from __future__ import annotations

from pathlib import Path

import pytest

from app.core import settings
from app.core.settings import TREX_HOST_ERROR, TrexEnvironment
from app.trex.runtime_state import RuntimeConnectionState, RuntimeStateDocument, RuntimeStateStore, utc_now_iso


@pytest.fixture(autouse=True)
def isolate_runtime_state_path(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    monkeypatch.setenv(
        "TREX_WEBUI_RUNTIME_STATE_PATH",
        str(tmp_path / "isolated-runtime-state.json"),
    )
    settings.clear_runtime_trex_connection()
    try:
        yield
    finally:
        settings.clear_runtime_trex_connection()


def test_environment_reads_project_dotenv(monkeypatch, tmp_path: Path) -> None:
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text(
        "\n".join(
            [
                "TREX_WEBUI_TREX_HOST=192.0.2.10",
                "TREX_WEBUI_TREX_SYNC_PORT=4511",
                "TREX_WEBUI_TREX_ASYNC_PORT=4510",
                "TREX_WEBUI_TREX_SCAPY_PORT=4517",
                "TREX_WEBUI_TREX_CLIENT_NAME=LabClient",
                "TREX_WEBUI_TREX_TIMEOUT_SECONDS=11",
                "TREX_WEBUI_TREX_DAEMON_PORT=8091",
                "TREX_WEBUI_PROFILE_ROOTS=/opt/trex-core/scripts/stl:/opt/trex-webui/profiles",
                "TREX_WEBUI_REQUIRE_CONFIRMATION=0",
                "TREX_WEBUI_DAEMON_SUPERVISOR=systemd",
                "TREX_WEBUI_CAPTURE_OPEN_COMMAND=wireshark -r",
                f"TREX_WEBUI_RUNTIME_STATE_PATH={tmp_path / 'runtime-state.json'}",
            ]
        ),
        encoding="utf-8",
    )
    for name in [
        "TREX_WEBUI_TREX_HOST",
        "TREX_WEBUI_TREX_SYNC_PORT",
        "TREX_WEBUI_TREX_ASYNC_PORT",
        "TREX_WEBUI_TREX_SCAPY_PORT",
        "TREX_WEBUI_TREX_CLIENT_NAME",
        "TREX_WEBUI_TREX_TIMEOUT_SECONDS",
        "TREX_WEBUI_TREX_DAEMON_PORT",
        "TREX_WEBUI_PROFILE_ROOTS",
        "TREX_WEBUI_REQUIRE_CONFIRMATION",
        "TREX_WEBUI_DAEMON_SUPERVISOR",
        "TREX_WEBUI_CAPTURE_OPEN_COMMAND",
        "TREX_WEBUI_RUNTIME_STATE_PATH",
    ]:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(settings, "PROJECT_DOTENV", dotenv_path)

    env = TrexEnvironment.from_env()

    assert env.host == "192.0.2.10"
    assert env.sync_port == 4511
    assert env.async_port == 4510
    assert env.scapy_port == 4517
    assert env.client_name == "LabClient"
    assert env.connect_timeout_seconds == 11
    assert env.daemon_port == 8091
    assert env.profile_roots == [Path("/opt/trex-core/scripts/stl"), Path("/opt/trex-webui/profiles")]
    assert env.require_confirmation is False
    assert env.daemon_supervisor == "systemd"
    assert env.capture_open_command == ["wireshark", "-r"]
    assert env.runtime_state_path == tmp_path / "runtime-state.json"


def test_process_environment_overrides_project_dotenv(monkeypatch, tmp_path: Path) -> None:
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text("TREX_WEBUI_TREX_HOST=192.0.2.10\n", encoding="utf-8")
    monkeypatch.setattr(settings, "PROJECT_DOTENV", dotenv_path)
    monkeypatch.setenv("TREX_WEBUI_TREX_HOST", "192.0.2.20")

    env = TrexEnvironment.from_env()

    assert env.host == "192.0.2.20"


def test_runtime_connection_overrides_environment_without_touching_static_paths(monkeypatch, tmp_path: Path) -> None:
    dotenv_path = tmp_path / ".env"
    scripts_dir = tmp_path / "scripts"
    dotenv_path.write_text(
        "\n".join(
            [
                "TREX_WEBUI_TREX_HOST=192.0.2.10",
                "TREX_WEBUI_TREX_SYNC_PORT=4501",
                "TREX_WEBUI_TREX_ASYNC_PORT=4500",
                "TREX_WEBUI_TREX_SCAPY_PORT=4507",
                "TREX_WEBUI_TREX_CLIENT_NAME=Client1",
                "TREX_WEBUI_TREX_TIMEOUT_SECONDS=3",
                f"TREX_WEBUI_TREX_SCRIPTS_DIR={scripts_dir}",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "PROJECT_DOTENV", dotenv_path)
    for name in [
        "TREX_WEBUI_TREX_HOST",
        "TREX_WEBUI_TREX_SYNC_PORT",
        "TREX_WEBUI_TREX_ASYNC_PORT",
        "TREX_WEBUI_TREX_SCAPY_PORT",
        "TREX_WEBUI_TREX_CLIENT_NAME",
        "TREX_WEBUI_TREX_TIMEOUT_SECONDS",
        "TREX_WEBUI_TREX_SCRIPTS_DIR",
    ]:
        monkeypatch.delenv(name, raising=False)

    try:
        runtime_env = settings.set_runtime_trex_connection(
            host="trex.lab",
            sync_port=4511,
            async_port=4510,
            scapy_port=4517,
            client_name="RuntimeClient",
            connect_timeout_seconds=9,
        )
        assert runtime_env.host == "trex.lab"
        assert runtime_env.sync_port == 4511
        assert runtime_env.async_port == 4510
        assert runtime_env.scapy_port == 4517
        assert runtime_env.client_name == "RuntimeClient"
        assert runtime_env.connect_timeout_seconds == 9
        assert runtime_env.scripts_dir == scripts_dir

        current = settings.get_environment()
        assert current.host == "trex.lab"
        assert current.client_name == "RuntimeClient"
        assert current.scripts_dir == scripts_dir
    finally:
        settings.clear_runtime_trex_connection()

    restored = settings.get_environment()
    assert restored.host == "192.0.2.10"
    assert restored.sync_port == 4501
    assert restored.async_port == 4500
    assert restored.scapy_port == 4507
    assert restored.client_name == "Client1"
    assert restored.connect_timeout_seconds == 3


def test_connection_validation_does_not_mutate_runtime_connection() -> None:
    settings.clear_runtime_trex_connection()
    before = settings.get_environment()

    validated = settings.validate_trex_connection_settings(
        host="validated.lab",
        sync_port=4511,
        async_port=4510,
        scapy_port=4517,
        client_name="ValidatedClient",
        connect_timeout_seconds=9,
    )

    after = settings.get_environment()
    assert validated.host == "validated.lab"
    assert validated.client_name == "ValidatedClient"
    assert after.host == before.host
    assert after.sync_port == before.sync_port
    assert after.async_port == before.async_port
    assert after.scapy_port == before.scapy_port
    assert after.client_name == before.client_name
    assert after.connect_timeout_seconds == before.connect_timeout_seconds


def test_persisted_runtime_connection_is_restored_after_process_state_reset(monkeypatch, tmp_path: Path) -> None:
    state_path = tmp_path / "runtime-state.json"
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    settings.clear_runtime_trex_connection()

    try:
        settings.set_runtime_trex_connection(
            host="persistent.trex",
            sync_port=4511,
            async_port=4510,
            scapy_port=4517,
            client_name="PersistentClient",
            connect_timeout_seconds=9,
            persist=True,
        )
        settings.clear_runtime_trex_connection()

        restored = settings.get_environment()

        assert restored.host == "persistent.trex"
        assert restored.sync_port == 4511
        assert restored.async_port == 4510
        assert restored.scapy_port == 4517
        assert restored.client_name == "PersistentClient"
        assert restored.connect_timeout_seconds == 9
    finally:
        settings.clear_runtime_trex_connection()


def test_managed_systemd_runtime_connection_rejects_remote_target_without_persisting(
    monkeypatch,
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "systemd")
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    settings.clear_runtime_trex_connection()

    try:
        with pytest.raises(ValueError, match="managed systemd mode pins"):
            settings.set_runtime_trex_connection(
                host="remote.trex",
                sync_port=4501,
                async_port=4500,
                scapy_port=4507,
                persist=True,
            )
        assert not state_path.exists()
    finally:
        settings.clear_runtime_trex_connection()


def test_external_persisted_remote_connection_fails_closed_after_switch_to_managed_systemd(
    monkeypatch,
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime-state.json"
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_HOST", "127.0.0.1")
    monkeypatch.setenv("TREX_WEBUI_TREX_SYNC_PORT", "4501")
    monkeypatch.setenv("TREX_WEBUI_TREX_ASYNC_PORT", "4500")
    monkeypatch.setenv("TREX_WEBUI_TREX_SCAPY_PORT", "4507")
    monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "external")

    def persist_remote(state: RuntimeStateDocument) -> RuntimeStateDocument:
        state.connection = RuntimeConnectionState(
            host="remote.trex",
            sync_port=4511,
            async_port=4510,
            scapy_port=4517,
            client_name="RemoteClient",
            connect_timeout_seconds=9,
            updated_at=utc_now_iso(),
        )
        return state

    RuntimeStateStore(state_path).update(persist_remote)
    settings.clear_runtime_trex_connection()

    try:
        external_environment = settings.get_environment()
        assert external_environment.host == "remote.trex"
        assert external_environment.configuration_errors == {}

        monkeypatch.setenv("TREX_WEBUI_DAEMON_SUPERVISOR", "systemd")
        managed_environment = settings.get_environment()

        assert managed_environment.host == "127.0.0.1"
        assert managed_environment.sync_port == 4501
        assert managed_environment.async_port == 4500
        assert managed_environment.scapy_port == 4507
        assert (
            managed_environment.configuration_errors["TREX_WEBUI_RUNTIME_STATE_PATH"]
            == settings.MANAGED_LOCAL_CONNECTION_ERROR
        )
        assert RuntimeStateStore(state_path).load().connection is not None
        assert RuntimeStateStore(state_path).load().connection.host == "remote.trex"
    finally:
        settings.clear_runtime_trex_connection()


def test_corrupt_runtime_state_fails_closed_to_static_connection(monkeypatch, tmp_path: Path) -> None:
    state_path = tmp_path / "runtime-state.json"
    state_path.write_text('{"version":99}\n', encoding="utf-8")
    monkeypatch.setenv("TREX_WEBUI_RUNTIME_STATE_PATH", str(state_path))
    monkeypatch.setenv("TREX_WEBUI_TREX_HOST", "static.trex")
    settings.clear_runtime_trex_connection()

    try:
        environment = settings.get_environment()

        assert environment.host == "static.trex"
        assert "runtime state is invalid" in environment.configuration_errors["TREX_WEBUI_RUNTIME_STATE_PATH"]
        assert state_path.read_text(encoding="utf-8") == '{"version":99}\n'
    finally:
        settings.clear_runtime_trex_connection()


def test_runtime_connection_rejects_dirty_host() -> None:
    try:
        try:
            settings.set_runtime_trex_connection(
                host="http://192.0.2.10:4501",
                sync_port=4501,
                async_port=4500,
                scapy_port=4507,
                client_name="Client1",
                connect_timeout_seconds=3,
            )
        except ValueError as exc:
            assert str(exc) == TREX_HOST_ERROR
        else:
            raise AssertionError("dirty host should be rejected")
    finally:
        settings.clear_runtime_trex_connection()


def test_runtime_connection_rejects_dirty_client_name() -> None:
    try:
        try:
            settings.set_runtime_trex_connection(
                host="trex.lab",
                sync_port=4501,
                async_port=4500,
                scapy_port=4507,
                client_name="bad\nclient",
                connect_timeout_seconds=3,
            )
        except ValueError as exc:
            assert str(exc) == settings.TREX_CLIENT_NAME_ERROR
        else:
            raise AssertionError("dirty client name should be rejected")
    finally:
        settings.clear_runtime_trex_connection()


def test_environment_reports_invalid_integer_settings_without_crashing(monkeypatch, tmp_path: Path) -> None:
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text(
        "\n".join(
            [
                "TREX_WEBUI_TREX_SYNC_PORT=sync",
                "TREX_WEBUI_TREX_ASYNC_PORT=async",
                "TREX_WEBUI_TREX_SCAPY_PORT=scapy",
                "TREX_WEBUI_TREX_TIMEOUT_SECONDS=timeout",
                "TREX_WEBUI_TREX_DAEMON_PORT=daemon",
                "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS=timeout",
            ]
        ),
        encoding="utf-8",
    )
    for name in [
        "TREX_WEBUI_TREX_SYNC_PORT",
        "TREX_WEBUI_TREX_ASYNC_PORT",
        "TREX_WEBUI_TREX_SCAPY_PORT",
        "TREX_WEBUI_TREX_TIMEOUT_SECONDS",
        "TREX_WEBUI_TREX_DAEMON_PORT",
        "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS",
    ]:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(settings, "PROJECT_DOTENV", dotenv_path)

    env = TrexEnvironment.from_env()
    readiness = env.readiness()

    assert env.sync_port == 4501
    assert env.async_port == 4500
    assert env.scapy_port == 4507
    assert env.connect_timeout_seconds == 3
    assert env.daemon_port == 8090
    assert env.command_timeout_seconds == 20
    assert readiness["configuration_errors"] == {
        "TREX_WEBUI_TREX_SYNC_PORT": "TREX_WEBUI_TREX_SYNC_PORT must be an integer",
        "TREX_WEBUI_TREX_ASYNC_PORT": "TREX_WEBUI_TREX_ASYNC_PORT must be an integer",
        "TREX_WEBUI_TREX_SCAPY_PORT": "TREX_WEBUI_TREX_SCAPY_PORT must be an integer",
        "TREX_WEBUI_TREX_TIMEOUT_SECONDS": "TREX_WEBUI_TREX_TIMEOUT_SECONDS must be an integer",
        "TREX_WEBUI_TREX_DAEMON_PORT": "TREX_WEBUI_TREX_DAEMON_PORT must be an integer",
        "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS": "TREX_WEBUI_COMMAND_TIMEOUT_SECONDS must be an integer",
    }


def test_environment_reports_invalid_host_without_crashing(monkeypatch, tmp_path: Path) -> None:
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text("TREX_WEBUI_TREX_HOST=http://192.0.2.10:8090\n", encoding="utf-8")
    monkeypatch.delenv("TREX_WEBUI_TREX_HOST", raising=False)
    monkeypatch.setattr(settings, "PROJECT_DOTENV", dotenv_path)

    env = TrexEnvironment.from_env()
    readiness = env.readiness()

    assert env.host == "http://192.0.2.10:8090"
    assert readiness["host_valid"] is False
    assert readiness["configuration_errors"] == {"TREX_WEBUI_TREX_HOST": TREX_HOST_ERROR}


def test_environment_reports_invalid_capture_open_command(monkeypatch, tmp_path: Path) -> None:
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text("TREX_WEBUI_CAPTURE_OPEN_COMMAND=./wireshark -r\n", encoding="utf-8")
    monkeypatch.delenv("TREX_WEBUI_CAPTURE_OPEN_COMMAND", raising=False)
    monkeypatch.setattr(settings, "PROJECT_DOTENV", dotenv_path)

    env = TrexEnvironment.from_env()
    readiness = env.readiness()

    assert env.capture_open_command == []
    assert readiness["configuration_errors"] == {
        "TREX_WEBUI_CAPTURE_OPEN_COMMAND": "TREX_WEBUI_CAPTURE_OPEN_COMMAND executable must be absolute or a PATH executable name"
    }


def test_environment_readiness_reports_path_gates(tmp_path: Path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    env = TrexEnvironment(
        host="trex.lab",
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=scripts_dir,
        daemon_bin=scripts_dir / "trex_daemon_server",
        config_path=tmp_path / "trex_cfg.yaml",
        daemon_log=tmp_path / "logs" / "trex.log",
        profile_roots=[scripts_dir / "stl"],
        command_timeout_seconds=10,
        require_confirmation=True,
    )

    readiness = env.readiness()

    assert readiness["host"] == "trex.lab"
    assert readiness["scapy_port"] == 4507
    assert readiness["client_name"] == "Client1"
    assert readiness["connect_timeout_seconds"] == 3
    assert readiness["host_valid"] is True
    assert readiness["scripts_dir_path_valid"] is True
    assert readiness["daemon_bin_path_valid"] is True
    assert readiness["config_path_valid"] is True
    assert readiness["daemon_log_path_valid"] is True
    assert readiness["runtime_state_path_valid"] is True
    assert readiness["scripts_dir_exists"] is True
    assert readiness["daemon_bin_exists"] is False
    assert readiness["config_parent_exists"] is True
    assert readiness["daemon_log_parent_exists"] is False
    assert readiness["runtime_state_parent_exists"] is True
    assert readiness["profile_roots"] == [str(scripts_dir / "stl")]
    assert readiness["profile_roots_existing"] == []


def test_environment_readiness_reports_dirty_paths_without_crashing(tmp_path: Path) -> None:
    env = TrexEnvironment(
        host="trex.lab",
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=Path("relative-scripts"),
        daemon_bin=Path("/opt/trex-core/scripts/trex_daemon_server "),
        config_path=Path("/etc/trex\x00cfg.yaml"),
        daemon_log=Path("logs/trex.log"),
        profile_roots=[tmp_path / "profiles", Path("/tmp/bad\x00profile-root")],
        command_timeout_seconds=10,
        require_confirmation=True,
    )

    readiness = env.readiness()

    assert readiness["scripts_dir_path_valid"] is False
    assert readiness["daemon_bin_path_valid"] is False
    assert readiness["config_path_valid"] is False
    assert readiness["daemon_log_path_valid"] is False
    assert readiness["scripts_dir_exists"] is False
    assert readiness["daemon_bin_exists"] is False
    assert readiness["config_parent_exists"] is False
    assert readiness["daemon_log_parent_exists"] is False
    assert readiness["profile_roots_existing"] == []
