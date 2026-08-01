from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal, Optional, Union

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.background import BackgroundTask

from app.core.settings import (
    get_environment,
    set_runtime_trex_connection,
    validate_runtime_trex_connection_settings,
)
from app.trex.api_contracts import (
    CaptureFileDownloadResultResponse,
    CaptureFileOpenResultResponse,
    CaptureFilesResultResponse,
    CapturePacketResultResponse,
    CaptureRemoveResultResponse,
    CaptureStartResultResponse,
    CaptureStatusResultResponse,
    QuickValidationResultResponse,
    SystemOverviewResponse,
    TrexConnectResponse,
    TrexDisconnectResultResponse,
    TrexPortXstatsResponse,
    TrexPortsResultResponse,
    TrexProbeResponse,
    TrexSampledStatsResultResponse,
    TrexStatsClearResponse,
    TrexStatsResultResponse,
    TrafficActionResultResponse,
    TrafficRuntimeResultResponse,
    TrafficStartResultResponse,
    TrafficUpdateResultResponse,
)
from app.trex.config_model import TrexConfig
from app.trex.dependencies import (
    disconnect_stl_service,
    disconnect_stl_service_for_trex_termination,
    get_stats_sampler,
    get_stl_service,
    retire_traffic_after_trex_termination,
    retire_disconnected_stl_service,
    start_traffic_hard_stop_reaper,
    stop_traffic_hard_stop_reaper,
    trex_termination_transaction,
)
from app.trex.runtime import (
    DAEMON_COMMAND_TIMEOUT_MAX_SECONDS,
    DAEMON_CONFIG_AUDIT_MAX_RECORDS,
    DAEMON_CONFIG_MAX_BYTES,
    DAEMON_CONFIG_VERSION_MAX_FILES,
    DAEMON_CONFIG_VERSION_NAME_MAX_CHARS,
    DAEMON_CONFIG_VERSION_NOTE_MAX_CHARS,
    DAEMON_CONFIG_VERSION_SOURCE_MAX_CHARS,
    DAEMON_FILE_CONTENT_MAX_BYTES,
    DAEMON_FILE_PATH_MAX_CHARS,
    DAEMON_RESERVATION_USER_MAX_CHARS,
    RuntimeManager,
)
from app.trex.capture_requests import (
    CAPTURE_BPF_MAX_CHARS,
    CAPTURE_FETCH_COUNT_MAX,
    CAPTURE_FETCH_LIMIT_MAX,
    CAPTURE_LIMIT_MAX,
    CAPTURE_SNAPLEN_MAX,
)
from app.trex.result import TrexCallResult, public_result_payload
from app.trex.quick_validation import (
    QUICK_VALIDATION_CANCEL_CONFIRMATION,
    QUICK_VALIDATION_CONFIRMATION,
    QuickValidationCancelRequest,
    QuickValidationStartRequest,
    get_quick_validation_authority,
)
from app.trex.runtime_authority import RuntimeAuthorityProvider
from app.trex.runtime_mutation import runtime_mutation_fence
from app.trex.runtime_state import RuntimeStateError, RuntimeStateStore
from app.trex.run_reports import (
    RUN_REPORT_MARKDOWN_MAX_CHARS,
    RUN_REPORT_TREND_MAX_FILES,
    RUN_REPORT_TITLE_MAX_CHARS,
)
from app.trex.stl_client import RealStlClientService
from app.trex.workbench_values import (
    PROFILE_PACKET_MODEL_MAX_CHARS,
    PROFILE_PCAP_BASE64_MAX_CHARS,
    PROFILE_PCAP_MAX_PACKETS,
)
from app.trex.stats_sampler import (
    StatsSamplerClosedError,
    StatsSubscriberLimitError,
    StatsSubscription,
    TrexStatsSampler,
)
from app.trex.traffic_hard_stop import normalize_hard_stop_at

@asynccontextmanager
async def application_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    start_traffic_hard_stop_reaper()
    try:
        yield
    finally:
        stop_traffic_hard_stop_reaper()


app = FastAPI(
    title="TRex WebUI API",
    version="0.1.0",
    lifespan=application_lifespan,
)

STATS_STREAM_HEARTBEAT_SECONDS = 15.0
STATS_STREAM_HEARTBEAT_EVENT = ": heartbeat\n\n"


@app.exception_handler(RuntimeStateError)
async def runtime_state_error_response(_request: Request, exc: RuntimeStateError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "data": None,
            "blocker": "runtime_state_invalid",
            "error": str(exc),
        },
    )


class DaemonActionRequest(BaseModel):
    confirmation: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=DAEMON_COMMAND_TIMEOUT_MAX_SECONDS)


class DaemonTrexStartRequest(BaseModel):
    confirmation: Optional[str] = None
    config_content: Optional[str] = Field(default=None, max_length=DAEMON_CONFIG_MAX_BYTES)
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=DAEMON_COMMAND_TIMEOUT_MAX_SECONDS)


class DaemonConfigVersionSaveRequest(BaseModel):
    config_content: Optional[str] = Field(default=None, max_length=DAEMON_CONFIG_MAX_BYTES)
    source: Optional[str] = Field(default="manual", min_length=1, max_length=DAEMON_CONFIG_VERSION_SOURCE_MAX_CHARS)
    note: Optional[str] = Field(default=None, max_length=DAEMON_CONFIG_VERSION_NOTE_MAX_CHARS)


class DaemonConfigVersionLoadRequest(BaseModel):
    name: str = Field(min_length=1, max_length=DAEMON_CONFIG_VERSION_NAME_MAX_CHARS)


class DaemonConfigVersionRestoreRequest(DaemonConfigVersionLoadRequest):
    confirmation: Optional[str] = None


class DaemonConfigVersionDiffRequest(DaemonConfigVersionLoadRequest):
    config_content: Optional[str] = Field(default=None, max_length=DAEMON_CONFIG_MAX_BYTES)


class DaemonTrexReservationRequest(BaseModel):
    user: Optional[str] = Field(default=None, max_length=DAEMON_RESERVATION_USER_MAX_CHARS)


class DaemonTrexStopRequest(BaseModel):
    confirmation: Optional[str] = None


class ConnectTrexRequest(BaseModel):
    host: str = Field(min_length=1, max_length=253)
    sync_port: int = Field(default=4501, ge=1, le=65535)
    async_port: int = Field(default=4500, ge=1, le=65535)
    scapy_port: int = Field(default=4507, ge=1, le=65535)
    client_name: str = Field(default="Client1", min_length=1, max_length=64)
    timeout_seconds: int = Field(default=3, ge=1, le=300)


class PortsRequest(BaseModel):
    ports: Optional[list[int]] = None
    confirmation: Optional[str] = None


class AcquirePortsRequest(PortsRequest):
    force: bool = False
    sync_streams: bool = True


class ResetPortsRequest(PortsRequest):
    restart: bool = False


class ServiceModeRequest(PortsRequest):
    enabled: bool = True
    filtered: bool = False
    mask: Optional[int] = None


class PortAttributeRequest(PortsRequest):
    attribute: Literal["promiscuous", "multicast", "link", "led", "flow_control"]
    value: Union[bool, Literal["NONE", "TX", "RX", "FULL"]]


class PortLayerConfigurationRequest(BaseModel):
    port: int = Field(ge=0, le=255)
    mode: Literal["L2", "L3"]
    l2_destination: Optional[str] = Field(default=None, max_length=64)
    l3_source: Optional[str] = Field(default=None, max_length=64)
    l3_destination: Optional[str] = Field(default=None, max_length=64)
    vlan: Optional[list[int]] = Field(default=None, max_length=2)


class PortArpResolveRequest(PortsRequest):
    retries: int = Field(default=0, ge=0, le=10)
    vlan: Optional[list[int]] = Field(default=None, max_length=2)


class PortIpv6ScanRequest(PortsRequest):
    timeout_seconds: float = Field(default=3.0, ge=0.1, le=30)


class PortPingRequest(BaseModel):
    port: int = Field(ge=0, le=255)
    destination: str = Field(min_length=1, max_length=64)
    pkt_size: int = Field(default=64, ge=64, le=9216)
    count: int = Field(default=5, ge=1, le=10)
    interval_sec: float = Field(default=1.0, ge=0, le=10)
    vlan: Optional[list[int]] = Field(default=None, max_length=2)


class ClearStatsRequest(PortsRequest):
    clear_global: bool = True
    clear_flow_stats: bool = True
    clear_latency_stats: bool = True
    clear_xstats: bool = True


class CaptureStartRequest(BaseModel):
    tx_ports: Optional[list[int]] = None
    rx_ports: Optional[list[int]] = None
    limit: int = Field(default=1000, ge=1, le=CAPTURE_LIMIT_MAX)
    mode: Literal["fixed", "cyclic"] = "fixed"
    bpf_filter: str = Field(default="", max_length=CAPTURE_BPF_MAX_CHARS)
    snaplen: int = Field(default=0, ge=0, le=CAPTURE_SNAPLEN_MAX)


class CaptureFetchRequest(BaseModel):
    capture_id: int = Field(ge=0)
    pkt_count: int = Field(default=1000, ge=1, le=CAPTURE_FETCH_COUNT_MAX)
    fetch_limit: int = Field(default=50, ge=1, le=CAPTURE_FETCH_LIMIT_MAX)
    snaplen: int = Field(default=0, ge=0, le=CAPTURE_SNAPLEN_MAX)


class CaptureStopRequest(BaseModel):
    capture_id: int = Field(ge=0)
    pkt_count: int = Field(default=1000, ge=1, le=CAPTURE_FETCH_COUNT_MAX)
    save_pcap: bool = False
    file_name: Optional[str] = Field(default=None, max_length=128)
    snaplen: int = Field(default=0, ge=0, le=CAPTURE_SNAPLEN_MAX)


