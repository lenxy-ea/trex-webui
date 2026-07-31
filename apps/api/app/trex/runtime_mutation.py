from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator

from app.core.settings import TrexEnvironment
from app.trex.runtime_state import RuntimeStateError, RuntimeStateStore


_RUNTIME_MUTATION_FENCE = threading.RLock()
_RUNTIME_MUTATION_CONTEXT = threading.local()


class RuntimeConnectionTargetMismatch(RuntimeStateError):
    pass


def runtime_mutation_fence_active() -> bool:
    return getattr(_RUNTIME_MUTATION_CONTEXT, "depth", 0) > 0


def runtime_hard_stop_priority_active() -> bool:
    return getattr(_RUNTIME_MUTATION_CONTEXT, "hard_stop_depth", 0) > 0


@contextmanager
def runtime_mutation_fence(*, hard_stop: bool = False) -> Iterator[None]:
    """Serialize process-local TRex mutations and their persisted authority updates."""

    with _RUNTIME_MUTATION_FENCE:
        previous_depth = getattr(_RUNTIME_MUTATION_CONTEXT, "depth", 0)
        previous_hard_stop_depth = getattr(
            _RUNTIME_MUTATION_CONTEXT,
            "hard_stop_depth",
            0,
        )
        _RUNTIME_MUTATION_CONTEXT.depth = previous_depth + 1
        if hard_stop:
            _RUNTIME_MUTATION_CONTEXT.hard_stop_depth = (
                previous_hard_stop_depth + 1
            )
        try:
            yield
        finally:
            _RUNTIME_MUTATION_CONTEXT.depth = previous_depth
            _RUNTIME_MUTATION_CONTEXT.hard_stop_depth = (
                previous_hard_stop_depth
            )


def assert_persisted_connection_target(
    environment: TrexEnvironment,
    store: RuntimeStateStore,
) -> None:
    """Reject a service whose immutable endpoint no longer owns the persisted target."""

    connection = store.load().connection
    if connection is None:
        return
    expected = (
        environment.host,
        environment.sync_port,
        environment.async_port,
        environment.scapy_port,
        environment.client_name,
        environment.connect_timeout_seconds,
    )
    observed = (
        connection.host,
        connection.sync_port,
        connection.async_port,
        connection.scapy_port,
        connection.client_name,
        connection.connect_timeout_seconds,
    )
    if observed != expected:
        raise RuntimeConnectionTargetMismatch(
            "the persisted TRex connection target changed; discard this stale service"
        )
