from __future__ import annotations

from typing import Optional

from app.trex.result import TrexCallResult
from app.trex.stats_operations import (
    ProbeResult,
    clear_stats as _clear_stats,
    port_xstats as _port_xstats,
    probe as _probe,
    snapshot as _snapshot,
    stats as _stats,
)


class StlStatsFacadeMixin:
    def probe(self) -> ProbeResult:
        return _probe(self._with_client)

    def snapshot(self) -> TrexCallResult:
        return _snapshot(self._with_client, self._port_attribute_overrides)

    def stats(self, ports: Optional[list[int]] = None) -> TrexCallResult:
        return _stats(self._with_client, ports)

    def clear_stats(
        self,
        ports: Optional[list[int]],
        clear_global: bool,
        clear_flow_stats: bool,
        clear_latency_stats: bool,
        clear_xstats: bool,
    ) -> TrexCallResult:
        return _clear_stats(
            self._with_client,
            ports,
            clear_global,
            clear_flow_stats,
            clear_latency_stats,
            clear_xstats,
        )

    def port_xstats(self, port: int) -> TrexCallResult:
        return _port_xstats(self._with_client, port)