class CaptureRemoveRequest(BaseModel):
    capture_id: int = Field(ge=0)


class CaptureFileRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=128)


class RunReportFileRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=128)


class RunReportSaveRequest(BaseModel):
    title: str = Field(min_length=1, max_length=RUN_REPORT_TITLE_MAX_CHARS)
    markdown: str = Field(max_length=RUN_REPORT_MARKDOWN_MAX_CHARS)
    payload: dict[str, object] = Field(default_factory=dict)
    file_name: Optional[str] = Field(default=None, max_length=128)
    traffic_session_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    traffic_session_revision: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def traffic_session_binding_must_be_complete(self) -> "RunReportSaveRequest":
        if (self.traffic_session_id is None) != (
            self.traffic_session_revision is None
        ):
            raise ValueError(
                "traffic_session_id and traffic_session_revision must be supplied together"
            )
        return self


class StrictTrafficRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TrafficTargetRequest(StrictTrafficRequest):
    ports: Optional[list[int]] = Field(default=None, max_length=256)


class TrafficPortsRequest(TrafficTargetRequest):
    confirmation: Optional[str] = None
    expected_session_id: str = Field(min_length=1, max_length=64)


class StartTrafficRequest(TrafficTargetRequest):
    expected_session_id: str | None = Field(min_length=1, max_length=64)
    confirmation: Optional[str] = None
    profile_path: str = Field(min_length=1, max_length=1024)
    multiplier: str = Field(default="1", min_length=1, max_length=64)
    duration: float = Field(default=-1, ge=-1)
    force: bool = False
    total: bool = False
    synchronized: bool = False
    clear_existing: bool = True
    tunables: dict[str, object] = Field(default_factory=dict)
    hard_stop_at: str | None = None

    @field_validator("hard_stop_at")
    @classmethod
    def hard_stop_must_be_bounded_utc(
        cls,
        value: str | None,
    ) -> str | None:
        return None if value is None else normalize_hard_stop_at(value)


class UpdateTrafficRequest(TrafficTargetRequest):
    expected_session_id: str = Field(min_length=1, max_length=64)
    multiplier: str = Field(default="1", min_length=1, max_length=64)
    force: bool = False
    total: bool = False


class TrafficPlanGroupRequest(StrictTrafficRequest):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    name: str = Field(min_length=1, max_length=128)
    ports: list[int] = Field(min_length=1, max_length=256)
    profile_path: str = Field(min_length=1, max_length=1024)
    multiplier: str = Field(default="1", min_length=1, max_length=64)
    duration: float = Field(default=-1, ge=-1)
    force: bool = False
    total: bool = False
    synchronized: bool = False
    clear_existing: bool = True
    tunables: dict[str, object] = Field(default_factory=dict)


class TrafficPlanPutRequest(StrictTrafficRequest):
    plan_revision: int = Field(ge=0)
    groups: list[TrafficPlanGroupRequest] = Field(max_length=128)


class TrafficGroupStartRequest(StrictTrafficRequest):
    plan_revision: int = Field(ge=0)
    expected_session_id: str | None = Field(min_length=1, max_length=64)
    confirmation: Optional[str] = None
    hard_stop_at: str | None = None

    @field_validator("hard_stop_at")
    @classmethod
    def hard_stop_must_be_bounded_utc(
        cls,
        value: str | None,
    ) -> str | None:
        return None if value is None else normalize_hard_stop_at(value)


