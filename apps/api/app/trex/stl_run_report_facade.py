from __future__ import annotations

from typing import Any

from app.trex.result import TrexCallResult
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
    ) -> TrexCallResult:
        return _save_run_report(self.env, title, markdown, payload, file_name=file_name)

    def download_run_report(self, file_name: str) -> TrexCallResult:
        return _download_run_report(self.env, file_name)

    def run_report_trends(self, limit: int = 30) -> TrexCallResult:
        return _run_report_trends(self.env, limit=limit)
