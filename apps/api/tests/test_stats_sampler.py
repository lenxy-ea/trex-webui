from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.trex.result import TrexCallResult
from app.trex.stats_sampler import StatsSubscriberLimitError, TrexStatsSampler


class RecordingStatsService:
    def __init__(self, result: TrexCallResult | None = None, delay: float = 0.0) -> None:
        self.result = result or TrexCallResult(True, data={"global": {"tx_pps": 1}})
        self.delay = delay
        self.calls: list[list[int] | None] = []
        self.active_calls = 0
        self.max_active_calls = 0
        self.lock = threading.Lock()

    def stats(self, ports: list[int] | None = None) -> TrexCallResult:
        with self.lock:
            self.calls.append(ports)
            self.active_calls += 1
            self.max_active_calls = max(self.max_active_calls, self.active_calls)
        try:
            if self.delay > 0:
                time.sleep(self.delay)
            return self.result
        finally:
            with self.lock:
                self.active_calls -= 1


def test_sampler_serializes_concurrent_sample_requests() -> None:
    service = RecordingStatsService(delay=0.02)
    sampler = TrexStatsSampler(service, interval_seconds=0.01)
    threads = [threading.Thread(target=sampler.sample_once) for _ in range(4)]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=1)

    assert len(service.calls) == 4
    assert service.max_active_calls == 1
    sampler.close()


def test_sampler_publishes_samples_to_subscribers() -> None:
    service = RecordingStatsService()
    sampler = TrexStatsSampler(service, interval_seconds=0.01)

    async def exercise() -> None:
        subscription = sampler.subscribe()
        sample = await asyncio.wait_for(subscription.__anext__(), timeout=1)

        assert sample["ok"] is True
        assert sample["data"] == {"global": {"tx_pps": 1}}
        assert isinstance(sample["sequence"], int)
        subscription.close()
        assert sampler.subscriber_count == 0

    asyncio.run(exercise())
    sampler.close()


def test_sampler_sends_latest_sample_to_new_subscriber() -> None:
    service = RecordingStatsService()
    sampler = TrexStatsSampler(service, interval_seconds=1)
    sampler.record_result(TrexCallResult(True, data={"global": {"tx_pps": 7}}))

    async def exercise() -> None:
        subscription = sampler.subscribe()
        sample = await asyncio.wait_for(subscription.__anext__(), timeout=1)

        assert sample["data"] == {"global": {"tx_pps": 7}}
        subscription.close()

    asyncio.run(exercise())
    sampler.close()


def test_sampler_publishes_error_samples() -> None:
    service = RecordingStatsService(TrexCallResult(False, blocker="trex_connect_failed", error="offline"))
    sampler = TrexStatsSampler(service, interval_seconds=0.01)

    async def exercise() -> None:
        subscription = sampler.subscribe()
        sample = await asyncio.wait_for(subscription.__anext__(), timeout=1)

        assert sample["ok"] is False
        assert sample["blocker"] == "trex_connect_failed"
        assert sample["error"] == "offline"
        subscription.close()

    asyncio.run(exercise())
    sampler.close()


def test_unsubscribe_wakes_waiting_consumer() -> None:
    service = RecordingStatsService()
    sampler = TrexStatsSampler(service, interval_seconds=60)

    async def exercise() -> None:
        subscription = sampler.subscribe()
        await asyncio.wait_for(subscription.__anext__(), timeout=1)
        waiting = asyncio.create_task(subscription.__anext__())
        await asyncio.sleep(0)

        subscription.close()

        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(waiting, timeout=1)
        assert sampler.subscriber_count == 0

    asyncio.run(exercise())
    sampler.close()


def test_sampler_close_wakes_waiting_consumer() -> None:
    service = RecordingStatsService()
    sampler = TrexStatsSampler(service, interval_seconds=60)

    async def exercise() -> None:
        subscription = sampler.subscribe()
        await asyncio.wait_for(subscription.__anext__(), timeout=1)
        waiting = asyncio.create_task(subscription.__anext__())
        await asyncio.sleep(0)

        sampler.close()

        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(waiting, timeout=1)
        assert subscription.closed is True
        assert sampler.subscriber_count == 0

    asyncio.run(exercise())


def test_sampler_rejects_subscribers_above_configured_limit() -> None:
    service = RecordingStatsService()
    sampler = TrexStatsSampler(service, interval_seconds=60, max_subscribers=1)

    async def exercise() -> None:
        subscription = sampler.subscribe()

        with pytest.raises(StatsSubscriberLimitError, match="subscriber limit"):
            sampler.subscribe()

        subscription.close()

    asyncio.run(exercise())
    sampler.close()
