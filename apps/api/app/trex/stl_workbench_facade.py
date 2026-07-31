from __future__ import annotations

from typing import Any

from app.trex.result import TrexCallResult
from app.trex.workbench_operations import (
    export_workbench_profile_yaml as _export_workbench_profile_yaml,
    export_workbench_stream_pcap as _export_workbench_stream_pcap,
    import_workbench_pcap as _import_workbench_pcap,
    load_workbench_profile as _load_workbench_profile,
    render_workbench_profile as _render_workbench_profile,
    save_workbench_profile as _save_workbench_profile,
)
from app.trex.workbench_values import PROFILE_PCAP_MAX_PACKETS


class StlWorkbenchFacadeMixin:
    def render_workbench_profile(self, streams: list[dict[str, Any]]) -> TrexCallResult:
        return _render_workbench_profile(streams)

    def save_workbench_profile(self, profile_name: str, streams: list[dict[str, Any]]) -> TrexCallResult:
        return _save_workbench_profile(self.env, profile_name, streams)

    def export_workbench_profile_yaml(self, profile_name: str, streams: list[dict[str, Any]]) -> TrexCallResult:
        return _export_workbench_profile_yaml(profile_name, streams)

    def export_workbench_stream_pcap(self, stream: dict[str, Any], file_name: str | None = None) -> TrexCallResult:
        return _export_workbench_stream_pcap(stream, file_name)

    def import_workbench_pcap(
        self,
        file_name: str,
        content_base64: str,
        max_packets: int = PROFILE_PCAP_MAX_PACKETS,
        options: dict[str, Any] | None = None,
    ) -> TrexCallResult:
        return _import_workbench_pcap(file_name, content_base64, max_packets=max_packets, options=options)

    def load_workbench_profile(self, profile_path: str) -> TrexCallResult:
        return _load_workbench_profile(self.env, profile_path, self.resolve_profile_path)
