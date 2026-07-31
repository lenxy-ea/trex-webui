from __future__ import annotations

import copy
from typing import Any

from app.trex.result import TrexCallResult
from app.trex.runtime_mutation import runtime_mutation_fence
from app.trex.runtime_state import RuntimeStateError
from app.trex.run_report_operations import (
    download_run_report as _download_run_report,
    list_run_reports as _list_run_reports,
    run_report_trends as _run_report_trends,
    save_run_report as _save_run_report,
)


class StlRunReportFacadeMixin:
    def list_run_reports(self) -> TrexCallResult:
        return _list_run_reports(self.env)

    def save_run_report(
        self,
        title: str,
        markdown: str,
        payload: dict[str, Any],
        file_name: str | None = None,
        traffic_session_id: str | None = None,
        traffic_session_revision: int | None = None,
    ) -> TrexCallResult:
        if (traffic_session_id is None) != (traffic_session_revision is None):
            return TrexCallResult(
                False,
                blocker="run_report_session_binding_invalid",
                error=(
                    "traffic_session_id and traffic_session_revision must be "
                    "supplied together"
                ),
            )
        with runtime_mutation_fence():
            try:
                document = self._runtime_state_store.load()
            except RuntimeStateError as exc:
                return TrexCallResult(
                    False,
                    blocker="run_report_session_state_invalid",
                    error=str(exc),
                )

            canonical_payload = copy.deepcopy(payload)
            if traffic_session_id is None:
                reserved = sorted(
                    key
                    for key in ("traffic_session", "traffic_session_binding")
                    if key in canonical_payload
                )
                if reserved:
                    return TrexCallResult(
                        False,
                        blocker="run_report_session_binding_required",
                        error=(
                            "unbound reports cannot supply backend-owned traffic "
                            f"session fields: {', '.join(reserved)}"
                        ),
                    )
            else:
                if document.traffic_mutation_intent is not None:
                    return TrexCallResult(
                        False,
                        blocker="run_report_session_mutation_pending",
                        error=(
                            "the traffic session has an uncommitted durable mutation; "
                            "refresh after recovery completes"
                        ),
                    )
                session = document.traffic_session
                if (
                    session is None
                    or session.id != traffic_session_id
                    or session.revision != traffic_session_revision
                ):
                    observed = (
                        "none"
                        if session is None
                        else f"{session.id}@{session.revision}"
                    )
                    return TrexCallResult(
                        False,
                        blocker="run_report_session_conflict",
                        error=(
                            "traffic session changed before report save; "
                            f"expected {traffic_session_id}@{traffic_session_revision}, "
                            f"observed {observed}"
                        ),
                    )
                if session.evidence_version != 1:
                    return TrexCallResult(
                        False,
                        blocker="run_report_session_evidence_unavailable",
                        error=(
                            "the selected legacy traffic session has no certifiable "
                            "backend evidence; start a new traffic session"
                        ),
                    )
                canonical_payload["traffic_session"] = session.model_dump(
                    mode="json"
                )
                canonical_payload["traffic_session_binding"] = {
                    "id": session.id,
                    "revision": session.revision,
                    "evidence_version": session.evidence_version,
                }
            return _save_run_report(
                self.env,
                title,
                markdown,
                canonical_payload,
                file_name=file_name,
            )

    def download_run_report(self, file_name: str) -> TrexCallResult:
        return _download_run_report(self.env, file_name)

    def run_report_trends(self, limit: int = 30) -> TrexCallResult:
        return _run_report_trends(self.env, limit=limit)
