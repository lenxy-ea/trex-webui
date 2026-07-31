from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Protocol

from app.trex.result import TrexCallResult


TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS = 300
DEFAULT_TRAFFIC_HARD_STOP_REAPER_INTERVAL_SECONDS = 0.5
DEFAULT_TRAFFIC_HARD_STOP_REAPER_CLOSE_TIMEOUT_SECONDS = 10.0
DEFAULT_TRAFFIC_HARD_STOP_FAILURE_LOG_INTERVAL_SECONDS = 60.0
TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS = (
    DEFAULT_TRAFFIC_HARD_STOP_REAPER_INTERVAL_SECONDS + 0.5
)

logger = logging.getLogger(__name__)


class TrafficHardStopReaperCloseError(RuntimeError):
    """The worker could not be proven stopped before its service changed."""


class TrafficHardStopService(Protocol):
    def reap_expired_traffic_hard_stops(
        self,
        now: datetime | None = None,
    ) -> TrexCallResult: ...


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def canonical_utc_timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() != timedelta(0):
        raise ValueError("hard_stop_at must use an absolute UTC timestamp")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_utc_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or value != value.strip() or not value:
        raise ValueError("hard_stop_at must be a clean absolute UTC timestamp")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise ValueError("hard_stop_at must be a valid ISO 8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError("hard_stop_at must use an absolute UTC timestamp")
    return parsed.astimezone(timezone.utc)


def normalize_hard_stop_at(
    value: str,
    *,
    now: datetime | None = None,
    max_window_seconds: int = TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS,
) -> str:
    current = utc_now() if now is None else now
    if current.tzinfo is None or current.utcoffset() != timedelta(0):
        raise ValueError("hard-stop validation clock must use UTC")
    if max_window_seconds < 1:
        raise ValueError("hard-stop maximum window must be positive")
    deadline = parse_utc_timestamp(value)
    current = current.astimezone(timezone.utc)
    if deadline <= current:
        raise ValueError("hard_stop_at must be in the future")
    if deadline > current + timedelta(seconds=max_window_seconds):
        raise ValueError(
            "hard_stop_at exceeds the maximum "
            f"{max_window_seconds}-second safety window"
        )
    return canonical_utc_timestamp(deadline)


def hard_stop_is_expired(value: str, now: datetime) -> bool:
    if now.tzinfo is None or now.utcoffset() != timedelta(0):
        raise ValueError("hard-stop clock must use UTC")
    return parse_utc_timestamp(value) <= now.astimezone(timezone.utc)


class TrafficHardStopReaper:
    """Poll durable traffic leases independently of browser request lifetimes."""

    def __init__(
        self,
        service_provider: Callable[[], TrafficHardStopService],
        *,
        clock: Callable[[], datetime] = utc_now,
        interval_seconds: float = DEFAULT_TRAFFIC_HARD_STOP_REAPER_INTERVAL_SECONDS,
        close_timeout_seconds: float = (
            DEFAULT_TRAFFIC_HARD_STOP_REAPER_CLOSE_TIMEOUT_SECONDS
        ),
        failure_log_interval_seconds: float = (
            DEFAULT_TRAFFIC_HARD_STOP_FAILURE_LOG_INTERVAL_SECONDS
        ),
        monotonic_clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("traffic hard-stop reaper interval must be positive")
        if close_timeout_seconds <= 0:
            raise ValueError(
                "traffic hard-stop reaper close timeout must be positive"
            )
        if failure_log_interval_seconds <= 0:
            raise ValueError(
                "traffic hard-stop failure log interval must be positive"
            )
        self._service_provider = service_provider
        self._clock = clock
        self._monotonic_clock = monotonic_clock
        self.interval_seconds = interval_seconds
        self.close_timeout_seconds = close_timeout_seconds
        self.failure_log_interval_seconds = failure_log_interval_seconds
        self._state_lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._closed = False
        self._last_result: TrexCallResult | None = None
        self._last_error: str | None = None
        self._reported_failure_signature: tuple[object, ...] | None = None
        self._last_failure_logged_at: float | None = None

    @property
    def running(self) -> bool:
        with self._state_lock:
            return self._thread is not None and self._thread.is_alive()

    @property
    def closed(self) -> bool:
        with self._state_lock:
            return self._closed

    @property
    def last_result(self) -> TrexCallResult | None:
        with self._state_lock:
            return self._last_result

    @property
    def last_error(self) -> str | None:
        with self._state_lock:
            return self._last_error

    def start(self) -> None:
        with self._state_lock:
            if self._closed:
                raise RuntimeError("traffic hard-stop reaper is closed")
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run,
                name="trex-traffic-hard-stop-reaper",
                daemon=True,
            )
            self._thread.start()
            if not self._thread.is_alive():
                self._thread = None
                self._closed = True
                raise RuntimeError(
                    "traffic hard-stop reaper worker failed to start"
                )

    def close(self) -> None:
        with self._state_lock:
            self._closed = True
            self._stop_event.set()
            thread = self._thread
        if thread is threading.current_thread():
            raise TrafficHardStopReaperCloseError(
                "traffic hard-stop reaper cannot join its own worker"
            )
        if thread is not None and thread.is_alive():
            thread.join(timeout=self.close_timeout_seconds)
        if thread is not None and thread.is_alive():
            message = (
                "traffic hard-stop reaper worker did not stop within "
                f"{self.close_timeout_seconds:g}s; service replacement is blocked"
            )
            logger.error(message)
            raise TrafficHardStopReaperCloseError(message)
        with self._state_lock:
            if self._thread is thread:
                self._thread = None

    def run_once(self) -> TrexCallResult:
        try:
            now = self._clock()
            result = self._service_provider().reap_expired_traffic_hard_stops(
                now
            )
        except Exception as exc:
            with self._state_lock:
                self._last_error = str(exc) or exc.__class__.__name__
            self._log_failure(
                (
                    "exception",
                    exc.__class__.__name__,
                    str(exc),
                ),
                "traffic hard-stop reaper raised an exception",
                exc_info=True,
            )
            raise
        with self._state_lock:
            self._last_result = result
            self._last_error = (
                None
                if result.ok
                else result.error or result.blocker or "hard-stop reaper failed"
            )
        if result.ok:
            self._log_recovery(result)
        else:
            data = result.data if isinstance(result.data, dict) else {}
            blocker = result.blocker or "traffic_hard_stop_failed"
            error = result.error or "traffic hard-stop reaper failed"
            session_id = data.get("session_id")
            ports = data.get("ports", [])
            self._log_failure(
                (
                    "result",
                    blocker,
                    error,
                    session_id,
                    tuple(ports) if isinstance(ports, list) else repr(ports),
                ),
                "traffic hard-stop reaper failed: blocker=%s error=%s "
                "session_id=%s ports=%s",
                blocker,
                error,
                session_id,
                ports,
            )
        return result

    def _log_failure(
        self,
        signature: tuple[object, ...],
        message: str,
        *args: object,
        exc_info: bool = False,
    ) -> None:
        now = self._monotonic_clock()
        with self._state_lock:
            should_log = (
                signature != self._reported_failure_signature
                or self._last_failure_logged_at is None
                or now - self._last_failure_logged_at
                >= self.failure_log_interval_seconds
            )
            if not should_log:
                return
            self._reported_failure_signature = signature
            self._last_failure_logged_at = now
        logger.warning(message, *args, exc_info=exc_info)

    def _log_recovery(self, result: TrexCallResult) -> None:
        with self._state_lock:
            previous = self._reported_failure_signature
            if previous is None:
                return
            self._reported_failure_signature = None
            self._last_failure_logged_at = None
        data = result.data if isinstance(result.data, dict) else {}
        logger.info(
            "traffic hard-stop reaper recovered: session_id=%s ports=%s "
            "attempted=%s stopped=%s",
            data.get("session_id"),
            data.get("ports", []),
            data.get("attempted"),
            data.get("stopped"),
        )

    def _run(self) -> None:
        try:
            while not self._stop_event.wait(self.interval_seconds):
                try:
                    self.run_once()
                except Exception:
                    # Persisted state remains authoritative. A later iteration
                    # retries; callers can inspect last_error for diagnostics.
                    continue
        finally:
            with self._state_lock:
                if self._thread is threading.current_thread():
                    self._thread = None
