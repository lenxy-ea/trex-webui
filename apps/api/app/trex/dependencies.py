from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator

from app.core.settings import TrexEnvironment, get_environment
from app.trex.stats_sampler import TrexStatsSampler
from app.trex.result import TrexCallResult
from app.trex.runtime_mutation import runtime_mutation_fence
from app.trex.stl_client import RealStlClientService
from app.trex.traffic_hard_stop import TrafficHardStopReaper


_service_lock = threading.RLock()
_service_replacement_lock = threading.RLock()
_reaper_lifecycle_lock = threading.RLock()
_service: RealStlClientService | None = None
_stats_sampler: TrexStatsSampler | None = None
_service_key: tuple[object, ...] | None = None
_traffic_hard_stop_reaper: TrafficHardStopReaper | None = None
_traffic_hard_stop_reaper_service: RealStlClientService | None = None
_traffic_hard_stop_reaper_enabled = False


class StlServiceReplacementError(RuntimeError):
    def __init__(self, result: TrexCallResult) -> None:
        self.result = result
        blocker = result.blocker or "trex_service_replacement_failed"
        self.blocker = blocker
        detail = result.error or "the cached TRex service could not be closed"
        super().__init__(f"{blocker}: {detail}")


def _environment_key(env: TrexEnvironment) -> tuple[object, ...]:
    return (
        env.host,
        env.sync_port,
        env.async_port,
        env.scapy_port,
        env.client_name,
        env.connect_timeout_seconds,
        env.daemon_supervisor,
        str(env.runtime_state_path),
        str(env.daemon_generation_path),
        str(env.scripts_dir),
        tuple(str(root) for root in env.profile_roots),
    )


def _detach_reaper_for_service_change() -> TrafficHardStopReaper | None:
    global _traffic_hard_stop_reaper, _traffic_hard_stop_reaper_service
    with _reaper_lifecycle_lock:
        reaper = _traffic_hard_stop_reaper
    if reaper is not None:
        reaper.close()
    with _reaper_lifecycle_lock:
        if _traffic_hard_stop_reaper is reaper:
            _traffic_hard_stop_reaper = None
            _traffic_hard_stop_reaper_service = None
    return reaper


def _resume_reaper_for_service(
    service: RealStlClientService,
) -> TrafficHardStopReaper | None:
    global _traffic_hard_stop_reaper, _traffic_hard_stop_reaper_service
    with _reaper_lifecycle_lock:
        if not _traffic_hard_stop_reaper_enabled:
            return None
        existing = _traffic_hard_stop_reaper
        if existing is not None:
            if (
                _traffic_hard_stop_reaper_service is service
                and existing.running
                and not existing.closed
            ):
                return existing
            if existing.running and existing.closed:
                raise RuntimeError(
                    "traffic hard-stop reaper is still exiting after close; "
                    "a replacement worker cannot start"
                )
            if (
                not existing.closed
                and _traffic_hard_stop_reaper_service is service
            ):
                existing.start()
                if (
                    _traffic_hard_stop_reaper_service is service
                    and existing.running
                ):
                    return existing
            existing.close()
            if _traffic_hard_stop_reaper is existing:
                _traffic_hard_stop_reaper = None
                _traffic_hard_stop_reaper_service = None
        reaper = TrafficHardStopReaper(lambda: service)
        _traffic_hard_stop_reaper = reaper
        _traffic_hard_stop_reaper_service = service
        reaper.start()
        if not reaper.running:
            _traffic_hard_stop_reaper = None
            _traffic_hard_stop_reaper_service = None
            raise RuntimeError(
                "traffic hard-stop reaper worker is not running after startup"
            )
        return reaper


def _replace_service(env: TrexEnvironment) -> RealStlClientService:
    global _service, _service_key, _stats_sampler
    key = _environment_key(env)
    with _service_replacement_lock:
        with _service_lock:
            if _service is not None and _service_key == key:
                service = _service
                _resume_reaper_for_service(service)
                return service
            previous = _service

        replacement: RealStlClientService | None = None
        try:
            # Stop and prove the old worker gone while the old service itself
            # remains usable. Replacement construction may then validate local
            # runtime state; on failure the old service gets a fresh reaper and
            # has not been closed.
            _detach_reaper_for_service_change()
            replacement = RealStlClientService(env)
            with runtime_mutation_fence():
                with _service_lock:
                    if _service is not None and _service_key == key:
                        replacement = _service
                    else:
                        if _service is not None:
                            close_result = _service.close()
                            if not close_result.ok:
                                raise StlServiceReplacementError(close_result)
                        if _stats_sampler is not None:
                            _stats_sampler.close()
                            _stats_sampler = None
                        _service = replacement
                        _service_key = key
        except Exception:
            with _service_lock:
                resumable = _service if _service is not None else previous
            with _reaper_lifecycle_lock:
                reaper_still_attached = (
                    _traffic_hard_stop_reaper is not None
                )
            if resumable is not None and not reaper_still_attached:
                _resume_reaper_for_service(resumable)
            raise
        if replacement is None:
            raise RuntimeError("TRex service replacement was not constructed")
        _resume_reaper_for_service(replacement)
        return replacement


