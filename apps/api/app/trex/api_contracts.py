from __future__ import annotations

from typing import Any, Generic, Literal, Optional, TypeVar, Union

from pydantic import BaseModel, ConfigDict, Field, RootModel

from app.trex.quick_validation import QuickValidationStatusResponse


TrexData = TypeVar("TrexData")
CaptureId = Union[int, str]


class StrictResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TrexResultResponse(StrictResponseModel, Generic[TrexData]):
    ok: bool
    data: Optional[TrexData] = None
    blocker: Optional[str] = None
    error: Optional[str] = None


class TrexConnectionAttemptFailure(StrictResponseModel):
    connected: Literal[False]
    partial_client_disposed: bool


class TrexDisconnectLifecycle(StrictResponseModel):
    disconnected: bool
    client_cached: bool
    stats_sampler_closed: Optional[bool] = None
    phase: Optional[str] = None
    remaining_capture_ids: Optional[list[CaptureId]] = None
    capture_id: Optional[CaptureId] = None


class EnvironmentReadinessResponse(StrictResponseModel):
    host: str
    sync_port: int
    async_port: int
    scapy_port: int
    client_name: str
    connect_timeout_seconds: int
    daemon_port: int
    daemon_supervisor: str
    scripts_dir: str
    daemon_bin: str
    config_path: str
    daemon_log: str
    runtime_state_path: str
    daemon_generation_path: str
    profile_roots: list[str]
    host_valid: bool
    scripts_dir_path_valid: bool
    daemon_bin_path_valid: bool
    config_path_valid: bool
    daemon_log_path_valid: bool
    runtime_state_path_valid: bool
    daemon_generation_path_valid: bool
    scripts_dir_exists: bool
    daemon_bin_exists: bool
    config_parent_exists: bool
    daemon_log_parent_exists: bool
    runtime_state_parent_exists: bool
    daemon_generation_exists: bool
    profile_roots_existing: list[str]
    command_timeout_seconds: int
    require_confirmation: bool
    capture_open_command: list[str]
    configuration_errors: dict[str, str]


class DaemonPreviewResponse(StrictResponseModel):
    action: str
    command: list[str]
    requires_confirmation: bool
    daemon_bin_exists: bool
    working_directory: str
    available: bool
    blocker: Optional[str]


class DaemonStatusResponse(StrictResponseModel):
    ok: bool
    running: bool
    source: str
    command_executed: bool
    command: list[str]
    returncode: Optional[int] = None
    stdout: str
    stderr: str
    blocker: Optional[str] = None
    error: Optional[str] = None


class TrexProbeResponse(StrictResponseModel):
    ok: bool
    server_version: Optional[Any] = None
    system_info: Optional[Any] = None
    blocker: Optional[str] = None
    error: Optional[str] = None


class TrexPortRecordResponse(StrictResponseModel):
    id: int
    acquired: bool
    info: dict[str, Any]


class TrexPortsSnapshotResponse(StrictResponseModel):
    server_version: Optional[Any] = None
    system_info: Optional[Any] = None
    port_ids: list[int]
    acquired_ports: list[int]
    ports: list[TrexPortRecordResponse]
    warnings: list[Any]


TrexPortsData = Union[TrexPortsSnapshotResponse, TrexConnectionAttemptFailure]


class TrexPortsResultResponse(TrexResultResponse[TrexPortsData]):
    pass


class SystemOverviewResponse(StrictResponseModel):
    environment: EnvironmentReadinessResponse
    daemon_preview: DaemonPreviewResponse
    daemon_status: DaemonStatusResponse
    trex_probe: TrexProbeResponse
    trex_ports: TrexPortsResultResponse


class TrexDisconnectResultResponse(TrexResultResponse[TrexDisconnectLifecycle]):
    pass


TrexConnectResponse = Union[SystemOverviewResponse, TrexDisconnectResultResponse]


class TrexStatsSnapshot(RootModel[dict[Union[str, int], Any]]):
    pass


TrexStatsData = Union[TrexStatsSnapshot, TrexConnectionAttemptFailure]


class TrexStatsResultResponse(TrexResultResponse[TrexStatsData]):
    pass


class TrexSampledStatsResultResponse(TrexResultResponse[TrexStatsData]):
    sequence: int
    sample_time: str