class ProfileWorkbenchStream(BaseModel):
    name: str = Field(default="stream", min_length=1, max_length=128)
    packet_type: Literal[
        "Ethernet",
        "Ethernet/ARP",
        "Ethernet/IPv4",
        "Ethernet/IPv6",
        "Ethernet/IPv4/UDP",
        "Ethernet/IPv4/TCP",
        "Ethernet/IPv4/ICMP",
        "Ethernet/IPv4/GRE",
        "Ethernet/IPv4/SCTP",
        "Ethernet/IPv6/UDP",
        "Ethernet/IPv6/TCP",
        "Ethernet/IPv6/ICMPv6",
        "Ethernet/IPv6/GRE",
        "Ethernet/IPv6/SCTP",
    ] = "Ethernet/IPv4/UDP"
    frame_length_type: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    frame_length: int = Field(default=64, ge=64, le=9216)
    frame_length_min: int = Field(default=64, ge=64, le=9216)
    frame_length_max: int = Field(default=1518, ge=64, le=9216)
    mode: Literal["continuous", "burst", "multi_burst"] = "continuous"
    rate_type: Literal["pps", "bps L1", "bps L2", "percentage"] = "pps"
    rate_value: float = Field(default=1.0, gt=0)
    enabled: bool = True
    self_start: bool = True
    total_pkts: int = Field(default=1, ge=1)
    pkts_per_burst: int = Field(default=1, ge=1)
    count: int = Field(default=1, ge=1)
    next_stream_id: Optional[int] = Field(default=None, ge=1)
    action_count: int = Field(default=0, ge=0)
    isg: float = Field(default=0.0, ge=0)
    ibg: float = Field(default=0.0, ge=0)
    pg_id: int = Field(default=1, ge=0)
    flow_stats_enabled: bool = True
    latency_enabled: bool = False
    ether_dst: str = Field(default="00:00:00:00:00:00", max_length=17)
    ether_src: str = Field(default="00:00:00:00:00:00", max_length=17)
    ether_type_override: bool = False
    ether_type: str = Field(default="0800", max_length=4)
    ether_dst_mode: Literal["Fixed", "Increment", "Decrement", "TRex Config"] = "TRex Config"
    ether_dst_count: int = Field(default=16, ge=1, le=9999)
    ether_dst_step: int = Field(default=1, ge=1, le=999)
    ether_src_mode: Literal["Fixed", "Increment", "Decrement", "TRex Config"] = "TRex Config"
    ether_src_count: int = Field(default=16, ge=1, le=9999)
    ether_src_step: int = Field(default=1, ge=1, le=999)
    arp_hardware_type: int = Field(default=1, ge=0, le=65535)
    arp_protocol_type: str = Field(default="0800", max_length=4)
    arp_hardware_size: int = Field(default=6, ge=0, le=255)
    arp_protocol_size: int = Field(default=4, ge=0, le=255)
    arp_operation: int = Field(default=1, ge=0, le=65535)
    arp_operation_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    arp_operation_count: int = Field(default=4, ge=2, le=65536)
    arp_operation_step: int = Field(default=1, ge=1, le=65535)
    arp_sender_mac: str = Field(default="00:00:00:00:00:00", max_length=17)
    arp_sender_mac_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    arp_sender_mac_count: int = Field(default=16, ge=2, le=100_000_000)
    arp_sender_mac_step: int = Field(default=1, ge=1, le=100_000_000)
    arp_sender_ip: str = Field(default="16.0.0.1", max_length=15)
    arp_sender_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    arp_sender_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    arp_sender_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    arp_target_mac: str = Field(default="00:00:00:00:00:00", max_length=17)
    arp_target_mac_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    arp_target_mac_count: int = Field(default=16, ge=2, le=100_000_000)
    arp_target_mac_step: int = Field(default=1, ge=1, le=100_000_000)
    arp_target_ip: str = Field(default="48.0.0.1", max_length=15)
    arp_target_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    arp_target_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    arp_target_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    vlan_enabled: bool = False
    vlan_tpid_override: bool = False
    vlan_tpid: str = Field(default="8100", max_length=4)
    vlan_priority: int = Field(default=0, ge=0, le=7)
    vlan_priority_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vlan_priority_count: int = Field(default=4, ge=2, le=8)
    vlan_priority_step: int = Field(default=1, ge=1, le=7)
    vlan_cfi: int = Field(default=0, ge=0, le=1)
    vlan_id: int = Field(default=0, ge=0, le=4094)
    vlan_id_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vlan_id_count: int = Field(default=16, ge=2, le=4095)
    vlan_id_step: int = Field(default=1, ge=1, le=4094)
    vlan2_enabled: bool = False
    vlan2_tpid_override: bool = False
    vlan2_tpid: str = Field(default="8100", max_length=4)
    vlan2_priority: int = Field(default=0, ge=0, le=7)
    vlan2_priority_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vlan2_priority_count: int = Field(default=4, ge=2, le=8)
    vlan2_priority_step: int = Field(default=1, ge=1, le=7)
    vlan2_cfi: int = Field(default=0, ge=0, le=1)
    vlan2_id: int = Field(default=1, ge=0, le=4094)
    vlan2_id_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vlan2_id_count: int = Field(default=16, ge=2, le=4095)
    vlan2_id_step: int = Field(default=1, ge=1, le=4094)
    mpls_enabled: bool = False
    mpls_label: int = Field(default=17, ge=0, le=1_048_575)
    mpls_label_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label_count: int = Field(default=16, ge=2, le=1_048_576)
    mpls_label_step: int = Field(default=1, ge=1, le=1_048_575)
    mpls_tc: int = Field(default=0, ge=0, le=7)
    mpls_tc_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_tc_count: int = Field(default=4, ge=2, le=8)
    mpls_tc_step: int = Field(default=1, ge=1, le=7)
    mpls_ttl: int = Field(default=255, ge=0, le=255)
    mpls_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_ttl_count: int = Field(default=16, ge=2, le=256)
    mpls_ttl_step: int = Field(default=1, ge=1, le=255)
    mpls_label2_enabled: bool = False
    mpls_label2: int = Field(default=18, ge=0, le=1_048_575)
    mpls_label2_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label2_count: int = Field(default=16, ge=2, le=1_048_576)
    mpls_label2_step: int = Field(default=1, ge=1, le=1_048_575)
    mpls_label2_tc: int = Field(default=0, ge=0, le=7)
    mpls_label2_tc_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label2_tc_count: int = Field(default=4, ge=2, le=8)
    mpls_label2_tc_step: int = Field(default=1, ge=1, le=7)
    mpls_label2_ttl: int = Field(default=255, ge=0, le=255)
    mpls_label2_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label2_ttl_count: int = Field(default=16, ge=2, le=256)
    mpls_label2_ttl_step: int = Field(default=1, ge=1, le=255)
    mpls_label3_enabled: bool = False
    mpls_label3: int = Field(default=19, ge=0, le=1_048_575)
    mpls_label3_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label3_count: int = Field(default=16, ge=2, le=1_048_576)
    mpls_label3_step: int = Field(default=1, ge=1, le=1_048_575)
    mpls_label3_tc: int = Field(default=0, ge=0, le=7)
    mpls_label3_tc_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label3_tc_count: int = Field(default=4, ge=2, le=8)
    mpls_label3_tc_step: int = Field(default=1, ge=1, le=7)
    mpls_label3_ttl: int = Field(default=255, ge=0, le=255)
    mpls_label3_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    mpls_label3_ttl_count: int = Field(default=16, ge=2, le=256)
    mpls_label3_ttl_step: int = Field(default=1, ge=1, le=255)
    vxlan_enabled: bool = False
    vxlan_vni: int = Field(default=42, ge=0, le=16_777_215)
    vxlan_vni_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vxlan_vni_count: int = Field(default=16, ge=2, le=16_777_216)
    vxlan_vni_step: int = Field(default=1, ge=1, le=16_777_215)
    vxlan_inner_ether_dst: str = Field(default="00:00:00:00:00:00", max_length=17)
    vxlan_inner_ether_src: str = Field(default="00:00:00:00:00:00", max_length=17)
    vxlan_inner_ip_version: Literal["IPv4", "IPv6"] = "IPv4"
    vxlan_inner_ipv4_src: str = Field(default="10.0.0.1", max_length=15)
    vxlan_inner_ipv4_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    vxlan_inner_ipv4_src_count: int = Field(default=16, ge=2, le=100_000_000)
    vxlan_inner_ipv4_src_step: int = Field(default=1, ge=1, le=100_000_000)
    vxlan_inner_ipv4_dst: str = Field(default="10.0.0.2", max_length=15)
    vxlan_inner_ipv4_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    vxlan_inner_ipv4_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    vxlan_inner_ipv4_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    vxlan_inner_ipv4_ttl: int = Field(default=127, ge=0, le=255)
    vxlan_inner_ipv4_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vxlan_inner_ipv4_ttl_count: int = Field(default=16, ge=2, le=256)
    vxlan_inner_ipv4_ttl_step: int = Field(default=1, ge=1, le=255)
    vxlan_inner_ipv6_src: str = Field(default="2001:db8:50::1", max_length=39)
    vxlan_inner_ipv6_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    vxlan_inner_ipv6_src_count: int = Field(default=16, ge=2, le=100_000_000)
    vxlan_inner_ipv6_src_step: int = Field(default=1, ge=1, le=100_000_000)
    vxlan_inner_ipv6_dst: str = Field(default="2001:db8:50::2", max_length=39)
    vxlan_inner_ipv6_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    vxlan_inner_ipv6_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    vxlan_inner_ipv6_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    vxlan_inner_ipv6_hop_limit: int = Field(default=64, ge=0, le=255)
    vxlan_inner_ipv6_hop_limit_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vxlan_inner_ipv6_hop_limit_count: int = Field(default=16, ge=2, le=256)
    vxlan_inner_ipv6_hop_limit_step: int = Field(default=1, ge=1, le=255)
    vxlan_inner_l4_src_port: int = Field(default=1025, ge=0, le=65535)
    vxlan_inner_l4_src_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vxlan_inner_l4_src_port_count: int = Field(default=16, ge=2, le=65536)
    vxlan_inner_l4_src_port_step: int = Field(default=1, ge=1, le=65535)
    vxlan_inner_l4_dst_port: int = Field(default=12, ge=0, le=65535)
    vxlan_inner_l4_dst_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    vxlan_inner_l4_dst_port_count: int = Field(default=16, ge=2, le=65536)
    vxlan_inner_l4_dst_port_step: int = Field(default=1, ge=1, le=65535)
    gtpu_enabled: bool = False
    gtpu_message_type: int = Field(default=255, ge=0, le=255)
    gtpu_teid: int = Field(default=0x12345678, ge=0, le=4294967295)
    gtpu_teid_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_teid_count: int = Field(default=16, ge=2, le=4294967296)
    gtpu_teid_step: int = Field(default=1, ge=1, le=4294967295)
    gtpu_sequence_enabled: bool = False
    gtpu_sequence: int = Field(default=0, ge=0, le=65535)
    gtpu_sequence_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_sequence_count: int = Field(default=16, ge=2, le=65536)
    gtpu_sequence_step: int = Field(default=1, ge=1, le=65535)
    gtpu_npdu_enabled: bool = False
    gtpu_npdu: int = Field(default=0, ge=0, le=255)
    gtpu_npdu_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_npdu_count: int = Field(default=16, ge=2, le=256)
    gtpu_npdu_step: int = Field(default=1, ge=1, le=255)
    gtpu_extension_enabled: bool = False
    gtpu_extension_udp_port: int = Field(default=2152, ge=0, le=65535)
    gtpu_extension_udp_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_extension_udp_port_count: int = Field(default=16, ge=2, le=65536)
    gtpu_extension_udp_port_step: int = Field(default=1, ge=1, le=65535)
    gtpu_inner_ip_version: Literal["IPv4", "IPv6"] = "IPv4"
    gtpu_inner_ipv4_src: str = Field(default="10.3.0.1", max_length=15)
    gtpu_inner_ipv4_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gtpu_inner_ipv4_src_count: int = Field(default=16, ge=2, le=100_000_000)
    gtpu_inner_ipv4_src_step: int = Field(default=1, ge=1, le=100_000_000)
    gtpu_inner_ipv4_dst: str = Field(default="10.3.0.2", max_length=15)
    gtpu_inner_ipv4_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gtpu_inner_ipv4_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    gtpu_inner_ipv4_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    gtpu_inner_ipv4_ttl: int = Field(default=64, ge=0, le=255)
    gtpu_inner_ipv4_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_inner_ipv4_ttl_count: int = Field(default=16, ge=2, le=256)
    gtpu_inner_ipv4_ttl_step: int = Field(default=1, ge=1, le=255)
    gtpu_inner_ipv6_src: str = Field(default="2001:db8:30::1", max_length=39)
    gtpu_inner_ipv6_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gtpu_inner_ipv6_src_count: int = Field(default=16, ge=2, le=100_000_000)
    gtpu_inner_ipv6_src_step: int = Field(default=1, ge=1, le=100_000_000)
    gtpu_inner_ipv6_dst: str = Field(default="2001:db8:30::2", max_length=39)
    gtpu_inner_ipv6_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gtpu_inner_ipv6_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    gtpu_inner_ipv6_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    gtpu_inner_ipv6_hop_limit: int = Field(default=64, ge=0, le=255)
    gtpu_inner_ipv6_hop_limit_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_inner_ipv6_hop_limit_count: int = Field(default=16, ge=2, le=256)
    gtpu_inner_ipv6_hop_limit_step: int = Field(default=1, ge=1, le=255)
    gtpu_inner_l4_src_port: int = Field(default=1025, ge=0, le=65535)
    gtpu_inner_l4_src_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_inner_l4_src_port_count: int = Field(default=16, ge=2, le=65536)
    gtpu_inner_l4_src_port_step: int = Field(default=1, ge=1, le=65535)
    gtpu_inner_l4_dst_port: int = Field(default=12, ge=0, le=65535)
    gtpu_inner_l4_dst_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gtpu_inner_l4_dst_port_count: int = Field(default=16, ge=2, le=65536)
    gtpu_inner_l4_dst_port_step: int = Field(default=1, ge=1, le=65535)
    gre_checksum_present: bool = False
    gre_checksum_override: bool = False
    gre_checksum: str = Field(default="0000", max_length=4)
    gre_key_present: bool = False
    gre_key: int = Field(default=0, ge=0, le=4294967295)
    gre_key_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gre_key_count: int = Field(default=16, ge=2, le=4294967296)
    gre_key_step: int = Field(default=1, ge=1, le=4294967295)
    gre_sequence_present: bool = False
    gre_sequence: int = Field(default=0, ge=0, le=4294967295)
    gre_sequence_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gre_sequence_count: int = Field(default=16, ge=2, le=4294967296)
    gre_sequence_step: int = Field(default=1, ge=1, le=4294967295)
    gre_protocol_type: str = Field(default="0800", max_length=4)
    gre_inner_ip_version: Literal["IPv4", "IPv6"] = "IPv4"
    gre_inner_ipv4_src: str = Field(default="10.2.0.1", max_length=15)
    gre_inner_ipv4_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gre_inner_ipv4_src_count: int = Field(default=16, ge=2, le=100_000_000)
    gre_inner_ipv4_src_step: int = Field(default=1, ge=1, le=100_000_000)
    gre_inner_ipv4_dst: str = Field(default="10.2.0.2", max_length=15)
    gre_inner_ipv4_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gre_inner_ipv4_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    gre_inner_ipv4_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    gre_inner_ipv4_ttl: int = Field(default=64, ge=0, le=255)
    gre_inner_ipv4_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gre_inner_ipv4_ttl_count: int = Field(default=16, ge=2, le=256)
    gre_inner_ipv4_ttl_step: int = Field(default=1, ge=1, le=255)
    gre_inner_ipv6_src: str = Field(default="2001:db8:40::1", max_length=45)
    gre_inner_ipv6_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gre_inner_ipv6_src_count: int = Field(default=16, ge=2, le=100_000_000)
    gre_inner_ipv6_src_step: int = Field(default=1, ge=1, le=100_000_000)
    gre_inner_ipv6_dst: str = Field(default="2001:db8:40::2", max_length=45)
    gre_inner_ipv6_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    gre_inner_ipv6_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    gre_inner_ipv6_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    gre_inner_ipv6_hop_limit: int = Field(default=64, ge=0, le=255)
    gre_inner_ipv6_hop_limit_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gre_inner_ipv6_hop_limit_count: int = Field(default=16, ge=2, le=256)
    gre_inner_ipv6_hop_limit_step: int = Field(default=1, ge=1, le=255)
    gre_inner_l4_src_port: int = Field(default=1025, ge=0, le=65535)
    gre_inner_l4_src_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gre_inner_l4_src_port_count: int = Field(default=16, ge=2, le=65536)
    gre_inner_l4_src_port_step: int = Field(default=1, ge=1, le=65535)
    gre_inner_l4_dst_port: int = Field(default=12, ge=0, le=65535)
    gre_inner_l4_dst_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    gre_inner_l4_dst_port_count: int = Field(default=16, ge=2, le=65536)
    gre_inner_l4_dst_port_step: int = Field(default=1, ge=1, le=65535)
    ipv4_src: str = Field(default="16.0.0.1", max_length=15)
    ipv4_dst: str = Field(default="48.0.0.1", max_length=15)
    ipv4_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    ipv4_src_count: int = Field(default=16, ge=2, le=100_000_000)
    ipv4_src_step: int = Field(default=1, ge=1, le=100_000_000)
    ipv4_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    ipv4_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    ipv4_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    ipv4_dscp: int = Field(default=0, ge=0, le=63)
    ipv4_dscp_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv4_dscp_count: int = Field(default=16, ge=2, le=64)
    ipv4_dscp_step: int = Field(default=1, ge=1, le=63)
    ipv4_ecn: int = Field(default=0, ge=0, le=3)
    ipv4_ecn_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv4_ecn_count: int = Field(default=4, ge=2, le=4)
    ipv4_ecn_step: int = Field(default=1, ge=1, le=3)
    ipv4_id: int = Field(default=1234, ge=0, le=65535)
    ipv4_id_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv4_id_count: int = Field(default=16, ge=2, le=65_536)
    ipv4_id_step: int = Field(default=1, ge=1, le=65_535)
    ipv4_flag_df: bool = False
    ipv4_flag_mf: bool = False
    ipv4_fragment_offset: int = Field(default=0, ge=0, le=8191)
    ipv4_fragment_offset_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv4_fragment_offset_count: int = Field(default=16, ge=2, le=8192)
    ipv4_fragment_offset_step: int = Field(default=1, ge=1, le=8191)
    ipv4_ttl: int = Field(default=127, ge=0, le=255)
    ipv4_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv4_ttl_count: int = Field(default=16, ge=2, le=256)
    ipv4_ttl_step: int = Field(default=1, ge=1, le=255)
    ipv4_checksum_override: bool = False
    ipv4_checksum: str = Field(default="0000", max_length=4)
    ipv6_src: str = Field(default="2001:db8::1", max_length=45)
    ipv6_dst: str = Field(default="2001:db8::2", max_length=45)
    ipv6_src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    ipv6_src_count: int = Field(default=16, ge=2, le=100_000_000)
    ipv6_src_step: int = Field(default=1, ge=1, le=100_000_000)
    ipv6_dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    ipv6_dst_count: int = Field(default=16, ge=2, le=100_000_000)
    ipv6_dst_step: int = Field(default=1, ge=1, le=100_000_000)
    ipv6_traffic_class: int = Field(default=0, ge=0, le=255)
    ipv6_traffic_class_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv6_traffic_class_count: int = Field(default=16, ge=2, le=256)
    ipv6_traffic_class_step: int = Field(default=1, ge=1, le=255)
    ipv6_flow_label: int = Field(default=0, ge=0, le=1_048_575)
    ipv6_flow_label_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv6_flow_label_count: int = Field(default=16, ge=2, le=1_048_576)
    ipv6_flow_label_step: int = Field(default=1, ge=1, le=1_048_575)
    ipv6_hop_limit: int = Field(default=127, ge=0, le=255)
    ipv6_hop_limit_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    ipv6_hop_limit_count: int = Field(default=16, ge=2, le=256)
    ipv6_hop_limit_step: int = Field(default=1, ge=1, le=255)
    l4_src_port_override: bool = False
    l4_src_port: int = Field(default=1025, ge=0, le=65535)
    l4_src_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    l4_src_port_count: int = Field(default=16, ge=2, le=65_536)
    l4_src_port_step: int = Field(default=1, ge=1, le=65_535)
    l4_dst_port_override: bool = False
    l4_dst_port: int = Field(default=12, ge=0, le=65535)
    l4_dst_port_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    l4_dst_port_count: int = Field(default=16, ge=2, le=65_536)
    l4_dst_port_step: int = Field(default=1, ge=1, le=65_535)
    udp_length_override: bool = False
    udp_length: int = Field(default=26, ge=8, le=65535)
    udp_length_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    udp_length_count: int = Field(default=16, ge=2, le=65_528)
    udp_length_step: int = Field(default=1, ge=1, le=65_527)
    udp_checksum_override: bool = False
    udp_checksum: str = Field(default="0000", max_length=4)
    udp_checksum_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    udp_checksum_count: int = Field(default=16, ge=2, le=65_536)
    udp_checksum_step: int = Field(default=1, ge=1, le=65_535)
    dns_enabled: bool = False
    dns_transaction_id: int = Field(default=0x1234, ge=0, le=65_535)
    dns_transaction_id_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dns_transaction_id_count: int = Field(default=16, ge=2, le=65_536)
    dns_transaction_id_step: int = Field(default=1, ge=1, le=65_535)
    dns_flags: str = Field(default="0100", max_length=4)
    dns_flags_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dns_flags_count: int = Field(default=16, ge=2, le=65_536)
    dns_flags_step: int = Field(default=1, ge=1, le=65_535)
    dns_query_name: str = Field(default="example.com", max_length=253)
    dns_query_type: int = Field(default=1, ge=0, le=65_535)
    dns_query_type_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dns_query_type_count: int = Field(default=16, ge=2, le=65_536)
    dns_query_type_step: int = Field(default=1, ge=1, le=65_535)
    dns_query_class: int = Field(default=1, ge=0, le=65_535)
    dns_query_class_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dns_query_class_count: int = Field(default=16, ge=2, le=65_536)
    dns_query_class_step: int = Field(default=1, ge=1, le=65_535)
    dns_answer_enabled: bool = False
    dns_answer_ttl: int = Field(default=60, ge=0, le=4_294_967_295)
    dns_answer_ttl_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dns_answer_ttl_count: int = Field(default=16, ge=2, le=4_294_967_296)
    dns_answer_ttl_step: int = Field(default=1, ge=1, le=4_294_967_295)
    dns_answer_ipv4: str = Field(default="192.0.2.1", max_length=15)
    dns_answer_ipv4_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dns_answer_ipv4_count: int = Field(default=16, ge=2, le=100_000_000)
    dns_answer_ipv4_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_enabled: bool = False
    dhcp_operation: int = Field(default=1, ge=1, le=255)
    dhcp_operation_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_operation_count: int = Field(default=2, ge=2, le=256)
    dhcp_operation_step: int = Field(default=1, ge=1, le=255)
    dhcp_hops: int = Field(default=0, ge=0, le=255)
    dhcp_hops_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_hops_count: int = Field(default=16, ge=2, le=256)
    dhcp_hops_step: int = Field(default=1, ge=1, le=255)
    dhcp_seconds: int = Field(default=0, ge=0, le=65_535)
    dhcp_seconds_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_seconds_count: int = Field(default=16, ge=2, le=65_536)
    dhcp_seconds_step: int = Field(default=1, ge=1, le=65_535)
    dhcp_message_type: int = Field(default=1, ge=1, le=255)
    dhcp_message_type_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_message_type_count: int = Field(default=16, ge=2, le=255)
    dhcp_message_type_step: int = Field(default=1, ge=1, le=254)
    dhcp_xid: int = Field(default=0x3903F326, ge=0, le=4294967295)
    dhcp_xid_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_xid_count: int = Field(default=16, ge=2, le=4_294_967_296)
    dhcp_xid_step: int = Field(default=1, ge=1, le=4_294_967_295)
    dhcp_flags: str = Field(default="8000", max_length=4)
    dhcp_flags_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_flags_count: int = Field(default=16, ge=2, le=65_536)
    dhcp_flags_step: int = Field(default=1, ge=1, le=65_535)
    dhcp_client_ip: str = Field(default="0.0.0.0", max_length=15)
    dhcp_client_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dhcp_client_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_client_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_your_ip: str = Field(default="0.0.0.0", max_length=15)
    dhcp_your_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dhcp_your_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_your_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_server_ip: str = Field(default="0.0.0.0", max_length=15)
    dhcp_server_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dhcp_server_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_server_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_relay_ip: str = Field(default="0.0.0.0", max_length=15)
    dhcp_relay_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dhcp_relay_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_relay_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_client_mac: str = Field(default="00:11:22:33:44:55", max_length=17)
    dhcp_client_mac_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_client_mac_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_client_mac_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_hostname: str = Field(default="trex-webui", max_length=63)
    dhcp_requested_ip: str = Field(default="0.0.0.0", max_length=15)
    dhcp_requested_ip_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dhcp_requested_ip_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_requested_ip_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_server_id: str = Field(default="0.0.0.0", max_length=15)
    dhcp_server_id_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dhcp_server_id_count: int = Field(default=16, ge=2, le=100_000_000)
    dhcp_server_id_step: int = Field(default=1, ge=1, le=100_000_000)
    dhcp_parameter_request_list: str = Field(default="1,3,6,15,28,51,58,59", max_length=767)
    dhcp_lease_time: int = Field(default=0, ge=0, le=4294967295)
    dhcp_lease_time_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_lease_time_count: int = Field(default=16, ge=2, le=4_294_967_296)
    dhcp_lease_time_step: int = Field(default=1, ge=1, le=4_294_967_295)
    dhcp_renewal_time: int = Field(default=0, ge=0, le=4294967295)
    dhcp_renewal_time_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_renewal_time_count: int = Field(default=16, ge=2, le=4_294_967_296)
    dhcp_renewal_time_step: int = Field(default=1, ge=1, le=4_294_967_295)
    dhcp_rebinding_time: int = Field(default=0, ge=0, le=4294967295)
    dhcp_rebinding_time_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    dhcp_rebinding_time_count: int = Field(default=16, ge=2, le=4_294_967_296)
    dhcp_rebinding_time_step: int = Field(default=1, ge=1, le=4_294_967_295)
    tcp_sequence_number: int = Field(default=1234567, ge=0, le=4294967295)
    tcp_sequence_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_sequence_count: int = Field(default=16, ge=2, le=4_294_967_296)
    tcp_sequence_step: int = Field(default=1, ge=1, le=4_294_967_295)
    tcp_ack_number: int = Field(default=7654321, ge=0, le=4294967295)
    tcp_ack_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_ack_count: int = Field(default=16, ge=2, le=4_294_967_296)
    tcp_ack_step: int = Field(default=1, ge=1, le=4_294_967_295)
    tcp_window: int = Field(default=9999, ge=0, le=65535)
    tcp_window_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_window_count: int = Field(default=16, ge=2, le=65_536)
    tcp_window_step: int = Field(default=1, ge=1, le=65_535)
    tcp_checksum_override: bool = False
    tcp_checksum: str = Field(default="ABCD", max_length=4)
    tcp_checksum_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_checksum_count: int = Field(default=16, ge=2, le=65_536)
    tcp_checksum_step: int = Field(default=1, ge=1, le=65_535)
    tcp_option_mss_enabled: bool = False
    tcp_option_mss: int = Field(default=1460, ge=0, le=65_535)
    tcp_option_mss_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_option_mss_count: int = Field(default=16, ge=2, le=65_536)
    tcp_option_mss_step: int = Field(default=1, ge=1, le=65_535)
    tcp_option_window_scale_enabled: bool = False
    tcp_option_window_scale: int = Field(default=7, ge=0, le=14)
    tcp_option_window_scale_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_option_window_scale_count: int = Field(default=16, ge=2, le=256)
    tcp_option_window_scale_step: int = Field(default=1, ge=1, le=255)
    tcp_option_sack_permitted_enabled: bool = False
    tcp_option_sack_blocks_enabled: bool = False
    tcp_option_sack_left_edge: int = Field(default=1000, ge=0, le=4_294_967_295)
    tcp_option_sack_left_edge_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_option_sack_left_edge_count: int = Field(default=16, ge=2, le=4_294_967_296)
    tcp_option_sack_left_edge_step: int = Field(default=1, ge=1, le=4_294_967_295)
    tcp_option_sack_right_edge: int = Field(default=2000, ge=0, le=4_294_967_295)
    tcp_option_sack_right_edge_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_option_sack_right_edge_count: int = Field(default=16, ge=2, le=4_294_967_296)
    tcp_option_sack_right_edge_step: int = Field(default=1, ge=1, le=4_294_967_295)
    tcp_option_timestamp_enabled: bool = False
    tcp_option_timestamp_value: int = Field(default=1, ge=0, le=4_294_967_295)
    tcp_option_timestamp_value_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_option_timestamp_value_count: int = Field(default=16, ge=2, le=4_294_967_296)
    tcp_option_timestamp_value_step: int = Field(default=1, ge=1, le=4_294_967_295)
    tcp_option_timestamp_echo: int = Field(default=0, ge=0, le=4_294_967_295)
    tcp_option_timestamp_echo_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_option_timestamp_echo_count: int = Field(default=16, ge=2, le=4_294_967_296)
    tcp_option_timestamp_echo_step: int = Field(default=1, ge=1, le=4_294_967_295)
    sctp_verification_tag: int = Field(default=0x12345678, ge=0, le=4_294_967_295)
    sctp_verification_tag_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    sctp_verification_tag_count: int = Field(default=16, ge=2, le=4_294_967_296)
    sctp_verification_tag_step: int = Field(default=1, ge=1, le=4_294_967_295)
    sctp_checksum_override: bool = False
    sctp_checksum: str = Field(default="00000000", max_length=8)
    sctp_data_flags: int = Field(default=3, ge=0, le=255)
    sctp_data_flags_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    sctp_data_flags_count: int = Field(default=16, ge=2, le=256)
    sctp_data_flags_step: int = Field(default=1, ge=1, le=255)
    sctp_tsn: int = Field(default=1, ge=0, le=4_294_967_295)
    sctp_tsn_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    sctp_tsn_count: int = Field(default=16, ge=2, le=4_294_967_296)
    sctp_tsn_step: int = Field(default=1, ge=1, le=4_294_967_295)
    sctp_stream_id: int = Field(default=0, ge=0, le=65_535)
    sctp_stream_id_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    sctp_stream_id_count: int = Field(default=16, ge=2, le=65_536)
    sctp_stream_id_step: int = Field(default=1, ge=1, le=65_535)
    sctp_stream_sequence: int = Field(default=0, ge=0, le=65_535)
    sctp_stream_sequence_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    sctp_stream_sequence_count: int = Field(default=16, ge=2, le=65_536)
    sctp_stream_sequence_step: int = Field(default=1, ge=1, le=65_535)
    sctp_payload_protocol_id: int = Field(default=0, ge=0, le=4_294_967_295)
    sctp_payload_protocol_id_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    sctp_payload_protocol_id_count: int = Field(default=16, ge=2, le=4_294_967_296)
    sctp_payload_protocol_id_step: int = Field(default=1, ge=1, le=4_294_967_295)
    icmp_type: int = Field(default=8, ge=0, le=255)
    icmp_type_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    icmp_type_count: int = Field(default=16, ge=2, le=256)
    icmp_type_step: int = Field(default=1, ge=1, le=255)
    icmp_code: int = Field(default=0, ge=0, le=255)
    icmp_code_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    icmp_code_count: int = Field(default=16, ge=2, le=256)
    icmp_code_step: int = Field(default=1, ge=1, le=255)
    icmp_checksum_override: bool = False
    icmp_checksum: str = Field(default="0000", max_length=4)
    icmp_identifier: int = Field(default=1, ge=0, le=65535)
    icmp_identifier_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    icmp_identifier_count: int = Field(default=16, ge=2, le=65_536)
    icmp_identifier_step: int = Field(default=1, ge=1, le=65_535)
    icmp_sequence: int = Field(default=1, ge=0, le=65535)
    icmp_sequence_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    icmp_sequence_count: int = Field(default=16, ge=2, le=65_536)
    icmp_sequence_step: int = Field(default=1, ge=1, le=65_535)
    icmpv6_nd_target: str = Field(default="2001:db8::2", max_length=45)
    icmpv6_nd_include_option: bool = True
    icmpv6_nd_option_mac: str = Field(default="00:00:00:00:00:00", max_length=17)
    icmpv6_nd_na_router: bool = False
    icmpv6_nd_na_solicited: bool = True
    icmpv6_nd_na_override: bool = True
    icmpv6_rs_include_slla: bool = True
    icmpv6_rs_slla_mac: str = Field(default="00:00:00:00:00:00", max_length=17)
    icmpv6_ra_cur_hop_limit: int = Field(default=64, ge=0, le=255)
    icmpv6_ra_managed: bool = False
    icmpv6_ra_other: bool = False
    icmpv6_ra_router_lifetime: int = Field(default=1800, ge=0, le=65535)
    icmpv6_ra_reachable_time: int = Field(default=0, ge=0, le=4294967295)
    icmpv6_ra_retrans_timer: int = Field(default=0, ge=0, le=4294967295)
    icmpv6_ra_include_slla: bool = True
    icmpv6_ra_slla_mac: str = Field(default="00:00:00:00:00:00", max_length=17)
    icmpv6_ra_include_prefix: bool = True
    icmpv6_ra_prefix: str = Field(default="2001:db8:1::", max_length=45)
    icmpv6_ra_prefix_length: int = Field(default=64, ge=0, le=128)
    icmpv6_ra_prefix_on_link: bool = True
    icmpv6_ra_prefix_autonomous: bool = True
    icmpv6_ra_prefix_valid_lifetime: int = Field(default=2592000, ge=0, le=4294967295)
    icmpv6_ra_prefix_preferred_lifetime: int = Field(default=604800, ge=0, le=4294967295)
    tcp_urgent_pointer: int = Field(default=1111, ge=0, le=65535)
    tcp_urgent_pointer_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_urgent_pointer_count: int = Field(default=16, ge=2, le=65_536)
    tcp_urgent_pointer_step: int = Field(default=1, ge=1, le=65_535)
    tcp_flags_mode: Literal["Fixed", "Increment", "Decrement", "Random"] = "Fixed"
    tcp_flags_count: int = Field(default=16, ge=2, le=64)
    tcp_flags_step: int = Field(default=1, ge=1, le=63)
    tcp_flag_urg: bool = False
    tcp_flag_ack: bool = False
    tcp_flag_psh: bool = False
    tcp_flag_rst: bool = False
    tcp_flag_syn: bool = False
    tcp_flag_fin: bool = False
    payload_enabled: bool = True
    payload_type: Literal["Fixed Word", "Increment Byte", "Decrement Byte", "Random"] = "Fixed Word"
    payload_pattern: str = Field(default="00", max_length=1024)
    advanced_cache_size_type: Literal["Auto", "Enable", "Disable"] = "Auto"
    advanced_cache_value: int = Field(default=5000, ge=0, le=999999)
    packet_binary_base64: Optional[str] = Field(default=None, max_length=PROFILE_PCAP_BASE64_MAX_CHARS)
    advanced_mode: bool = False
    packet_model: Optional[str] = Field(default=None, max_length=PROFILE_PACKET_MODEL_MAX_CHARS)
    packet_meta_base64: Optional[str] = Field(default=None, max_length=PROFILE_PCAP_BASE64_MAX_CHARS)
    advanced_vm: Optional[dict[str, object]] = None


