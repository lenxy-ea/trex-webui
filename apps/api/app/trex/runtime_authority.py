from __future__ import annotations

import stat
import uuid
from pathlib import Path

from app.core.settings import TrexEnvironment
from app.trex.runtime_state import RuntimeAuthorityIdentity, RuntimeStateError


DAEMON_GENERATION_MAX_BYTES = 128


def read_managed_daemon_generation(path: Path) -> str:
    raw_path = str(path)
    if (
        not raw_path
        or raw_path != raw_path.strip()
        or "\x00" in raw_path
        or not path.is_absolute()
    ):
        raise RuntimeStateError("daemon generation path must be a clean absolute path")
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise RuntimeStateError(f"managed daemon generation is unavailable: {exc}") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise RuntimeStateError(
            "managed daemon generation must be a non-symlink regular file"
        )
    if metadata.st_uid != 0:
        raise RuntimeStateError("managed daemon generation must be owned by root")
    if stat.S_IMODE(metadata.st_mode) & 0o022:
        raise RuntimeStateError(
            "managed daemon generation must not be writable by group or other"
        )
    if metadata.st_size > DAEMON_GENERATION_MAX_BYTES:
        raise RuntimeStateError("managed daemon generation exceeds the maximum size")
    try:
        raw_generation = path.read_text(encoding="ascii")
    except (OSError, UnicodeError) as exc:
        raise RuntimeStateError(f"cannot read managed daemon generation: {exc}") from exc
    generation = raw_generation.strip()
    try:
        parsed = uuid.UUID(generation)
    except (AttributeError, ValueError) as exc:
        raise RuntimeStateError("managed daemon generation must be a canonical UUID") from exc
    if str(parsed) != generation:
        raise RuntimeStateError("managed daemon generation must be a canonical UUID")
    return generation


class RuntimeAuthorityProvider:
    """Resolve the exact TRex target and the lifecycle that owns its runtime."""

    def __init__(self, environment: TrexEnvironment) -> None:
        self.environment = environment
        self._external_generation = f"process:{uuid.uuid4()}"

    def current(self) -> RuntimeAuthorityIdentity:
        environment = self.environment
        if environment.daemon_supervisor == "systemd":
            generation = read_managed_daemon_generation(
                environment.daemon_generation_path
            )
        else:
            generation = self._external_generation
        return RuntimeAuthorityIdentity(
            host=environment.host,
            sync_port=environment.sync_port,
            async_port=environment.async_port,
            scapy_port=environment.scapy_port,
            daemon_supervisor=environment.daemon_supervisor,
            generation=generation,
        )
