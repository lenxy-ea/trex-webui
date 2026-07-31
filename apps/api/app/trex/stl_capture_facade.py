from __future__ import annotations

from typing import Optional

from app.trex.capture_file_operations import (
    download_capture_file as _download_capture_file,
    list_capture_files as _list_capture_files,
    open_capture_file as _open_capture_file,
)
from app.trex.capture_operations import (
    capture_status as _capture_status,
    fetch_capture as _fetch_capture,
    remove_all_captures as _remove_all_captures,
    remove_capture as _remove_capture,
    start_capture as _start_capture,
    stop_capture as _stop_capture,
)
from app.trex.result import TrexCallResult


class StlCaptureFacadeMixin:
    def capture_status(self) -> TrexCallResult:
        return _capture_status(self._with_client, self._capture_runtime)

    def start_capture(
        self,
        tx_ports: Optional[list[int]],
        rx_ports: Optional[list[int]],
        limit: int,
        mode: str,
        bpf_filter: str,
        snaplen: int,
    ) -> TrexCallResult:
        return _start_capture(
            self._with_client,
            self._capture_runtime,
            tx_ports,
            rx_ports,
            limit,
            mode,
            bpf_filter,
            snaplen,
        )

    def fetch_capture(
        self,
        capture_id: int,
        pkt_count: int,
        fetch_limit: int,
        snaplen: int,
    ) -> TrexCallResult:
        return _fetch_capture(self._with_client, self._capture_runtime, capture_id, pkt_count, fetch_limit, snaplen)

    def stop_capture(
        self,
        capture_id: int,
        pkt_count: int,
        save_pcap: bool,
        file_name: Optional[str],
        snaplen: int,
    ) -> TrexCallResult:
        return _stop_capture(
            self.env,
            self._with_client,
            self._capture_runtime,
            capture_id,
            pkt_count,
            save_pcap,
            file_name,
            snaplen,
        )

    def remove_all_captures(self) -> TrexCallResult:
        return _remove_all_captures(self._with_client, self._capture_runtime)

    def remove_capture(self, capture_id: int) -> TrexCallResult:
        return _remove_capture(self._with_client, self._capture_runtime, capture_id)

    def list_capture_files(self) -> TrexCallResult:
        return _list_capture_files(self.env)

    def download_capture_file(self, file_name: str) -> TrexCallResult:
        return _download_capture_file(self.env, file_name)

    def open_capture_file(self, file_name: str) -> TrexCallResult:
        return _open_capture_file(self.env, file_name, self.capture_file_opener)