class TrexStatsClearResult(StrictResponseModel):
    accepted: bool
    ports: Optional[list[int]]
    clear_global: bool
    clear_flow_stats: bool
    clear_latency_stats: bool
    clear_xstats: bool
    result: Optional[str] = None


TrexStatsClearData = Union[TrexStatsClearResult, TrexConnectionAttemptFailure]


class TrexStatsClearResponse(TrexResultResponse[TrexStatsClearData]):
    pass


class TrexPortXstatsResult(StrictResponseModel):
    port: int
    xstats: Any


TrexPortXstatsData = Union[TrexPortXstatsResult, TrexConnectionAttemptFailure]


class TrexPortXstatsResponse(TrexResultResponse[TrexPortXstatsData]):
    pass


TrafficRunState = Literal["running", "paused", "stopped", "mixed", "unknown"]


class TrafficGroupResponse(StrictResponseModel):
    id: str
    name: str
    ports: list[int]
    profile_path: str
    multiplier: str
    duration: float
    force: bool
    total: bool
    synchronized: bool
    clear_existing: bool
    tunables: dict[str, Any]


class TrafficMutationEvidenceResponse(StrictResponseModel):
    intent_nonce: str
    operation: Literal["start", "stop", "pause", "resume", "update"]
    completion_mode: Literal["direct", "recovered", "replayed", "hard_stop"]
    ports: list[int]
    baseline_port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    desired_port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    baseline_acquired_ports: list[int]
    prepared_at: str
    completed_at: str
    acquisition_restored: Literal[True]
    wal_cleared: Literal[True]


class TrafficCleanupEvidenceResponse(StrictResponseModel):
    completion: Literal["operator_stop", "hard_stop", "observed"]
    completed_at: str
    final_port_states: dict[int, Literal["stopped"]]
    intent_nonce: Optional[str]
    acquisition_restored: Optional[Literal[True]]
    wal_cleared: bool


class TrafficSessionGroupResponse(StrictResponseModel):
    group_id: Optional[str]
    run_id: Optional[str]
    source: Optional[Literal["plan", "ad_hoc"]]
    plan_revision: Optional[int]
    ports: list[int]
    profile_path: str
    profile_sha256: Optional[str]
    start_multiplier: Optional[str]
    multiplier: str
    duration: float
    start_force: Optional[bool]
    start_total: Optional[bool]
    start_synchronized: Optional[bool]
    start_clear_existing: Optional[bool]
    started_at: Optional[str]
    ended_at: Optional[str]
    hard_stop_at: Optional[str]
    tunables: dict[str, Any]
    start_evidence: Optional[TrafficMutationEvidenceResponse]
    cleanup_evidence: Optional[TrafficCleanupEvidenceResponse]
    state: TrafficRunState
    port_states: dict[int, Literal["running", "paused", "stopped", "unknown"]]
    updated_at: str


class RuntimeAuthorityIdentityResponse(StrictResponseModel):
    host: str
    sync_port: int
    async_port: int
    scapy_port: int
    daemon_supervisor: Literal["external", "systemd"]
    generation: str


class TrafficSessionResponse(StrictResponseModel):
    id: str
    revision: int
    evidence_version: Optional[Literal[1]]
    authority: RuntimeAuthorityIdentityResponse
    state: TrafficRunState
    started_at: str
    updated_at: str
    ended_at: Optional[str]
    groups: list[TrafficSessionGroupResponse]
    completed_groups: list[TrafficSessionGroupResponse]
    mutation_evidence: list[TrafficMutationEvidenceResponse]
    reconciliation: Optional[str]


class TrafficConfigIdentityResponse(StrictResponseModel):
    path: str
    port_limit: int
    interfaces: list[str]


class TrafficPortRuntimeResponse(StrictResponseModel):
    port: int
    state: Literal["running", "paused", "stopped", "unknown"]
    ownership: Literal["managed", "external", "none"]