def _ensure_service_locked(env: TrexEnvironment) -> RealStlClientService:
    """Compatibility entry point for callers already serialized by a lock."""

    return _replace_service(env)


def get_stl_service() -> RealStlClientService:
    with _service_replacement_lock:
        env = get_environment()
        key = _environment_key(env)
        with _service_lock:
            if _service is not None and _service_key == key:
                service = _service
            else:
                service = None
        if service is not None:
            _resume_reaper_for_service(service)
            return service
        return _replace_service(env)


def get_stats_sampler() -> TrexStatsSampler:
    global _stats_sampler
    with _service_replacement_lock:
        service = get_stl_service()
        with _service_lock:
            if _stats_sampler is None:
                _stats_sampler = TrexStatsSampler(service)
            return _stats_sampler


def start_traffic_hard_stop_reaper() -> TrafficHardStopReaper:
    global _traffic_hard_stop_reaper_enabled
    with _service_replacement_lock:
        with _reaper_lifecycle_lock:
            _traffic_hard_stop_reaper_enabled = True
        service = get_stl_service()
        reaper = _resume_reaper_for_service(service)
        if reaper is None or not reaper.running:
            raise RuntimeError("traffic hard-stop reaper did not start")
        return reaper


def stop_traffic_hard_stop_reaper() -> None:
    global _traffic_hard_stop_reaper_enabled
    with _service_replacement_lock:
        with _reaper_lifecycle_lock:
            _traffic_hard_stop_reaper_enabled = False
        _detach_reaper_for_service_change()


def _disconnect_stl_service(*, terminating_trex: bool) -> TrexCallResult:
    global _stats_sampler
    with _service_replacement_lock:
        with _service_lock:
            service = _service
        if not terminating_trex:
            priority_guard = (
                getattr(service, "_hard_stop_rpc_priority_failure", None)
                if service is not None
                else None
            )
            if callable(priority_guard):
                priority_failure = priority_guard()
                if priority_failure is not None:
                    return priority_failure
        with runtime_mutation_fence(hard_stop=terminating_trex):
            with _service_lock:
                sampler_closed = _stats_sampler is not None
                if _stats_sampler is not None:
                    _stats_sampler.close()
                    _stats_sampler = None
                if _service is None:
                    return TrexCallResult(
                        True,
                        data={
                            "disconnected": False,
                            "client_cached": False,
                            "stats_sampler_closed": sampler_closed,
                        },
                    )
                result = _service.disconnect()
                if result.ok and isinstance(result.data, dict):
                    result.data["stats_sampler_closed"] = sampler_closed
                return result


def disconnect_stl_service() -> TrexCallResult:
    return _disconnect_stl_service(terminating_trex=False)


def disconnect_stl_service_for_trex_termination() -> TrexCallResult:
    """Close the cached STL client without delaying an explicit process stop."""

    return _disconnect_stl_service(terminating_trex=True)


@contextmanager
def trex_termination_transaction() -> Iterator[None]:
    """Fence disconnect, process termination, and durable retirement as one action."""

    with _service_replacement_lock, runtime_mutation_fence(hard_stop=True):
        yield


def retire_traffic_after_trex_termination() -> TrexCallResult:
    """Retire durable traffic only after the daemon confirmed process termination."""

    service = get_stl_service()
    with runtime_mutation_fence(hard_stop=True):
        return service.retire_traffic_after_trex_termination()


def retire_disconnected_stl_service() -> None:
    """Remove a successfully disconnected service before publishing a new target."""

    global _service, _service_key, _stats_sampler
    with _service_replacement_lock:
        _detach_reaper_for_service_change()
        with runtime_mutation_fence():
            with _service_lock:
                if _stats_sampler is not None:
                    _stats_sampler.close()
                    _stats_sampler = None
                _service = None
                _service_key = None
