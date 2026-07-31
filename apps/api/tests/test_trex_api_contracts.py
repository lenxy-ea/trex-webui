from __future__ import annotations

import asyncio
from collections.abc import Iterator

import pytest
from fastapi.exceptions import ResponseValidationError
from fastapi.routing import serialize_response
from fastapi.routing import APIRoute
from pydantic import TypeAdapter, ValidationError

from app.main import app, result_payload
from app.trex.api_contracts import (
    CaptureFileDownloadResultResponse,
    CaptureFileOpenResultResponse,
    CaptureFilesResultResponse,
    CapturePacketResultResponse,
    CaptureRemoveResultResponse,
    CaptureStartResultResponse,
    CaptureStatusResultResponse,
    TrexConnectResponse,
    TrexDisconnectResultResponse,
    TrexPortXstatsResponse,
    TrexPortsResultResponse,
    TrexStatsClearResponse,
    TrexStatsResultResponse,
    TrafficActionResultResponse,
    TrafficStartResultResponse,
)
from app.trex.result import TrexCallResult


def _api_routes() -> Iterator[APIRoute]:
    return (route for route in app.routes if isinstance(route, APIRoute))


def _route(path: str, method: str) -> APIRoute:
    return next(route for route in _api_routes() if route.path == path and method in route.methods)


def test_operator_critical_routes_publish_named_response_contracts() -> None:
    openapi = app.openapi()
    routes = {
        ("/api/system/overview", "get"),
        ("/api/trex/probe", "get"),
        ("/api/trex/ports", "get"),
        ("/api/trex/connect", "post"),
        ("/api/trex/disconnect", "post"),
        ("/api/trex/stats", "get"),
        ("/api/trex/stats/latest", "get"),
        ("/api/trex/stats/clear", "post"),
        ("/api/trex/ports/xstats", "get"),
        ("/api/trex/capture/status", "get"),
        ("/api/trex/capture/start", "post"),
        ("/api/trex/capture/fetch", "post"),
        ("/api/trex/capture/stop", "post"),
        ("/api/trex/capture/remove", "post"),
        ("/api/trex/capture/remove-all", "post"),
        ("/api/trex/capture/files", "get"),
        ("/api/trex/capture/files/download", "post"),
        ("/api/trex/capture/files/open", "post"),
    }

    for path, method in routes:
        response_schema = openapi["paths"][path][method]["responses"]["200"]["content"]["application/json"]["schema"]
        assert "$ref" in response_schema or response_schema.get("anyOf"), (path, method, response_schema)

    stream_content = openapi["paths"]["/api/trex/stats/stream"]["get"]["responses"]["200"]["content"]
    assert set(stream_content) == {"text/event-stream"}
    assert "TrexSampledStatsResultResponse" in openapi["paths"]["/api/trex/stats/stream"]["get"]["responses"]["200"]["description"]

    schemas = openapi["components"]["schemas"]
    assert schemas["TrexDisconnectLifecycle"]["additionalProperties"] is False
    assert set(schemas["TrexDisconnectLifecycle"]["properties"]) >= {
        "disconnected",
        "client_cached",
        "stats_sampler_closed",
        "phase",
        "remaining_capture_ids",
        "capture_id",
    }
    assert set(schemas["CaptureFetchBudgetResponse"]["required"]) >= {
        "requested_packet_count",
        "max_packet_count",
        "max_bytes",
        "fetched_bytes",
        "effective_snaplen",
        "truncated_by_byte_budget",
    }
    assert "daemon_supervisor" in schemas["EnvironmentReadinessResponse"]["required"]
    assert set(schemas["EnvironmentReadinessResponse"]["required"]) >= {
        "runtime_state_path",
        "runtime_state_path_valid",
        "runtime_state_parent_exists",
    }
    assert set(schemas["DaemonPreviewResponse"]["required"]) >= {"available", "blocker"}


