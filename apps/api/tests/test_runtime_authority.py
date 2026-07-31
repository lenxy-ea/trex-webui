from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.settings import TrexEnvironment
from app.trex.runtime_authority import RuntimeAuthorityProvider
from app.trex.runtime_state import RuntimeStateError


def mock_generation_owner(
    monkeypatch: pytest.MonkeyPatch,
    path: Path,
    uid: int,
) -> None:
    real_lstat = Path.lstat

    def lstat(candidate: Path):  # type: ignore[no-untyped-def]
        metadata = real_lstat(candidate)
        if candidate == path:
            return SimpleNamespace(
                st_mode=metadata.st_mode,
                st_uid=uid,
                st_size=metadata.st_size,
            )
        return metadata

    monkeypatch.setattr(Path, "lstat", lstat)


def environment(tmp_path: Path, *, supervisor: str = "systemd") -> TrexEnvironment:
    return TrexEnvironment(
        host="127.0.0.1",
        sync_port=4501,
        async_port=4500,
        daemon_port=8090,
        scripts_dir=tmp_path,
        daemon_bin=tmp_path / "trex_daemon_server",
        config_path=tmp_path / "trex_cfg.yaml",
        daemon_log=tmp_path / "trex.log",
        profile_roots=[tmp_path],
        command_timeout_seconds=3,
        require_confirmation=True,
        daemon_supervisor=supervisor,
        runtime_state_path=tmp_path / "runtime-state.json",
        daemon_generation_path=tmp_path / "daemon-generation",
    )


def test_managed_authority_binds_exact_target_and_root_generation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path)
    env.daemon_generation_path.write_text(
        "11111111-1111-4111-8111-111111111111\n",
        encoding="ascii",
    )
    env.daemon_generation_path.chmod(0o644)
    mock_generation_owner(monkeypatch, env.daemon_generation_path, 0)

    authority = RuntimeAuthorityProvider(env).current()

    assert authority.model_dump(mode="json") == {
        "host": "127.0.0.1",
        "sync_port": 4501,
        "async_port": 4500,
        "scapy_port": 4507,
        "daemon_supervisor": "systemd",
        "generation": "11111111-1111-4111-8111-111111111111",
    }


@pytest.mark.parametrize(
    ("content", "mode", "message"),
    [
        ("not-a-uuid\n", 0o644, "canonical UUID"),
        ("11111111-1111-4111-8111-111111111111\n", 0o666, "must not be writable"),
    ],
)
def test_managed_authority_rejects_untrusted_generation_file(
    tmp_path: Path,
    content: str,
    mode: int,
    message: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path)
    env.daemon_generation_path.write_text(content, encoding="ascii")
    env.daemon_generation_path.chmod(mode)
    mock_generation_owner(monkeypatch, env.daemon_generation_path, 0)

    with pytest.raises(RuntimeStateError, match=message):
        RuntimeAuthorityProvider(env).current()


def test_managed_authority_rejects_generation_symlink(tmp_path: Path) -> None:
    env = environment(tmp_path)
    target = tmp_path / "target"
    target.write_text(
        "11111111-1111-4111-8111-111111111111\n",
        encoding="ascii",
    )
    env.daemon_generation_path.symlink_to(target)

    with pytest.raises(RuntimeStateError, match="non-symlink regular file"):
        RuntimeAuthorityProvider(env).current()


def test_managed_authority_rejects_non_root_generation_owner(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env = environment(tmp_path)
    env.daemon_generation_path.write_text(
        "11111111-1111-4111-8111-111111111111\n",
        encoding="ascii",
    )
    env.daemon_generation_path.chmod(0o644)
    mock_generation_owner(monkeypatch, env.daemon_generation_path, 1000)

    with pytest.raises(RuntimeStateError, match="owned by root"):
        RuntimeAuthorityProvider(env).current()


def test_external_authority_is_stable_only_within_one_provider(
    tmp_path: Path,
) -> None:
    env = replace(environment(tmp_path), daemon_supervisor="external")
    first = RuntimeAuthorityProvider(env)
    second = RuntimeAuthorityProvider(env)

    assert first.current() == first.current()
    assert first.current() != second.current()
    assert first.current().generation.startswith("process:")