class TrafficMutationIntentResponse(StrictResponseModel):
    nonce: str
    phase: Literal["prepared", "cleanup_required"]
    operation: Literal["start", "stop", "pause", "resume", "update"]
    hardware_stage: Literal[
        "prepared",
        "acquire_intent",
        "acquired",
        "streams_remove_intent",
        "streams_removed",
        "profile_add_intent",
        "profile_added",
        "start_intent",
        "start_returned",
    ]
    authority: RuntimeAuthorityIdentityResponse
    expected_session_id: Optional[str]
    ports: list[int]
    baseline_port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    desired_port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    session_before: Optional[TrafficSessionResponse]
    start_group: Optional[TrafficSessionGroupResponse]
    start_source: Optional[Literal["plan", "ad_hoc"]]
    start_plan_revision: Optional[int]
    start_profile_sha256: Optional[str]
    start_clear_existing: Optional[bool]
    start_force: Optional[bool]
    start_total: Optional[bool]
    start_synchronized: Optional[bool]
    baseline_stream_ids: Optional[dict[int, list[int]]]
    baseline_acquired_ports: list[int]
    update_multiplier: Optional[str]
    update_force: Optional[bool]
    update_total: Optional[bool]
    superseded_intent_nonce: Optional[str]
    superseded_intent_operation: Optional[
        Literal["start", "stop", "pause", "resume", "update"]
    ]
    superseded_intent_ports: Optional[list[int]]
    superseded_reason: Optional[str]
    prepared_at: str
    reconciliation: Optional[str]


class TrafficRuntimeSnapshotResponse(StrictResponseModel):
    plan_revision: int
    groups: list[TrafficGroupResponse]
    authority: RuntimeAuthorityIdentityResponse
    session: Optional[TrafficSessionResponse]
    mutation_intent: Optional[TrafficMutationIntentResponse]
    config: TrafficConfigIdentityResponse
    available_ports: list[int]
    port_states: list[TrafficPortRuntimeResponse]
    live_state_sampled: bool
    reconciliation: str


class TrafficRuntimeResultResponse(TrexResultResponse[TrafficRuntimeSnapshotResponse]):
    pass


class QuickValidationResultResponse(
    TrexResultResponse[QuickValidationStatusResponse]
):
    pass


class TrafficCleanupResponse(StrictResponseModel):
    attempted: bool
    ok: bool
    action: Literal["stop"]
    ports: list[int]
    blocker: Optional[str]
    error: Optional[str]


class TrafficStartResult(StrictResponseModel):
    accepted: bool
    profile_path: str
    ports: list[int]
    multiplier: str
    duration: float
    force: bool
    total: bool
    synchronized: bool
    clear_existing: bool
    tunables: dict[str, Any]
    stream_ids: Any
    start_result: Optional[str]
    state_persisted: bool
    session: Optional[TrafficSessionResponse] = None
    cleanup: Optional[TrafficCleanupResponse] = None


TrafficStartData = Union[TrafficStartResult, TrexConnectionAttemptFailure]


class TrafficStartResultResponse(TrexResultResponse[TrafficStartData]):
    pass


class TrafficUpdateResult(StrictResponseModel):
    accepted: bool
    ports: list[int]
    multiplier: str
    force: bool
    total: bool
    update_result: Optional[str]
    state_persisted: bool
    session: Optional[TrafficSessionResponse] = None


TrafficUpdateData = Union[TrafficUpdateResult, TrexConnectionAttemptFailure]


class TrafficUpdateResultResponse(TrexResultResponse[TrafficUpdateData]):
    pass


class TrafficActionResult(StrictResponseModel):
    accepted: bool
    result: Optional[str]
    action: Literal["stop", "pause", "resume"]
    ports: list[int]
    state_persisted: bool
    session: Optional[TrafficSessionResponse] = None


TrafficActionData = Union[TrafficActionResult, TrexConnectionAttemptFailure]


class TrafficActionResultResponse(TrexResultResponse[TrafficActionData]):
    pass


class CaptureFilterResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    tx: Optional[Union[int, str, list[CaptureId]]] = None
    rx: Optional[Union[int, str, list[CaptureId]]] = None
    bpf: Optional[str] = None


class CaptureRecordResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: CaptureId
    state: Optional[str] = None
    status: Optional[str] = None
    count: Optional[Union[int, str]] = None
    pkt_count: Optional[Union[int, str]] = None
    bytes: Optional[Union[int, str]] = None
    fetched: Optional[Union[int, str]] = None
    matched: Optional[Union[int, str]] = None
    limit: Optional[Union[int, str]] = None
    mode: Optional[str] = None
    filter: Optional[CaptureFilterResponse] = None


class CapturePortUsageResponse(StrictResponseModel):
    port: int
    rx_recorder_ids: list[CaptureId]
    tx_recorder_ids: list[CaptureId]


