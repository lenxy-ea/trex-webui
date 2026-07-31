from __future__ import annotations

from typing import Any, Callable

from app.core.settings import TrexEnvironment
from app.trex.capture_decode import _capture_packet_record
from app.trex.capture_file_operations import capture_file_error_result
from app.trex.capture_files import (
    CaptureFileError,
    capture_saved_file_record,
    normalize_capture_file_name,
    packet_bytes_from_value,
    write_capture_pcap,
)
from app.trex.capture_requests import (
    CAPTURE_FETCH_BYTES_MAX,
    CAPTURE_FETCH_COUNT_MAX,
    CAPTURE_FETCH_LIMIT_MAX,
    CAPTURE_LIMIT_MAX,
    CAPTURE_SNAPLEN_MAX,
    CaptureRequestValidationError,
    bounded_capture_int,
    normalize_capture_filter,
    normalize_capture_id,
    normalize_capture_mode,
)
from app.trex.capture_runtime import CaptureRuntime
from app.trex.capture_state import (
    capture_status_payload,
    capture_status_records,
    dedupe_ports,
)
from app.trex.port_operations import (
    _ensure_port_exists,
    _normalize_port_list,
)
from app.trex.result import TrexCallResult

WithClient = Callable[[Callable[[Any], dict[str, Any]]], TrexCallResult]
CAPTURE_STOP_FETCH_LIMIT = 50


def _assert_managed_capture_authority(
    capture_runtime: CaptureRuntime,
    captures: Any,
    capture_ids: list[int | str],
) -> None:
    records = capture_status_records(captures)
    records_by_id = capture_runtime._records_by_id(records)
    for capture_id in capture_ids:
        capture_runtime.assert_runtime_authority(capture_id)
        record = records_by_id.get(str(capture_id))
        if record is not None:
            capture_runtime.assert_capture_identity(capture_id, record)


def _error_record(stage: str, exc: Exception) -> dict[str, str]:
    error = str(exc).strip() or exc.__class__.__name__
    return {"stage": stage, "error": error}


def _error_summary(primary_error: dict[str, str] | None, cleanup_errors: list[dict[str, str]]) -> str:
    parts: list[str] = []
    if primary_error is not None:
        parts.append(f"{primary_error['stage']}: {primary_error['error']}")
    if cleanup_errors:
        cleanup = "; ".join(f"{item['stage']}: {item['error']}" for item in cleanup_errors)
        parts.append(f"cleanup failed ({cleanup})")
    return "; ".join(parts)


def _cleanup_pending_capture_start(
    client: Any,
    capture_runtime: CaptureRuntime,
    pending_id: str,
    capture_id: int,
) -> list[dict[str, str]]:
    cleanup_errors: list[dict[str, str]] = []
    try:
        capture_runtime.require_pending_start_cleanup(
            pending_id,
            capture_id,
        )
    except Exception as exc:
        return [
            _error_record("capture_cleanup_authority_persist", exc),
        ]

    recorder_absent = False
    try:
        capture_runtime.assert_runtime_authority(capture_id)
        _remove_capture_recorder(client, capture_id)
        recorder_absent = True
    except Exception as exc:
        cleanup_errors.append(_error_record("capture_remove", exc))
    service_mode_restored = False
    if recorder_absent:
        try:
            capture_runtime.restore_service_mode(client, [capture_id])
            service_mode_restored = True
        except Exception as exc:
            cleanup_errors.append(_error_record("service_mode_restore", exc))
    if service_mode_restored:
        try:
            capture_runtime.release_ports(client, [capture_id])
        except Exception as exc:
            cleanup_errors.append(_error_record("port_release", exc))
    return cleanup_errors


def _stop_capture_recorder(client: Any, capture_id: int) -> int:
    response = client._transmit("capture", params={"command": "stop", "capture_id": capture_id})
    if not response:
        raise RuntimeError(str(response))
    response_data = response.data()
    if not isinstance(response_data, dict):
        raise RuntimeError("TRex capture stop response must be an object")
    packet_count = response_data.get("pkt_count")
    if isinstance(packet_count, bool) or not isinstance(packet_count, int) or packet_count < 0:
        raise RuntimeError("TRex capture stop response has an invalid pkt_count")
    return packet_count


