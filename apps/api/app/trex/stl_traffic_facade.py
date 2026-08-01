from __future__ import annotations

import threading
import weakref
from datetime import datetime
from typing import Any, Optional

from app.trex.result import TrexCallResult
from app.trex.traffic_runtime import TrafficRuntimeAuthority


_TRAFFIC_AUTHORITIES_LOCK = threading.Lock()
_TRAFFIC_AUTHORITIES: weakref.WeakKeyDictionary[Any, TrafficRuntimeAuthority] = weakref.WeakKeyDictionary()


def _traffic_authority(service: Any) -> TrafficRuntimeAuthority:
    with _TRAFFIC_AUTHORITIES_LOCK:
        authority = _TRAFFIC_AUTHORITIES.get(service)
        if authority is None:
            authority = TrafficRuntimeAuthority(
                service.env,
                service.resolve_profile_path,
                service._with_client,
                store=service._runtime_state_store,
                runtime_authority=service._runtime_authority,
            )
            _TRAFFIC_AUTHORITIES[service] = authority
        return authority


class StlTrafficFacadeMixin:
    def traffic_runtime_snapshot(self) -> TrexCallResult:
        return _traffic_authority(self).snapshot()

    def reap_expired_traffic_hard_stops(
        self,
        now: datetime | None = None,
    ) -> TrexCallResult:
        return _traffic_authority(self).reap_expired_hard_stops(now)

    def retire_traffic_after_trex_termination(self) -> TrexCallResult:
        return _traffic_authority(self).retire_after_trex_termination()

    def replace_traffic_plan(
        self,
        expected_revision: int,
        groups: list[dict[str, Any]],
    ) -> TrexCallResult:
        return _traffic_authority(self).replace_plan(expected_revision, groups)

    def start_traffic_group(
        self,
        group_id: str,
        expected_revision: int,
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        return _traffic_authority(self).start_group(
            group_id,
            expected_revision,
            expected_session_id,
            hard_stop_at,
        )

    def traffic_action(
        self,
        action: str,
        ports: Optional[list[int]],
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        return _traffic_authority(self).action(
            action,
            ports,
            expected_session_id=expected_session_id,
        )

    def update_traffic(
        self,
        ports: Optional[list[int]],
        multiplier: str,
        force: bool,
        total: bool,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        return _traffic_authority(self).update(
            ports,
            multiplier,
            force,
            total,
            expected_session_id=expected_session_id,
        )

    def start_profile(
        self,
        profile_path: str,
        ports: Optional[list[int]],
        multiplier: str,
        duration: float,
        force: bool,
        total: bool,
        synchronized: bool,
        clear_existing: bool,
        tunables: dict[str, Any],
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        return _traffic_authority(self).start(
            expected_session_id=expected_session_id,
            profile_path=profile_path,
            ports=ports,
            multiplier=multiplier,
            duration=duration,
            force=force,
            total=total,
            synchronized=synchronized,
            clear_existing=clear_existing,
            tunables=tunables,
            hard_stop_at=hard_stop_at,
        )