class ProfileWorkbenchRenderRequest(BaseModel):
    streams: list[ProfileWorkbenchStream] = Field(min_length=1, max_length=512)


class ProfileWorkbenchSaveRequest(ProfileWorkbenchRenderRequest):
    profile_name: str = Field(min_length=1, max_length=128)


class ProfileWorkbenchYamlExportRequest(ProfileWorkbenchRenderRequest):
    profile_name: str = Field(min_length=1, max_length=128)


class ProfileWorkbenchPcapExportRequest(BaseModel):
    stream: ProfileWorkbenchStream
    file_name: Optional[str] = Field(default=None, max_length=128)


class ProfileWorkbenchPcapImportOptions(BaseModel):
    name_prefix: str = Field(default="", max_length=64)
    rewrite_src_enabled: bool = False
    src_address: str = Field(default="16.0.0.1", max_length=15)
    src_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    src_count: int = Field(default=16, ge=1, le=100_000_000)
    rewrite_dst_enabled: bool = False
    dst_address: str = Field(default="48.0.0.1", max_length=15)
    dst_mode: Literal["Fixed", "Increment Host", "Decrement Host", "Random Host"] = "Fixed"
    dst_count: int = Field(default=16, ge=1, le=100_000_000)
    rate_mode: Literal["speedup", "ipg"] = "speedup"
    speedup: float = Field(default=1.0, gt=0, le=1_000_000_000)
    ipg: float = Field(default=1.0, ge=0, le=86_400)
    loop_count: int = Field(default=0, ge=0, le=4_294_967_295)


class ProfileWorkbenchPcapImportRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=128)
    content_base64: str = Field(min_length=1, max_length=PROFILE_PCAP_BASE64_MAX_CHARS)
    max_packets: int = Field(default=PROFILE_PCAP_MAX_PACKETS, ge=1, le=PROFILE_PCAP_MAX_PACKETS)
    options: Optional[ProfileWorkbenchPcapImportOptions] = None


class ProfileFileRequest(BaseModel):
    profile_path: str = Field(min_length=1, max_length=4096)


class ProfileDuplicateRequest(ProfileFileRequest):
    target_name: Optional[str] = Field(default=None, max_length=128)


class ProfileDeleteRequest(ProfileFileRequest):
    confirmation: Optional[str] = None


def result_payload(result: TrexCallResult) -> dict[str, object]:
    return jsonable_encoder(public_result_payload(result))


def record_stats_sample(sampler: object, payload: dict[str, object]) -> None:
    if isinstance(sampler, TrexStatsSampler):
        sampler.record_result(payload)


def stats_sse_event(payload: dict[str, object]) -> str:
    content = json.dumps(jsonable_encoder(payload), separators=(",", ":"))
    return f"data: {content}\n\n"


async def stats_sse_events(
    request: Request,
    subscription: StatsSubscription,
    heartbeat_seconds: float = STATS_STREAM_HEARTBEAT_SECONDS,
) -> AsyncIterator[str]:
    try:
        while not await request.is_disconnected():
            try:
                sample = await asyncio.wait_for(subscription.__anext__(), timeout=heartbeat_seconds)
            except asyncio.TimeoutError:
                if await request.is_disconnected():
                    break
                yield STATS_STREAM_HEARTBEAT_EVENT
            except StopAsyncIteration:
                break
            else:
                yield stats_sse_event(sample)
    finally:
        subscription.close()


