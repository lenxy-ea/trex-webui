from __future__ import annotations

import asyncio
import threading
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import AsyncIterator, Optional, cast

from app.trex.result import TrexCallResult, public_result_payload
from app.trex.stl_client import RealStlClientService


DEFAULT_STATS_SAMPLE_INTERVAL_SECONDS = 1.0
DEFAULT_STATS_HISTORY_LIMIT = 1200
DEFAULT_STATS_SUBSCRIBER_LIMIT = 32
STATS_SUBSCRIBER_QUEUE_LIMIT = 32

_SUBSCRIPTION_CLOSED = object()


class StatsSubscriberLimitError(RuntimeError):
    pass


class StatsSamplerClosedError(RuntimeError):
    pass


@dataclass
class _SubscriberState:
    loop: asyncio.AbstractEventLoop
    events: asyncio.Queue[dict[str, object] | object]
    closed: threading.Event


class StatsSubscription(AsyncIterator[dict[str, object]]):
    def __init__(
        self,
        sampler: "TrexStatsSampler",
        subscriber_id: int,
        state: _SubscriberState,
    ) -> None:
        self.sampler = sampler
        self.subscriber_id = subscriber_id
        self._state = state

    @property
    def closed(self) -> bool:
        return self._state.closed.is_set()

    def close(self) -> None:
        self.sampler.unsubscribe(self)

    def __aiter__(self) -> StatsSubscription:
        return self

    async def __anext__(self) -> dict[str, object]:
        if self.closed:
            raise StopAsyncIteration
        event = await self._state.events.get()
        if self.closed or event is _SUBSCRIPTION_CLOSED:
            raise StopAsyncIteration
        return cast(dict[str, object], event)