class CaptureServiceModeResponse(StrictResponseModel):
    enabled_ports: list[int]
    already_enabled_ports: list[int]
    restored_ports: list[int]
    managed_capture_ids: list[CaptureId]
    released_capture_ids: Optional[list[CaptureId]] = None


class CaptureStatusResponse(StrictResponseModel):
    captures: list[CaptureRecordResponse]
    port_usage: list[CapturePortUsageResponse] = Field(default_factory=list)
    service_mode: Optional[CaptureServiceModeResponse] = None


class CaptureStartResult(CaptureStatusResponse):
    accepted: bool
    id: Optional[CaptureId]
    start_ts: Optional[float]
    tx_ports: list[int]
    rx_ports: list[int]
    limit: int
    mode: Literal["fixed", "cyclic"]
    bpf_filter: str
    snaplen: int


class CaptureDecodedFieldResponse(StrictResponseModel):
    name: str
    value: str


class CaptureDecodedLayerResponse(StrictResponseModel):
    name: str
    fields: list[CaptureDecodedFieldResponse]


class CapturePacketResponse(StrictResponseModel):
    index: int
    time: float
    port: Optional[CaptureId]
    mode: str
    destination: str
    source: str
    type: str
    length: int
    wirelen: int
    info: str
    binary_base64: str
    hex_preview: str
    decoded_layers: list[CaptureDecodedLayerResponse]


class CaptureFetchBudgetResponse(StrictResponseModel):
    requested_packet_count: int
    target_packet_count: int
    max_packet_count: int
    max_bytes: int
    fetched_bytes: int
    effective_snaplen: int
    truncated_by_byte_budget: bool
    available_packet_count: Optional[int] = None
    omitted_packet_count: Optional[int] = None


class CaptureSavedFileResponse(StrictResponseModel):
    path: str
    name: str
    size_bytes: int
    modified_time: Optional[str] = None
    download_available: Optional[bool] = None
    content_base64: Optional[str] = None
    download_error: Optional[str] = None


class CaptureErrorResponse(StrictResponseModel):
    stage: str
    error: str


class CapturePacketResult(CaptureStatusResponse):
    accepted: bool
    id: CaptureId
    packets: list[CapturePacketResponse]
    packet_count: int
    fetch_budget: CaptureFetchBudgetResponse
    saved_file: Optional[CaptureSavedFileResponse] = None
    capture_stopped: Optional[bool] = None
    capture_removed: Optional[bool] = None
    available_packet_count: Optional[int] = None
    primary_error: Optional[CaptureErrorResponse] = None
    cleanup_errors: Optional[list[CaptureErrorResponse]] = None


class CaptureRemoveResult(CaptureStatusResponse):
    accepted: bool
    removed_ids: list[CaptureId]
    captures_before: Optional[list[CaptureRecordResponse]] = None


class CaptureFilesResult(StrictResponseModel):
    root: str
    files: list[CaptureSavedFileResponse]


class CaptureFileDownloadResult(StrictResponseModel):
    accepted: bool
    file: CaptureSavedFileResponse


class CaptureFileOpenResult(CaptureFileDownloadResult):
    command: list[str]
    pid: int


CaptureStatusData = Union[CaptureStatusResponse, TrexConnectionAttemptFailure]
CaptureStartData = Union[CaptureStartResult, TrexConnectionAttemptFailure]
CapturePacketData = Union[CapturePacketResult, TrexConnectionAttemptFailure]
CaptureRemoveData = Union[CaptureRemoveResult, TrexConnectionAttemptFailure]

class CaptureStatusResultResponse(TrexResultResponse[CaptureStatusData]):
    pass


class CaptureStartResultResponse(TrexResultResponse[CaptureStartData]):
    pass


class CapturePacketResultResponse(TrexResultResponse[CapturePacketData]):
    pass


class CaptureRemoveResultResponse(TrexResultResponse[CaptureRemoveData]):
    pass


class CaptureFilesResultResponse(TrexResultResponse[CaptureFilesResult]):
    pass


class CaptureFileDownloadResultResponse(TrexResultResponse[CaptureFileDownloadResult]):
    pass


class CaptureFileOpenResultResponse(TrexResultResponse[CaptureFileOpenResult]):
    pass