def _remove_capture_recorder(client: Any, capture_id: int) -> None:
    response = client._transmit("capture", params={"command": "remove", "capture_id": capture_id})
    if not response:
        raise RuntimeError(str(response))


def _fetch_capture_packets_bounded(
    client: Any,
    capture_id: int,
    pkt_count: int,
    fetch_limit: int,
    snaplen: int,
    available_packet_count: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    target_packet_count = pkt_count
    if available_packet_count is not None:
        target_packet_count = min(target_packet_count, available_packet_count)

    effective_snaplen = snaplen or CAPTURE_SNAPLEN_MAX
    packets: list[dict[str, Any]] = []
    fetched_bytes = 0
    byte_budget_exhausted = False

    while len(packets) < target_packet_count:
        remaining_bytes = CAPTURE_FETCH_BYTES_MAX - fetched_bytes
        packet_capacity = remaining_bytes // effective_snaplen
        if packet_capacity <= 0:
            byte_budget_exhausted = True
            break
        batch_count = min(target_packet_count - len(packets), fetch_limit, packet_capacity)
        batch: list[dict[str, Any]] = []
        client.fetch_capture_packets(
            capture_id,
            batch,
            pkt_count=batch_count,
            fetch_limit=min(fetch_limit, batch_count),
            snaplen=effective_snaplen,
        )
        if len(batch) > batch_count:
            raise RuntimeError("TRex capture fetch exceeded the requested packet batch")

        for packet in batch:
            if not isinstance(packet, dict):
                raise RuntimeError("TRex capture fetch returned a non-object packet")
            packet_size = len(packet_bytes_from_value(packet.get("binary")))
            if packet_size > effective_snaplen:
                raise RuntimeError("TRex capture fetch exceeded the requested snaplen")
            if fetched_bytes + packet_size > CAPTURE_FETCH_BYTES_MAX:
                raise RuntimeError("TRex capture fetch exceeded the byte budget")
            packets.append(packet)
            fetched_bytes += packet_size

        if len(batch) < batch_count:
            break

    budget: dict[str, Any] = {
        "requested_packet_count": pkt_count,
        "target_packet_count": target_packet_count,
        "max_packet_count": CAPTURE_FETCH_COUNT_MAX,
        "max_bytes": CAPTURE_FETCH_BYTES_MAX,
        "fetched_bytes": fetched_bytes,
        "effective_snaplen": effective_snaplen,
        "truncated_by_byte_budget": byte_budget_exhausted,
    }
    if available_packet_count is not None:
        budget["available_packet_count"] = available_packet_count
        budget["omitted_packet_count"] = max(0, available_packet_count - len(packets))
    return packets, budget


def _capture_request_validation_error_result(exc: CaptureRequestValidationError) -> TrexCallResult:
    return TrexCallResult(False, blocker=exc.blocker, error=exc.error)


def _capture_status_with_service_mode(
    capture_runtime: CaptureRuntime,
    captures: Any,
    service_mode: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = capture_status_payload(captures)
    payload["service_mode"] = capture_runtime.public_service_mode(service_mode)
    payload["service_mode"]["managed_capture_ids"] = capture_runtime.managed_capture_ids()
    return payload


def capture_status(with_client: WithClient, capture_runtime: CaptureRuntime) -> TrexCallResult:
    def collect(client: Any) -> dict[str, Any]:
        captures = client.get_capture_status()
        service_mode = capture_runtime.reconcile(client, captures)
        return _capture_status_with_service_mode(
            capture_runtime,
            client.get_capture_status(),
            service_mode,
        )

    return with_client(collect)


def start_capture(
    with_client: WithClient,
    capture_runtime: CaptureRuntime,
    tx_ports: list[int] | None,
    rx_ports: list[int] | None,
    limit: int,
    mode: str,
    bpf_filter: str,
    snaplen: int,
) -> TrexCallResult:
    normalized_tx = _normalize_port_list(tx_ports)
    if isinstance(normalized_tx, TrexCallResult):
        return normalized_tx
    normalized_rx = _normalize_port_list(rx_ports)
    if isinstance(normalized_rx, TrexCallResult):
        return normalized_rx
    if not normalized_tx and not normalized_rx:
        return TrexCallResult(False, blocker="capture_ports_missing", error="at least one TX or RX port is required")
    try:
        normalized_limit = bounded_capture_int(limit, 1, CAPTURE_LIMIT_MAX, "capture_limit_invalid", "limit")
        normalized_snaplen = bounded_capture_int(snaplen, 0, CAPTURE_SNAPLEN_MAX, "capture_snaplen_invalid", "snaplen")
        normalized_filter = normalize_capture_filter(bpf_filter)
        normalized_mode = normalize_capture_mode(mode)
    except CaptureRequestValidationError as exc:
        return _capture_request_validation_error_result(exc)

    def start(client: Any) -> dict[str, Any]:
        initial_captures = client.get_capture_status()
        capture_runtime.reconcile(client, initial_captures)
        before = capture_runtime.validated_capture_status_records(
            client.get_capture_status()
        )
        operation_authority = capture_runtime.current_authority()
        capture_runtime.assert_all_runtime_authorities()
        capture_ports = dedupe_ports([*(normalized_tx or []), *(normalized_rx or [])])
        for port in capture_ports:
            _ensure_port_exists(client, port)
        try:
            pending_id = capture_runtime.begin_capture_start(
                client,
                capture_ports,
                normalized_tx or [],
                normalized_rx or [],
                normalized_filter,
                before,
                operation_authority,
            )
        except Exception as exc:
            raise RuntimeError(
                _error_summary(
                    _error_record("capture_start_intent_persist", exc),
                    [],
                )
            ) from exc

        try:
            service_mode = capture_runtime.prepare_capture_hardware(
                client,
                pending_id,
            )
            capture_runtime.mark_capture_rpc_attempted(pending_id)
        except Exception as exc:
            recovery_errors: list[dict[str, str]] = []
            try:
                capture_runtime.reconcile(
                    client,
                    client.get_capture_status(),
                )
            except Exception as recovery_exc:
                recovery_errors.append(
                    _error_record("capture_start_recovery", recovery_exc)
                )
            raise RuntimeError(
                _error_summary(
                    _error_record("capture_start_prepare", exc),
                    recovery_errors,
                )
                + (
                    f"; recovery ledger {pending_id} retained"
                    if capture_runtime.is_managed_capture_id(pending_id)
                    else ""
                )
            ) from exc

        result: Any = None
        start_error: Exception | None = None
        try:
            capture_runtime.assert_runtime_authority(pending_id)
            result = client.start_capture(
                tx_ports=normalized_tx or [],
                rx_ports=normalized_rx or [],
                limit=normalized_limit,
                mode=normalized_mode,
                bpf_filter=normalized_filter,
                snaplen=normalized_snaplen,
            )
        except Exception as exc:
            start_error = exc

        try:
            after = capture_runtime.validated_capture_status_records(
                client.get_capture_status()
            )
            resolution = capture_runtime.pending_start_resolution(
                pending_id,
                after,
            )
        except Exception as exc:
            primary_error = (
                _error_record("capture_start", start_error)
                if start_error is not None
                else _error_record("capture_start_verification", exc)
            )
            recovery_errors = (
                [_error_record("capture_start_recovery", exc)]
                if start_error is not None
                else []
            )
            raise RuntimeError(
                _error_summary(primary_error, recovery_errors)
                + f"; recovery ledger {pending_id} retained"
            ) from exc

        response_error: dict[str, str] | None = None
        capture_id: int | None = None
        if start_error is not None:
            response_error = _error_record("capture_start", start_error)
        elif not isinstance(result, dict):
            response_error = {
                "stage": "capture_start_response",
                "error": "TRex capture start response must be an object",
            }
        else:
            try:
                capture_id = normalize_capture_id(result.get("id"))
            except CaptureRequestValidationError as exc:
                response_error = _error_record(
                    "capture_start_response",
                    exc,
                )

        if (
            response_error is None
            and capture_id is not None
            and resolution.capture_id == capture_id
        ):
            try:
                capture_runtime.promote_pending_start(pending_id, capture_id)
            except Exception as exc:
                cleanup_errors = _cleanup_pending_capture_start(
                    client,
                    capture_runtime,
                    pending_id,
                    resolution.capture_id,
                )
                raise RuntimeError(
                    _error_summary(
                        _error_record("capture_authority_persist", exc),
                        cleanup_errors,
                    )
                ) from exc
            service_mode["managed_capture_ids"] = [capture_id]
            return {
                "accepted": True,
                "id": capture_id,
                "start_ts": result.get("ts"),
                "tx_ports": normalized_tx or [],
                "rx_ports": normalized_rx or [],
                "limit": normalized_limit,
                "mode": normalized_mode,
                "bpf_filter": normalized_filter,
                "snaplen": normalized_snaplen,
                **_capture_status_with_service_mode(
                    capture_runtime,
                    after,
                    service_mode,
                ),
            }

        if response_error is None:
            response_error = {
                "stage": "capture_start_verification",
                "error": (
                    f"TRex returned capture id {capture_id!r}, but the uniquely "
                    f"attributable recorder is {resolution.capture_id!r}"
                ),
            }
        if resolution.capture_id is None:
            raise RuntimeError(
                _error_summary(response_error, [])
                + "; no uniquely attributable live recorder is visible yet; "
                f"recovery ledger {pending_id} retained"
            )
        cleanup_errors = _cleanup_pending_capture_start(
            client,
            capture_runtime,
            pending_id,
            resolution.capture_id,
        )
        recovery_suffix = (
            f"; recovery ledger retained for capture {resolution.capture_id}"
            if (
                capture_runtime.is_pending_capture_id(pending_id)
                or (
                    resolution.capture_id is not None
                    and capture_runtime.is_cleanup_required_capture_id(
                        resolution.capture_id
                    )
                )
            )
            else ""
        )
        raise RuntimeError(
            _error_summary(response_error, cleanup_errors) + recovery_suffix
        )

    return with_client(start)


def fetch_capture(
    with_client: WithClient,
    capture_runtime: CaptureRuntime,
    capture_id: int,
    pkt_count: int,
    fetch_limit: int,
    snaplen: int,
) -> TrexCallResult:
    try:
        normalized_capture_id = normalize_capture_id(capture_id)
        normalized_pkt_count = bounded_capture_int(
            pkt_count,
            1,
            CAPTURE_FETCH_COUNT_MAX,
            "capture_fetch_count_invalid",
            "pkt_count",
        )
        normalized_fetch_limit = bounded_capture_int(
            fetch_limit,
            1,
            CAPTURE_FETCH_LIMIT_MAX,
            "capture_fetch_limit_invalid",
            "fetch_limit",
        )
        normalized_snaplen = bounded_capture_int(snaplen, 0, CAPTURE_SNAPLEN_MAX, "capture_snaplen_invalid", "snaplen")
    except CaptureRequestValidationError as exc:
        return _capture_request_validation_error_result(exc)

    def fetch(client: Any) -> dict[str, Any]:
        if capture_runtime.is_managed_capture_id(normalized_capture_id):
            _assert_managed_capture_authority(
                capture_runtime,
                client.get_capture_status(),
                [normalized_capture_id],
            )
        packets, fetch_budget = _fetch_capture_packets_bounded(
            client,
            normalized_capture_id,
            normalized_pkt_count,
            normalized_fetch_limit,
            normalized_snaplen,
        )
        return {
            "accepted": True,
            "id": normalized_capture_id,
            "packets": [_capture_packet_record(packet) for packet in packets],
            "packet_count": len(packets),
            "fetch_budget": fetch_budget,
            **_capture_status_with_service_mode(capture_runtime, client.get_capture_status()),
        }

    return with_client(fetch)


def stop_capture(
    env: TrexEnvironment,
    with_client: WithClient,
    capture_runtime: CaptureRuntime,
    capture_id: int,
    pkt_count: int,
    save_pcap: bool,
    file_name: str | None,
    snaplen: int,
) -> TrexCallResult:
    try:
        normalized_capture_id = normalize_capture_id(capture_id)
        normalized_pkt_count = bounded_capture_int(
            pkt_count,
            1,
            CAPTURE_FETCH_COUNT_MAX,
            "capture_fetch_count_invalid",
            "pkt_count",
        )
        normalized_snaplen = bounded_capture_int(snaplen, 0, CAPTURE_SNAPLEN_MAX, "capture_snaplen_invalid", "snaplen")
    except CaptureRequestValidationError as exc:
        return _capture_request_validation_error_result(exc)
    try:
        normalized_file_name = normalize_capture_file_name(file_name)
    except CaptureFileError as exc:
        if save_pcap:
            return capture_file_error_result(exc)
        normalized_file_name = None

    def stop(client: Any) -> dict[str, Any]:
        _assert_managed_capture_authority(
            capture_runtime,
            client.get_capture_status(),
            [normalized_capture_id],
        )
        packets: list[dict[str, Any]] = []
        packet_records: list[dict[str, Any]] = []
        fetch_budget: dict[str, Any] = {
            "requested_packet_count": normalized_pkt_count,
            "target_packet_count": 0,
            "max_packet_count": CAPTURE_FETCH_COUNT_MAX,
            "max_bytes": CAPTURE_FETCH_BYTES_MAX,
            "fetched_bytes": 0,
            "effective_snaplen": normalized_snaplen or CAPTURE_SNAPLEN_MAX,
            "truncated_by_byte_budget": False,
            "available_packet_count": None,
            "omitted_packet_count": None,
        }
        saved_file = None
        available_packet_count: int | None = None
        capture_stopped = False
        capture_removed = False
        primary_error: dict[str, str] | None = None
        cleanup_errors: list[dict[str, str]] = []

        primary_stage = "capture_stop"
        try:
            available_packet_count = _stop_capture_recorder(client, normalized_capture_id)
            capture_stopped = True
            primary_stage = "packet_fetch"
            packets, fetch_budget = _fetch_capture_packets_bounded(
                client,
                normalized_capture_id,
                normalized_pkt_count,
                CAPTURE_STOP_FETCH_LIMIT,
                normalized_snaplen,
                available_packet_count,
            )
            if save_pcap:
                primary_stage = "pcap_write"
                target = write_capture_pcap(
                    env,
                    normalized_capture_id,
                    packets,
                    normalized_file_name if isinstance(normalized_file_name, str) else None,
                )
                primary_stage = "saved_file_record"
                saved_file = capture_saved_file_record(target, include_content=True)
            primary_stage = "packet_decode"
            packet_records = [_capture_packet_record(packet) for packet in packets]
        except Exception as exc:
            primary_error = _error_record(primary_stage, exc)

        try:
            capture_runtime.assert_runtime_authority(normalized_capture_id)
            _remove_capture_recorder(client, normalized_capture_id)
            capture_removed = True
        except Exception as exc:
            cleanup_errors.append(_error_record("capture_remove", exc))

        service_mode = capture_runtime.service_mode_payload()
        service_mode_restored = False
        if capture_removed:
            try:
                service_mode = capture_runtime.restore_service_mode(client, [normalized_capture_id])
                service_mode_restored = True
            except Exception as exc:
                cleanup_errors.append(_error_record("service_mode_restore", exc))

        # Recorder deletion and service-mode restoration are prerequisites for
        # releasing ports. Keep the runtime ledger intact on either failure so
        # a later Remove or Disconnect can retry cleanup safely.
        if service_mode_restored:
            try:
                capture_runtime.release_ports(client, [normalized_capture_id])
            except Exception as exc:
                cleanup_errors.append(_error_record("port_release", exc))

        try:
            capture_status = _capture_status_with_service_mode(
                capture_runtime,
                client.get_capture_status(),
                service_mode,
            )
        except Exception as exc:
            cleanup_errors.append(_error_record("capture_status", exc))
            capture_status = {
                **capture_status_payload([]),
                "service_mode": capture_runtime.public_service_mode(service_mode),
            }
            capture_status["service_mode"]["managed_capture_ids"] = capture_runtime.managed_capture_ids()

        return {
            "accepted": primary_error is None and not cleanup_errors,
            "id": normalized_capture_id,
            "packets": packet_records,
            "packet_count": len(packet_records),
            "saved_file": saved_file,
            "fetch_budget": fetch_budget,
            "capture_stopped": capture_stopped,
            "capture_removed": capture_removed,
            "available_packet_count": available_packet_count,
            "primary_error": primary_error,
            "cleanup_errors": cleanup_errors,
            **capture_status,
        }

    result = with_client(stop)
    if not result.ok:
        return result
    payload = result.data
    primary_error = payload.get("primary_error")
    cleanup_errors = payload.get("cleanup_errors")
    if primary_error is None and not cleanup_errors:
        return result
    normalized_cleanup_errors = cleanup_errors if isinstance(cleanup_errors, list) else []
    normalized_primary_error = primary_error if isinstance(primary_error, dict) else None
    return TrexCallResult(
        False,
        data=payload,
        blocker="trex_command_failed" if normalized_primary_error is not None else "capture_cleanup_failed",
        error=_error_summary(normalized_primary_error, normalized_cleanup_errors),
    )


def remove_all_captures(with_client: WithClient, capture_runtime: CaptureRuntime) -> TrexCallResult:
    def remove(client: Any) -> dict[str, Any]:
        before = capture_runtime.validated_capture_status_records(
            client.get_capture_status()
        )
        reconciled_service_mode = capture_runtime.reconcile(client, before)
        _assert_managed_capture_authority(
            capture_runtime,
            before,
            capture_runtime.managed_capture_ids(),
        )
        for capture_id in capture_runtime.managed_capture_ids():
            capture_runtime.assert_runtime_authority(capture_id)
        client.remove_all_captures()
        capture_ids = [record["id"] for record in before]
        capture_ids.extend(capture_id for capture_id in capture_runtime.managed_capture_ids() if capture_id not in capture_ids)
        service_mode = capture_runtime.restore_service_mode(client, capture_ids)
        capture_runtime.release_ports(client, capture_ids)
        reconciled_released_ids = reconciled_service_mode.get(
            "released_capture_ids",
            [],
        )
        if isinstance(reconciled_released_ids, list):
            service_mode["released_capture_ids"] = list(
                dict.fromkeys(
                    [
                        *reconciled_released_ids,
                        *service_mode.get("released_capture_ids", []),
                    ]
                )
            )
        reconciled_restored_ports = reconciled_service_mode.get(
            "restored_ports",
            [],
        )
        if isinstance(reconciled_restored_ports, list):
            service_mode["restored_ports"] = sorted(
                set(reconciled_restored_ports).union(
                    service_mode.get("restored_ports", [])
                )
            )
        return {
            "accepted": True,
            "removed_ids": [record["id"] for record in before],
            **_capture_status_with_service_mode(capture_runtime, client.get_capture_status(), service_mode),
        }

    return with_client(remove)


def remove_capture(with_client: WithClient, capture_runtime: CaptureRuntime, capture_id: int) -> TrexCallResult:
    try:
        normalized_capture_id = normalize_capture_id(capture_id)
    except CaptureRequestValidationError as exc:
        return _capture_request_validation_error_result(exc)

    def remove(client: Any) -> dict[str, Any]:
        before = capture_runtime.validated_capture_status_records(
            client.get_capture_status()
        )
        was_managed = capture_runtime.is_managed_capture_id(
            normalized_capture_id
        ) or capture_runtime.was_stale_generation_capture_id(
            normalized_capture_id
        )
        service_mode = capture_runtime.reconcile(client, before)
        live_ids = {int(record["id"]) for record in before}
        if (
            was_managed
            and normalized_capture_id not in live_ids
            and not capture_runtime.is_managed_capture_id(
                normalized_capture_id
            )
        ):
            return {
                "accepted": True,
                "removed_ids": [normalized_capture_id],
                "captures_before": before,
                **_capture_status_with_service_mode(
                    capture_runtime,
                    client.get_capture_status(),
                    service_mode,
                ),
            }
        _assert_managed_capture_authority(
            capture_runtime,
            before,
            [normalized_capture_id],
        )
        capture_runtime.assert_runtime_authority(normalized_capture_id)
        if hasattr(client, "remove_capture"):
            client.remove_capture(normalized_capture_id)
        else:
            rc = client._transmit("capture", params={"command": "remove", "capture_id": normalized_capture_id})
            if not rc:
                raise ValueError(str(rc))
        service_mode = capture_runtime.restore_service_mode(client, [normalized_capture_id])
        capture_runtime.release_ports(client, [normalized_capture_id])
        return {
            "accepted": True,
            "removed_ids": [normalized_capture_id],
            "captures_before": before,
            **_capture_status_with_service_mode(capture_runtime, client.get_capture_status(), service_mode),
        }

    return with_client(remove)