class TrexStatsSampler:
    def __init__(
        self,
        service: RealStlClientService,
        interval_seconds: float = DEFAULT_STATS_SAMPLE_INTERVAL_SECONDS,
        history_limit: int = DEFAULT_STATS_HISTORY_LIMIT,
        max_subscribers: int = DEFAULT_STATS_SUBSCRIBER_LIMIT,
    ) -> None:
        if max_subscribers < 1:
            raise ValueError("max_subscribers must be at least 1")
        self.service = service
        self.interval_seconds = interval_seconds
        self.max_subscribers = max_subscribers
        self._history: deque[dict[str, object]] = deque(maxlen=history_limit)
        self._latest: dict[str, object] | None = None
        self._sequence = 0
        self._state_lock = threading.RLock()
        self._sample_lock = threading.Lock()
        self._subscribers: dict[int, _SubscriberState] = {}
        self._next_subscriber_id = 1
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._closed = False

    @property
    def subscriber_count(self) -> int:
        with self._state_lock:
            return len(self._subscribers)

    def close(self) -> None:
        with self._state_lock:
            if self._closed:
                return
            self._closed = True
            self._stop_event.set()
            thread = self._thread
            subscribers = list(self._subscribers.values())
            self._subscribers.clear()

        for subscriber in subscribers:
            self._close_subscriber(subscriber)

        if thread is not None and thread is not threading.current_thread() and thread.is_alive():
            thread.join(timeout=2)

    def latest_payload(self) -> dict[str, object] | None:
        with self._state_lock:
            return dict(self._latest) if self._latest is not None else None

    def history(self) -> list[dict[str, object]]:
        with self._state_lock:
            return [dict(sample) for sample in self._history]

    def reset_history(self) -> None:
        with self._state_lock:
            self._history.clear()
            self._latest = None

    def subscribe(self) -> StatsSubscription:
        loop = asyncio.get_running_loop()
        subscriber = _SubscriberState(
            loop=loop,
            events=asyncio.Queue(maxsize=STATS_SUBSCRIBER_QUEUE_LIMIT),
            closed=threading.Event(),
        )
        with self._state_lock:
            if self._closed:
                raise StatsSamplerClosedError("stats sampler is closed")
            if len(self._subscribers) >= self.max_subscribers:
                raise StatsSubscriberLimitError("stats stream subscriber limit reached")
            subscriber_id = self._next_subscriber_id
            self._next_subscriber_id += 1
            self._subscribers[subscriber_id] = subscriber
            if self._latest is not None:
                self._enqueue(subscriber, self._latest)
            self._start_locked()
        return StatsSubscription(self, subscriber_id, subscriber)

    def unsubscribe(self, subscription: StatsSubscription) -> None:
        subscriber = subscription._state
        with self._state_lock:
            current = self._subscribers.get(subscription.subscriber_id)
            if current is subscriber:
                self._subscribers.pop(subscription.subscriber_id, None)
            should_stop = len(self._subscribers) == 0
            if should_stop:
                self._stop_event.set()
        self._close_subscriber(subscriber)

    def start(self) -> None:
        with self._state_lock:
            if self._closed:
                raise StatsSamplerClosedError("stats sampler is closed")
            self._start_locked()

    def _start_locked(self) -> None:
        self._stop_event.clear()
        if self._thread is not None and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="trex-stats-sampler", daemon=True)
        self._thread.start()

    def sample_once(self, ports: Optional[list[int]] = None) -> dict[str, object]:
        with self._sample_lock:
            result = self.service.stats(ports=ports)
            return self.record_result(result)

    def record_result(self, result: TrexCallResult | dict[str, object]) -> dict[str, object]:
        if isinstance(result, TrexCallResult):
            payload: dict[str, object] = public_result_payload(result)
        else:
            payload = dict(result)

        with self._state_lock:
            self._sequence += 1
            payload["sequence"] = self._sequence
            payload["sample_time"] = datetime.now(timezone.utc).isoformat()
            self._latest = dict(payload)
            self._history.append(dict(payload))
            subscribers = list(self._subscribers.values())

        for subscriber in subscribers:
            self._publish(subscriber, payload)
        return payload

    def _run(self) -> None:
        try:
            while not self._stop_event.is_set():
                with self._state_lock:
                    if self._closed or not self._subscribers:
                        break
                self.sample_once()
                self._stop_event.wait(self.interval_seconds)
        finally:
            with self._state_lock:
                if self._thread is threading.current_thread():
                    self._thread = None
                if not self._closed and self._subscribers:
                    self._start_locked()

    @staticmethod
    def _enqueue(subscriber: _SubscriberState, payload: dict[str, object]) -> None:
        if subscriber.closed.is_set():
            return
        try:
            subscriber.events.put_nowait(dict(payload))
            return
        except asyncio.QueueFull:
            pass
        try:
            subscriber.events.get_nowait()
        except asyncio.QueueEmpty:
            pass
        try:
            subscriber.events.put_nowait(dict(payload))
        except asyncio.QueueFull:
            pass

    def _publish(self, subscriber: _SubscriberState, payload: dict[str, object]) -> None:
        try:
            subscriber.loop.call_soon_threadsafe(self._enqueue, subscriber, dict(payload))
        except RuntimeError:
            self._discard_subscriber(subscriber)

    def _discard_subscriber(self, subscriber: _SubscriberState) -> None:
        with self._state_lock:
            for subscriber_id, current in self._subscribers.items():
                if current is subscriber:
                    self._subscribers.pop(subscriber_id)
                    break
            if not self._subscribers:
                self._stop_event.set()
        subscriber.closed.set()

    @staticmethod
    def _signal_closed(subscriber: _SubscriberState) -> None:
        while True:
            try:
                subscriber.events.get_nowait()
            except asyncio.QueueEmpty:
                break
        try:
            subscriber.events.put_nowait(_SUBSCRIPTION_CLOSED)
        except asyncio.QueueFull:
            pass

    def _close_subscriber(self, subscriber: _SubscriberState) -> None:
        if subscriber.closed.is_set():
            return
        subscriber.closed.set()
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None
        if running_loop is subscriber.loop:
            self._signal_closed(subscriber)
            return
        try:
            subscriber.loop.call_soon_threadsafe(self._signal_closed, subscriber)
        except RuntimeError:
            pass