async def close_stats_subscription(subscription: StatsSubscription) -> None:
    subscription.close()


def confirmation_blocker(expected: str) -> dict[str, object]:
    return {
        "ok": False,
        "data": None,
        "blocker": "confirmation_required",
        "error": f"confirmation token required: {expected}",
    }


def build_system_overview(service: RealStlClientService) -> dict[str, object]:
    env = get_environment()
    runtime = RuntimeManager(env)
    snapshot = service.snapshot()
    return jsonable_encoder(
        {
            "environment": env.readiness(),
            "daemon_preview": runtime.preview_daemon_action("show"),
            "daemon_status": runtime.daemon_status(),
            "trex_probe": {
                "ok": snapshot.ok,
                "server_version": snapshot.data.get("server_version") if snapshot.ok else None,
                "system_info": snapshot.data.get("system_info") if snapshot.ok else None,
                "blocker": snapshot.blocker,
                "error": snapshot.error,
            },
            "trex_ports": result_payload(snapshot),
        }
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    environment = get_environment()
    if environment.configuration_errors:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "blocked",
                "blocker": "trex_environment_invalid",
                "configuration_errors": environment.configuration_errors,
            },
        )
    RuntimeStateStore(environment.runtime_state_path).load()
    if environment.daemon_supervisor == "systemd":
        RuntimeAuthorityProvider(environment).current()
    return {"status": "ok"}


@app.get("/api/system/environment")
def environment() -> dict[str, object]:
    return get_environment().readiness()