def test_exact_response_envelope_rejects_unknown_top_level_fields() -> None:
    route = _route("/api/trex/stats", "GET")
    response_model = route.response_model
    payload = {
        "ok": False,
        "data": None,
        "blocker": "trex_connect_failed",
        "error": "offline",
        "unexpected": "must not be silently filtered",
    }

    assert response_model is TrexStatsResultResponse
    with pytest.raises(ValidationError, match="extra_forbidden"):
        response_model.model_validate(payload)
    with pytest.raises(ResponseValidationError, match="extra_forbidden"):
        asyncio.run(
            serialize_response(
                field=route.response_field,
                response_content=payload,
                exclude_unset=True,
                is_coroutine=True,
            )
        )


def test_dynamic_vendor_bags_remain_open_inside_strict_owned_contracts() -> None:
    stats = TrexStatsResultResponse.model_validate(
        {
            "ok": True,
            "data": {
                0: {"opackets": 7},
                "flow_stats": {7: {"tx_pkts": {"total": 7}}},
                "vendor_section": {"new_counter": 7},
            },
            "blocker": None,
            "error": None,
        }
    )
    ports = TrexPortsResultResponse.model_validate(
        {
            "ok": True,
            "data": {
                "server_version": {"version": "unit"},
                "system_info": {},
                "port_ids": [0],
                "acquired_ports": [],
                "ports": [{"id": 0, "acquired": False, "info": {"vendor_capability": "N/A"}}],
                "warnings": [],
            },
            "blocker": None,
            "error": None,
        }
    )
    captures = CaptureStatusResultResponse.model_validate(
        {
            "ok": True,
            "data": {
                "captures": [{"id": 3, "vendor_recorder_field": {"value": 1}}],
                "port_usage": [],
                "service_mode": {
                    "enabled_ports": [],
                    "already_enabled_ports": [],
                    "restored_ports": [],
                    "managed_capture_ids": [3],
                },
            },
            "blocker": None,
            "error": None,
        }
    )

    assert stats.data is not None
    assert ports.data is not None
    assert captures.data is not None


def test_operator_result_unions_accept_explicit_empty_failure_data() -> None:
    payload = {
        "ok": False,
        "data": None,
        "blocker": "trex_connect_failed",
        "error": "offline",
    }
    result_models = [
        TrexDisconnectResultResponse,
        TrexPortsResultResponse,
        TrexStatsResultResponse,
        TrexStatsClearResponse,
        TrexPortXstatsResponse,
        TrafficStartResultResponse,
        TrafficActionResultResponse,
        CaptureStatusResultResponse,
        CaptureStartResultResponse,
        CapturePacketResultResponse,
        CaptureRemoveResultResponse,
        CaptureFilesResultResponse,
        CaptureFileDownloadResultResponse,
        CaptureFileOpenResultResponse,
    ]

    for response_model in result_models:
        assert response_model.model_validate(payload).data is None
    assert TypeAdapter(TrexConnectResponse).validate_python(payload).data is None


@pytest.mark.parametrize(
    "blocker",
    [
        "traffic_hard_stop_priority",
        "traffic_hard_stop_window_insufficient",
    ],
)
def test_hard_stop_scheduler_evidence_is_not_exposed_as_operator_data(
    blocker: str,
) -> None:
    payload = result_payload(
        TrexCallResult(
            False,
            data={
                "rpc_count": 8,
                "remaining_seconds": 12.0,
                "required_seconds": 25.0,
            },
            blocker=blocker,
            error="TRex RPC is deferred for the hard-stop supervisor",
        )
    )

    assert payload["data"] is None
    assert payload["blocker"] == blocker
    assert payload["error"] == (
        "TRex RPC is deferred for the hard-stop supervisor"
    )
    assert TrafficStartResultResponse.model_validate(payload).data is None
    assert TrafficActionResultResponse.model_validate(payload).data is None


def test_result_payload_preserves_typed_connection_attempt_failure_data() -> None:
    payload = result_payload(
        TrexCallResult(
            False,
            data={
                "connected": False,
                "partial_client_disposed": True,
            },
            blocker="trex_connect_failed",
            error="offline",
        )
    )

    assert payload["data"] == {
        "connected": False,
        "partial_client_disposed": True,
    }
    start = TrafficStartResultResponse.model_validate(payload)
    action = TrafficActionResultResponse.model_validate(payload)
    ports = TrexPortsResultResponse.model_validate(payload)
    assert start.data is not None
    assert action.data is not None
    assert ports.data is not None