@app.get("/api/system/daemon/preview/{action}")
def daemon_preview(action: str) -> dict[str, object]:
    try:
        return RuntimeManager(get_environment()).preview_daemon_action(action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/system/daemon/{action}")
def daemon_action(action: str, request: DaemonActionRequest) -> dict[str, object]:
    try:
        result = RuntimeManager(get_environment()).run_daemon_action(
            action,
            request.confirmation,
            request.timeout_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": result.ok,
        "command": result.command,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "blocker": result.blocker,
        "recovered_from_timeout": result.recovered_from_timeout,
    }


@app.get("/api/system/daemon/status")
def daemon_status() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_status()


@app.get("/api/system/daemon")
def daemon_overview() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_overview()


@app.get("/api/system/daemon/config/metadata")
def daemon_config_metadata() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_metadata()


@app.get("/api/system/daemon/config/default")
def daemon_default_config() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_default_config()


@app.get("/api/system/daemon/config/versions")
def daemon_config_versions(
    limit: int = Query(default=50, ge=1, le=DAEMON_CONFIG_VERSION_MAX_FILES),
) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_config_versions(limit)


@app.get("/api/system/daemon/config/audit")
def daemon_config_audit(
    limit: int = Query(default=50, ge=1, le=DAEMON_CONFIG_AUDIT_MAX_RECORDS),
) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_config_audit(limit)


@app.post("/api/system/daemon/config/versions/save")
def daemon_config_version_save(request: DaemonConfigVersionSaveRequest) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_config_version_save(
        config_content=request.config_content,
        source=request.source,
        note=request.note,
    )


@app.post("/api/system/daemon/config/versions/load")
def daemon_config_version_load(request: DaemonConfigVersionLoadRequest) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_config_version_load(request.name)


@app.post("/api/system/daemon/config/versions/restore")
def daemon_config_version_restore(request: DaemonConfigVersionRestoreRequest) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_config_version_restore(
        request.name,
        confirmation=request.confirmation,
    )


@app.post("/api/system/daemon/config/versions/diff")
def daemon_config_version_diff(request: DaemonConfigVersionDiffRequest) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_config_version_diff(
        request.name,
        config_content=request.config_content,
    )


@app.get("/api/system/daemon/devices")
def daemon_devices_info() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_devices_info()


@app.get("/api/system/daemon/files")
def daemon_files(path: Optional[str] = Query(default=None, max_length=DAEMON_FILE_PATH_MAX_CHARS)) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_files_list(path)


@app.get("/api/system/daemon/files/content")
def daemon_file_content(
    path: str = Query(..., min_length=1, max_length=DAEMON_FILE_PATH_MAX_CHARS),
    max_bytes: int = Query(default=131_072, ge=1, le=DAEMON_FILE_CONTENT_MAX_BYTES),
) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_file_content(path, max_bytes)


@app.get("/api/system/daemon/trex/status")
def daemon_trex_status() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_runtime_status()


@app.get("/api/system/daemon/trex/version")
def daemon_trex_version() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_version()


@app.get("/api/system/daemon/trex/log")
def daemon_trex_log() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_log_from_rpc()


@app.get("/api/system/daemon/trex/running-info")
def daemon_trex_running_info() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_running_info()


@app.get("/api/system/daemon/trex/latest-dump")
def daemon_trex_latest_dump() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_latest_dump()


@app.get("/api/system/daemon/trex/reservation")
def daemon_trex_reservation() -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_reservation()


@app.post("/api/system/daemon/trex/reservation/reserve")
def daemon_trex_reserve(request: DaemonTrexReservationRequest) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_reserve(user=request.user)


@app.post("/api/system/daemon/trex/reservation/cancel")
def daemon_trex_cancel_reservation(request: DaemonTrexReservationRequest) -> dict[str, object]:
    return RuntimeManager(get_environment()).daemon_trex_cancel_reservation(user=request.user)


@app.post("/api/system/daemon/trex/start")
def daemon_trex_start(request: DaemonTrexStartRequest) -> dict[str, object]:
    return RuntimeManager(
        get_environment(),
        lifecycle_disconnect=disconnect_stl_service,
    ).daemon_trex_start(
        confirmation=request.confirmation,
        config_content=request.config_content,
        timeout_seconds=request.timeout_seconds,
    )


@app.post("/api/system/daemon/trex/stop")
def daemon_trex_stop(request: Optional[DaemonTrexStopRequest] = None) -> dict[str, object]:
    with trex_termination_transaction():
        payload = RuntimeManager(
            get_environment(),
            lifecycle_disconnect=disconnect_stl_service_for_trex_termination,
        ).daemon_trex_stop(confirmation=request.confirmation if request else None)
        payload["traffic_retirement"] = None
        if not payload.get("ok"):
            return payload
        retirement = retire_traffic_after_trex_termination()
        payload["traffic_retirement"] = public_result_payload(retirement)
        if not retirement.ok:
            payload["ok"] = False
            payload["blocker"] = (
                retirement.blocker
                or "daemon_stop_traffic_retirement_failed"
            )
            payload["error"] = (
                "TRex process termination succeeded, but durable traffic "
                f"retirement failed: {retirement.error or retirement.blocker}"
            )
        return payload


@app.post("/api/config/render")
def render_config(config: TrexConfig) -> dict[str, object]:
    return {"yaml": config.to_yaml(), "config": config.to_trex_dict()}


@app.get(
    "/api/trex/probe",
    response_model=TrexProbeResponse,
    response_model_exclude_unset=True,
)
def probe_trex(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    result = service.probe()
    if not result.ok:
        return {"ok": False, "blocker": result.blocker, "error": result.error}
    return {
        "ok": True,
        "server_version": result.server_version,
        "system_info": result.system_info,
    }


@app.get(
    "/api/trex/ports",
    response_model=TrexPortsResultResponse,
    response_model_exclude_unset=True,
)
def trex_ports(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return result_payload(service.snapshot())


@app.post(
    "/api/trex/connect",
    response_model=TrexConnectResponse,
    response_model_exclude_unset=True,
)
def connect_trex(request: ConnectTrexRequest) -> dict[str, object]:
    with runtime_mutation_fence():
        return _connect_trex_locked(request)


def _connect_trex_locked(request: ConnectTrexRequest) -> dict[str, object]:
    environment = get_environment()
    try:
        validate_runtime_trex_connection_settings(
            environment=environment,
            host=request.host,
            sync_port=request.sync_port,
            async_port=request.async_port,
            scapy_port=request.scapy_port,
            client_name=request.client_name,
            connect_timeout_seconds=request.timeout_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    runtime_state = RuntimeStateStore(environment.runtime_state_path).load()
    if runtime_state.traffic_mutation_intent is not None:
        return result_payload(
            TrexCallResult(
                False,
                blocker="runtime_traffic_recovery_required",
                error=(
                    "resolve the durable traffic mutation intent before "
                    "reconnecting"
                ),
            )
        )
    if runtime_state.capture_leases:
        return result_payload(
            TrexCallResult(
                False,
                blocker="runtime_capture_active",
                error="remove all managed capture recorders before reconnecting",
            )
        )
    if (
        runtime_state.traffic_session is not None
        and runtime_state.traffic_session.state in {"running", "paused", "mixed", "unknown"}
    ):
        return result_payload(
            TrexCallResult(
                False,
                blocker="runtime_traffic_active",
                error="stop or reconcile the active traffic session before reconnecting",
            )
        )

    disconnect_result = disconnect_stl_service()
    if not disconnect_result.ok:
        return result_payload(disconnect_result)
    retire_disconnected_stl_service()

    set_runtime_trex_connection(
        host=request.host,
        sync_port=request.sync_port,
        async_port=request.async_port,
        scapy_port=request.scapy_port,
        client_name=request.client_name,
        connect_timeout_seconds=request.timeout_seconds,
        persist=True,
    )
    return build_system_overview(get_stl_service())


@app.post(
    "/api/trex/disconnect",
    response_model=TrexDisconnectResultResponse,
    response_model_exclude_unset=True,
)
def disconnect_trex() -> dict[str, object]:
    return result_payload(disconnect_stl_service())


@app.get(
    "/api/trex/stats/latest",
    response_model=TrexSampledStatsResultResponse,
    response_model_exclude_unset=True,
)
def trex_stats_latest(sampler: TrexStatsSampler = Depends(get_stats_sampler)) -> dict[str, object]:
    latest = sampler.latest_payload()
    if latest is not None:
        return jsonable_encoder(latest)
    return jsonable_encoder(sampler.sample_once())


@app.get(
    "/api/trex/stats/stream",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "Server-sent stats samples; each data event matches TrexSampledStatsResultResponse",
            "content": {
                "text/event-stream": {
                    "schema": {"type": "string"},
                }
            },
        },
        503: {"description": "Stats sampler closed or subscriber limit reached"},
    },
)
async def trex_stats_stream(
    request: Request,
    sampler: TrexStatsSampler = Depends(get_stats_sampler),
) -> StreamingResponse:
    try:
        subscription = sampler.subscribe()
    except StatsSubscriberLimitError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
            headers={"Retry-After": "1"},
        ) from exc
    except StatsSamplerClosedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        return StreamingResponse(
            stats_sse_events(request, subscription),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
            background=BackgroundTask(close_stats_subscription, subscription),
        )
    except Exception:
        subscription.close()
        raise


@app.get(
    "/api/trex/stats",
    response_model=TrexStatsResultResponse,
    response_model_exclude_unset=True,
)
def trex_stats(
    ports: Optional[list[int]] = Query(default=None),
    service: RealStlClientService = Depends(get_stl_service),
    sampler: object = Depends(get_stats_sampler),
) -> dict[str, object]:
    normalized_ports = ports if isinstance(ports, list) else None
    payload = result_payload(service.stats(ports=normalized_ports))
    if normalized_ports is None:
        record_stats_sample(sampler, payload)
    return payload


@app.post(
    "/api/trex/stats/clear",
    response_model=TrexStatsClearResponse,
    response_model_exclude_unset=True,
)
def clear_trex_stats(
    request: ClearStatsRequest,
    service: RealStlClientService = Depends(get_stl_service),
    sampler: object = Depends(get_stats_sampler),
) -> dict[str, object]:
    payload = result_payload(
        service.clear_stats(
            ports=request.ports,
            clear_global=request.clear_global,
            clear_flow_stats=request.clear_flow_stats,
            clear_latency_stats=request.clear_latency_stats,
            clear_xstats=request.clear_xstats,
        )
    )
    if payload["ok"] and isinstance(sampler, TrexStatsSampler):
        sampler.reset_history()
        sampler.sample_once()
    return payload


@app.get(
    "/api/trex/ports/xstats",
    response_model=TrexPortXstatsResponse,
    response_model_exclude_unset=True,
)
def trex_port_xstats(
    port: int = Query(..., ge=0, le=255),
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.port_xstats(port=port))


@app.get("/api/trex/profiles")
def trex_profiles(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return result_payload(service.list_profiles())


@app.get("/api/trex/profiles/preview")
def trex_profile_preview(
    profile_path: str = Query(...),
    max_bytes: int = Query(default=8192, ge=1, le=65536),
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.profile_preview(profile_path=profile_path, max_bytes=max_bytes))


@app.get("/api/trex/profiles/workbench")
def trex_profile_workbench(
    profile_path: str = Query(...),
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.load_workbench_profile(profile_path=profile_path))


@app.post("/api/trex/profiles/duplicate")
def duplicate_trex_profile(
    request: ProfileDuplicateRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    with runtime_mutation_fence():
        return result_payload(service.duplicate_profile(profile_path=request.profile_path, target_name=request.target_name))


@app.post("/api/trex/profiles/delete")
def delete_trex_profile(
    request: ProfileDeleteRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if get_environment().require_confirmation and request.confirmation != "delete-profile":
        return confirmation_blocker("delete-profile")
    with runtime_mutation_fence():
        return result_payload(service.delete_profile(profile_path=request.profile_path))


@app.post("/api/trex/profiles/export-json")
def export_trex_profile_json(
    request: ProfileFileRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.export_profile_json(profile_path=request.profile_path))


@app.post("/api/trex/profiles/workbench/render")
def trex_profile_workbench_render(
    request: ProfileWorkbenchRenderRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.render_workbench_profile([stream.model_dump() for stream in request.streams]))


@app.post("/api/trex/profiles/workbench/save")
def trex_profile_workbench_save(
    request: ProfileWorkbenchSaveRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    with runtime_mutation_fence():
        return result_payload(
            service.save_workbench_profile(
                profile_name=request.profile_name,
                streams=[stream.model_dump() for stream in request.streams],
            )
        )


@app.post("/api/trex/profiles/workbench/export-yaml")
def trex_profile_workbench_export_yaml(
    request: ProfileWorkbenchYamlExportRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.export_workbench_profile_yaml(
            profile_name=request.profile_name,
            streams=[stream.model_dump() for stream in request.streams],
        )
    )


@app.post("/api/trex/profiles/workbench/export-pcap")
def trex_profile_workbench_export_pcap(
    request: ProfileWorkbenchPcapExportRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.export_workbench_stream_pcap(stream=request.stream.model_dump(), file_name=request.file_name)
    )


@app.post("/api/trex/profiles/workbench/import-pcap")
def trex_profile_workbench_import_pcap(
    request: ProfileWorkbenchPcapImportRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.import_workbench_pcap(
            file_name=request.file_name,
            content_base64=request.content_base64,
            max_packets=request.max_packets,
            options=request.options.model_dump() if request.options is not None else None,
        )
    )


@app.post("/api/trex/ports/acquire")
def acquire_ports(
    request: AcquirePortsRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if request.force and get_environment().require_confirmation and request.confirmation != "force-acquire":
        return confirmation_blocker("force-acquire")
    return result_payload(service.acquire(request.ports, request.force, request.sync_streams))


@app.post("/api/trex/ports/release")
def release_ports(
    request: PortsRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.release(request.ports))


@app.post("/api/trex/ports/reset")
def reset_ports(
    request: ResetPortsRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if get_environment().require_confirmation and request.confirmation != "reset":
        return confirmation_blocker("reset")
    return result_payload(service.reset(request.ports, request.restart))


@app.post("/api/trex/ports/service-mode")
def set_ports_service_mode(
    request: ServiceModeRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if get_environment().require_confirmation and request.confirmation != "service-mode":
        return confirmation_blocker("service-mode")
    return result_payload(
        service.set_service_mode(request.ports, request.enabled, request.filtered, request.mask)
    )


@app.post("/api/trex/ports/attribute")
def set_ports_attribute(
    request: PortAttributeRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if (
        get_environment().require_confirmation
        and request.attribute == "link"
        and request.value is False
        and request.confirmation != "port-attribute"
    ):
        return confirmation_blocker("port-attribute")
    return result_payload(service.set_port_attribute(request.ports, request.attribute, request.value))


@app.post("/api/trex/ports/configuration/apply")
def apply_port_configuration(
    request: PortLayerConfigurationRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.configure_port_layer(
            port=request.port,
            mode=request.mode,
            l2_destination=request.l2_destination,
            l3_source=request.l3_source,
            l3_destination=request.l3_destination,
            vlan=request.vlan,
        )
    )


@app.post("/api/trex/ports/arp/resolve")
def resolve_ports_arp(
    request: PortArpResolveRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.resolve_arp(ports=request.ports, retries=request.retries, vlan=request.vlan))


@app.post("/api/trex/ports/ipv6/scan")
def scan_ports_ipv6(
    request: PortIpv6ScanRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.scan_ipv6_neighbors(ports=request.ports, timeout_seconds=request.timeout_seconds))


@app.post("/api/trex/ports/ping")
def ping_from_port(
    request: PortPingRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.ping(
            port=request.port,
            destination=request.destination,
            pkt_size=request.pkt_size,
            count=request.count,
            interval_sec=request.interval_sec,
            vlan=request.vlan,
        )
    )


@app.get(
    "/api/trex/capture/status",
    response_model=CaptureStatusResultResponse,
    response_model_exclude_unset=True,
)
def trex_capture_status(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return result_payload(service.capture_status())


@app.post(
    "/api/trex/capture/start",
    response_model=CaptureStartResultResponse,
    response_model_exclude_unset=True,
)
def start_packet_capture(
    request: CaptureStartRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.start_capture(
            tx_ports=request.tx_ports,
            rx_ports=request.rx_ports,
            limit=request.limit,
            mode=request.mode,
            bpf_filter=request.bpf_filter,
            snaplen=request.snaplen,
        )
    )


@app.post(
    "/api/trex/capture/fetch",
    response_model=CapturePacketResultResponse,
    response_model_exclude_unset=True,
)
def fetch_packet_capture(
    request: CaptureFetchRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.fetch_capture(
            capture_id=request.capture_id,
            pkt_count=request.pkt_count,
            fetch_limit=request.fetch_limit,
            snaplen=request.snaplen,
        )
    )


@app.post(
    "/api/trex/capture/stop",
    response_model=CapturePacketResultResponse,
    response_model_exclude_unset=True,
)
def stop_packet_capture(
    request: CaptureStopRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.stop_capture(
            capture_id=request.capture_id,
            pkt_count=request.pkt_count,
            save_pcap=request.save_pcap,
            file_name=request.file_name,
            snaplen=request.snaplen,
        )
    )


@app.post(
    "/api/trex/capture/remove-all",
    response_model=CaptureRemoveResultResponse,
    response_model_exclude_unset=True,
)
def remove_packet_captures(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return result_payload(service.remove_all_captures())


@app.post(
    "/api/trex/capture/remove",
    response_model=CaptureRemoveResultResponse,
    response_model_exclude_unset=True,
)
def remove_packet_capture(
    request: CaptureRemoveRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.remove_capture(capture_id=request.capture_id))


@app.get(
    "/api/trex/capture/files",
    response_model=CaptureFilesResultResponse,
    response_model_exclude_unset=True,
)
def packet_capture_files(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return result_payload(service.list_capture_files())


@app.post(
    "/api/trex/capture/files/download",
    response_model=CaptureFileDownloadResultResponse,
    response_model_exclude_unset=True,
)
def download_packet_capture_file(
    request: CaptureFileRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.download_capture_file(file_name=request.file_name))


@app.post(
    "/api/trex/capture/files/open",
    response_model=CaptureFileOpenResultResponse,
    response_model_exclude_unset=True,
)
def open_packet_capture_file(
    request: CaptureFileRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.open_capture_file(file_name=request.file_name))


@app.get("/api/trex/reports")
def trex_run_reports(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return result_payload(service.list_run_reports())


@app.get("/api/trex/reports/trends")
def trex_run_report_trends(
    limit: int = Query(default=30, ge=1, le=RUN_REPORT_TREND_MAX_FILES),
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.run_report_trends(limit=limit))


@app.post("/api/trex/reports/save")
def save_trex_run_report(
    request: RunReportSaveRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.save_run_report(
            title=request.title,
            markdown=request.markdown,
            payload=request.payload,
            file_name=request.file_name,
            traffic_session_id=request.traffic_session_id,
            traffic_session_revision=request.traffic_session_revision,
        )
    )


@app.post("/api/trex/reports/download")
def download_trex_run_report(
    request: RunReportFileRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.download_run_report(file_name=request.file_name))


@app.get(
    "/api/trex/quick-validation",
    response_model=QuickValidationResultResponse,
    response_model_exclude_unset=True,
)
def quick_validation_status(
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(get_quick_validation_authority(service).status())


@app.post(
    "/api/trex/quick-validation/start",
    response_model=QuickValidationResultResponse,
    response_model_exclude_unset=True,
)
def start_quick_validation(
    request: QuickValidationStartRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if (
        get_environment().require_confirmation
        and request.confirmation != QUICK_VALIDATION_CONFIRMATION
    ):
        return confirmation_blocker(QUICK_VALIDATION_CONFIRMATION)
    return result_payload(
        get_quick_validation_authority(service).start(
            expected_run_id=request.expected_run_id,
            expected_run_revision=request.expected_run_revision,
            group_id=request.group_id,
            plan_revision=request.plan_revision,
            duration_seconds=request.duration_seconds,
        )
    )


@app.post(
    "/api/trex/quick-validation/cancel",
    response_model=QuickValidationResultResponse,
    response_model_exclude_unset=True,
)
def cancel_quick_validation(
    request: QuickValidationCancelRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if (
        get_environment().require_confirmation
        and request.confirmation != QUICK_VALIDATION_CANCEL_CONFIRMATION
    ):
        return confirmation_blocker(QUICK_VALIDATION_CANCEL_CONFIRMATION)
    return result_payload(
        get_quick_validation_authority(service).cancel(
            run_id=request.run_id,
            run_revision=request.run_revision,
        )
    )


@app.get(
    "/api/trex/traffic/runtime",
    response_model=TrafficRuntimeResultResponse,
    response_model_exclude_unset=True,
)
def traffic_runtime(
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(service.traffic_runtime_snapshot())


@app.put(
    "/api/trex/traffic/plan",
    response_model=TrafficRuntimeResultResponse,
    response_model_exclude_unset=True,
)
def replace_traffic_plan(
    request: TrafficPlanPutRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.replace_traffic_plan(
            expected_revision=request.plan_revision,
            groups=[group.model_dump(mode="python") for group in request.groups],
        )
    )


@app.post(
    "/api/trex/traffic/group/{group_id}/start",
    response_model=TrafficStartResultResponse,
    response_model_exclude_unset=True,
)
def start_traffic_group(
    group_id: str,
    request: TrafficGroupStartRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if get_environment().require_confirmation and request.confirmation != "start-traffic":
        return confirmation_blocker("start-traffic")
    return result_payload(
        service.start_traffic_group(
            group_id=group_id,
            expected_revision=request.plan_revision,
            expected_session_id=request.expected_session_id,
            hard_stop_at=request.hard_stop_at,
        )
    )


@app.post(
    "/api/trex/traffic/start",
    response_model=TrafficStartResultResponse,
    response_model_exclude_unset=True,
)
def start_traffic(
    request: StartTrafficRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if get_environment().require_confirmation and request.confirmation != "start-traffic":
        return confirmation_blocker("start-traffic")
    return result_payload(
        service.start_profile(
            profile_path=request.profile_path,
            ports=request.ports,
            multiplier=request.multiplier,
            duration=request.duration,
            force=request.force,
            total=request.total,
            synchronized=request.synchronized,
            clear_existing=request.clear_existing,
            tunables=request.tunables,
            expected_session_id=request.expected_session_id,
            hard_stop_at=request.hard_stop_at,
        )
    )


@app.post(
    "/api/trex/traffic/update",
    response_model=TrafficUpdateResultResponse,
    response_model_exclude_unset=True,
)
def update_traffic(
    request: UpdateTrafficRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    return result_payload(
        service.update_traffic(
            ports=request.ports,
            multiplier=request.multiplier,
            force=request.force,
            total=request.total,
            expected_session_id=request.expected_session_id,
        )
    )


@app.post(
    "/api/trex/traffic/{action}",
    response_model=TrafficActionResultResponse,
    response_model_exclude_unset=True,
)
def traffic_action(
    action: Literal["stop", "pause", "resume"],
    request: TrafficPortsRequest,
    service: RealStlClientService = Depends(get_stl_service),
) -> dict[str, object]:
    if action == "stop" and get_environment().require_confirmation and request.confirmation != "stop":
        return confirmation_blocker("stop")
    return result_payload(
        service.traffic_action(
            action,
            request.ports,
            expected_session_id=request.expected_session_id,
        )
    )


@app.get(
    "/api/system/overview",
    response_model=SystemOverviewResponse,
    response_model_exclude_unset=True,
)
def overview(service: RealStlClientService = Depends(get_stl_service)) -> dict[str, object]:
    return build_system_overview(service)
