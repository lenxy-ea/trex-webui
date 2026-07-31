import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  acquirePorts,
  applyPortConfiguration,
  cancelDaemonTrexReservation,
  cancelQuickValidation,
  clearTrexStats,
  connectTrex,
  controlTraffic,
  deleteProfile,
  disconnectTrex,
  duplicateProfile,
  downloadCaptureFile,
  downloadRunReport,
  diffDaemonConfigVersion,
  exportProfileJson,
  exportProfileWorkbenchYaml,
  exportProfileWorkbenchPcap,
  fetchCapture,
  fetchCaptureFiles,
  fetchCaptureStatus,
  fetchDaemonConfigAudit,
  fetchDaemonConfigVersions,
  fetchDaemonDefaultConfig,
  fetchDaemonOverview,
  fetchPortXstats,
  fetchProfileWorkbench,
  fetchProfiles,
  fetchQuickValidation,
  fetchRunReportTrends,
  fetchRunReports,
  fetchSystemOverview,
  fetchTrafficRuntime,
  fetchTrexStats,
  getApiLogEntries,
  importProfileWorkbenchPcap,
  loadDaemonConfigVersion,
  openTrexStatsStream,
  openCaptureFile,
  parseTrexStatsStreamEvent,
  pingFromPort,
  releasePorts,
  removeAllCaptures,
  removeCapture,
  renderProfileWorkbench,
  reserveDaemonTrex,
  resetPorts,
  resolvePortsArp,
  restoreDaemonConfigVersion,
  scanPortsIpv6,
  saveDaemonConfigVersion,
  saveProfileWorkbench,
  saveRunReport,
  startCapture,
  startDaemonTrex,
  startQuickValidation,
  startTraffic,
  setPortAttribute,
  setServiceMode,
  stopCapture,
  stopDaemonTrex,
  subscribeApiLogEntries,
  updateTraffic,
  type ApiLogEntry,
  type CaptureFileRequest,
  type CaptureFetchRequest,
  type CaptureRemoveRequest,
  type CaptureStartRequest,
  type CaptureStopRequest,
  type ConnectTrexRequest,
  type DaemonConfigAudit,
  type DaemonConfigVersionDiffResult,
  type DaemonConfigVersions,
  type DaemonDefaultConfig,
  type EnvironmentReadiness,
  type DaemonOverview,
  type DaemonTrexReservationResult,
  type DaemonTrexResult,
  type ProfileCatalog,
  type ProfileExportResult,
  type ProfileFileOperationResult,
  type ProfilePcapExportResult,
  type ProfilePcapImportOptions,
  type ProfilePcapImportResult,
  type ProfilePacketPreview,
  type ProfileWorkbenchYamlExportResult,
  type ProfileWorkbenchSaveResult,
  type ProfileWorkbenchStream,
  type QuickValidationStatus,
  type FlowControlMode,
  type PortAttributeName,
  type RunReportDownloadResult,
  type RunReportSaveResult,
  type SystemOverview,
  type TrexCapturePacket,
  type TrexCaptureFileDownloadResult,
  type TrexCaptureFileOpenResult,
  type TrexCaptureFiles,
  type TrexCapturePacketResult,
  type TrexCaptureRemoveResult,
  type TrexCaptureStartResult,
  type TrexCaptureStatus,
  type TrexDisconnectResult,
  type TrexPortRecord,
  type TrexPortXstatsSnapshot,
  type TrexResult,
  type TrexRunReportTrends,
  type TrexRunReports,
  type TrexStatsSnapshot,
  type TrafficRuntimeSnapshot,
  type TrafficSession,
  type TrafficStartResult
} from "./api";
import { LogDock } from "./components/workbench/LogDock";
import { StatusFooter } from "./components/workbench/StatusFooter";
import { TopologyPane, type TopologyPortState } from "./components/workbench/TopologyPane";
import { WorkbenchChrome } from "./components/workbench/WorkbenchChrome";
import { ConnectWorkspace } from "./components/workbench/ConnectWorkspace";
import { FloatingWindow } from "./components/workbench/FloatingWindow";
import { PreferencesWorkspace } from "./components/workbench/PreferencesWorkspace";
import { PortControlWorkspace } from "./components/workbench/PortControlWorkspace";
import type { PortConfigurationDraft } from "./components/workbench/PortConfigurationPanel";
import type { QuickValidationStartConfirmation } from "./components/workbench/QuickValidationWorkspace";
import { capturePortSummaryFromStatus } from "./components/workbench/capturePortSummary";
import { appendCapturePackets } from "./components/workbench/capturePacketBuffer";
import { displayValue } from "./components/workbench/format";
import { portIsLocallyAcquired } from "./components/workbench/portControlState";
import { runtimeControlDisabledReason } from "./components/workbench/runtimeCapability";
import {
  buildProfileTunables,
  defaultProfileTunablesDraft,
  type ProfileTunablesDraft
} from "./components/workbench/profileTunables";
import {
  buildTrafficDuration,
  buildTrafficMultiplier,
  type TrafficMultiplierUnit
} from "./components/workbench/trafficMultiplier";
import type {
  RunReportTemplateId,
  RunReportTrafficSession
} from "./components/workbench/runReport";
import {
  synchronizeRunReportTrafficSession,
  trafficProfileByPort
} from "./components/workbench/trafficRunAuthority";
import { trexResultDiagnosticMessage } from "./components/workbench/trexDiagnostics";
import type { LogRow, StatsHistorySample, StatsRow } from "./components/workbench/types";
import "./styles.css";

type RunReportTools = typeof import("./components/workbench/runReport");
type ActiveDialog = "connect" | "dashboard" | "profiles" | "capture" | "quick-validation" | "reports" | "daemon" | "preferences" | "about" | null;

function loadRunReportTools() {
  return import("./components/workbench/runReport");
}

const TrexDaemonDialog = lazy(() =>
  import("./components/workbench/TrexDaemonDialog").then((module) => ({
    default: module.TrexDaemonDialog
  }))
);
const DashboardWorkspace = lazy(() =>
  import("./components/workbench/DashboardWorkspace").then((module) => ({
    default: module.DashboardWorkspace
  }))
);
const TrafficProfilesWorkspace = lazy(() =>
  import("./components/workbench/TrafficProfilesWorkspace").then((module) => ({
    default: module.TrafficProfilesWorkspace
  }))
);
const PacketCaptureWorkspace = lazy(() =>
  import("./components/workbench/PacketCaptureWorkspace").then((module) => ({
    default: module.PacketCaptureWorkspace
  }))
);
const RunReportsWorkspace = lazy(() =>
  import("./components/workbench/RunReportsWorkspace").then((module) => ({
    default: module.RunReportsWorkspace
  }))
);
const QuickValidationWorkspace = lazy(() =>
  import("./components/workbench/QuickValidationWorkspace").then((module) => ({
    default: module.QuickValidationWorkspace
  }))
);

const WORKSPACE_LOADING_FALLBACK = (
  <div aria-label="Loading workspace" aria-live="polite" className="workspace-loading" role="status">
    Loading…
  </div>
);

const STATS_POLL_ACTIVE_MS = 1000;
const STATS_POLL_BACKGROUND_MS = 5000;
const OVERVIEW_POLL_ACTIVE_MS = 3000;
const OVERVIEW_POLL_BACKGROUND_MS = 10000;
const QUICK_VALIDATION_POLL_MS = 1000;
const QUICK_VALIDATION_IDLE_POLL_MS = 5000;
const OPTIMISTIC_TRAFFIC_GRACE_MS = 3000;
const STATS_HISTORY_RETENTION_MS = 10 * 60 * 1000;
const STATS_HISTORY_MAX_SAMPLES = 1200;
const EMPTY_CAPTURE_PACKETS: TrexCapturePacket[] = [];
const EMPTY_LOG_ROWS: LogRow[] = [];
const EMPTY_PORT_RECORDS: TrexPortRecord[] = [];
const EMPTY_STATS_HISTORY: StatsHistorySample[] = [];

type CaptureCommandData =
  | TrexCaptureStartResult
  | TrexCapturePacketResult
  | TrexCaptureRemoveResult
  | TrexCaptureFileDownloadResult
  | TrexCaptureFileOpenResult;

function defaultWorkbenchStream(index: number): ProfileWorkbenchStream {
  return {
    name: `stream-${index}`,
    packet_type: "Ethernet/IPv4/UDP",
    frame_length_type: "Fixed",
    frame_length: 64,
    frame_length_min: 64,
    frame_length_max: 1518,
    mode: "continuous",
    rate_type: "pps",
    rate_value: 1000,
    enabled: true,
    self_start: true,
    total_pkts: 1,
    pkts_per_burst: 1,
    count: 1,
    next_stream_id: null,
    action_count: 0,
    isg: 0,
    ibg: 0,
    pg_id: index,
    flow_stats_enabled: true,
    latency_enabled: false,
    ether_dst: "00:00:00:00:00:00",
    ether_src: "00:00:00:00:00:00",
    ether_type_override: false,
    ether_type: "0800",
    ether_dst_mode: "TRex Config",
    ether_dst_count: 16,
    ether_dst_step: 1,
    ether_src_mode: "TRex Config",
    ether_src_count: 16,
    ether_src_step: 1,
    arp_hardware_type: 1,
    arp_protocol_type: "0800",
    arp_hardware_size: 6,
    arp_protocol_size: 4,
    arp_operation: 1,
    arp_operation_mode: "Fixed",
    arp_operation_count: 4,
    arp_operation_step: 1,
    arp_sender_mac: "00:00:00:00:00:00",
    arp_sender_mac_mode: "Fixed",
    arp_sender_mac_count: 16,
    arp_sender_mac_step: 1,
    arp_sender_ip: "16.0.0.1",
    arp_sender_ip_mode: "Fixed",
    arp_sender_ip_count: 16,
    arp_sender_ip_step: 1,
    arp_target_mac: "00:00:00:00:00:00",
    arp_target_mac_mode: "Fixed",
    arp_target_mac_count: 16,
    arp_target_mac_step: 1,
    arp_target_ip: "48.0.0.1",
    arp_target_ip_mode: "Fixed",
    arp_target_ip_count: 16,
    arp_target_ip_step: 1,
    vlan_enabled: false,
    vlan_tpid_override: false,
    vlan_tpid: "8100",
    vlan_priority: 0,
    vlan_priority_mode: "Fixed",
    vlan_priority_count: 4,
    vlan_priority_step: 1,
    vlan_cfi: 0,
    vlan_id: 0,
    vlan_id_mode: "Fixed",
    vlan_id_count: 16,
    vlan_id_step: 1,
    vlan2_enabled: false,
    vlan2_tpid_override: false,
    vlan2_tpid: "8100",
    vlan2_priority: 0,
    vlan2_priority_mode: "Fixed",
    vlan2_priority_count: 4,
    vlan2_priority_step: 1,
    vlan2_cfi: 0,
    vlan2_id: 1,
    vlan2_id_mode: "Fixed",
    vlan2_id_count: 16,
    vlan2_id_step: 1,
    mpls_enabled: false,
    mpls_label: 17,
    mpls_label_mode: "Fixed",
    mpls_label_count: 16,
    mpls_label_step: 1,
    mpls_tc: 0,
    mpls_tc_mode: "Fixed",
    mpls_tc_count: 4,
    mpls_tc_step: 1,
    mpls_ttl: 255,
    mpls_ttl_mode: "Fixed",
    mpls_ttl_count: 16,
    mpls_ttl_step: 1,
    mpls_label2_enabled: false,
    mpls_label2: 18,
    mpls_label2_mode: "Fixed",
    mpls_label2_count: 16,
    mpls_label2_step: 1,
    mpls_label2_tc: 0,
    mpls_label2_tc_mode: "Fixed",
    mpls_label2_tc_count: 4,
    mpls_label2_tc_step: 1,
    mpls_label2_ttl: 255,
    mpls_label2_ttl_mode: "Fixed",
    mpls_label2_ttl_count: 16,
    mpls_label2_ttl_step: 1,
    mpls_label3_enabled: false,
    mpls_label3: 19,
    mpls_label3_mode: "Fixed",
    mpls_label3_count: 16,
    mpls_label3_step: 1,
    mpls_label3_tc: 0,
    mpls_label3_tc_mode: "Fixed",
    mpls_label3_tc_count: 4,
    mpls_label3_tc_step: 1,
    mpls_label3_ttl: 255,
    mpls_label3_ttl_mode: "Fixed",
    mpls_label3_ttl_count: 16,
    mpls_label3_ttl_step: 1,
    vxlan_enabled: false,
    vxlan_vni: 42,
    vxlan_vni_mode: "Fixed",
    vxlan_vni_count: 16,
    vxlan_vni_step: 1,
    vxlan_inner_ether_dst: "00:00:00:00:00:00",
    vxlan_inner_ether_src: "00:00:00:00:00:00",
    vxlan_inner_ip_version: "IPv4",
    vxlan_inner_ipv4_src: "10.0.0.1",
    vxlan_inner_ipv4_src_mode: "Fixed",
    vxlan_inner_ipv4_src_count: 16,
    vxlan_inner_ipv4_src_step: 1,
    vxlan_inner_ipv4_dst: "10.0.0.2",
    vxlan_inner_ipv4_dst_mode: "Fixed",
    vxlan_inner_ipv4_dst_count: 16,
    vxlan_inner_ipv4_dst_step: 1,
    vxlan_inner_ipv4_ttl: 127,
    vxlan_inner_ipv4_ttl_mode: "Fixed",
    vxlan_inner_ipv4_ttl_count: 16,
    vxlan_inner_ipv4_ttl_step: 1,
    vxlan_inner_ipv6_src: "2001:db8:50::1",
    vxlan_inner_ipv6_src_mode: "Fixed",
    vxlan_inner_ipv6_src_count: 16,
    vxlan_inner_ipv6_src_step: 1,
    vxlan_inner_ipv6_dst: "2001:db8:50::2",
    vxlan_inner_ipv6_dst_mode: "Fixed",
    vxlan_inner_ipv6_dst_count: 16,
    vxlan_inner_ipv6_dst_step: 1,
    vxlan_inner_ipv6_hop_limit: 64,
    vxlan_inner_ipv6_hop_limit_mode: "Fixed",
    vxlan_inner_ipv6_hop_limit_count: 16,
    vxlan_inner_ipv6_hop_limit_step: 1,
    vxlan_inner_l4_src_port: 1025,
    vxlan_inner_l4_src_port_mode: "Fixed",
    vxlan_inner_l4_src_port_count: 16,
    vxlan_inner_l4_src_port_step: 1,
    vxlan_inner_l4_dst_port: 12,
    vxlan_inner_l4_dst_port_mode: "Fixed",
    vxlan_inner_l4_dst_port_count: 16,
    vxlan_inner_l4_dst_port_step: 1,
    gtpu_enabled: false,
    gtpu_message_type: 255,
    gtpu_teid: 0x12345678,
    gtpu_teid_mode: "Fixed",
    gtpu_teid_count: 16,
    gtpu_teid_step: 1,
    gtpu_sequence_enabled: false,
    gtpu_sequence: 0,
    gtpu_sequence_mode: "Fixed",
    gtpu_sequence_count: 16,
    gtpu_sequence_step: 1,
    gtpu_npdu_enabled: false,
    gtpu_npdu: 0,
    gtpu_npdu_mode: "Fixed",
    gtpu_npdu_count: 16,
    gtpu_npdu_step: 1,
    gtpu_extension_enabled: false,
    gtpu_extension_udp_port: 2152,
    gtpu_extension_udp_port_mode: "Fixed",
    gtpu_extension_udp_port_count: 16,
    gtpu_extension_udp_port_step: 1,
    gtpu_inner_ip_version: "IPv4",
    gtpu_inner_ipv4_src: "10.3.0.1",
    gtpu_inner_ipv4_src_mode: "Fixed",
    gtpu_inner_ipv4_src_count: 16,
    gtpu_inner_ipv4_src_step: 1,
    gtpu_inner_ipv4_dst: "10.3.0.2",
    gtpu_inner_ipv4_dst_mode: "Fixed",
    gtpu_inner_ipv4_dst_count: 16,
    gtpu_inner_ipv4_dst_step: 1,
    gtpu_inner_ipv4_ttl: 64,
    gtpu_inner_ipv4_ttl_mode: "Fixed",
    gtpu_inner_ipv4_ttl_count: 16,
    gtpu_inner_ipv4_ttl_step: 1,
    gtpu_inner_ipv6_src: "2001:db8:30::1",
    gtpu_inner_ipv6_src_mode: "Fixed",
    gtpu_inner_ipv6_src_count: 16,
    gtpu_inner_ipv6_src_step: 1,
    gtpu_inner_ipv6_dst: "2001:db8:30::2",
    gtpu_inner_ipv6_dst_mode: "Fixed",
    gtpu_inner_ipv6_dst_count: 16,
    gtpu_inner_ipv6_dst_step: 1,
    gtpu_inner_ipv6_hop_limit: 64,
    gtpu_inner_ipv6_hop_limit_mode: "Fixed",
    gtpu_inner_ipv6_hop_limit_count: 16,
    gtpu_inner_ipv6_hop_limit_step: 1,
    gtpu_inner_l4_src_port: 1025,
    gtpu_inner_l4_src_port_mode: "Fixed",
    gtpu_inner_l4_src_port_count: 16,
    gtpu_inner_l4_src_port_step: 1,
    gtpu_inner_l4_dst_port: 12,
    gtpu_inner_l4_dst_port_mode: "Fixed",
    gtpu_inner_l4_dst_port_count: 16,
    gtpu_inner_l4_dst_port_step: 1,
    gre_checksum_present: false,
    gre_checksum_override: false,
    gre_checksum: "0000",
    gre_key_present: false,
    gre_key: 0,
    gre_key_mode: "Fixed",
    gre_key_count: 16,
    gre_key_step: 1,
    gre_sequence_present: false,
    gre_sequence: 0,
    gre_sequence_mode: "Fixed",
    gre_sequence_count: 16,
    gre_sequence_step: 1,
    gre_protocol_type: "0800",
    gre_inner_ip_version: "IPv4",
    gre_inner_ipv4_src: "10.2.0.1",
    gre_inner_ipv4_src_mode: "Fixed",
    gre_inner_ipv4_src_count: 16,
    gre_inner_ipv4_src_step: 1,
    gre_inner_ipv4_dst: "10.2.0.2",
    gre_inner_ipv4_dst_mode: "Fixed",
    gre_inner_ipv4_dst_count: 16,
    gre_inner_ipv4_dst_step: 1,
    gre_inner_ipv4_ttl: 64,
    gre_inner_ipv4_ttl_mode: "Fixed",
    gre_inner_ipv4_ttl_count: 16,
    gre_inner_ipv4_ttl_step: 1,
    gre_inner_ipv6_src: "2001:db8:40::1",
    gre_inner_ipv6_src_mode: "Fixed",
    gre_inner_ipv6_src_count: 16,
    gre_inner_ipv6_src_step: 1,
    gre_inner_ipv6_dst: "2001:db8:40::2",
    gre_inner_ipv6_dst_mode: "Fixed",
    gre_inner_ipv6_dst_count: 16,
    gre_inner_ipv6_dst_step: 1,
    gre_inner_ipv6_hop_limit: 64,
    gre_inner_ipv6_hop_limit_mode: "Fixed",
    gre_inner_ipv6_hop_limit_count: 16,
    gre_inner_ipv6_hop_limit_step: 1,
    gre_inner_l4_src_port: 1025,
    gre_inner_l4_src_port_mode: "Fixed",
    gre_inner_l4_src_port_count: 16,
    gre_inner_l4_src_port_step: 1,
    gre_inner_l4_dst_port: 12,
    gre_inner_l4_dst_port_mode: "Fixed",
    gre_inner_l4_dst_port_count: 16,
    gre_inner_l4_dst_port_step: 1,
    ipv4_src: "16.0.0.1",
    ipv4_dst: "48.0.0.1",
    ipv4_src_mode: "Fixed",
    ipv4_src_count: 16,
    ipv4_src_step: 1,
    ipv4_dst_mode: "Fixed",
    ipv4_dst_count: 16,
    ipv4_dst_step: 1,
    ipv4_dscp: 0,
    ipv4_dscp_mode: "Fixed",
    ipv4_dscp_count: 16,
    ipv4_dscp_step: 1,
    ipv4_ecn: 0,
    ipv4_ecn_mode: "Fixed",
    ipv4_ecn_count: 4,
    ipv4_ecn_step: 1,
    ipv4_id: 1234,
    ipv4_id_mode: "Fixed",
    ipv4_id_count: 16,
    ipv4_id_step: 1,
    ipv4_flag_df: false,
    ipv4_flag_mf: false,
    ipv4_fragment_offset: 0,
    ipv4_fragment_offset_mode: "Fixed",
    ipv4_fragment_offset_count: 16,
    ipv4_fragment_offset_step: 1,
    ipv4_ttl: 127,
    ipv4_ttl_mode: "Fixed",
    ipv4_ttl_count: 16,
    ipv4_ttl_step: 1,
    ipv4_checksum_override: false,
    ipv4_checksum: "0000",
    ipv6_src: "2001:db8::1",
    ipv6_dst: "2001:db8::2",
    ipv6_src_mode: "Fixed",
    ipv6_src_count: 16,
    ipv6_src_step: 1,
    ipv6_dst_mode: "Fixed",
    ipv6_dst_count: 16,
    ipv6_dst_step: 1,
    ipv6_traffic_class: 0,
    ipv6_traffic_class_mode: "Fixed",
    ipv6_traffic_class_count: 16,
    ipv6_traffic_class_step: 1,
    ipv6_flow_label: 0,
    ipv6_flow_label_mode: "Fixed",
    ipv6_flow_label_count: 16,
    ipv6_flow_label_step: 1,
    ipv6_hop_limit: 127,
    ipv6_hop_limit_mode: "Fixed",
    ipv6_hop_limit_count: 16,
    ipv6_hop_limit_step: 1,
    l4_src_port_override: false,
    l4_src_port: 1025,
    l4_src_port_mode: "Fixed",
    l4_src_port_count: 16,
    l4_src_port_step: 1,
    l4_dst_port_override: false,
    l4_dst_port: 12,
    l4_dst_port_mode: "Fixed",
    l4_dst_port_count: 16,
    l4_dst_port_step: 1,
    udp_length_override: false,
    udp_length: 26,
    udp_length_mode: "Fixed",
    udp_length_count: 16,
    udp_length_step: 1,
    udp_checksum_override: false,
    udp_checksum: "0000",
    udp_checksum_mode: "Fixed",
    udp_checksum_count: 16,
    udp_checksum_step: 1,
    dns_enabled: false,
    dns_transaction_id: 0x1234,
    dns_transaction_id_mode: "Fixed",
    dns_transaction_id_count: 16,
    dns_transaction_id_step: 1,
    dns_flags: "0100",
    dns_flags_mode: "Fixed",
    dns_flags_count: 16,
    dns_flags_step: 1,
    dns_query_name: "example.com",
    dns_query_type: 1,
    dns_query_type_mode: "Fixed",
    dns_query_type_count: 16,
    dns_query_type_step: 1,
    dns_query_class: 1,
    dns_query_class_mode: "Fixed",
    dns_query_class_count: 16,
    dns_query_class_step: 1,
    dns_answer_enabled: false,
    dns_answer_ttl: 60,
    dns_answer_ttl_mode: "Fixed",
    dns_answer_ttl_count: 16,
    dns_answer_ttl_step: 1,
    dns_answer_ipv4: "192.0.2.1",
    dns_answer_ipv4_mode: "Fixed",
    dns_answer_ipv4_count: 16,
    dns_answer_ipv4_step: 1,
    dhcp_enabled: false,
    dhcp_operation: 1,
    dhcp_operation_mode: "Fixed",
    dhcp_operation_count: 2,
    dhcp_operation_step: 1,
    dhcp_hops: 0,
    dhcp_hops_mode: "Fixed",
    dhcp_hops_count: 16,
    dhcp_hops_step: 1,
    dhcp_seconds: 0,
    dhcp_seconds_mode: "Fixed",
    dhcp_seconds_count: 16,
    dhcp_seconds_step: 1,
    dhcp_message_type: 1,
    dhcp_message_type_mode: "Fixed",
    dhcp_message_type_count: 16,
    dhcp_message_type_step: 1,
    dhcp_xid: 0x3903f326,
    dhcp_xid_mode: "Fixed",
    dhcp_xid_count: 16,
    dhcp_xid_step: 1,
    dhcp_flags: "8000",
    dhcp_flags_mode: "Fixed",
    dhcp_flags_count: 16,
    dhcp_flags_step: 1,
    dhcp_client_ip: "0.0.0.0",
    dhcp_client_ip_mode: "Fixed",
    dhcp_client_ip_count: 16,
    dhcp_client_ip_step: 1,
    dhcp_your_ip: "0.0.0.0",
    dhcp_your_ip_mode: "Fixed",
    dhcp_your_ip_count: 16,
    dhcp_your_ip_step: 1,
    dhcp_server_ip: "0.0.0.0",
    dhcp_server_ip_mode: "Fixed",
    dhcp_server_ip_count: 16,
    dhcp_server_ip_step: 1,
    dhcp_relay_ip: "0.0.0.0",
    dhcp_relay_ip_mode: "Fixed",
    dhcp_relay_ip_count: 16,
    dhcp_relay_ip_step: 1,
    dhcp_client_mac: "00:11:22:33:44:55",
    dhcp_client_mac_mode: "Fixed",
    dhcp_client_mac_count: 16,
    dhcp_client_mac_step: 1,
    dhcp_hostname: "trex-webui",
    dhcp_requested_ip: "0.0.0.0",
    dhcp_requested_ip_mode: "Fixed",
    dhcp_requested_ip_count: 16,
    dhcp_requested_ip_step: 1,
    dhcp_server_id: "0.0.0.0",
    dhcp_server_id_mode: "Fixed",
    dhcp_server_id_count: 16,
    dhcp_server_id_step: 1,
    dhcp_parameter_request_list: "1,3,6,15,28,51,58,59",
    dhcp_lease_time: 0,
    dhcp_lease_time_mode: "Fixed",
    dhcp_lease_time_count: 16,
    dhcp_lease_time_step: 1,
    dhcp_renewal_time: 0,
    dhcp_renewal_time_mode: "Fixed",
    dhcp_renewal_time_count: 16,
    dhcp_renewal_time_step: 1,
    dhcp_rebinding_time: 0,
    dhcp_rebinding_time_mode: "Fixed",
    dhcp_rebinding_time_count: 16,
    dhcp_rebinding_time_step: 1,
    icmp_type: 8,
    icmp_type_mode: "Fixed",
    icmp_type_count: 16,
    icmp_type_step: 1,
    icmp_code: 0,
    icmp_code_mode: "Fixed",
    icmp_code_count: 16,
    icmp_code_step: 1,
    icmp_checksum_override: false,
    icmp_checksum: "0000",
    icmp_identifier: 1,
    icmp_identifier_mode: "Fixed",
    icmp_identifier_count: 16,
    icmp_identifier_step: 1,
    icmp_sequence: 1,
    icmp_sequence_mode: "Fixed",
    icmp_sequence_count: 16,
    icmp_sequence_step: 1,
    icmpv6_nd_target: "2001:db8::2",
    icmpv6_nd_include_option: true,
    icmpv6_nd_option_mac: "00:00:00:00:00:00",
    icmpv6_nd_na_router: false,
    icmpv6_nd_na_solicited: true,
    icmpv6_nd_na_override: true,
    icmpv6_rs_include_slla: true,
    icmpv6_rs_slla_mac: "00:00:00:00:00:00",
    icmpv6_ra_cur_hop_limit: 64,
    icmpv6_ra_managed: false,
    icmpv6_ra_other: false,
    icmpv6_ra_router_lifetime: 1800,
    icmpv6_ra_reachable_time: 0,
    icmpv6_ra_retrans_timer: 0,
    icmpv6_ra_include_slla: true,
    icmpv6_ra_slla_mac: "00:00:00:00:00:00",
    icmpv6_ra_include_prefix: true,
    icmpv6_ra_prefix: "2001:db8:1::",
    icmpv6_ra_prefix_length: 64,
    icmpv6_ra_prefix_on_link: true,
    icmpv6_ra_prefix_autonomous: true,
    icmpv6_ra_prefix_valid_lifetime: 2592000,
    icmpv6_ra_prefix_preferred_lifetime: 604800,
    tcp_sequence_number: 1234567,
    tcp_sequence_mode: "Fixed",
    tcp_sequence_count: 16,
    tcp_sequence_step: 1,
    tcp_ack_number: 7654321,
    tcp_ack_mode: "Fixed",
    tcp_ack_count: 16,
    tcp_ack_step: 1,
    tcp_window: 9999,
    tcp_window_mode: "Fixed",
    tcp_window_count: 16,
    tcp_window_step: 1,
    tcp_checksum_override: false,
    tcp_checksum: "ABCD",
    tcp_checksum_mode: "Fixed",
    tcp_checksum_count: 16,
    tcp_checksum_step: 1,
    tcp_option_mss_enabled: false,
    tcp_option_mss: 1460,
    tcp_option_mss_mode: "Fixed",
    tcp_option_mss_count: 16,
    tcp_option_mss_step: 1,
    tcp_option_window_scale_enabled: false,
    tcp_option_window_scale: 7,
    tcp_option_window_scale_mode: "Fixed",
    tcp_option_window_scale_count: 16,
    tcp_option_window_scale_step: 1,
    tcp_option_sack_permitted_enabled: false,
    tcp_option_sack_blocks_enabled: false,
    tcp_option_sack_left_edge: 1000,
    tcp_option_sack_left_edge_mode: "Fixed",
    tcp_option_sack_left_edge_count: 16,
    tcp_option_sack_left_edge_step: 1,
    tcp_option_sack_right_edge: 2000,
    tcp_option_sack_right_edge_mode: "Fixed",
    tcp_option_sack_right_edge_count: 16,
    tcp_option_sack_right_edge_step: 1,
    tcp_option_timestamp_enabled: false,
    tcp_option_timestamp_value: 1,
    tcp_option_timestamp_value_mode: "Fixed",
    tcp_option_timestamp_value_count: 16,
    tcp_option_timestamp_value_step: 1,
    tcp_option_timestamp_echo: 0,
    tcp_option_timestamp_echo_mode: "Fixed",
    tcp_option_timestamp_echo_count: 16,
    tcp_option_timestamp_echo_step: 1,
    tcp_urgent_pointer: 1111,
    tcp_urgent_pointer_mode: "Fixed",
    tcp_urgent_pointer_count: 16,
    tcp_urgent_pointer_step: 1,
    tcp_flags_mode: "Fixed",
    tcp_flags_count: 16,
    tcp_flags_step: 1,
    tcp_flag_urg: false,
    tcp_flag_ack: false,
    tcp_flag_psh: false,
    tcp_flag_rst: false,
    tcp_flag_syn: false,
    tcp_flag_fin: false,
    sctp_verification_tag: 0x12345678,
    sctp_verification_tag_mode: "Fixed",
    sctp_verification_tag_count: 16,
    sctp_verification_tag_step: 1,
    sctp_checksum_override: false,
    sctp_checksum: "00000000",
    sctp_data_flags: 3,
    sctp_data_flags_mode: "Fixed",
    sctp_data_flags_count: 16,
    sctp_data_flags_step: 1,
    sctp_tsn: 1,
    sctp_tsn_mode: "Fixed",
    sctp_tsn_count: 16,
    sctp_tsn_step: 1,
    sctp_stream_id: 0,
    sctp_stream_id_mode: "Fixed",
    sctp_stream_id_count: 16,
    sctp_stream_id_step: 1,
    sctp_stream_sequence: 0,
    sctp_stream_sequence_mode: "Fixed",
    sctp_stream_sequence_count: 16,
    sctp_stream_sequence_step: 1,
    sctp_payload_protocol_id: 0,
    sctp_payload_protocol_id_mode: "Fixed",
    sctp_payload_protocol_id_count: 16,
    sctp_payload_protocol_id_step: 1,
    payload_enabled: true,
    payload_type: "Fixed Word",
    payload_pattern: "00",
    advanced_cache_size_type: "Auto",
    advanced_cache_value: 5000,
    packet_binary_base64: null,
    advanced_mode: false,
    packet_model: null,
    packet_meta_base64: null,
    advanced_vm: null
  };
}

function completeWorkbenchStream(stream: Partial<ProfileWorkbenchStream>, index: number): ProfileWorkbenchStream {
  return {
    ...defaultWorkbenchStream(index),
    ...stream
  };
}

function completeWorkbenchStreams(streams: ProfileWorkbenchStream[]): ProfileWorkbenchStream[] {
  return streams.map((stream, index) => completeWorkbenchStream(stream, index + 1));
}

const packetBinaryInvalidatingFields: (keyof ProfileWorkbenchStream)[] = [
  "packet_type",
  "frame_length_type",
  "frame_length",
  "frame_length_min",
  "frame_length_max",
  "ether_dst",
  "ether_src",
  "ether_type_override",
  "ether_type",
  "ether_dst_mode",
  "ether_dst_count",
  "ether_dst_step",
  "ether_src_mode",
  "ether_src_count",
  "ether_src_step",
  "arp_hardware_type",
  "arp_protocol_type",
  "arp_hardware_size",
  "arp_protocol_size",
  "arp_operation",
  "arp_operation_mode",
  "arp_operation_count",
  "arp_operation_step",
  "arp_sender_mac",
  "arp_sender_mac_mode",
  "arp_sender_mac_count",
  "arp_sender_mac_step",
  "arp_sender_ip",
  "arp_sender_ip_mode",
  "arp_sender_ip_count",
  "arp_sender_ip_step",
  "arp_target_mac",
  "arp_target_mac_mode",
  "arp_target_mac_count",
  "arp_target_mac_step",
  "arp_target_ip",
  "arp_target_ip_mode",
  "arp_target_ip_count",
  "arp_target_ip_step",
  "vlan_enabled",
  "vlan_tpid_override",
  "vlan_tpid",
  "vlan_priority",
  "vlan_priority_mode",
  "vlan_priority_count",
  "vlan_priority_step",
  "vlan_cfi",
  "vlan_id",
  "vlan_id_mode",
  "vlan_id_count",
  "vlan_id_step",
  "vlan2_enabled",
  "vlan2_tpid_override",
  "vlan2_tpid",
  "vlan2_priority",
  "vlan2_priority_mode",
  "vlan2_priority_count",
  "vlan2_priority_step",
  "vlan2_cfi",
  "vlan2_id",
  "vlan2_id_mode",
  "vlan2_id_count",
  "vlan2_id_step",
  "mpls_enabled",
  "mpls_label",
  "mpls_label_mode",
  "mpls_label_count",
  "mpls_label_step",
  "mpls_tc",
  "mpls_tc_mode",
  "mpls_tc_count",
  "mpls_tc_step",
  "mpls_ttl",
  "mpls_ttl_mode",
  "mpls_ttl_count",
  "mpls_ttl_step",
  "mpls_label2_enabled",
  "mpls_label2",
  "mpls_label2_mode",
  "mpls_label2_count",
  "mpls_label2_step",
  "mpls_label2_tc",
  "mpls_label2_tc_mode",
  "mpls_label2_tc_count",
  "mpls_label2_tc_step",
  "mpls_label2_ttl",
  "mpls_label2_ttl_mode",
  "mpls_label2_ttl_count",
  "mpls_label2_ttl_step",
  "mpls_label3_enabled",
  "mpls_label3",
  "mpls_label3_mode",
  "mpls_label3_count",
  "mpls_label3_step",
  "mpls_label3_tc",
  "mpls_label3_tc_mode",
  "mpls_label3_tc_count",
  "mpls_label3_tc_step",
  "mpls_label3_ttl",
  "mpls_label3_ttl_mode",
  "mpls_label3_ttl_count",
  "mpls_label3_ttl_step",
  "vxlan_enabled",
  "vxlan_vni",
  "vxlan_vni_mode",
  "vxlan_vni_count",
  "vxlan_vni_step",
  "vxlan_inner_ether_dst",
  "vxlan_inner_ether_src",
  "vxlan_inner_ip_version",
  "vxlan_inner_ipv4_src",
  "vxlan_inner_ipv4_src_mode",
  "vxlan_inner_ipv4_src_count",
  "vxlan_inner_ipv4_src_step",
  "vxlan_inner_ipv4_dst",
  "vxlan_inner_ipv4_dst_mode",
  "vxlan_inner_ipv4_dst_count",
  "vxlan_inner_ipv4_dst_step",
  "vxlan_inner_ipv4_ttl",
  "vxlan_inner_ipv4_ttl_mode",
  "vxlan_inner_ipv4_ttl_count",
  "vxlan_inner_ipv4_ttl_step",
  "vxlan_inner_ipv6_src",
  "vxlan_inner_ipv6_src_mode",
  "vxlan_inner_ipv6_src_count",
  "vxlan_inner_ipv6_src_step",
  "vxlan_inner_ipv6_dst",
  "vxlan_inner_ipv6_dst_mode",
  "vxlan_inner_ipv6_dst_count",
  "vxlan_inner_ipv6_dst_step",
  "vxlan_inner_ipv6_hop_limit",
  "vxlan_inner_ipv6_hop_limit_mode",
  "vxlan_inner_ipv6_hop_limit_count",
  "vxlan_inner_ipv6_hop_limit_step",
  "vxlan_inner_l4_src_port",
  "vxlan_inner_l4_src_port_mode",
  "vxlan_inner_l4_src_port_count",
  "vxlan_inner_l4_src_port_step",
  "vxlan_inner_l4_dst_port",
  "vxlan_inner_l4_dst_port_mode",
  "vxlan_inner_l4_dst_port_count",
  "vxlan_inner_l4_dst_port_step",
  "gtpu_enabled",
  "gtpu_message_type",
  "gtpu_teid",
  "gtpu_teid_mode",
  "gtpu_teid_count",
  "gtpu_teid_step",
  "gtpu_sequence_enabled",
  "gtpu_sequence",
  "gtpu_sequence_mode",
  "gtpu_sequence_count",
  "gtpu_sequence_step",
  "gtpu_npdu_enabled",
  "gtpu_npdu",
  "gtpu_npdu_mode",
  "gtpu_npdu_count",
  "gtpu_npdu_step",
  "gtpu_extension_enabled",
  "gtpu_extension_udp_port",
  "gtpu_extension_udp_port_mode",
  "gtpu_extension_udp_port_count",
  "gtpu_extension_udp_port_step",
  "gtpu_inner_ip_version",
  "gtpu_inner_ipv4_src",
  "gtpu_inner_ipv4_src_mode",
  "gtpu_inner_ipv4_src_count",
  "gtpu_inner_ipv4_src_step",
  "gtpu_inner_ipv4_dst",
  "gtpu_inner_ipv4_dst_mode",
  "gtpu_inner_ipv4_dst_count",
  "gtpu_inner_ipv4_dst_step",
  "gtpu_inner_ipv4_ttl",
  "gtpu_inner_ipv4_ttl_mode",
  "gtpu_inner_ipv4_ttl_count",
  "gtpu_inner_ipv4_ttl_step",
  "gtpu_inner_ipv6_src",
  "gtpu_inner_ipv6_src_mode",
  "gtpu_inner_ipv6_src_count",
  "gtpu_inner_ipv6_src_step",
  "gtpu_inner_ipv6_dst",
  "gtpu_inner_ipv6_dst_mode",
  "gtpu_inner_ipv6_dst_count",
  "gtpu_inner_ipv6_dst_step",
  "gtpu_inner_ipv6_hop_limit",
  "gtpu_inner_ipv6_hop_limit_mode",
  "gtpu_inner_ipv6_hop_limit_count",
  "gtpu_inner_ipv6_hop_limit_step",
  "gtpu_inner_l4_src_port",
  "gtpu_inner_l4_src_port_mode",
  "gtpu_inner_l4_src_port_count",
  "gtpu_inner_l4_src_port_step",
  "gtpu_inner_l4_dst_port",
  "gtpu_inner_l4_dst_port_mode",
  "gtpu_inner_l4_dst_port_count",
  "gtpu_inner_l4_dst_port_step",
  "gre_checksum_present",
  "gre_checksum_override",
  "gre_checksum",
  "gre_key_present",
  "gre_key",
  "gre_key_mode",
  "gre_key_count",
  "gre_key_step",
  "gre_sequence_present",
  "gre_sequence",
  "gre_sequence_mode",
  "gre_sequence_count",
  "gre_sequence_step",
  "gre_protocol_type",
  "gre_inner_ip_version",
  "gre_inner_ipv4_src",
  "gre_inner_ipv4_src_mode",
  "gre_inner_ipv4_src_count",
  "gre_inner_ipv4_src_step",
  "gre_inner_ipv4_dst",
  "gre_inner_ipv4_dst_mode",
  "gre_inner_ipv4_dst_count",
  "gre_inner_ipv4_dst_step",
  "gre_inner_ipv4_ttl",
  "gre_inner_ipv4_ttl_mode",
  "gre_inner_ipv4_ttl_count",
  "gre_inner_ipv4_ttl_step",
  "gre_inner_ipv6_src",
  "gre_inner_ipv6_src_mode",
  "gre_inner_ipv6_src_count",
  "gre_inner_ipv6_src_step",
  "gre_inner_ipv6_dst",
  "gre_inner_ipv6_dst_mode",
  "gre_inner_ipv6_dst_count",
  "gre_inner_ipv6_dst_step",
  "gre_inner_ipv6_hop_limit",
  "gre_inner_ipv6_hop_limit_mode",
  "gre_inner_ipv6_hop_limit_count",
  "gre_inner_ipv6_hop_limit_step",
  "gre_inner_l4_src_port",
  "gre_inner_l4_src_port_mode",
  "gre_inner_l4_src_port_count",
  "gre_inner_l4_src_port_step",
  "gre_inner_l4_dst_port",
  "gre_inner_l4_dst_port_mode",
  "gre_inner_l4_dst_port_count",
  "gre_inner_l4_dst_port_step",
  "ipv4_src",
  "ipv4_dst",
  "ipv4_src_mode",
  "ipv4_src_count",
  "ipv4_src_step",
  "ipv4_dst_mode",
  "ipv4_dst_count",
  "ipv4_dst_step",
  "ipv4_dscp",
  "ipv4_dscp_mode",
  "ipv4_dscp_count",
  "ipv4_dscp_step",
  "ipv4_ecn",
  "ipv4_ecn_mode",
  "ipv4_ecn_count",
  "ipv4_ecn_step",
  "ipv4_id",
  "ipv4_id_mode",
  "ipv4_id_count",
  "ipv4_id_step",
  "ipv4_flag_df",
  "ipv4_flag_mf",
  "ipv4_fragment_offset",
  "ipv4_fragment_offset_mode",
  "ipv4_fragment_offset_count",
  "ipv4_fragment_offset_step",
  "ipv4_ttl",
  "ipv4_ttl_mode",
  "ipv4_ttl_count",
  "ipv4_ttl_step",
  "ipv4_checksum_override",
  "ipv4_checksum",
  "ipv6_src",
  "ipv6_dst",
  "ipv6_src_mode",
  "ipv6_src_count",
  "ipv6_src_step",
  "ipv6_dst_mode",
  "ipv6_dst_count",
  "ipv6_dst_step",
  "ipv6_traffic_class",
  "ipv6_traffic_class_mode",
  "ipv6_traffic_class_count",
  "ipv6_traffic_class_step",
  "ipv6_flow_label",
  "ipv6_flow_label_mode",
  "ipv6_flow_label_count",
  "ipv6_flow_label_step",
  "ipv6_hop_limit",
  "ipv6_hop_limit_mode",
  "ipv6_hop_limit_count",
  "ipv6_hop_limit_step",
  "l4_src_port_override",
  "l4_src_port",
  "l4_dst_port_override",
  "l4_dst_port",
  "udp_length_override",
  "udp_length",
  "udp_length_mode",
  "udp_length_count",
  "udp_length_step",
  "udp_checksum_override",
  "udp_checksum",
  "udp_checksum_mode",
  "udp_checksum_count",
  "udp_checksum_step",
  "dns_enabled",
  "dns_transaction_id",
  "dns_transaction_id_mode",
  "dns_transaction_id_count",
  "dns_transaction_id_step",
  "dns_flags",
  "dns_flags_mode",
  "dns_flags_count",
  "dns_flags_step",
  "dns_query_name",
  "dns_query_type",
  "dns_query_type_mode",
  "dns_query_type_count",
  "dns_query_type_step",
  "dns_query_class",
  "dns_query_class_mode",
  "dns_query_class_count",
  "dns_query_class_step",
  "dns_answer_enabled",
  "dns_answer_ttl",
  "dns_answer_ttl_mode",
  "dns_answer_ttl_count",
  "dns_answer_ttl_step",
  "dns_answer_ipv4",
  "dns_answer_ipv4_mode",
  "dns_answer_ipv4_count",
  "dns_answer_ipv4_step",
  "dhcp_enabled",
  "dhcp_operation",
  "dhcp_operation_mode",
  "dhcp_operation_count",
  "dhcp_operation_step",
  "dhcp_hops",
  "dhcp_hops_mode",
  "dhcp_hops_count",
  "dhcp_hops_step",
  "dhcp_seconds",
  "dhcp_seconds_mode",
  "dhcp_seconds_count",
  "dhcp_seconds_step",
  "dhcp_message_type",
  "dhcp_message_type_mode",
  "dhcp_message_type_count",
  "dhcp_message_type_step",
  "dhcp_xid",
  "dhcp_xid_mode",
  "dhcp_xid_count",
  "dhcp_xid_step",
  "dhcp_flags",
  "dhcp_flags_mode",
  "dhcp_flags_count",
  "dhcp_flags_step",
  "dhcp_client_ip",
  "dhcp_client_ip_mode",
  "dhcp_client_ip_count",
  "dhcp_client_ip_step",
  "dhcp_your_ip",
  "dhcp_your_ip_mode",
  "dhcp_your_ip_count",
  "dhcp_your_ip_step",
  "dhcp_server_ip",
  "dhcp_server_ip_mode",
  "dhcp_server_ip_count",
  "dhcp_server_ip_step",
  "dhcp_relay_ip",
  "dhcp_relay_ip_mode",
  "dhcp_relay_ip_count",
  "dhcp_relay_ip_step",
  "dhcp_client_mac",
  "dhcp_client_mac_mode",
  "dhcp_client_mac_count",
  "dhcp_client_mac_step",
  "dhcp_hostname",
  "dhcp_requested_ip",
  "dhcp_requested_ip_mode",
  "dhcp_requested_ip_count",
  "dhcp_requested_ip_step",
  "dhcp_server_id",
  "dhcp_server_id_mode",
  "dhcp_server_id_count",
  "dhcp_server_id_step",
  "dhcp_parameter_request_list",
  "dhcp_lease_time",
  "dhcp_lease_time_mode",
  "dhcp_lease_time_count",
  "dhcp_lease_time_step",
  "dhcp_renewal_time",
  "dhcp_renewal_time_mode",
  "dhcp_renewal_time_count",
  "dhcp_renewal_time_step",
  "dhcp_rebinding_time",
  "dhcp_rebinding_time_mode",
  "dhcp_rebinding_time_count",
  "dhcp_rebinding_time_step",
  "icmp_type",
  "icmp_type_mode",
  "icmp_type_count",
  "icmp_type_step",
  "icmp_code",
  "icmp_code_mode",
  "icmp_code_count",
  "icmp_code_step",
  "icmp_checksum_override",
  "icmp_checksum",
  "icmp_identifier",
  "icmp_identifier_mode",
  "icmp_identifier_count",
  "icmp_identifier_step",
  "icmp_sequence",
  "icmp_sequence_mode",
  "icmp_sequence_count",
  "icmp_sequence_step",
  "icmpv6_nd_target",
  "icmpv6_nd_include_option",
  "icmpv6_nd_option_mac",
  "icmpv6_nd_na_router",
  "icmpv6_nd_na_solicited",
  "icmpv6_nd_na_override",
  "icmpv6_rs_include_slla",
  "icmpv6_rs_slla_mac",
  "icmpv6_ra_cur_hop_limit",
  "icmpv6_ra_managed",
  "icmpv6_ra_other",
  "icmpv6_ra_router_lifetime",
  "icmpv6_ra_reachable_time",
  "icmpv6_ra_retrans_timer",
  "icmpv6_ra_include_slla",
  "icmpv6_ra_slla_mac",
  "icmpv6_ra_include_prefix",
  "icmpv6_ra_prefix",
  "icmpv6_ra_prefix_length",
  "icmpv6_ra_prefix_on_link",
  "icmpv6_ra_prefix_autonomous",
  "icmpv6_ra_prefix_valid_lifetime",
  "icmpv6_ra_prefix_preferred_lifetime",
  "tcp_sequence_number",
  "tcp_sequence_mode",
  "tcp_sequence_count",
  "tcp_sequence_step",
  "tcp_ack_number",
  "tcp_ack_mode",
  "tcp_ack_count",
  "tcp_ack_step",
  "tcp_window",
  "tcp_window_mode",
  "tcp_window_count",
  "tcp_window_step",
  "tcp_checksum_override",
  "tcp_checksum",
  "tcp_checksum_mode",
  "tcp_checksum_count",
  "tcp_checksum_step",
  "tcp_option_mss_enabled",
  "tcp_option_mss",
  "tcp_option_mss_mode",
  "tcp_option_mss_count",
  "tcp_option_mss_step",
  "tcp_option_window_scale_enabled",
  "tcp_option_window_scale",
  "tcp_option_window_scale_mode",
  "tcp_option_window_scale_count",
  "tcp_option_window_scale_step",
  "tcp_option_sack_permitted_enabled",
  "tcp_option_sack_blocks_enabled",
  "tcp_option_sack_left_edge",
  "tcp_option_sack_left_edge_mode",
  "tcp_option_sack_left_edge_count",
  "tcp_option_sack_left_edge_step",
  "tcp_option_sack_right_edge",
  "tcp_option_sack_right_edge_mode",
  "tcp_option_sack_right_edge_count",
  "tcp_option_sack_right_edge_step",
  "tcp_option_timestamp_enabled",
  "tcp_option_timestamp_value",
  "tcp_option_timestamp_value_mode",
  "tcp_option_timestamp_value_count",
  "tcp_option_timestamp_value_step",
  "tcp_option_timestamp_echo",
  "tcp_option_timestamp_echo_mode",
  "tcp_option_timestamp_echo_count",
  "tcp_option_timestamp_echo_step",
  "tcp_urgent_pointer",
  "tcp_urgent_pointer_mode",
  "tcp_urgent_pointer_count",
  "tcp_urgent_pointer_step",
  "tcp_flags_mode",
  "tcp_flags_count",
  "tcp_flags_step",
  "tcp_flag_urg",
  "tcp_flag_ack",
  "tcp_flag_psh",
  "tcp_flag_rst",
  "tcp_flag_syn",
  "tcp_flag_fin",
  "sctp_verification_tag",
  "sctp_verification_tag_mode",
  "sctp_verification_tag_count",
  "sctp_verification_tag_step",
  "sctp_checksum_override",
  "sctp_checksum",
  "sctp_data_flags",
  "sctp_data_flags_mode",
  "sctp_data_flags_count",
  "sctp_data_flags_step",
  "sctp_tsn",
  "sctp_tsn_mode",
  "sctp_tsn_count",
  "sctp_tsn_step",
  "sctp_stream_id",
  "sctp_stream_id_mode",
  "sctp_stream_id_count",
  "sctp_stream_id_step",
  "sctp_stream_sequence",
  "sctp_stream_sequence_mode",
  "sctp_stream_sequence_count",
  "sctp_stream_sequence_step",
  "sctp_payload_protocol_id",
  "sctp_payload_protocol_id_mode",
  "sctp_payload_protocol_id_count",
  "sctp_payload_protocol_id_step",
  "payload_enabled",
  "payload_type",
  "payload_pattern"
];

const WORKBENCH_MAX_COUNTER = 4_294_967_295;
const WORKBENCH_MAX_PG_ID = 16_777_215;
const WORKBENCH_MAX_RATE = 1_000_000_000_000;
const WORKBENCH_MAX_GAP_SECONDS = 86_400;
const MAC_ADDRESS_PATTERN = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i;
const HEX_WORD_PATTERN = /^[0-9a-f]{4}$/i;
const DNS_LABEL_PATTERN = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?$/;
const PAYLOAD_PATTERN_MAX_HEX_CHARS = 1024;
const LARGE_UNIT_COUNT_PATTERN = /^\s*(\d{1,10}(?:\.\d{1,2})?)\s*([KMG])\s*$/i;

function integerRangeError(label: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label} must be an integer between ${min} and ${max}.`;
  }
  return null;
}

function largeUnitCountValue(value: number | string) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return Number.NaN;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }
  const match = LARGE_UNIT_COUNT_PATTERN.exec(trimmed);
  if (!match) {
    return Number.NaN;
  }
  const unit = match[2].toUpperCase() as "K" | "M" | "G";
  const multiplier = { G: 1_000_000_000, K: 1_000, M: 1_000_000 }[unit];
  return Math.trunc(Number(match[1]) * multiplier);
}

function largeUnitCountRangeError(label: string, value: number | string, min: number, max: number) {
  const parsed = largeUnitCountValue(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return `${label} must be an integer or K/M/G count between ${min} and ${max}.`;
  }
  return null;
}

function numberRangeError(label: string, value: number, min: number, max: number, exclusiveMin = false) {
  const lowerBoundInvalid = exclusiveMin ? value <= min : value < min;
  if (!Number.isFinite(value) || lowerBoundInvalid || value > max) {
    return `${label} must be ${exclusiveMin ? "greater than" : "at least"} ${min} and no more than ${max}.`;
  }
  return null;
}

function ipv4AddressValid(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }
    const octet = Number(part);
    return octet >= 0 && octet <= 255 && String(octet) === part;
  });
}

function ipv6AddressValid(value: string) {
  if (value.trim() !== value || !value.includes(":")) {
    return false;
  }
  try {
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]");
  } catch {
    return false;
  }
}

function dnsQueryNameValid(value: string) {
  if (value.trim() !== value || value === "" || value.length > 253 || value.includes("\0")) {
    return false;
  }
  const labels = value.replace(/\.$/, "").split(".");
  return labels.length > 0 && labels.every((label) => DNS_LABEL_PATTERN.test(label));
}

function dhcpHostnameValid(value: string) {
  return value.trim() === value && value.length <= 63 && !value.includes("\0") && (value === "" || /^[A-Za-z0-9_.-]+$/.test(value));
}

function dhcpParameterRequestListValid(value: string) {
  const candidate = value.trim();
  if (candidate === "") {
    return true;
  }
  const tokens = candidate.split(/[\s,]+/).filter(Boolean);
  return tokens.length <= 255 && tokens.every((token) => {
    if (!/^\d{1,3}$/.test(token)) {
      return false;
    }
    const option = Number(token);
    return Number.isInteger(option) && option >= 0 && option <= 255;
  });
}

function workbenchMplsLabelCount(stream: ProfileWorkbenchStream) {
  if (!stream.mpls_enabled) {
    return 0;
  }
  return 1 + (stream.mpls_label2_enabled ? 1 : 0) + (stream.mpls_label2_enabled && stream.mpls_label3_enabled ? 1 : 0);
}

function workbenchVlanHeaderLength(stream: ProfileWorkbenchStream) {
  if (!stream.vlan_enabled) {
    return 0;
  }
  return stream.vlan2_enabled ? 8 : 4;
}

function icmpv6ControlMinimumFrameLength(stream: ProfileWorkbenchStream) {
  if (stream.packet_type !== "Ethernet/IPv6/ICMPv6") {
    return 64;
  }
  const l2HeaderLength = 14 + workbenchVlanHeaderLength(stream) + (workbenchMplsLabelCount(stream) * 4);
  let icmpLength = 8;
  if (stream.icmp_type === 133) {
    icmpLength = 8 + (stream.icmpv6_rs_include_slla ? 8 : 0);
  } else if (stream.icmp_type === 134) {
    icmpLength = 16 + (stream.icmpv6_ra_include_slla ? 8 : 0) + (stream.icmpv6_ra_include_prefix ? 32 : 0);
  } else if (stream.icmp_type === 135 || stream.icmp_type === 136) {
    icmpLength = 24 + (stream.icmpv6_nd_include_option ? 8 : 0);
  }
  return Math.max(64, l2HeaderLength + 40 + icmpLength + 4);
}

function validateWorkbenchStream(
  stream: ProfileWorkbenchStream | null | undefined,
  index: number,
  streamCount = Number.MAX_SAFE_INTEGER
) {
  if (!stream) {
    return `Stream ${index + 1}: stream is missing.`;
  }
  const prefix = `Stream ${index + 1}`;
  if (stream.name.trim() === "") {
    return `${prefix}: Name is required.`;
  }
  if (stream.name !== stream.name.trim() || stream.name.includes("\0") || stream.name.length > 128) {
    return `${prefix}: Name must be 1-128 visible characters without leading or trailing spaces.`;
  }
  if (stream.advanced_mode) {
    return stream.packet_binary_base64 ? null : `${prefix}: Advanced stream requires packet bytes.`;
  }
  const isIpv4 = stream.packet_type.startsWith("Ethernet/IPv4");
  const isIpv6 = stream.packet_type.startsWith("Ethernet/IPv6");
  const isArp = stream.packet_type === "Ethernet/ARP";
  const isGre = stream.packet_type.endsWith("/GRE");
  const isUdp = stream.packet_type.endsWith("/UDP");
  const isSctp = stream.packet_type.endsWith("/SCTP");
  const isGtpu = stream.gtpu_enabled;
  const isIcmp = stream.packet_type === "Ethernet/IPv4/ICMP" || stream.packet_type === "Ethernet/IPv6/ICMPv6";
  const isIcmpv6 = stream.packet_type === "Ethernet/IPv6/ICMPv6";
  const isIcmpv6Control = isIcmpv6 && [133, 134, 135, 136].includes(stream.icmp_type);
  const isIcmpv6Echo = isIcmpv6 && [128, 129].includes(stream.icmp_type);
  const numericChecks = [
    integerRangeError(`${prefix}: Length`, stream.frame_length, 64, 9216),
    integerRangeError(`${prefix}: Minimum length`, stream.frame_length_min, 64, 9216),
    integerRangeError(`${prefix}: Maximum length`, stream.frame_length_max, 64, 9216),
    numberRangeError(`${prefix}: Rate`, stream.rate_value, 0, WORKBENCH_MAX_RATE, true),
    integerRangeError(`${prefix}: Number of Packets`, stream.total_pkts, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: Number of Burst`, stream.count, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: Packets per Burst`, stream.pkts_per_burst, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: Action count`, stream.action_count, 0, WORKBENCH_MAX_COUNTER),
    numberRangeError(`${prefix}: ISG`, stream.isg, 0, WORKBENCH_MAX_GAP_SECONDS),
    numberRangeError(`${prefix}: IBG`, stream.ibg, 0, WORKBENCH_MAX_GAP_SECONDS),
    integerRangeError(`${prefix}: PG ID`, stream.pg_id, 0, WORKBENCH_MAX_PG_ID),
    integerRangeError(`${prefix}: VLAN priority`, stream.vlan_priority, 0, 7),
    integerRangeError(`${prefix}: VLAN priority count`, stream.vlan_priority_count, 2, 8),
    integerRangeError(`${prefix}: VLAN priority step`, stream.vlan_priority_step, 1, 7),
    integerRangeError(`${prefix}: VLAN CFI/DEI`, stream.vlan_cfi, 0, 1),
    integerRangeError(`${prefix}: VLAN ID`, stream.vlan_id, 0, 4094),
    integerRangeError(`${prefix}: VLAN ID count`, stream.vlan_id_count, 2, 4095),
    integerRangeError(`${prefix}: VLAN ID step`, stream.vlan_id_step, 1, 4094),
    integerRangeError(`${prefix}: MPLS label`, stream.mpls_label, 0, 1_048_575),
    integerRangeError(`${prefix}: MPLS label count`, stream.mpls_label_count, 2, 1_048_576),
    integerRangeError(`${prefix}: MPLS label step`, stream.mpls_label_step, 1, 1_048_575),
    integerRangeError(`${prefix}: MPLS traffic class`, stream.mpls_tc, 0, 7),
    integerRangeError(`${prefix}: MPLS traffic class count`, stream.mpls_tc_count, 2, 8),
    integerRangeError(`${prefix}: MPLS traffic class step`, stream.mpls_tc_step, 1, 7),
    integerRangeError(`${prefix}: MPLS TTL`, stream.mpls_ttl, 0, 255),
    integerRangeError(`${prefix}: MPLS TTL count`, stream.mpls_ttl_count, 2, 256),
    integerRangeError(`${prefix}: MPLS TTL step`, stream.mpls_ttl_step, 1, 255),
    integerRangeError(`${prefix}: MPLS label 2`, stream.mpls_label2, 0, 1_048_575),
    integerRangeError(`${prefix}: MPLS label 2 count`, stream.mpls_label2_count, 2, 1_048_576),
    integerRangeError(`${prefix}: MPLS label 2 step`, stream.mpls_label2_step, 1, 1_048_575),
    integerRangeError(`${prefix}: MPLS label 2 traffic class`, stream.mpls_label2_tc, 0, 7),
    integerRangeError(`${prefix}: MPLS label 2 traffic class count`, stream.mpls_label2_tc_count, 2, 8),
    integerRangeError(`${prefix}: MPLS label 2 traffic class step`, stream.mpls_label2_tc_step, 1, 7),
    integerRangeError(`${prefix}: MPLS label 2 TTL`, stream.mpls_label2_ttl, 0, 255),
    integerRangeError(`${prefix}: MPLS label 2 TTL count`, stream.mpls_label2_ttl_count, 2, 256),
    integerRangeError(`${prefix}: MPLS label 2 TTL step`, stream.mpls_label2_ttl_step, 1, 255),
    integerRangeError(`${prefix}: MPLS label 3`, stream.mpls_label3, 0, 1_048_575),
    integerRangeError(`${prefix}: MPLS label 3 count`, stream.mpls_label3_count, 2, 1_048_576),
    integerRangeError(`${prefix}: MPLS label 3 step`, stream.mpls_label3_step, 1, 1_048_575),
    integerRangeError(`${prefix}: MPLS label 3 traffic class`, stream.mpls_label3_tc, 0, 7),
    integerRangeError(`${prefix}: MPLS label 3 traffic class count`, stream.mpls_label3_tc_count, 2, 8),
    integerRangeError(`${prefix}: MPLS label 3 traffic class step`, stream.mpls_label3_tc_step, 1, 7),
    integerRangeError(`${prefix}: MPLS label 3 TTL`, stream.mpls_label3_ttl, 0, 255),
    integerRangeError(`${prefix}: MPLS label 3 TTL count`, stream.mpls_label3_ttl_count, 2, 256),
    integerRangeError(`${prefix}: MPLS label 3 TTL step`, stream.mpls_label3_ttl_step, 1, 255),
    integerRangeError(`${prefix}: VXLAN VNI`, stream.vxlan_vni, 0, 16_777_215),
    integerRangeError(`${prefix}: VXLAN VNI count`, stream.vxlan_vni_count, 2, 16_777_216),
    integerRangeError(`${prefix}: VXLAN VNI step`, stream.vxlan_vni_step, 1, 16_777_215),
    integerRangeError(`${prefix}: VXLAN inner IPv4 source count`, stream.vxlan_inner_ipv4_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv4 source step`, stream.vxlan_inner_ipv4_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv4 destination count`, stream.vxlan_inner_ipv4_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv4 destination step`, stream.vxlan_inner_ipv4_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv4 TTL`, stream.vxlan_inner_ipv4_ttl, 0, 255),
    integerRangeError(`${prefix}: VXLAN inner IPv4 TTL count`, stream.vxlan_inner_ipv4_ttl_count, 2, 256),
    integerRangeError(`${prefix}: VXLAN inner IPv4 TTL step`, stream.vxlan_inner_ipv4_ttl_step, 1, 255),
    integerRangeError(`${prefix}: VXLAN inner IPv6 source count`, stream.vxlan_inner_ipv6_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv6 source step`, stream.vxlan_inner_ipv6_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv6 destination count`, stream.vxlan_inner_ipv6_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv6 destination step`, stream.vxlan_inner_ipv6_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: VXLAN inner IPv6 hop limit`, stream.vxlan_inner_ipv6_hop_limit, 0, 255),
    integerRangeError(`${prefix}: VXLAN inner IPv6 hop limit count`, stream.vxlan_inner_ipv6_hop_limit_count, 2, 256),
    integerRangeError(`${prefix}: VXLAN inner IPv6 hop limit step`, stream.vxlan_inner_ipv6_hop_limit_step, 1, 255),
    integerRangeError(`${prefix}: VXLAN inner source port`, stream.vxlan_inner_l4_src_port, 0, 65535),
    integerRangeError(`${prefix}: VXLAN inner source port count`, stream.vxlan_inner_l4_src_port_count, 2, 65536),
    integerRangeError(`${prefix}: VXLAN inner source port step`, stream.vxlan_inner_l4_src_port_step, 1, 65535),
    integerRangeError(`${prefix}: VXLAN inner destination port`, stream.vxlan_inner_l4_dst_port, 0, 65535),
    integerRangeError(`${prefix}: VXLAN inner destination port count`, stream.vxlan_inner_l4_dst_port_count, 2, 65536),
    integerRangeError(`${prefix}: VXLAN inner destination port step`, stream.vxlan_inner_l4_dst_port_step, 1, 65535),
    integerRangeError(`${prefix}: GTP-U message type`, stream.gtpu_message_type, 0, 255),
    integerRangeError(`${prefix}: GTP-U TEID`, stream.gtpu_teid, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: GTP-U TEID count`, stream.gtpu_teid_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: GTP-U TEID step`, stream.gtpu_teid_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: GTP-U sequence`, stream.gtpu_sequence, 0, 65_535),
    integerRangeError(`${prefix}: GTP-U sequence count`, stream.gtpu_sequence_count, 2, 65_536),
    integerRangeError(`${prefix}: GTP-U sequence step`, stream.gtpu_sequence_step, 1, 65_535),
    integerRangeError(`${prefix}: GTP-U N-PDU number`, stream.gtpu_npdu, 0, 255),
    integerRangeError(`${prefix}: GTP-U N-PDU count`, stream.gtpu_npdu_count, 2, 256),
    integerRangeError(`${prefix}: GTP-U N-PDU step`, stream.gtpu_npdu_step, 1, 255),
    integerRangeError(`${prefix}: GTP-U extension UDP port`, stream.gtpu_extension_udp_port, 0, 65535),
    integerRangeError(`${prefix}: GTP-U extension UDP port count`, stream.gtpu_extension_udp_port_count, 2, 65536),
    integerRangeError(`${prefix}: GTP-U extension UDP port step`, stream.gtpu_extension_udp_port_step, 1, 65535),
    integerRangeError(`${prefix}: GTP-U inner IPv4 source count`, stream.gtpu_inner_ipv4_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv4 source step`, stream.gtpu_inner_ipv4_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv4 destination count`, stream.gtpu_inner_ipv4_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv4 destination step`, stream.gtpu_inner_ipv4_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv4 TTL`, stream.gtpu_inner_ipv4_ttl, 0, 255),
    integerRangeError(`${prefix}: GTP-U inner IPv4 TTL count`, stream.gtpu_inner_ipv4_ttl_count, 2, 256),
    integerRangeError(`${prefix}: GTP-U inner IPv4 TTL step`, stream.gtpu_inner_ipv4_ttl_step, 1, 255),
    integerRangeError(`${prefix}: GTP-U inner IPv6 source count`, stream.gtpu_inner_ipv6_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv6 source step`, stream.gtpu_inner_ipv6_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv6 destination count`, stream.gtpu_inner_ipv6_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv6 destination step`, stream.gtpu_inner_ipv6_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GTP-U inner IPv6 hop limit`, stream.gtpu_inner_ipv6_hop_limit, 0, 255),
    integerRangeError(`${prefix}: GTP-U inner IPv6 hop limit count`, stream.gtpu_inner_ipv6_hop_limit_count, 2, 256),
    integerRangeError(`${prefix}: GTP-U inner IPv6 hop limit step`, stream.gtpu_inner_ipv6_hop_limit_step, 1, 255),
    integerRangeError(`${prefix}: GTP-U inner source port`, stream.gtpu_inner_l4_src_port, 0, 65535),
    integerRangeError(`${prefix}: GTP-U inner source port count`, stream.gtpu_inner_l4_src_port_count, 2, 65536),
    integerRangeError(`${prefix}: GTP-U inner source port step`, stream.gtpu_inner_l4_src_port_step, 1, 65535),
    integerRangeError(`${prefix}: GTP-U inner destination port`, stream.gtpu_inner_l4_dst_port, 0, 65535),
    integerRangeError(`${prefix}: GTP-U inner destination port count`, stream.gtpu_inner_l4_dst_port_count, 2, 65536),
    integerRangeError(`${prefix}: GTP-U inner destination port step`, stream.gtpu_inner_l4_dst_port_step, 1, 65535),
    integerRangeError(`${prefix}: GRE key`, stream.gre_key, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: GRE key count`, stream.gre_key_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: GRE key step`, stream.gre_key_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: GRE sequence`, stream.gre_sequence, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: GRE sequence count`, stream.gre_sequence_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: GRE sequence step`, stream.gre_sequence_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: GRE inner IPv4 source count`, stream.gre_inner_ipv4_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv4 source step`, stream.gre_inner_ipv4_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv4 destination count`, stream.gre_inner_ipv4_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv4 destination step`, stream.gre_inner_ipv4_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv4 TTL`, stream.gre_inner_ipv4_ttl, 0, 255),
    integerRangeError(`${prefix}: GRE inner IPv4 TTL count`, stream.gre_inner_ipv4_ttl_count, 2, 256),
    integerRangeError(`${prefix}: GRE inner IPv4 TTL step`, stream.gre_inner_ipv4_ttl_step, 1, 255),
    integerRangeError(`${prefix}: GRE inner IPv6 source count`, stream.gre_inner_ipv6_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv6 source step`, stream.gre_inner_ipv6_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv6 destination count`, stream.gre_inner_ipv6_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv6 destination step`, stream.gre_inner_ipv6_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: GRE inner IPv6 hop limit`, stream.gre_inner_ipv6_hop_limit, 0, 255),
    integerRangeError(`${prefix}: GRE inner IPv6 hop limit count`, stream.gre_inner_ipv6_hop_limit_count, 2, 256),
    integerRangeError(`${prefix}: GRE inner IPv6 hop limit step`, stream.gre_inner_ipv6_hop_limit_step, 1, 255),
    integerRangeError(`${prefix}: GRE inner source port`, stream.gre_inner_l4_src_port, 0, 65535),
    integerRangeError(`${prefix}: GRE inner source port count`, stream.gre_inner_l4_src_port_count, 2, 65536),
    integerRangeError(`${prefix}: GRE inner source port step`, stream.gre_inner_l4_src_port_step, 1, 65535),
    integerRangeError(`${prefix}: GRE inner destination port`, stream.gre_inner_l4_dst_port, 0, 65535),
    integerRangeError(`${prefix}: GRE inner destination port count`, stream.gre_inner_l4_dst_port_count, 2, 65536),
    integerRangeError(`${prefix}: GRE inner destination port step`, stream.gre_inner_l4_dst_port_step, 1, 65535),
    integerRangeError(`${prefix}: Ethernet destination count`, stream.ether_dst_count, 1, 9999),
    integerRangeError(`${prefix}: Ethernet destination step`, stream.ether_dst_step, 1, 999),
    integerRangeError(`${prefix}: Ethernet source count`, stream.ether_src_count, 1, 9999),
    integerRangeError(`${prefix}: Ethernet source step`, stream.ether_src_step, 1, 999),
    integerRangeError(`${prefix}: VLAN inner priority`, stream.vlan2_priority, 0, 7),
    integerRangeError(`${prefix}: VLAN inner priority count`, stream.vlan2_priority_count, 2, 8),
    integerRangeError(`${prefix}: VLAN inner priority step`, stream.vlan2_priority_step, 1, 7),
    integerRangeError(`${prefix}: VLAN inner CFI DEI`, stream.vlan2_cfi, 0, 1),
    integerRangeError(`${prefix}: VLAN inner ID`, stream.vlan2_id, 0, 4094),
    integerRangeError(`${prefix}: VLAN inner ID count`, stream.vlan2_id_count, 2, 4095),
    integerRangeError(`${prefix}: VLAN inner ID step`, stream.vlan2_id_step, 1, 4094),
    integerRangeError(`${prefix}: ARP hardware type`, stream.arp_hardware_type, 0, 65535),
    integerRangeError(`${prefix}: ARP hardware size`, stream.arp_hardware_size, 0, 255),
    integerRangeError(`${prefix}: ARP protocol size`, stream.arp_protocol_size, 0, 255),
    integerRangeError(`${prefix}: ARP operation`, stream.arp_operation, 0, 65535),
    integerRangeError(`${prefix}: ARP operation count`, stream.arp_operation_count, 2, 65536),
    integerRangeError(`${prefix}: ARP operation step`, stream.arp_operation_step, 1, 65535),
    integerRangeError(`${prefix}: ARP sender MAC count`, stream.arp_sender_mac_count, 2, 100_000_000),
    integerRangeError(`${prefix}: ARP sender MAC step`, stream.arp_sender_mac_step, 1, 100_000_000),
    integerRangeError(`${prefix}: ARP sender IP count`, stream.arp_sender_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: ARP sender IP step`, stream.arp_sender_ip_step, 1, 100_000_000),
    integerRangeError(`${prefix}: ARP target MAC count`, stream.arp_target_mac_count, 2, 100_000_000),
    integerRangeError(`${prefix}: ARP target MAC step`, stream.arp_target_mac_step, 1, 100_000_000),
    integerRangeError(`${prefix}: ARP target IP count`, stream.arp_target_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: ARP target IP step`, stream.arp_target_ip_step, 1, 100_000_000),
    largeUnitCountRangeError(`${prefix}: IPv4 source count`, stream.ipv4_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: IPv4 source step`, stream.ipv4_src_step, 1, 100_000_000),
    largeUnitCountRangeError(`${prefix}: IPv4 destination count`, stream.ipv4_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: IPv4 destination step`, stream.ipv4_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: IPv4 DSCP`, stream.ipv4_dscp, 0, 63),
    integerRangeError(`${prefix}: IPv4 DSCP count`, stream.ipv4_dscp_count, 2, 64),
    integerRangeError(`${prefix}: IPv4 DSCP step`, stream.ipv4_dscp_step, 1, 63),
    integerRangeError(`${prefix}: IPv4 ECN`, stream.ipv4_ecn, 0, 3),
    integerRangeError(`${prefix}: IPv4 ECN count`, stream.ipv4_ecn_count, 2, 4),
    integerRangeError(`${prefix}: IPv4 ECN step`, stream.ipv4_ecn_step, 1, 3),
    integerRangeError(`${prefix}: IPv4 identification`, stream.ipv4_id, 0, 65535),
    integerRangeError(`${prefix}: IPv4 identification count`, stream.ipv4_id_count, 2, 65_536),
    integerRangeError(`${prefix}: IPv4 identification step`, stream.ipv4_id_step, 1, 65_535),
    integerRangeError(`${prefix}: IPv4 fragment offset`, stream.ipv4_fragment_offset, 0, 8191),
    integerRangeError(`${prefix}: IPv4 fragment offset count`, stream.ipv4_fragment_offset_count, 2, 8192),
    integerRangeError(`${prefix}: IPv4 fragment offset step`, stream.ipv4_fragment_offset_step, 1, 8191),
    integerRangeError(`${prefix}: IPv4 TTL`, stream.ipv4_ttl, 0, 255),
    integerRangeError(`${prefix}: IPv4 TTL count`, stream.ipv4_ttl_count, 2, 256),
    integerRangeError(`${prefix}: IPv4 TTL step`, stream.ipv4_ttl_step, 1, 255),
    integerRangeError(`${prefix}: IPv6 source count`, stream.ipv6_src_count, 2, 100_000_000),
    integerRangeError(`${prefix}: IPv6 source step`, stream.ipv6_src_step, 1, 100_000_000),
    integerRangeError(`${prefix}: IPv6 destination count`, stream.ipv6_dst_count, 2, 100_000_000),
    integerRangeError(`${prefix}: IPv6 destination step`, stream.ipv6_dst_step, 1, 100_000_000),
    integerRangeError(`${prefix}: IPv6 traffic class`, stream.ipv6_traffic_class, 0, 255),
    integerRangeError(`${prefix}: IPv6 traffic class count`, stream.ipv6_traffic_class_count, 2, 256),
    integerRangeError(`${prefix}: IPv6 traffic class step`, stream.ipv6_traffic_class_step, 1, 255),
    integerRangeError(`${prefix}: IPv6 flow label`, stream.ipv6_flow_label, 0, 1_048_575),
    integerRangeError(`${prefix}: IPv6 flow label count`, stream.ipv6_flow_label_count, 2, 1_048_576),
    integerRangeError(`${prefix}: IPv6 flow label step`, stream.ipv6_flow_label_step, 1, 1_048_575),
    integerRangeError(`${prefix}: IPv6 hop limit`, stream.ipv6_hop_limit, 0, 255),
    integerRangeError(`${prefix}: IPv6 hop limit count`, stream.ipv6_hop_limit_count, 2, 256),
    integerRangeError(`${prefix}: IPv6 hop limit step`, stream.ipv6_hop_limit_step, 1, 255),
    integerRangeError(`${prefix}: L4 source port`, stream.l4_src_port, 0, 65535),
    integerRangeError(`${prefix}: L4 destination port`, stream.l4_dst_port, 0, 65535),
    integerRangeError(`${prefix}: UDP length`, stream.udp_length, 8, 65535),
    integerRangeError(`${prefix}: UDP length count`, stream.udp_length_count, 2, 65_528),
    integerRangeError(`${prefix}: UDP length step`, stream.udp_length_step, 1, 65_527),
    integerRangeError(`${prefix}: UDP checksum count`, stream.udp_checksum_count, 2, 65_536),
    integerRangeError(`${prefix}: UDP checksum step`, stream.udp_checksum_step, 1, 65_535),
    integerRangeError(`${prefix}: DNS transaction ID`, stream.dns_transaction_id, 0, 65_535),
    integerRangeError(`${prefix}: DNS transaction ID count`, stream.dns_transaction_id_count, 2, 65_536),
    integerRangeError(`${prefix}: DNS transaction ID step`, stream.dns_transaction_id_step, 1, 65_535),
    integerRangeError(`${prefix}: DNS flags count`, stream.dns_flags_count, 2, 65_536),
    integerRangeError(`${prefix}: DNS flags step`, stream.dns_flags_step, 1, 65_535),
    integerRangeError(`${prefix}: DNS query type`, stream.dns_query_type, 0, 65_535),
    integerRangeError(`${prefix}: DNS query type count`, stream.dns_query_type_count, 2, 65_536),
    integerRangeError(`${prefix}: DNS query type step`, stream.dns_query_type_step, 1, 65_535),
    integerRangeError(`${prefix}: DNS query class`, stream.dns_query_class, 0, 65_535),
    integerRangeError(`${prefix}: DNS query class count`, stream.dns_query_class_count, 2, 65_536),
    integerRangeError(`${prefix}: DNS query class step`, stream.dns_query_class_step, 1, 65_535),
    integerRangeError(`${prefix}: DNS answer TTL`, stream.dns_answer_ttl, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DNS answer TTL count`, stream.dns_answer_ttl_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: DNS answer TTL step`, stream.dns_answer_ttl_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DNS answer IPv4 count`, stream.dns_answer_ipv4_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DNS answer IPv4 step`, stream.dns_answer_ipv4_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP operation`, stream.dhcp_operation, 1, 255),
    integerRangeError(`${prefix}: DHCP operation count`, stream.dhcp_operation_count, 2, 256),
    integerRangeError(`${prefix}: DHCP operation step`, stream.dhcp_operation_step, 1, 255),
    integerRangeError(`${prefix}: DHCP hops`, stream.dhcp_hops, 0, 255),
    integerRangeError(`${prefix}: DHCP hops count`, stream.dhcp_hops_count, 2, 256),
    integerRangeError(`${prefix}: DHCP hops step`, stream.dhcp_hops_step, 1, 255),
    integerRangeError(`${prefix}: DHCP seconds`, stream.dhcp_seconds, 0, 65_535),
    integerRangeError(`${prefix}: DHCP seconds count`, stream.dhcp_seconds_count, 2, 65_536),
    integerRangeError(`${prefix}: DHCP seconds step`, stream.dhcp_seconds_step, 1, 65_535),
    integerRangeError(`${prefix}: DHCP message type`, stream.dhcp_message_type, 1, 255),
    integerRangeError(`${prefix}: DHCP message type count`, stream.dhcp_message_type_count, 2, 255),
    integerRangeError(`${prefix}: DHCP message type step`, stream.dhcp_message_type_step, 1, 254),
    integerRangeError(`${prefix}: DHCP XID`, stream.dhcp_xid, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP XID count`, stream.dhcp_xid_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: DHCP XID step`, stream.dhcp_xid_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP flags count`, stream.dhcp_flags_count, 2, 65_536),
    integerRangeError(`${prefix}: DHCP flags step`, stream.dhcp_flags_step, 1, 65_535),
    integerRangeError(`${prefix}: DHCP client IP count`, stream.dhcp_client_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP client IP step`, stream.dhcp_client_ip_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP your IP count`, stream.dhcp_your_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP your IP step`, stream.dhcp_your_ip_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP server IP count`, stream.dhcp_server_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP server IP step`, stream.dhcp_server_ip_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP relay IP count`, stream.dhcp_relay_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP relay IP step`, stream.dhcp_relay_ip_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP client MAC count`, stream.dhcp_client_mac_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP client MAC step`, stream.dhcp_client_mac_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP requested IP count`, stream.dhcp_requested_ip_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP requested IP step`, stream.dhcp_requested_ip_step, 1, 100_000_000),
    integerRangeError(`${prefix}: DHCP server ID count`, stream.dhcp_server_id_count, 2, 100_000_000),
    integerRangeError(`${prefix}: DHCP server ID step`, stream.dhcp_server_id_step, 1, 100_000_000),
    dhcpParameterRequestListValid(stream.dhcp_parameter_request_list)
      ? null
      : `${prefix}: DHCP parameter request list must contain option numbers between 0 and 255.`,
    integerRangeError(`${prefix}: DHCP lease time`, stream.dhcp_lease_time, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP lease time count`, stream.dhcp_lease_time_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: DHCP lease time step`, stream.dhcp_lease_time_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP renewal time`, stream.dhcp_renewal_time, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP renewal time count`, stream.dhcp_renewal_time_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: DHCP renewal time step`, stream.dhcp_renewal_time_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP rebinding time`, stream.dhcp_rebinding_time, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: DHCP rebinding time count`, stream.dhcp_rebinding_time_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: DHCP rebinding time step`, stream.dhcp_rebinding_time_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: ICMP type`, stream.icmp_type, 0, 255),
    integerRangeError(`${prefix}: ICMP type count`, stream.icmp_type_count, 2, 256),
    integerRangeError(`${prefix}: ICMP type step`, stream.icmp_type_step, 1, 255),
    integerRangeError(`${prefix}: ICMP code`, stream.icmp_code, 0, 255),
    integerRangeError(`${prefix}: ICMP code count`, stream.icmp_code_count, 2, 256),
    integerRangeError(`${prefix}: ICMP code step`, stream.icmp_code_step, 1, 255),
    integerRangeError(`${prefix}: ICMP identifier`, stream.icmp_identifier, 0, 65535),
    integerRangeError(`${prefix}: ICMP identifier count`, stream.icmp_identifier_count, 2, 65_536),
    integerRangeError(`${prefix}: ICMP identifier step`, stream.icmp_identifier_step, 1, 65_535),
    integerRangeError(`${prefix}: ICMP sequence`, stream.icmp_sequence, 0, 65535),
    integerRangeError(`${prefix}: ICMP sequence count`, stream.icmp_sequence_count, 2, 65_536),
    integerRangeError(`${prefix}: ICMP sequence step`, stream.icmp_sequence_step, 1, 65_535),
    integerRangeError(`${prefix}: ICMPv6 RA current hop limit`, stream.icmpv6_ra_cur_hop_limit, 0, 255),
    integerRangeError(`${prefix}: ICMPv6 RA router lifetime`, stream.icmpv6_ra_router_lifetime, 0, 65_535),
    integerRangeError(`${prefix}: ICMPv6 RA reachable time`, stream.icmpv6_ra_reachable_time, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: ICMPv6 RA retrans timer`, stream.icmpv6_ra_retrans_timer, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: ICMPv6 RA prefix length`, stream.icmpv6_ra_prefix_length, 0, 128),
    integerRangeError(`${prefix}: ICMPv6 RA prefix valid lifetime`, stream.icmpv6_ra_prefix_valid_lifetime, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: ICMPv6 RA prefix preferred lifetime`, stream.icmpv6_ra_prefix_preferred_lifetime, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP sequence number`, stream.tcp_sequence_number, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP sequence count`, stream.tcp_sequence_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: TCP sequence step`, stream.tcp_sequence_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP acknowledge number`, stream.tcp_ack_number, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP acknowledge count`, stream.tcp_ack_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: TCP acknowledge step`, stream.tcp_ack_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP window`, stream.tcp_window, 0, 65535),
    integerRangeError(`${prefix}: TCP window count`, stream.tcp_window_count, 2, 65_536),
    integerRangeError(`${prefix}: TCP window step`, stream.tcp_window_step, 1, 65_535),
    integerRangeError(`${prefix}: TCP checksum count`, stream.tcp_checksum_count, 2, 65_536),
    integerRangeError(`${prefix}: TCP checksum step`, stream.tcp_checksum_step, 1, 65_535),
    integerRangeError(`${prefix}: TCP option MSS`, stream.tcp_option_mss, 0, 65_535),
    integerRangeError(`${prefix}: TCP option MSS count`, stream.tcp_option_mss_count, 2, 65_536),
    integerRangeError(`${prefix}: TCP option MSS step`, stream.tcp_option_mss_step, 1, 65_535),
    integerRangeError(`${prefix}: TCP option Window Scale`, stream.tcp_option_window_scale, 0, 14),
    integerRangeError(`${prefix}: TCP option Window Scale count`, stream.tcp_option_window_scale_count, 2, 256),
    integerRangeError(`${prefix}: TCP option Window Scale step`, stream.tcp_option_window_scale_step, 1, 255),
    integerRangeError(`${prefix}: TCP option SACK left edge`, stream.tcp_option_sack_left_edge, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option SACK left edge count`, stream.tcp_option_sack_left_edge_count, 2, WORKBENCH_MAX_COUNTER + 1),
    integerRangeError(`${prefix}: TCP option SACK left edge step`, stream.tcp_option_sack_left_edge_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option SACK right edge`, stream.tcp_option_sack_right_edge, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option SACK right edge count`, stream.tcp_option_sack_right_edge_count, 2, WORKBENCH_MAX_COUNTER + 1),
    integerRangeError(`${prefix}: TCP option SACK right edge step`, stream.tcp_option_sack_right_edge_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option timestamp value`, stream.tcp_option_timestamp_value, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option timestamp value count`, stream.tcp_option_timestamp_value_count, 2, WORKBENCH_MAX_COUNTER + 1),
    integerRangeError(`${prefix}: TCP option timestamp value step`, stream.tcp_option_timestamp_value_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option timestamp echo`, stream.tcp_option_timestamp_echo, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP option timestamp echo count`, stream.tcp_option_timestamp_echo_count, 2, WORKBENCH_MAX_COUNTER + 1),
    integerRangeError(`${prefix}: TCP option timestamp echo step`, stream.tcp_option_timestamp_echo_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: TCP urgent pointer`, stream.tcp_urgent_pointer, 0, 65535),
    integerRangeError(`${prefix}: TCP urgent pointer count`, stream.tcp_urgent_pointer_count, 2, 65_536),
    integerRangeError(`${prefix}: TCP urgent pointer step`, stream.tcp_urgent_pointer_step, 1, 65_535),
    integerRangeError(`${prefix}: TCP flags count`, stream.tcp_flags_count, 2, 64),
    integerRangeError(`${prefix}: TCP flags step`, stream.tcp_flags_step, 1, 63),
    integerRangeError(`${prefix}: SCTP verification tag`, stream.sctp_verification_tag, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: SCTP verification tag count`, stream.sctp_verification_tag_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: SCTP verification tag step`, stream.sctp_verification_tag_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: SCTP data flags`, stream.sctp_data_flags, 0, 255),
    integerRangeError(`${prefix}: SCTP data flags count`, stream.sctp_data_flags_count, 2, 256),
    integerRangeError(`${prefix}: SCTP data flags step`, stream.sctp_data_flags_step, 1, 255),
    integerRangeError(`${prefix}: SCTP TSN`, stream.sctp_tsn, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: SCTP TSN count`, stream.sctp_tsn_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: SCTP TSN step`, stream.sctp_tsn_step, 1, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: SCTP stream ID`, stream.sctp_stream_id, 0, 65_535),
    integerRangeError(`${prefix}: SCTP stream ID count`, stream.sctp_stream_id_count, 2, 65_536),
    integerRangeError(`${prefix}: SCTP stream ID step`, stream.sctp_stream_id_step, 1, 65_535),
    integerRangeError(`${prefix}: SCTP stream sequence`, stream.sctp_stream_sequence, 0, 65_535),
    integerRangeError(`${prefix}: SCTP stream sequence count`, stream.sctp_stream_sequence_count, 2, 65_536),
    integerRangeError(`${prefix}: SCTP stream sequence step`, stream.sctp_stream_sequence_step, 1, 65_535),
    integerRangeError(`${prefix}: SCTP payload protocol ID`, stream.sctp_payload_protocol_id, 0, WORKBENCH_MAX_COUNTER),
    integerRangeError(`${prefix}: SCTP payload protocol ID count`, stream.sctp_payload_protocol_id_count, 2, 4_294_967_296),
    integerRangeError(`${prefix}: SCTP payload protocol ID step`, stream.sctp_payload_protocol_id_step, 1, WORKBENCH_MAX_COUNTER)
  ].find(Boolean);
  if (numericChecks) {
    return numericChecks;
  }
  if (stream.frame_length_type !== "Fixed" && stream.frame_length_max - stream.frame_length_min < 5) {
    return `${prefix}: Maximum length must be at least 5 bytes greater than minimum length.`;
  }
  if (isIcmp && stream.frame_length_type !== "Fixed") {
    return `${prefix}: ICMP requires fixed frame length.`;
  }
  if (isIcmpv6 && (stream.ipv6_src_mode !== "Fixed" || stream.ipv6_dst_mode !== "Fixed")) {
    return `${prefix}: ICMPv6 requires fixed IPv6 source and destination addresses.`;
  }
  if (
    isIcmp
    && ((stream.icmp_type_mode ?? "Fixed") !== "Fixed" || (stream.icmp_code_mode ?? "Fixed") !== "Fixed")
    && !isIcmpv6Echo
  ) {
    return `${prefix}: ICMP type/code Field Engine requires ICMPv6 Echo.`;
  }
  if (
    isIcmp
    && !isIcmpv6Echo
    && ((stream.icmp_identifier_mode ?? "Fixed") !== "Fixed" || (stream.icmp_sequence_mode ?? "Fixed") !== "Fixed")
  ) {
    return `${prefix}: ICMP identifier and sequence Field Engine requires ICMPv6 Echo.`;
  }
  if (isIcmpv6Control) {
    const minimumFrameLength = icmpv6ControlMinimumFrameLength(stream);
    if (stream.frame_length < minimumFrameLength) {
      return `${prefix}: ICMPv6 control frame length must be at least ${minimumFrameLength}.`;
    }
    if (stream.icmp_code !== 0) {
      return `${prefix}: ICMPv6 control message code must be 0.`;
    }
  }
  if (isIcmpv6 && (stream.icmp_type === 135 || stream.icmp_type === 136)) {
    if (!ipv6AddressValid(stream.icmpv6_nd_target)) {
      return `${prefix}: ICMPv6 Neighbor Discovery target address is invalid.`;
    }
  }
  if (isIcmpv6 && stream.icmp_type === 134 && !ipv6AddressValid(stream.icmpv6_ra_prefix)) {
    return `${prefix}: ICMPv6 Router Advertisement prefix is invalid.`;
  }
  if (isArp && stream.mpls_enabled) {
    return `${prefix}: ARP does not support MPLS in the Stream Builder.`;
  }
  if (!isIpv4 && !isIpv6 && stream.mpls_enabled) {
    return `${prefix}: MPLS requires an IP packet.`;
  }
  if (stream.vxlan_enabled) {
    if (stream.packet_type !== "Ethernet/IPv4/UDP") {
      return `${prefix}: VXLAN requires Ethernet/IPv4/UDP.`;
    }
    if (stream.frame_length_type !== "Fixed") {
      return `${prefix}: VXLAN requires fixed frame length.`;
    }
    const mplsLabelCount = workbenchMplsLabelCount(stream);
    const vxlanInnerIpHeaderLength = stream.vxlan_inner_ip_version === "IPv6" ? 40 : 20;
    const minimumVxlanFrameLength =
      14 + workbenchVlanHeaderLength(stream) + (mplsLabelCount * 4) + 20 + 8 + 8 + 14 + vxlanInnerIpHeaderLength + 8 + 4;
    if (stream.frame_length < minimumVxlanFrameLength) {
      return `${prefix}: VXLAN frame length must be at least ${minimumVxlanFrameLength}.`;
    }
    if (stream.vxlan_inner_ip_version === "IPv6") {
      if (!ipv6AddressValid(stream.vxlan_inner_ipv6_src)) {
        return `${prefix}: VXLAN inner IPv6 source must be an IPv6 address.`;
      }
      if (!ipv6AddressValid(stream.vxlan_inner_ipv6_dst)) {
        return `${prefix}: VXLAN inner IPv6 destination must be an IPv6 address.`;
      }
    } else {
      if (!ipv4AddressValid(stream.vxlan_inner_ipv4_src)) {
        return `${prefix}: VXLAN inner IPv4 source must be an IPv4 address.`;
      }
      if (!ipv4AddressValid(stream.vxlan_inner_ipv4_dst)) {
        return `${prefix}: VXLAN inner IPv4 destination must be an IPv4 address.`;
      }
    }
  }
  if (isGtpu) {
    if (stream.packet_type !== "Ethernet/IPv4/UDP") {
      return `${prefix}: GTP-U requires Ethernet/IPv4/UDP.`;
    }
    if (stream.frame_length_type !== "Fixed") {
      return `${prefix}: GTP-U requires fixed frame length.`;
    }
    if (stream.gtpu_message_type !== 255) {
      return `${prefix}: GTP-U editor currently supports G-PDU message type 255.`;
    }
    const mplsLabelCount = workbenchMplsLabelCount(stream);
    const gtpuOptionalHeaderLength =
      stream.gtpu_sequence_enabled || stream.gtpu_npdu_enabled || stream.gtpu_extension_enabled ? 4 : 0;
    const gtpuExtensionHeaderLength = stream.gtpu_extension_enabled ? 4 : 0;
    const gtpuInnerIpHeaderLength = stream.gtpu_inner_ip_version === "IPv6" ? 40 : 20;
    const minimumGtpuFrameLength =
      14
      + workbenchVlanHeaderLength(stream)
      + (mplsLabelCount * 4)
      + 20
      + 8
      + 8
      + gtpuOptionalHeaderLength
      + gtpuExtensionHeaderLength
      + gtpuInnerIpHeaderLength
      + 8
      + 4;
    if (stream.frame_length < minimumGtpuFrameLength) {
      return `${prefix}: GTP-U frame length must be at least ${minimumGtpuFrameLength}.`;
    }
    if (stream.gtpu_inner_ip_version === "IPv6") {
      if (!ipv6AddressValid(stream.gtpu_inner_ipv6_src)) {
        return `${prefix}: GTP-U inner IPv6 source must be an IPv6 address.`;
      }
      if (!ipv6AddressValid(stream.gtpu_inner_ipv6_dst)) {
        return `${prefix}: GTP-U inner IPv6 destination must be an IPv6 address.`;
      }
    } else {
      if (!ipv4AddressValid(stream.gtpu_inner_ipv4_src)) {
        return `${prefix}: GTP-U inner IPv4 source must be an IPv4 address.`;
      }
      if (!ipv4AddressValid(stream.gtpu_inner_ipv4_dst)) {
        return `${prefix}: GTP-U inner IPv4 destination must be an IPv4 address.`;
      }
    }
  }
  if (isGre) {
    if (stream.frame_length_type !== "Fixed") {
      return `${prefix}: GRE requires fixed frame length.`;
    }
    const mplsLabelCount = workbenchMplsLabelCount(stream);
    const greHeaderLength =
      4 + (stream.gre_checksum_present ? 4 : 0) + (stream.gre_key_present ? 4 : 0) + (stream.gre_sequence_present ? 4 : 0);
    const greProtocolType = typeof stream.gre_protocol_type === "string" ? stream.gre_protocol_type : "0800";
    const greInnerIpVersion = stream.gre_inner_ip_version === "IPv6" || greProtocolType.toUpperCase() === "86DD"
      ? "IPv6"
      : "IPv4";
    const greInnerIpHeaderLength = greInnerIpVersion === "IPv6" ? 40 : 20;
    const minimumGreFrameLength =
      14 + workbenchVlanHeaderLength(stream) + (mplsLabelCount * 4) + (isIpv6 ? 40 : 20) + greHeaderLength + greInnerIpHeaderLength + 8 + 4;
    if (stream.frame_length < minimumGreFrameLength) {
      return `${prefix}: GRE frame length must be at least ${minimumGreFrameLength}.`;
    }
    if (!HEX_WORD_PATTERN.test(greProtocolType)) {
      return `${prefix}: GRE protocol type must be four hex characters.`;
    }
    if (!["0800", "86DD"].includes(greProtocolType.toUpperCase())) {
      return `${prefix}: GRE editor supports inner IPv4 0800 or inner IPv6 86DD.`;
    }
    if (stream.gre_checksum_present && stream.gre_checksum_override && !HEX_WORD_PATTERN.test(stream.gre_checksum)) {
      return `${prefix}: GRE checksum must be four hex characters.`;
    }
    if (stream.gre_checksum_present && (stream.gre_key_mode !== "Fixed" || stream.gre_sequence_mode !== "Fixed")) {
      return `${prefix}: GRE key/sequence Field Engine requires GRE checksum absent.`;
    }
    const greInnerFieldEngineEnabled =
      stream.gre_inner_ipv4_src_mode !== "Fixed"
      || stream.gre_inner_ipv4_dst_mode !== "Fixed"
      || stream.gre_inner_ipv4_ttl_mode !== "Fixed"
      || stream.gre_inner_ipv6_src_mode !== "Fixed"
      || stream.gre_inner_ipv6_dst_mode !== "Fixed"
      || stream.gre_inner_ipv6_hop_limit_mode !== "Fixed"
      || stream.gre_inner_l4_src_port_mode !== "Fixed"
      || stream.gre_inner_l4_dst_port_mode !== "Fixed";
    if (stream.gre_checksum_present && greInnerFieldEngineEnabled) {
      return `${prefix}: GRE inner Field Engine requires GRE checksum absent.`;
    }
    if (stream.gre_key_mode !== "Fixed" && !stream.gre_key_present) {
      return `${prefix}: GRE key Field Engine requires key present.`;
    }
    if (stream.gre_sequence_mode !== "Fixed" && !stream.gre_sequence_present) {
      return `${prefix}: GRE sequence Field Engine requires sequence present.`;
    }
    if (greInnerIpVersion === "IPv6") {
      if (!ipv6AddressValid(stream.gre_inner_ipv6_src)) {
        return `${prefix}: GRE inner IPv6 source must be an IPv6 address.`;
      }
      if (!ipv6AddressValid(stream.gre_inner_ipv6_dst)) {
        return `${prefix}: GRE inner IPv6 destination must be an IPv6 address.`;
      }
    } else {
      if (!ipv4AddressValid(stream.gre_inner_ipv4_src)) {
        return `${prefix}: GRE inner IPv4 source must be an IPv4 address.`;
      }
      if (!ipv4AddressValid(stream.gre_inner_ipv4_dst)) {
        return `${prefix}: GRE inner IPv4 destination must be an IPv4 address.`;
      }
    }
  }
  if (isSctp) {
    const minimumSctpFrameLength =
      14 + workbenchVlanHeaderLength(stream) + (workbenchMplsLabelCount(stream) * 4) + (isIpv6 ? 40 : 20) + 28 + 4;
    if (stream.frame_length < minimumSctpFrameLength) {
      return `${prefix}: SCTP frame length must be at least ${minimumSctpFrameLength}.`;
    }
    if (stream.sctp_checksum_override && !/^[0-9A-Fa-f]{8}$/.test(stream.sctp_checksum)) {
      return `${prefix}: SCTP checksum must be eight hex characters.`;
    }
  }
  if (isIpv6) {
    if (!ipv6AddressValid(stream.ipv6_src)) {
      return `${prefix}: IPv6 source address is invalid.`;
    }
    if (!ipv6AddressValid(stream.ipv6_dst)) {
      return `${prefix}: IPv6 destination address is invalid.`;
    }
  } else if (isIpv4) {
    if (!ipv4AddressValid(stream.ipv4_src)) {
      return `${prefix}: IPv4 source address is invalid.`;
    }
    if (!ipv4AddressValid(stream.ipv4_dst)) {
      return `${prefix}: IPv4 destination address is invalid.`;
    }
  }
  if (stream.next_stream_id !== null) {
    const nextStreamError = integerRangeError(`${prefix}: Next Stream`, stream.next_stream_id, 1, streamCount);
    if (nextStreamError) {
      return nextStreamError;
    }
  }
  if (!MAC_ADDRESS_PATTERN.test(stream.ether_dst)) {
    return `${prefix}: Ethernet destination must be a MAC address.`;
  }
  if (!MAC_ADDRESS_PATTERN.test(stream.ether_src)) {
    return `${prefix}: Ethernet source must be a MAC address.`;
  }
  if (stream.ether_type_override && !HEX_WORD_PATTERN.test(stream.ether_type)) {
    return `${prefix}: Ethernet Type must be four hex characters.`;
  }
  if (isArp) {
    if (!HEX_WORD_PATTERN.test(stream.arp_protocol_type)) {
      return `${prefix}: ARP protocol type must be a 4 digit hex value.`;
    }
    if (stream.arp_hardware_size !== 6 || stream.arp_protocol_size !== 4) {
      return `${prefix}: ARP editor currently supports Ethernet/IPv4 addresses with hardware size 6 and protocol size 4.`;
    }
    if (!MAC_ADDRESS_PATTERN.test(stream.arp_sender_mac)) {
      return `${prefix}: ARP sender MAC must be a MAC address.`;
    }
    if (!MAC_ADDRESS_PATTERN.test(stream.arp_target_mac)) {
      return `${prefix}: ARP target MAC must be a MAC address.`;
    }
    if (!ipv4AddressValid(stream.arp_sender_ip)) {
      return `${prefix}: ARP sender IP is invalid.`;
    }
    if (!ipv4AddressValid(stream.arp_target_ip)) {
      return `${prefix}: ARP target IP is invalid.`;
    }
  }
  if (stream.vxlan_enabled && !MAC_ADDRESS_PATTERN.test(stream.vxlan_inner_ether_dst)) {
    return `${prefix}: VXLAN inner Ethernet destination must be a MAC address.`;
  }
  if (stream.vxlan_enabled && !MAC_ADDRESS_PATTERN.test(stream.vxlan_inner_ether_src)) {
    return `${prefix}: VXLAN inner Ethernet source must be a MAC address.`;
  }
  if (stream.vlan_tpid_override && !HEX_WORD_PATTERN.test(stream.vlan_tpid)) {
    return `${prefix}: VLAN TPID must be four hex characters.`;
  }
  if (stream.vlan2_enabled && stream.vlan2_tpid_override && !HEX_WORD_PATTERN.test(stream.vlan2_tpid)) {
    return `${prefix}: VLAN inner TPID must be four hex characters.`;
  }
  if (stream.ipv4_checksum_override && !HEX_WORD_PATTERN.test(stream.ipv4_checksum)) {
    return `${prefix}: IPv4 checksum must be four hex characters.`;
  }
  if (stream.udp_checksum_override && !HEX_WORD_PATTERN.test(stream.udp_checksum)) {
    return `${prefix}: UDP checksum must be four hex characters.`;
  }
  if (stream.dns_enabled) {
    if (!isUdp || stream.vxlan_enabled || stream.gtpu_enabled) {
      return `${prefix}: DNS query builder requires a non-tunneled UDP packet.`;
    }
    if (!HEX_WORD_PATTERN.test(stream.dns_flags)) {
      return `${prefix}: DNS flags must be four hex characters.`;
    }
    if (!dnsQueryNameValid(stream.dns_query_name)) {
      return `${prefix}: DNS query name is invalid.`;
    }
    if (stream.dns_answer_enabled && !ipv4AddressValid(stream.dns_answer_ipv4)) {
      return `${prefix}: DNS answer IPv4 address is invalid.`;
    }
  }
  if (stream.dhcp_enabled) {
    if (stream.packet_type !== "Ethernet/IPv4/UDP" || stream.vxlan_enabled) {
      return `${prefix}: DHCP message builder requires a non-VXLAN IPv4 UDP packet.`;
    }
    if (!HEX_WORD_PATTERN.test(stream.dhcp_flags)) {
      return `${prefix}: DHCP flags must be four hex characters.`;
    }
    if (!MAC_ADDRESS_PATTERN.test(stream.dhcp_client_mac)) {
      return `${prefix}: DHCP client MAC must be a MAC address.`;
    }
    if (!ipv4AddressValid(stream.dhcp_client_ip)) {
      return `${prefix}: DHCP client IP is invalid.`;
    }
    if (!ipv4AddressValid(stream.dhcp_your_ip)) {
      return `${prefix}: DHCP your IP is invalid.`;
    }
    if (!ipv4AddressValid(stream.dhcp_server_ip)) {
      return `${prefix}: DHCP server IP is invalid.`;
    }
    if (!ipv4AddressValid(stream.dhcp_relay_ip)) {
      return `${prefix}: DHCP relay IP is invalid.`;
    }
    if (!dhcpHostnameValid(stream.dhcp_hostname)) {
      return `${prefix}: DHCP hostname is invalid.`;
    }
    if (!ipv4AddressValid(stream.dhcp_requested_ip)) {
      return `${prefix}: DHCP requested IP is invalid.`;
    }
    if (stream.dhcp_requested_ip_mode !== "Fixed" && stream.dhcp_requested_ip === "0.0.0.0") {
      return `${prefix}: DHCP requested IP Field Engine requires a non-zero option value.`;
    }
    if (!ipv4AddressValid(stream.dhcp_server_id)) {
      return `${prefix}: DHCP server ID is invalid.`;
    }
    if (stream.dhcp_server_id_mode !== "Fixed" && stream.dhcp_server_id === "0.0.0.0") {
      return `${prefix}: DHCP server ID Field Engine requires a non-zero option value.`;
    }
  }
  if (stream.tcp_checksum_override && !HEX_WORD_PATTERN.test(stream.tcp_checksum)) {
    return `${prefix}: TCP checksum must be four hex characters.`;
  }
  if (stream.icmp_checksum_override && !HEX_WORD_PATTERN.test(stream.icmp_checksum)) {
    return `${prefix}: ICMP checksum must be four hex characters.`;
  }
  if (isIcmpv6 && stream.icmpv6_nd_include_option && !MAC_ADDRESS_PATTERN.test(stream.icmpv6_nd_option_mac)) {
    return `${prefix}: ICMPv6 Neighbor Discovery option MAC must be a MAC address.`;
  }
  if (isIcmpv6 && stream.icmpv6_rs_include_slla && !MAC_ADDRESS_PATTERN.test(stream.icmpv6_rs_slla_mac)) {
    return `${prefix}: ICMPv6 Router Solicitation source link-layer MAC must be a MAC address.`;
  }
  if (isIcmpv6 && stream.icmpv6_ra_include_slla && !MAC_ADDRESS_PATTERN.test(stream.icmpv6_ra_slla_mac)) {
    return `${prefix}: ICMPv6 Router Advertisement source link-layer MAC must be a MAC address.`;
  }
  if (isIpv4 && !ipv4AddressValid(stream.ipv4_src)) {
    return `${prefix}: IPv4 source must be an IPv4 address.`;
  }
  if (isIpv4 && !ipv4AddressValid(stream.ipv4_dst)) {
    return `${prefix}: IPv4 destination must be an IPv4 address.`;
  }
  if (stream.payload_enabled && stream.payload_type === "Fixed Word") {
    const payloadPattern = stream.payload_pattern.replace(/\s+/g, "");
    if (payloadPattern.length > PAYLOAD_PATTERN_MAX_HEX_CHARS) {
      return `${prefix}: Payload pattern cannot exceed ${PAYLOAD_PATTERN_MAX_HEX_CHARS} hex characters.`;
    }
    if (payloadPattern !== "" && (payloadPattern.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(payloadPattern))) {
      return `${prefix}: Payload pattern must contain whole hex bytes.`;
    }
  }
  if (stream.advanced_cache_size_type === "Enable") {
    return integerRangeError(`${prefix}: Cache size`, stream.advanced_cache_value, 0, 999999);
  }
  return null;
}

function validateWorkbenchStreams(streams: ProfileWorkbenchStream[]) {
  if (streams.length === 0) {
    return "At least one stream is required.";
  }
  for (const [index, stream] of streams.entries()) {
    const error = validateWorkbenchStream(stream, index, streams.length);
    if (error) {
      return error;
    }
  }
  return null;
}

function validateWorkbenchProfile(profileName: string, streams: ProfileWorkbenchStream[]) {
  const trimmedName = profileName.trim();
  if (trimmedName === "") {
    return "Profile name is required.";
  }
  if (trimmedName !== profileName || profileName.length > 128 || profileName.includes("\0")) {
    return "Profile name must be 1-128 visible characters without leading or trailing spaces.";
  }
  return validateWorkbenchStreams(streams);
}

function parsePortsInput(value: string): { ports: number[] | null; error: string | null } {
  if (value.trim() === "") {
    return { ports: null, error: null };
  }

  const ports: number[] = [];
  for (const token of value.split(",")) {
    const candidate = token.trim();
    if (!/^\d+$/.test(candidate)) {
      return { ports: null, error: `invalid port value: ${candidate || "<empty>"}` };
    }
    ports.push(Number(candidate));
  }

  return { ports, error: null };
}

function summarizeStats(data: TrexStatsSnapshot | null, limit = 64): StatsRow[] {
  const rows: StatsRow[] = [];

  const visit = (scope: string, metric: string, value: unknown, depth: number) => {
    if (rows.length >= limit) {
      return;
    }
    if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value) || depth >= 3) {
      rows.push({
        scope,
        metric,
        value: displayValue(value)
      });
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visit(scope, metric ? `${metric}.${key}` : key, child, depth + 1);
      if (rows.length >= limit) {
        return;
      }
    }
  };

  if (!data) {
    return rows;
  }

  for (const [scope, value] of Object.entries(data)) {
    visit(scope, "", value, 0);
    if (rows.length >= limit) {
      return rows;
    }
  }
  return rows;
}

function readStatsPath(source: unknown, path: string) {
  let cursor = source;
  for (const key of path.split(".")) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function readStatsOptionalNumber(source: unknown, paths: string[]) {
  for (const path of paths) {
    const cursor = readStatsPath(source, path);
    if (typeof cursor === "number" && Number.isFinite(cursor)) {
      return cursor;
    }
  }
  return null;
}

function averageLatencyFromStats(source: TrexStatsSnapshot) {
  const latency = readStatsPath(source, "latency");
  if (!latency || typeof latency !== "object" || Array.isArray(latency)) {
    return null;
  }
  const values: number[] = [];
  for (const [scope, value] of Object.entries(latency as Record<string, unknown>)) {
    if (scope === "global" || scope === "total") {
      continue;
    }
    const average = readStatsOptionalNumber(value, [
      "latency.average",
      "latency.avg",
      "lat.average",
      "lat.avg",
      "average",
      "avg"
    ]);
    if (average !== null) {
      values.push(average);
    }
  }
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readStatsNumber(source: unknown, paths: string[]) {
  return readStatsOptionalNumber(source, paths) ?? 0;
}

function statsLatencyAverage(data: TrexStatsSnapshot) {
  return readStatsOptionalNumber(data, [
    "latency.total.latency.average",
    "latency.total.average",
    "latency.total.avg",
    "latency.global.latency.average",
    "latency.global.average",
    "latency.global.avg",
    "latency.average",
    "latency.avg"
  ]) ?? averageLatencyFromStats(data) ?? 0;
}

function statsSample(data: TrexStatsSnapshot): StatsHistorySample {
  return {
    timestamp: Date.now(),
    txPps: readStatsNumber(data, ["global.tx_pps", "total.tx_pps"]),
    rxPps: readStatsNumber(data, ["global.rx_pps", "total.rx_pps"]),
    txBps: readStatsNumber(data, ["global.tx_bps", "total.tx_bps"]),
    rxBps: readStatsNumber(data, ["global.rx_bps", "total.rx_bps"]),
    dropBps: readStatsNumber(data, ["global.rx_drop_bps", "global.drop_bps", "total.rx_drop_bps", "total.drop_bps"]),
    queueFull: readStatsNumber(data, ["global.queue_full", "global.queue_full_rate"]),
    latencyAvg: statsLatencyAverage(data)
  };
}

function appendStatsHistorySample(current: StatsHistorySample[], sample: StatsHistorySample) {
  const cutoff = sample.timestamp - STATS_HISTORY_RETENTION_MS;
  return [...current.filter((entry) => entry.timestamp >= cutoff), sample].slice(-STATS_HISTORY_MAX_SAMPLES);
}

function daemonActionLog(result: DaemonTrexResult) {
  const action = result.action;
  if (!result.ok) {
    if (action === "start") {
      if (result.blocker === "daemon_config_upload_failed" || result.blocker === "daemon_config_upload_result_invalid") {
        return `Config upload to TRex host failed: ${result.error || result.blocker}`;
      }
      return `Unable to start TRex: ${result.error || result.blocker || "command failed"}`;
    }
    if (action === "stop") {
      return `Unable to stop TRex: ${result.error || result.blocker || "command failed"}`;
    }
    return `${result.blocker ?? "daemon_blocked"} ${result.error ?? ""}`.trim();
  }
  if (action === "start") {
    return "TRex was started successfully";
  }
  if (action === "stop") {
    return result.stopped ? "TRex stopped successfully" : "TRex is not running";
  }
  return "TRex daemon command completed";
}

function daemonReservationLog(result: DaemonTrexReservationResult) {
  if (!result.ok) {
    const action = result.action === "reserve" ? "reserve TRex" : "cancel TRex reservation";
    return `Unable to ${action}: ${result.error || result.blocker || "request failed"}`;
  }
  if (result.action === "reserve") {
    return "TRex reservation was acquired successfully";
  }
  return result.canceled ? "TRex reservation was canceled successfully" : "TRex is not reserved";
}

function formatDaemonHostForUrl(host: string) {
  if (host.includes(":") && /^[0-9A-Fa-f:]+$/.test(host)) {
    return `[${host}]`;
  }
  return host;
}

function daemonDisconnectLog(environment: EnvironmentReadiness | null) {
  if (!environment) {
    return "Disconnected from TRex Daemon";
  }
  return `Disconnected from http://${formatDaemonHostForUrl(environment.host)}:${environment.daemon_port}`;
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function downloadBinaryFile(fileName: string, content: Uint8Array, mimeType: string) {
  const buffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(buffer).set(content);
  const blob = new Blob([buffer], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function base64ToBytes(contentBase64: string) {
  const binary = window.atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function downloadBase64File(fileName: string, contentBase64: string, mimeType: string) {
  const blob = new Blob([base64ToBytes(contentBase64)], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read file as base64"));
        return;
      }
      resolve(result.split(",", 2)[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

function aboutTrexVersionLabel(serverVersion: unknown) {
  if (serverVersion && typeof serverVersion === "object" && "version" in serverVersion) {
    const version = (serverVersion as { version?: unknown }).version;
    if (typeof version === "string" && version.trim() !== "") {
      return `TRex ${version}`;
    }
  }
  return "TRex";
}

function captureResultLogMessage(result: TrexResult<CaptureCommandData>) {
  if (!result.ok) {
    return `${result.blocker ?? "capture_blocked"} ${result.error ?? ""}`.trim();
  }
  const data = result.data;
  if (!data) {
    return "Capture command accepted";
  }
  const serviceMode = "captures" in data ? data.service_mode : undefined;
  if ("saved_file" in data && data.saved_file) {
    const savedFile = data.saved_file;
    const detail = `${savedFile.name} (${savedFile.size_bytes} bytes)`;
    if (savedFile.download_error) {
      return withCaptureServiceModeLog(`Capture saved ${detail}: ${savedFile.download_error}`, serviceMode);
    }
    return withCaptureServiceModeLog(`Capture saved ${detail}`, serviceMode);
  }
  if ("packet_count" in data) {
    return withCaptureServiceModeLog(`Capture command accepted ${data.packet_count} packets`, serviceMode);
  }
  if ("removed_ids" in data) {
    return withCaptureServiceModeLog(`Capture remove accepted ${data.removed_ids.length} recorders`, serviceMode);
  }
  if ("file" in data) {
    const file = data.file;
    const detail = `${file.name} (${file.size_bytes ?? 0} bytes)`;
    if ("pid" in data && data.pid !== null && data.pid !== undefined) {
      return `Capture file opened ${detail}`;
    }
    if (file.download_error) {
      return `Capture file download blocked ${detail}: ${file.download_error}`;
    }
    return `Capture file downloaded ${detail}`;
  }
  if ("id" in data && data.id !== null && data.id !== undefined) {
    return withCaptureServiceModeLog(`Capture recorder ${data.id} started`, serviceMode);
  }
  return withCaptureServiceModeLog("Capture command accepted", serviceMode);
}

function capturePortsLogLabel(ports: number[]) {
  if (ports.length === 1) {
    return `port ${ports[0]}`;
  }
  return `ports ${ports.join(", ")}`;
}

function captureServiceModeLogLabel(serviceMode: TrexCaptureStatus["service_mode"] | undefined) {
  if (!serviceMode) {
    return null;
  }
  const restoredPorts = serviceMode.restored_ports ?? [];
  if (restoredPorts.length > 0) {
    return `service mode restored on ${capturePortsLogLabel(restoredPorts)}`;
  }
  const enabledPorts = serviceMode.enabled_ports ?? [];
  if (enabledPorts.length > 0) {
    return `service mode enabled on ${capturePortsLogLabel(enabledPorts)}`;
  }
  const managedCaptureIds = serviceMode.managed_capture_ids ?? [];
  if (managedCaptureIds.length > 0) {
    return `service mode managed for recorder #${managedCaptureIds.join(", #")}`;
  }
  return null;
}

function withCaptureServiceModeLog(message: string, serviceMode: TrexCaptureStatus["service_mode"] | undefined) {
  const label = captureServiceModeLogLabel(serviceMode);
  return label ? `${message}; ${label}` : message;
}

function numericDataField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pingResultLogMessage(data: Record<string, unknown>) {
  const port = data.port ?? "-";
  const destination = data.destination;
  const recordCount =
    numericDataField(data, "record_count") ?? (Array.isArray(data.records) ? data.records.length : numericDataField(data, "count"));
  const replyCount = numericDataField(data, "reply_count");
  const timeoutCount = numericDataField(data, "timeout_count") ?? 0;
  const unreachableCount = numericDataField(data, "unreachable_count") ?? 0;
  const details: string[] = [];
  if (recordCount !== null && replyCount !== null) {
    details.push(`${replyCount}/${recordCount} replies`);
  }
  if (timeoutCount > 0) {
    details.push(`${timeoutCount} timed out`);
  }
  if (unreachableCount > 0) {
    details.push(`${unreachableCount} unreachable`);
  }
  const suffix = details.length > 0 ? `: ${details.join(", ")}` : "";
  return `Port ping accepted port ${port} -> ${destination}${suffix}`;
}

function commandResultLogMessage(result: TrexResult<Record<string, unknown>>) {
  if (!result.ok) {
    return `${result.blocker ?? "command_blocked"} ${result.error ?? ""}`.trim();
  }
  const data = result.data;
  if (!data) {
    return "Port command accepted";
  }
  const ports = Array.isArray(data.ports) ? data.ports.join(",") : data.port;
  const portText = ports !== undefined && ports !== null && ports !== "" ? ` ports ${ports}` : "";
  if (typeof data.arp_resolution === "string") {
    return `Port ARP resolve accepted${portText} (${data.arp_resolution})`;
  }
  if (typeof data.mode === "string" && data.port !== undefined) {
    return `Port configuration accepted port ${data.port} ${data.mode}`;
  }
  if (typeof data.destination === "string" && "records" in data) {
    return pingResultLogMessage(data);
  }
  if ("hosts" in data) {
    const hostCount = Array.isArray(data.hosts) ? data.hosts.length : 0;
    return `IPv6 scan accepted${portText}: ${hostCount} hosts`;
  }
  if ("clear_global" in data || "clear_xstats" in data) {
    return `Stats clear accepted${portText}`;
  }
  if (typeof data.multiplier === "string" && "update_result" in data) {
    return `Traffic rate update accepted${portText} (${data.multiplier})`;
  }
  if (typeof data.attribute === "string" && "value" in data) {
    return `Port attribute accepted${portText} ${data.attribute}=${displayValue(data.value)}`;
  }
  if (data.accepted === true) {
    return `Port command accepted${portText}`;
  }
  return `Port command accepted ${displayValue(data)}`;
}

function trafficStartLogMessage(result: TrexResult<unknown>) {
  if (!result.ok) {
    const diagnostic = trexResultDiagnosticMessage(result);
    if (diagnostic) {
      return diagnostic;
    }
    return `${result.blocker ?? "traffic_blocked"} ${result.error ?? ""}`.trim();
  }
  const data = result.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Traffic start accepted";
  }
  const record = data as Record<string, unknown>;

  const ports = Array.isArray(record.ports) ? record.ports.join(",") : record.ports;
  const portText = ports === null ? " all ports" : ports !== undefined && ports !== "" ? ` ports ${ports}` : "";
  const rateText = typeof record.multiplier === "string" ? ` (${record.multiplier})` : "";
  const durationText = typeof record.duration === "number" && record.duration > 0 ? ` duration ${record.duration}s` : "";
  if (portText || rateText || durationText) {
    return `Traffic start accepted${portText}${rateText}${durationText}`;
  }
  return `Traffic start accepted ${displayValue(record)}`;
}

type TrexCommandConfirmation = {
  token: string;
  message: (ports: number[] | null) => string;
};

function portsLabel(ports: number[] | null) {
  if (ports === null) {
    return "all ports";
  }
  if (ports.length === 1) {
    return `port ${ports[0]}`;
  }
  return `ports ${ports.join(", ")}`;
}

function normalizedPortIds(ports: number[] | null, portRecords: TrexPortRecord[]) {
  const ids = ports === null ? portRecords.map((port) => port.id) : ports;
  return [...new Set(ids)].filter((port) => Number.isFinite(port));
}

type TrafficMutationAuthority =
  | {
      ok: true;
      ports: number[];
      sessionId: string;
    }
  | {
      ok: false;
      result: TrexResult<Record<string, unknown>>;
    };

type TrafficStartAuthority =
  | {
      ok: true;
      sessionId: string | null;
    }
  | {
      ok: false;
      result: TrexResult<Record<string, unknown>>;
    };

function activeManagedSessionPorts(session: TrafficSession) {
  return [
    ...new Set(
      session.groups.flatMap((group) =>
        group.ports.filter((port) => {
          const state = group.port_states[port];
          return state === "running" || state === "paused";
        })
      )
    )
  ].sort((left, right) => left - right);
}

function commandTrafficSessionId(data: Record<string, unknown> | null) {
  if (data === null || typeof data.session !== "object" || data.session === null) {
    return null;
  }
  const id = Reflect.get(data.session, "id");
  return typeof id === "string" && id.trim() !== "" ? id : null;
}

function commandTrafficSessionState(data: Record<string, unknown> | null) {
  if (data === null || typeof data.session !== "object" || data.session === null) {
    return null;
  }
  const state = Reflect.get(data.session, "state");
  return typeof state === "string" ? state : null;
}

async function resolveTrafficMutationAuthority(
  requestedPorts: number[] | null,
  expectedSessionId: string | null
): Promise<TrafficMutationAuthority> {
  if (expectedSessionId === null) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_authority_unbound",
        error: "This page is not bound to an active traffic session; reload before controlling traffic"
      }
    };
  }

  const runtime = await fetchTrafficRuntime();
  if (!runtime.ok || runtime.data === null) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: runtime.blocker ?? "traffic_runtime_unavailable",
        error: runtime.error ?? "Unable to read the current traffic runtime authority"
      }
    };
  }

  const session = runtime.data.session;
  if (
    session === null
    || (session.state !== "running" && session.state !== "paused" && session.state !== "mixed")
  ) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_not_active",
        error: "No active managed traffic session is available"
      }
    };
  }
  if (session.id !== expectedSessionId) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_id_conflict",
        error: "The active traffic session changed in another page; reload before controlling it"
      }
    };
  }

  const ownedPorts = activeManagedSessionPorts(session);
  const ports = requestedPorts === null
    ? ownedPorts
    : [...new Set(requestedPorts)].sort((left, right) => left - right);
  const ownedPortSet = new Set(ownedPorts);
  if (ports.length === 0 || ports.some((port) => !ownedPortSet.has(port))) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_port_mismatch",
        error: `Requested ${portsLabel(ports)} are not owned by the active managed traffic session`
      }
    };
  }

  return {
    ok: true,
    ports,
    sessionId: session.id
  };
}

async function resolveTrafficStartAuthority(
  expectedSessionId: string | null
): Promise<TrafficStartAuthority> {
  const runtime = await fetchTrafficRuntime();
  if (!runtime.ok || runtime.data === null) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: runtime.blocker ?? "traffic_runtime_unavailable",
        error: runtime.error ?? "Unable to read the current traffic runtime authority"
      }
    };
  }

  const session = runtime.data.session;
  if (session === null || session.state === "stopped") {
    return { ok: true, sessionId: null };
  }
  if (session.state === "unknown") {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_reconciliation_required",
        error: "The current traffic session has unknown live state; reconcile it before starting traffic"
      }
    };
  }
  if (expectedSessionId === null) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_authority_unbound",
        error: "This page is not bound to the active traffic session; reload before adding traffic"
      }
    };
  }
  if (session.id !== expectedSessionId) {
    return {
      ok: false,
      result: {
        ok: false,
        data: null,
        blocker: "traffic_session_id_conflict",
        error: "The active traffic session changed in another page; reload before adding traffic"
      }
    };
  }
  return { ok: true, sessionId: session.id };
}

function isActivePortStatus(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toUpperCase();
  return (
    normalized === "TX"
    || normalized === "TRANSMITTING"
    || normalized === "PAUSE"
    || normalized === "PAUSED"
    || normalized.includes("TRANSMIT")
  );
}

function isPortLinkUp(port: TrexPortRecord) {
  const value = port.info.link ?? port.info.link_status;
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return true;
  }
  const normalized = value.trim().toUpperCase();
  return normalized === "" || normalized === "-" || normalized === "UP" || normalized === "TRUE" || normalized === "YES";
}

function hasPortTrafficStats(data: TrexStatsSnapshot | null | undefined, portId: number) {
  if (!data) {
    return false;
  }
  return [
    `${portId}.tx_pps`,
    `${portId}.rx_pps`,
    `${portId}.tx_bps`,
    `${portId}.rx_bps`,
    `${portId}.tx_bps_L1`,
    `${portId}.rx_bps_L1`,
    `${portId}.tx_bps_l1`,
    `${portId}.rx_bps_l1`
  ].some((path) => readStatsNumber(data, [path]) > 0.001);
}

function buildTopologyPortStates(
  portRecords: TrexPortRecord[],
  statsData: TrexStatsSnapshot | null | undefined,
  optimisticTrafficPortIds: number[],
  overview: SystemOverview | null
) {
  const optimisticIds = new Set(optimisticTrafficPortIds);
  return Object.fromEntries(
    portRecords.map((port) => {
      const isActive =
        optimisticIds.has(port.id)
        || isActivePortStatus(port.info.status ?? port.info.state)
        || hasPortTrafficStats(statsData, port.id);
      const state: TopologyPortState = isActive
        ? { signal: "active", label: "Traffic active" }
        : portIsLocallyAcquired(port, overview)
          ? { signal: "owned", label: "Acquired" }
          : isPortLinkUp(port)
            ? { signal: "idle", label: "Link up idle" }
            : { signal: "down", label: "Link down" };
      return [port.id, state];
    })
  ) as Record<number, TopologyPortState>;
}

function quickValidationIsActive(status: QuickValidationStatus | null | undefined) {
  const phase = status?.run?.phase;
  return Boolean(
    status?.active
    || status?.recovery_required
    || phase === "preflight"
    || phase === "running"
    || phase === "stopping"
  );
}

function quickValidationCancelRetryRevision(
  result: TrexResult<QuickValidationStatus>,
  runId: string,
  attemptedRevision: number
) {
  const status = result.data;
  const run = status?.run;
  const activePhase = run?.phase === "preflight" || run?.phase === "running" || run?.phase === "stopping";
  if (
    result.ok
    || result.blocker !== "quick_validation_run_conflict"
    || status?.active !== true
    || !activePhase
    || run?.id !== runId
    || !Number.isInteger(run.revision)
    || run.revision <= attemptedRevision
  ) {
    return null;
  }
  return run.revision;
}

export function App() {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionEventMessage, setConnectionEventMessage] = useState<string | null>(null);
  const [profileCatalog, setProfileCatalog] = useState<TrexResult<ProfileCatalog> | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProfilesLoading, setIsProfilesLoading] = useState(true);
  const [profilePath, setProfilePath] = useState("udp_1pkt_simple.py");
  const [builderProfileName, setBuilderProfileName] = useState("profile.yaml");
  const [profileStreams, setProfileStreams] = useState<ProfileWorkbenchStream[]>(() => [defaultWorkbenchStream(1)]);
  const [profileStreamsSourcePath, setProfileStreamsSourcePath] = useState<string | null>(null);
  const [profileStreamsDirty, setProfileStreamsDirty] = useState(false);
  const [trafficPlanDirty, setTrafficPlanDirty] = useState(false);
  const [selectedStreamIndex, setSelectedStreamIndex] = useState(0);
  const [profileWorkbenchResult, setProfileWorkbenchResult] = useState<TrexResult<ProfileWorkbenchSaveResult> | null>(null);
  const [profilePacketPreviews, setProfilePacketPreviews] = useState<ProfilePacketPreview[]>([]);
  const [profileTunables, setProfileTunables] = useState<ProfileTunablesDraft>(defaultProfileTunablesDraft);
  const [profileCommandResult, setProfileCommandResult] = useState<
    TrexResult<
      ProfileFileOperationResult | ProfileExportResult | ProfileWorkbenchYamlExportResult | ProfilePcapExportResult | ProfilePcapImportResult
    > | null
  >(null);
  const [isProfileWorkbenchBusy, setIsProfileWorkbenchBusy] = useState(false);
  const [trafficMultiplierUnit, setTrafficMultiplierUnit] = useState<TrafficMultiplierUnit>("raw");
  const [trafficMultiplierValue, setTrafficMultiplierValue] = useState("1");
  const [trafficDurationEnabled, setTrafficDurationEnabled] = useState(false);
  const [trafficDurationValue, setTrafficDurationValue] = useState("30");
  const [forceStart] = useState(false);
  const [startResult, setStartResult] = useState<TrexResult<unknown> | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [commandResult, setCommandResult] = useState<TrexResult<Record<string, unknown>> | null>(null);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [optimisticTrafficPortIds, setOptimisticTrafficPortIds] = useState<number[]>([]);
  const [optimisticTrafficStartedAt, setOptimisticTrafficStartedAt] = useState<number | null>(null);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [statsStreamUnavailable, setStatsStreamUnavailable] = useState(false);
  const [selectedPortId, setSelectedPortId] = useState<number | null>(null);
  const [statsResult, setStatsResult] = useState<TrexResult<TrexStatsSnapshot> | null>(null);
  const [statsHistory, setStatsHistory] = useState<StatsHistorySample[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hardwareCounterResult, setHardwareCounterResult] = useState<TrexResult<TrexPortXstatsSnapshot> | null>(null);
  const [isHardwareCountersLoading, setIsHardwareCountersLoading] = useState(false);
  const [captureStatusResult, setCaptureStatusResult] = useState<TrexResult<TrexCaptureStatus> | null>(null);
  const [captureFilesResult, setCaptureFilesResult] = useState<TrexResult<TrexCaptureFiles> | null>(null);
  const [isCaptureStatusLoading, setIsCaptureStatusLoading] = useState(false);
  const [isCaptureFilesLoading, setIsCaptureFilesLoading] = useState(false);
  const [captureResult, setCaptureResult] = useState<TrexResult<CaptureCommandData> | null>(null);
  const [capturePacketBuffer, setCapturePacketBuffer] = useState<{ dropped: number; packets: TrexCapturePacket[] }>({
    dropped: 0,
    packets: []
  });
  const [isCaptureBusy, setIsCaptureBusy] = useState(false);
  const [runReportsResult, setRunReportsResult] = useState<TrexResult<TrexRunReports> | null>(null);
  const [runReportTrendsResult, setRunReportTrendsResult] = useState<TrexResult<TrexRunReportTrends> | null>(null);
  const [runReportResult, setRunReportResult] = useState<TrexResult<RunReportSaveResult | RunReportDownloadResult> | null>(null);
  const [isRunReportBusy, setIsRunReportBusy] = useState(false);
  const [isRunReportsLoading, setIsRunReportsLoading] = useState(false);
  const [isRunReportSnapshotLoading, setIsRunReportSnapshotLoading] = useState(false);
  const [isRunReportTrendsLoading, setIsRunReportTrendsLoading] = useState(false);
  const captureStatusRequestGenerationRef = useRef(0);
  const captureFilesRequestGenerationRef = useRef(0);
  const runReportsRequestGenerationRef = useRef(0);
  const runReportSnapshotRequestGenerationRef = useRef(0);
  const runReportTrendsRequestGenerationRef = useRef(0);
  const trafficSessionAuthorityRef = useRef<string | null>(null);
  const [trafficRuntime, setTrafficRuntime] = useState<TrafficRuntimeSnapshot | null>(null);
  const [quickValidationResult, setQuickValidationResult] = useState<TrexResult<QuickValidationStatus> | null>(null);
  const [isQuickValidationLoading, setIsQuickValidationLoading] = useState(false);
  const [isQuickValidationBusy, setIsQuickValidationBusy] = useState(false);
  const [quickValidationPollEpoch, setQuickValidationPollEpoch] = useState(0);
  const quickValidationRequestGenerationRef = useRef(0);
  const quickValidationCommandActiveRef = useRef(false);
  const quickValidationStatusAuthorityRef = useRef<QuickValidationStatus | null>(null);
  const [runReportGeneratedAt, setRunReportGeneratedAt] = useState(() => new Date().toISOString());
  const [runReportTemplateId, setRunReportTemplateId] = useState<RunReportTemplateId>("standard");
  const [runReportTools, setRunReportTools] = useState<RunReportTools | null>(null);
  const [trafficRunSession, setTrafficRunSession] = useState<RunReportTrafficSession | null>(null);
  const [daemonOverview, setDaemonOverview] = useState<DaemonOverview | null>(null);
  const [daemonConfigVersions, setDaemonConfigVersions] = useState<DaemonConfigVersions | null>(null);
  const [daemonConfigAudit, setDaemonConfigAudit] = useState<DaemonConfigAudit | null>(null);
  const [daemonConfigVersionDiff, setDaemonConfigVersionDiff] = useState<DaemonConfigVersionDiffResult | null>(null);
  const [daemonConfigVersionMessage, setDaemonConfigVersionMessage] = useState<string | null>(null);
  const [daemonDefaultConfig, setDaemonDefaultConfig] = useState<DaemonDefaultConfig | null>(null);
  const [daemonResult, setDaemonResult] = useState<DaemonTrexResult | null>(null);
  const [daemonReservationResult, setDaemonReservationResult] = useState<DaemonTrexReservationResult | null>(null);
  const [daemonError, setDaemonError] = useState<string | null>(null);
  const [daemonConnectionMessage, setDaemonConnectionMessage] = useState<string | null>(null);
  const [daemonConfigOverride, setDaemonConfigOverride] = useState<{ content: string; label: string } | null>(null);
  const [daemonConfigContent, setDaemonConfigContent] = useState<string | null>(null);
  const [daemonConfigValid, setDaemonConfigValid] = useState(true);
  const [daemonStartTimeout, setDaemonStartTimeout] = useState("40");
  const [isDaemonLoading, setIsDaemonLoading] = useState(false);
  const [isDaemonBusy, setIsDaemonBusy] = useState(false);
  const [isDaemonReservationBusy, setIsDaemonReservationBusy] = useState(false);
  const [isDaemonConfigLoading, setIsDaemonConfigLoading] = useState(false);
  const [isDaemonConfigVersionBusy, setIsDaemonConfigVersionBusy] = useState(false);
  const [apiLogEntries, setApiLogEntries] = useState<ApiLogEntry[]>(() => getApiLogEntries());
  const capturePackets = capturePacketBuffer.packets;
  const quickValidationActive = isQuickValidationBusy
    || quickValidationIsActive(quickValidationResult?.data);

  const confirmQuickValidationWorkspaceExit = () => (
    activeDialog !== "quick-validation"
    || !quickValidationActive
    || window.confirm(
      "Quick Validation is still active. Leaving this workspace will not cancel traffic; "
      + "the backend safety lease remains in force. Continue?"
    )
  );

  const openWorkbenchDialog = (dialog: ActiveDialog) => {
    if (dialog !== "quick-validation" && !confirmQuickValidationWorkspaceExit()) {
      return false;
    }
    setActiveDialog(dialog);
    return true;
  };

  const applyTrafficRuntimeSnapshot = useCallback((snapshot: TrafficRuntimeSnapshot) => {
    setTrafficRuntime(snapshot);
    const session = snapshot.session;
    trafficSessionAuthorityRef.current = session !== null && session.state !== "stopped"
      ? session.id
      : null;
    setTrafficRunSession((current) =>
      synchronizeRunReportTrafficSession(current, snapshot)
    );
  }, []);

  const applyTrafficSessionResponse = useCallback((session: TrafficSession) => {
    trafficSessionAuthorityRef.current = session.state !== "stopped"
      ? session.id
      : null;
    setTrafficRuntime((current) => current === null
      ? current
      : { ...current, session });
    setTrafficRunSession((current) => ({
      session,
      captureCompletedAt: current?.session.id === session.id
        ? current.captureCompletedAt
        : null
    }));
  }, []);

  const refreshTrafficRuntimeAuthority = useCallback(async () => {
    try {
      const result = await fetchTrafficRuntime();
      if (result.data) {
        applyTrafficRuntimeSnapshot(result.data);
      }
      return result;
    } catch (caught) {
      return {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load traffic runtime"
      } satisfies TrexResult<TrafficRuntimeSnapshot>;
    }
  }, [applyTrafficRuntimeSnapshot]);

  const applyQuickValidationResult = useCallback((result: TrexResult<QuickValidationStatus>) => {
    if (result.data) {
      quickValidationStatusAuthorityRef.current = result.data;
      setQuickValidationResult(result);
      return result;
    }
    const effectiveResult = !result.ok && quickValidationStatusAuthorityRef.current
      ? { ...result, data: quickValidationStatusAuthorityRef.current }
      : result;
    setQuickValidationResult(effectiveResult);
    return effectiveResult;
  }, []);

  const loadQuickValidation = useCallback(async (showLoading = true) => {
    const requestGeneration = ++quickValidationRequestGenerationRef.current;
    if (showLoading) {
      setIsQuickValidationLoading(true);
    }
    try {
      const result = await fetchQuickValidation();
      if (
        quickValidationRequestGenerationRef.current === requestGeneration
        && !quickValidationCommandActiveRef.current
      ) {
        return applyQuickValidationResult(result);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<QuickValidationStatus> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load Quick Validation"
      };
      if (
        quickValidationRequestGenerationRef.current === requestGeneration
        && !quickValidationCommandActiveRef.current
      ) {
        return applyQuickValidationResult(result);
      }
      return result;
    } finally {
      if (
        showLoading
        && quickValidationRequestGenerationRef.current === requestGeneration
        && !quickValidationCommandActiveRef.current
      ) {
        setIsQuickValidationLoading(false);
      }
    }
  }, [applyQuickValidationResult]);

  const refreshDaemonConfigVersions = useCallback(async () => {
    const result = await fetchDaemonConfigVersions();
    setDaemonConfigVersions(result);
    if (!result.ok) {
      setDaemonConfigVersionMessage(result.error ?? result.blocker ?? "Unable to load config versions");
    }
    return result;
  }, []);

  const refreshDaemonConfigAudit = useCallback(async () => {
    const result = await fetchDaemonConfigAudit();
    setDaemonConfigAudit(result);
    if (!result.ok) {
      setDaemonConfigVersionMessage(result.error ?? result.blocker ?? "Unable to load config audit");
    }
    return result;
  }, []);

  const loadDaemonOverview = useCallback(async () => {
    setIsDaemonLoading(true);
    setDaemonConnectionMessage(null);
    try {
      setDaemonOverview(await fetchDaemonOverview());
      setDaemonDefaultConfig(null);
      setDaemonConfigOverride(null);
      setDaemonConfigContent(null);
      setDaemonConfigValid(true);
      setDaemonConfigAudit(null);
      setDaemonConfigVersionDiff(null);
      setDaemonReservationResult(null);
      setDaemonError(null);
    } catch (caught) {
      setDaemonError(caught instanceof Error ? caught.message : "Unable to load daemon state");
    } finally {
      setIsDaemonLoading(false);
    }
  }, []);

  const refreshDaemonOverview = useCallback(async () => {
    try {
      setDaemonOverview(await fetchDaemonOverview());
      setDaemonError(null);
      setDaemonConnectionMessage(null);
    } catch (caught) {
      setDaemonError(caught instanceof Error ? caught.message : "Unable to load daemon state");
    }
  }, []);

  const setCaptureStatusFromRecords = useCallback((
    captures: TrexCaptureStatus["captures"],
    portUsage?: TrexCaptureStatus["port_usage"],
    serviceMode?: TrexCaptureStatus["service_mode"]
  ) => {
    captureStatusRequestGenerationRef.current += 1;
    setIsCaptureStatusLoading(false);
    setCaptureStatusResult({
      ok: true,
      data: { captures, port_usage: portUsage, service_mode: serviceMode },
      blocker: null,
      error: null
    });
  }, []);

  const loadCaptureStatus = useCallback(async () => {
    const requestGeneration = ++captureStatusRequestGenerationRef.current;
    setIsCaptureStatusLoading(true);
    try {
      const result = await fetchCaptureStatus();
      if (captureStatusRequestGenerationRef.current === requestGeneration) {
        setCaptureStatusResult(result);
        if (!result.ok) {
          setCaptureResult({
            ok: false,
            data: null,
            blocker: result.blocker,
            error: result.error
          });
        }
      }
    } catch (caught) {
      const result: TrexResult<TrexCaptureStatus> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load capture status"
      };
      if (captureStatusRequestGenerationRef.current === requestGeneration) {
        setCaptureStatusResult(result);
        setCaptureResult({
          ok: false,
          data: null,
          blocker: result.blocker,
          error: result.error
        });
      }
    } finally {
      if (captureStatusRequestGenerationRef.current === requestGeneration) {
        setIsCaptureStatusLoading(false);
      }
    }
  }, []);

  const loadCaptureFiles = useCallback(async () => {
    const requestGeneration = ++captureFilesRequestGenerationRef.current;
    setIsCaptureFilesLoading(true);
    try {
      const result = await fetchCaptureFiles();
      if (captureFilesRequestGenerationRef.current === requestGeneration) {
        setCaptureFilesResult(result);
        if (!result.ok) {
          setCaptureResult({
            ok: false,
            data: null,
            blocker: result.blocker,
            error: result.error
          });
        }
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCaptureFiles> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load capture files"
      };
      if (captureFilesRequestGenerationRef.current === requestGeneration) {
        setCaptureFilesResult(result);
        setCaptureResult({
          ok: false,
          data: null,
          blocker: result.blocker,
          error: result.error
        });
      }
      return result;
    } finally {
      if (captureFilesRequestGenerationRef.current === requestGeneration) {
        setIsCaptureFilesLoading(false);
      }
    }
  }, []);

  const loadRunReports = useCallback(async () => {
    const requestGeneration = ++runReportsRequestGenerationRef.current;
    setIsRunReportsLoading(true);
    try {
      const result = await fetchRunReports();
      if (runReportsRequestGenerationRef.current === requestGeneration) {
        setRunReportsResult(result);
        if (!result.ok) {
          setRunReportResult({
            ok: false,
            data: null,
            blocker: result.blocker,
            error: result.error
          });
        }
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexRunReports> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load run reports"
      };
      if (runReportsRequestGenerationRef.current === requestGeneration) {
        setRunReportsResult(result);
        setRunReportResult({
          ok: false,
          data: null,
          blocker: result.blocker,
          error: result.error
        });
      }
      return result;
    } finally {
      if (runReportsRequestGenerationRef.current === requestGeneration) {
        setIsRunReportsLoading(false);
      }
    }
  }, []);

  const loadRunReportTrends = useCallback(async () => {
    const requestGeneration = ++runReportTrendsRequestGenerationRef.current;
    setIsRunReportTrendsLoading(true);
    try {
      const result = await fetchRunReportTrends();
      if (runReportTrendsRequestGenerationRef.current === requestGeneration) {
        setRunReportTrendsResult(result);
        if (!result.ok) {
          setRunReportResult({
            ok: false,
            data: null,
            blocker: result.blocker,
            error: result.error
          });
        }
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexRunReportTrends> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load run report trends"
      };
      if (runReportTrendsRequestGenerationRef.current === requestGeneration) {
        setRunReportTrendsResult(result);
        setRunReportResult({
          ok: false,
          data: null,
          blocker: result.blocker,
          error: result.error
        });
      }
      return result;
    } finally {
      if (runReportTrendsRequestGenerationRef.current === requestGeneration) {
        setIsRunReportTrendsLoading(false);
      }
    }
  }, []);

  const applyStatsResult = useCallback((result: TrexResult<TrexStatsSnapshot>) => {
    setStatsResult(result);
    if (result.ok && result.data) {
      const data = result.data;
      setStatsHistory((current) => appendStatsHistorySample(current, statsSample(data)));
    }
  }, []);

  const refreshStatsState = useCallback(async (ports: number[] | null = null) => {
    setIsStatsLoading(true);
    try {
      const result = await fetchTrexStats(ports);
      applyStatsResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<TrexStatsSnapshot> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load stats"
      };
      setStatsResult(result);
      return result;
    } finally {
      setIsStatsLoading(false);
    }
  }, [applyStatsResult]);

  const refreshOverviewState = useCallback(async () => {
    try {
      const result = await fetchSystemOverview();
      setOverview(result);
      setError(null);
      setConnectionEventMessage(null);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reach backend");
      return null;
    }
  }, []);

  const loadRunReportSnapshotInputs = useCallback(async () => {
    const requestGeneration = ++runReportSnapshotRequestGenerationRef.current;
    const isCurrentRequest = () =>
      runReportSnapshotRequestGenerationRef.current === requestGeneration;
    setIsRunReportSnapshotLoading(true);
    const overviewRequest = fetchSystemOverview()
      .then((result) => {
        if (isCurrentRequest()) {
          setOverview(result);
          setError(null);
          setConnectionEventMessage(null);
        }
        return result;
      })
      .catch((caught) => {
        if (isCurrentRequest()) {
          setError(caught instanceof Error ? caught.message : "Unable to reach backend");
        }
        return null;
      });
    const statsRequest = fetchTrexStats(null)
      .then((result) => {
        if (isCurrentRequest()) {
          applyStatsResult(result);
        }
        return result;
      })
      .catch((caught) => {
        const result: TrexResult<TrexStatsSnapshot> = {
          ok: false,
          data: null,
          blocker: "frontend_request_failed",
          error: caught instanceof Error ? caught.message : "Unable to load stats"
        };
        if (isCurrentRequest()) {
          setStatsResult(result);
        }
        return result;
      });
    const trafficRuntimeRequest = fetchTrafficRuntime()
      .then((result) => {
        if (isCurrentRequest() && result.ok && result.data) {
          applyTrafficRuntimeSnapshot(result.data);
        }
        return result;
      });
    try {
      await Promise.allSettled([
        overviewRequest,
        statsRequest,
        trafficRuntimeRequest,
        loadCaptureStatus(),
        loadCaptureFiles()
      ]);
    } finally {
      if (isCurrentRequest()) {
        setIsRunReportSnapshotLoading(false);
      }
    }
  }, [applyStatsResult, applyTrafficRuntimeSnapshot, loadCaptureFiles, loadCaptureStatus]);

  const refreshWorkbenchLiveState = useCallback(async (ports: number[] | null = null) => {
    setIsStatsLoading(true);
    try {
      const [overviewResult, statsRefresh, trafficRuntimeRefresh] = await Promise.allSettled([
        fetchSystemOverview(),
        fetchTrexStats(ports),
        fetchTrafficRuntime()
      ] as const);

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
        setError(null);
      } else {
        setError(
          overviewResult.reason instanceof Error
            ? overviewResult.reason.message
            : "Unable to reach backend"
        );
      }

      if (statsRefresh.status === "fulfilled") {
        applyStatsResult(statsRefresh.value);
      } else {
        setStatsResult({
          ok: false,
          data: null,
          blocker: "frontend_request_failed",
          error: statsRefresh.reason instanceof Error ? statsRefresh.reason.message : "Unable to load stats"
        });
      }
      if (
        trafficRuntimeRefresh.status === "fulfilled"
        && trafficRuntimeRefresh.value.ok
        && trafficRuntimeRefresh.value.data
      ) {
        applyTrafficRuntimeSnapshot(trafficRuntimeRefresh.value.data);
      }
    } finally {
      setIsStatsLoading(false);
    }
  }, [applyStatsResult, applyTrafficRuntimeSnapshot]);

  useEffect(() => {
    let isActive = true;

    Promise.allSettled([fetchSystemOverview(), fetchProfiles(), fetchTrafficRuntime()] as const)
      .then(([overviewResult, profilesResult, trafficRuntimeResult]) => {
        if (!isActive) {
          return;
        }

        if (overviewResult.status === "fulfilled") {
          setOverview(overviewResult.value);
          setError(null);
        } else {
          setError(
            overviewResult.reason instanceof Error
              ? overviewResult.reason.message
              : "Unable to reach backend"
          );
        }

        if (profilesResult.status === "fulfilled") {
          setProfileCatalog(profilesResult.value);
          setProfileError(null);
        } else {
          setProfileCatalog(null);
          setProfileError(
            profilesResult.reason instanceof Error
              ? profilesResult.reason.message
              : "Unable to load profile catalog"
          );
        }

        if (
          trafficRuntimeResult.status === "fulfilled"
          && trafficRuntimeResult.value.ok
          && trafficRuntimeResult.value.data
        ) {
          applyTrafficRuntimeSnapshot(trafficRuntimeResult.value.data);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsProfilesLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [applyTrafficRuntimeSnapshot]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const updateVisibility = () => {
      setIsDocumentVisible(!document.hidden);
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if ((!profileStreamsDirty && !trafficPlanDirty && !quickValidationActive) || typeof window === "undefined") {
      return undefined;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [profileStreamsDirty, quickValidationActive, trafficPlanDirty]);

  useEffect(() => {
    if (activeDialog !== "capture") {
      return undefined;
    }

    const initialRefresh = window.setTimeout(() => {
      void loadCaptureStatus();
      void loadCaptureFiles();
    }, 0);
    const interval = window.setInterval(() => {
      void loadCaptureStatus();
    }, 5000);
    return () => {
      captureStatusRequestGenerationRef.current += 1;
      captureFilesRequestGenerationRef.current += 1;
      setIsCaptureStatusLoading(false);
      setIsCaptureFilesLoading(false);
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [activeDialog, loadCaptureFiles, loadCaptureStatus]);

  useEffect(() => {
    if (activeDialog !== "quick-validation") {
      return undefined;
    }

    let isActive = true;
    let timeoutId: number | undefined;

    const refresh = async (showLoading: boolean) => {
      if (!isActive || quickValidationCommandActiveRef.current) {
        return;
      }
      const result = await loadQuickValidation(showLoading);
      if (isActive && !quickValidationCommandActiveRef.current) {
        const pollDelay = quickValidationIsActive(result.data)
          ? QUICK_VALIDATION_POLL_MS
          : QUICK_VALIDATION_IDLE_POLL_MS;
        timeoutId = window.setTimeout(() => {
          void refresh(false);
        }, pollDelay);
      }
    };
    const initialRefreshId = window.setTimeout(() => {
      void refreshTrafficRuntimeAuthority();
      void refresh(true);
    }, 0);

    return () => {
      isActive = false;
      quickValidationRequestGenerationRef.current += 1;
      setIsQuickValidationLoading(false);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      window.clearTimeout(initialRefreshId);
    };
  }, [activeDialog, loadQuickValidation, quickValidationPollEpoch, refreshTrafficRuntimeAuthority]);

  useEffect(() => {
    if (activeDialog !== "reports") {
      return undefined;
    }

    let isActive = true;
    void loadRunReportTools().then((tools) => {
      if (isActive) {
        setRunReportTools(tools);
      }
    });
    const initialRefresh = window.setTimeout(() => {
      void loadRunReportSnapshotInputs();
      void loadRunReports();
      void loadRunReportTrends();
    }, 0);
    return () => {
      isActive = false;
      captureStatusRequestGenerationRef.current += 1;
      captureFilesRequestGenerationRef.current += 1;
      runReportsRequestGenerationRef.current += 1;
      runReportSnapshotRequestGenerationRef.current += 1;
      runReportTrendsRequestGenerationRef.current += 1;
      setIsCaptureStatusLoading(false);
      setIsCaptureFilesLoading(false);
      setIsRunReportsLoading(false);
      setIsRunReportSnapshotLoading(false);
      setIsRunReportTrendsLoading(false);
      window.clearTimeout(initialRefresh);
    };
  }, [activeDialog, loadRunReports, loadRunReportSnapshotInputs, loadRunReportTrends]);

  const profileOptions = useMemo(() => profileCatalog?.data?.profiles ?? [], [profileCatalog]);
  const selectedProfile = useMemo(
    () =>
      profileOptions.find(
        (profile) => profile.relative_path === profilePath || profile.path === profilePath
      ) ?? null,
    [profileOptions, profilePath]
  );
  const isPythonProfile =
    selectedProfile?.kind === "python" ||
    selectedProfile?.suffix === ".py" ||
    profilePath.trim().toLowerCase().endsWith(".py");
  const selectedProfileTunables = useMemo(
    () => selectedProfile?.tunables ?? null,
    [selectedProfile]
  );
  const workbenchStreamValidationError = useMemo(
    () => validateWorkbenchStreams(profileStreams),
    [profileStreams]
  );
  const workbenchProfileValidationError = useMemo(
    () => validateWorkbenchProfile(builderProfileName, profileStreams),
    [builderProfileName, profileStreams]
  );
  const selectedStreamValidationError = useMemo(
    () => validateWorkbenchStream(profileStreams[selectedStreamIndex] ?? null, selectedStreamIndex, profileStreams.length),
    [profileStreams, selectedStreamIndex]
  );
  const trafficMultiplier = useMemo(
    () => buildTrafficMultiplier(trafficMultiplierUnit, trafficMultiplierValue),
    [trafficMultiplierUnit, trafficMultiplierValue]
  );
  const reportWorkbenchStreams = useMemo(() => {
    const selectedPath = selectedProfile?.relative_path ?? profilePath.trim();
    if (isPythonProfile || profileStreamsDirty || !profileStreamsSourcePath || selectedPath !== profileStreamsSourcePath) {
      return null;
    }
    return profileStreams;
  }, [isPythonProfile, profilePath, profileStreams, profileStreamsDirty, profileStreamsSourcePath, selectedProfile]);
  const trafficDuration = useMemo(
    () => buildTrafficDuration(trafficDurationEnabled, trafficDurationValue),
    [trafficDurationEnabled, trafficDurationValue]
  );
  const parsedProfileTunables = useMemo(
    () => buildProfileTunables(Boolean(isPythonProfile), profileTunables, selectedProfileTunables),
    [isPythonProfile, profileTunables, selectedProfileTunables]
  );
  const statsRows = useMemo(() => summarizeStats(statsResult?.data ?? null), [statsResult]);
  const portRecords = useMemo(
    () => (overview?.trex_ports?.ok && overview.trex_ports.data ? overview.trex_ports.data.ports : []),
    [overview]
  );
  const runtimeDisabledReason = runtimeControlDisabledReason(overview);
  const topologyPortStates = useMemo(
    () => buildTopologyPortStates(portRecords, statsResult?.data, optimisticTrafficPortIds, overview),
    [optimisticTrafficPortIds, overview, portRecords, statsResult]
  );
  const topologyProfileByPort = useMemo(
    () => trafficProfileByPort(trafficRuntime),
    [trafficRuntime]
  );
  const hasActivePortStatus = useMemo(
    () => portRecords.some((port) => isActivePortStatus(port.info.status ?? port.info.state)),
    [portRecords]
  );
  const shouldPollStats = activeDialog === "dashboard" || hasActivePortStatus || optimisticTrafficPortIds.length > 0;
  const shouldPollOverview = Boolean(overview?.trex_probe?.ok) && import.meta.env.MODE !== "test";
  const supportsStatsStream = typeof EventSource !== "undefined";
  const shouldUseStatsStream = shouldPollStats && isDocumentVisible && supportsStatsStream && !statsStreamUnavailable;
  const shouldPollStatsWithRest = shouldPollStats && !shouldUseStatsStream;
  const statsPollIntervalMs = isDocumentVisible ? STATS_POLL_ACTIVE_MS : STATS_POLL_BACKGROUND_MS;
  const overviewPollIntervalMs = isDocumentVisible ? OVERVIEW_POLL_ACTIVE_MS : OVERVIEW_POLL_BACKGROUND_MS;
  const selectedPort = useMemo(() => {
    if (portRecords.length === 0) {
      return null;
    }
    return portRecords.find((port) => port.id === selectedPortId) ?? portRecords[0];
  }, [portRecords, selectedPortId]);
  const selectedPortTransmitting = selectedPort
    ? topologyPortStates[selectedPort.id]?.signal === "active"
    : false;
  const selectedPortCaptureSummary = useMemo(
    () => capturePortSummaryFromStatus(captureStatusResult?.data, selectedPort?.id),
    [captureStatusResult, selectedPort?.id]
  );
  const selectedPortText = selectedPort ? String(selectedPort.id) : "0";

  useEffect(() => subscribeApiLogEntries(setApiLogEntries), []);

  useEffect(() => {
    if (!shouldUseStatsStream) {
      return undefined;
    }

    const eventSource = openTrexStatsStream();
    if (!eventSource) {
      return undefined;
    }

    let isActive = true;
    eventSource.onmessage = (event) => {
      if (!isActive) {
        return;
      }
      try {
        applyStatsResult(parseTrexStatsStreamEvent(event));
      } catch (caught) {
        setStatsResult({
          ok: false,
          data: null,
          blocker: "stats_stream_parse_failed",
          error: caught instanceof Error ? caught.message : "Unable to parse stats stream"
        });
        setStatsStreamUnavailable(true);
        eventSource.close();
      }
    };
    eventSource.onerror = () => {
      if (!isActive) {
        return;
      }
      setStatsStreamUnavailable(true);
      eventSource.close();
    };

    return () => {
      isActive = false;
      eventSource.close();
    };
  }, [applyStatsResult, shouldUseStatsStream]);

  useEffect(() => {
    if (!shouldPollStatsWithRest) {
      return undefined;
    }

    let isActive = true;
    let timeoutId: number | undefined;
    const refresh = async () => {
      try {
        const result = await fetchTrexStats(null);
        if (isActive) {
          applyStatsResult(result);
        }
      } catch (caught) {
        if (isActive) {
          setStatsResult({
            ok: false,
            data: null,
            blocker: "frontend_request_failed",
            error: caught instanceof Error ? caught.message : "Unable to load stats"
          });
        }
      } finally {
        if (isActive) {
          timeoutId = window.setTimeout(refresh, statsPollIntervalMs);
        }
      }
    };

    void refresh();
    return () => {
      isActive = false;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [applyStatsResult, shouldPollStatsWithRest, statsPollIntervalMs]);

  useEffect(() => {
    if (!shouldPollOverview) {
      return undefined;
    }

    let isActive = true;
    let timeoutId: number | undefined;
    const refresh = async () => {
      await refreshOverviewState();
      if (isActive) {
        timeoutId = window.setTimeout(refresh, overviewPollIntervalMs);
      }
    };

    timeoutId = window.setTimeout(refresh, overviewPollIntervalMs);
    return () => {
      isActive = false;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [overviewPollIntervalMs, refreshOverviewState, shouldPollOverview]);

  useEffect(() => {
    if (
      optimisticTrafficPortIds.length === 0
      || optimisticTrafficStartedAt === null
      || Date.now() - optimisticTrafficStartedAt < OPTIMISTIC_TRAFFIC_GRACE_MS
      || !overview?.trex_ports?.ok
      || !statsResult?.ok
    ) {
      return;
    }

    const stillActive = optimisticTrafficPortIds.some((portId) => {
      const port = portRecords.find((record) => record.id === portId);
      return (
        (port ? isActivePortStatus(port.info.status ?? port.info.state) : false)
        || hasPortTrafficStats(statsResult.data, portId)
      );
    });

    if (!stillActive) {
      const timeoutId = window.setTimeout(() => {
        setOptimisticTrafficPortIds([]);
        setOptimisticTrafficStartedAt(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [optimisticTrafficPortIds, optimisticTrafficStartedAt, overview, portRecords, statsResult]);

  const logRows = useMemo(() => {
    const rows: LogRow[] = [];
    if (overview) {
      const host = overview.environment?.host ?? "unconfigured";
      const syncPort = overview.environment?.sync_port ?? 4501;
      const probe = overview.trex_probe;
      rows.push({
        level: "Info",
        message: `Connecting to TRex server: tcp://${host}:${syncPort}`
      });
      rows.push({
        level: probe?.ok ? "Info" : "Warn",
        message: probe?.ok
          ? "Connected to TRex RPC"
          : `${probe?.blocker ?? "probe_blocked"} ${probe?.error ?? ""}`.trim()
      });
      if (error) {
        rows.push({ level: "Warn", message: error });
      }
    } else if (connectionEventMessage) {
      rows.push({ level: "Event", message: connectionEventMessage });
    } else if (error) {
      rows.push({ level: "Warn", message: error });
    } else {
      rows.push({ level: "Info", message: "Loading backend environment" });
    }

    if (commandResult) {
      rows.push({
        level: commandResult.ok ? "Event" : "Warn",
        message: commandResultLogMessage(commandResult)
      });
    }
    if (startResult) {
      rows.push({
        level: startResult.ok ? "Event" : "Warn",
        message: trafficStartLogMessage(startResult)
      });
    }
    if (statsResult) {
      rows.push({
        level: statsResult.ok ? "Info" : "Warn",
        message: statsResult.ok
          ? `Stats sample loaded for ${statsRows.length} metrics`
          : `${statsResult.blocker ?? "stats_blocked"} ${statsResult.error ?? ""}`.trim()
      });
    }
    if (hardwareCounterResult) {
      rows.push({
        level: hardwareCounterResult.ok ? "Info" : "Warn",
        message: hardwareCounterResult.ok
          ? `Hardware counters loaded for port ${hardwareCounterResult.data?.port ?? selectedPort?.id ?? "-"}`
          : `${hardwareCounterResult.blocker ?? "xstats_blocked"} ${hardwareCounterResult.error ?? ""}`.trim()
      });
    }
    if (profileWorkbenchResult) {
      rows.push({
        level: profileWorkbenchResult.ok ? "Event" : "Warn",
        message: profileWorkbenchResult.ok
          ? `Profile saved ${profileWorkbenchResult.data?.profile.relative_path ?? ""}`.trim()
          : `${profileWorkbenchResult.blocker ?? "profile_blocked"} ${profileWorkbenchResult.error ?? ""}`.trim()
      });
    }
    if (captureResult) {
      rows.push({
        level: captureResult.ok ? "Event" : "Warn",
        message: captureResultLogMessage(captureResult)
      });
    }
    if (runReportResult) {
      rows.push({
        level: runReportResult.ok ? "Event" : "Warn",
        message: runReportResult.ok
          ? `Run report ready ${runReportResult.data?.file?.name ?? ""}`.trim()
          : `${runReportResult.blocker ?? "run_report_blocked"} ${runReportResult.error ?? ""}`.trim()
      });
    }
    if (quickValidationResult) {
      const quickRun = quickValidationResult.data?.run;
      rows.push({
        level: quickValidationResult.ok
          ? quickRun?.phase === "fail" ? "Warn" : "Event"
          : "Warn",
        message: quickValidationResult.ok
          ? `Quick Validation ${quickRun?.group.group_id ?? "ready"}: ${quickRun?.phase ?? "ready"}`
          : `${quickValidationResult.blocker ?? "quick_validation_blocked"} ${quickValidationResult.error ?? ""}`.trim()
      });
    }
    if (daemonResult) {
      rows.push({
        level: daemonResult.ok ? "Event" : "Warn",
        message: daemonActionLog(daemonResult)
      });
    }
    if (daemonReservationResult) {
      rows.push({
        level: daemonReservationResult.ok ? "Event" : "Warn",
        message: daemonReservationLog(daemonReservationResult)
      });
    }
    if (daemonError) {
      rows.push({ level: "Warn", message: daemonError });
    }
    return rows.slice(-12);
  }, [
    captureResult,
    commandResult,
    connectionEventMessage,
    daemonError,
    daemonReservationResult,
    daemonResult,
    error,
    hardwareCounterResult,
    overview,
    profileWorkbenchResult,
    quickValidationResult,
    runReportResult,
    selectedPort?.id,
    startResult,
    statsResult,
    statsRows.length
  ]);

  const runReportIsOpen = activeDialog === "reports";
  const reportCaptureFilesResult = runReportIsOpen ? captureFilesResult : null;
  const reportCapturePackets = runReportIsOpen ? capturePackets : EMPTY_CAPTURE_PACKETS;
  const reportCaptureStatusResult = runReportIsOpen ? captureStatusResult : null;
  const reportLogRows = runReportIsOpen ? logRows : EMPTY_LOG_ROWS;
  const reportOverview = runReportIsOpen ? overview : null;
  const reportPortRecords = runReportIsOpen ? portRecords : EMPTY_PORT_RECORDS;
  const reportProfilePath = runReportIsOpen ? profilePath : "";
  const reportSelectedProfile = runReportIsOpen ? selectedProfile : null;
  const reportStartResult = runReportIsOpen ? startResult : null;
  const reportStatsHistory = runReportIsOpen ? statsHistory : EMPTY_STATS_HISTORY;
  const reportStatsResult = runReportIsOpen ? statsResult : null;
  const reportTrafficSession = runReportIsOpen ? trafficRunSession : null;
  const reportTrafficMultiplier = runReportIsOpen && trafficMultiplier.ok ? trafficMultiplier.value : null;
  const reportStreams = runReportIsOpen ? reportWorkbenchStreams : null;

  const runReportSnapshot = useMemo(
    () => runReportTools
      ? runReportTools.buildRunReportSnapshot({
        captureFilesResult: reportCaptureFilesResult,
        capturePackets: reportCapturePackets,
        captureStatusResult: reportCaptureStatusResult,
        generatedAt: runReportGeneratedAt,
        logRows: reportLogRows,
        overview: reportOverview,
        portRecords: reportPortRecords,
        profilePath: reportProfilePath,
        selectedProfile: reportSelectedProfile,
        startResult: reportStartResult,
        statsHistory: reportStatsHistory,
        statsResult: reportStatsResult,
        templateId: runReportTemplateId,
        trafficSession: reportTrafficSession,
        trafficMultiplier: reportTrafficMultiplier,
        workbenchStreams: reportStreams
      })
      : null,
    [
      reportCaptureFilesResult,
      reportCapturePackets,
      reportCaptureStatusResult,
      reportLogRows,
      reportOverview,
      reportPortRecords,
      reportProfilePath,
      reportSelectedProfile,
      reportStartResult,
      reportStatsHistory,
      reportStatsResult,
      reportStreams,
      reportTrafficMultiplier,
      reportTrafficSession,
      runReportGeneratedAt,
      runReportTemplateId,
      runReportTools,
    ]
  );

  const handleProfilePathChange = (value: string) => {
    setProfilePath(value);
    setProfileTunables(defaultProfileTunablesDraft);
  };

  const handleBuilderProfileNameChange = (value: string) => {
    setBuilderProfileName(value);
    if (!isPythonProfile) {
      setProfileStreamsDirty(true);
    }
  };

  const setProfileValidationFailure = (error: string) => {
    setProfileWorkbenchResult({
      ok: false,
      data: null,
      blocker: "profile_workbench_invalid",
      error
    });
    setProfileCommandResult(null);
  };

  const handleCreateWorkbenchProfile = () => {
    void handleSaveWorkbenchProfile();
  };

  const handleLoadWorkbenchProfile = async () => {
    if (!profilePath.trim()) {
      setProfileWorkbenchResult({
        ok: false,
        data: null,
        blocker: "profile_path_missing",
        error: "select an editable profile"
      });
      return;
    }
    if (profileStreamsDirty && !window.confirm("Discard the unsaved Stream Builder changes and load the selected profile?")) {
      return;
    }

    setIsProfileWorkbenchBusy(true);
    try {
      const result = await fetchProfileWorkbench(profilePath.trim());
      if (!result.ok || !result.data?.streams || result.data.streams.length === 0) {
        setProfileWorkbenchResult({
          ok: false,
          data: null,
          blocker: result.blocker ?? "profile_workbench_unsupported",
          error: result.error ?? "selected profile has no editable GUI streams"
        });
        return;
      }
      setProfileStreams(completeWorkbenchStreams(result.data.streams));
      setProfileStreamsSourcePath(result.data.profile?.relative_path ?? profilePath.trim());
      setProfileStreamsDirty(false);
      setProfilePacketPreviews(result.data.packet_previews ?? []);
      setBuilderProfileName(result.data.profile?.name ?? selectedProfile?.name ?? "profile.yaml");
      setSelectedStreamIndex(0);
      setProfileWorkbenchResult(null);
      setProfileCommandResult(null);
    } catch (caught) {
      setProfileWorkbenchResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load profile"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleSaveWorkbenchProfile = async () => {
    if (workbenchProfileValidationError) {
      setProfileValidationFailure(workbenchProfileValidationError);
      return;
    }
    setIsProfileWorkbenchBusy(true);
    try {
      const result = await saveProfileWorkbench(builderProfileName, profileStreams);
      setProfileWorkbenchResult(result);
      setProfileCommandResult(null);
      setProfilePacketPreviews(result.data?.packet_previews ?? []);
      if (result.ok && result.data?.profile) {
        setProfilePath(result.data.profile.relative_path);
        setProfileStreamsSourcePath(result.data.profile.relative_path);
        setProfileStreamsDirty(false);
        const refreshed = await fetchProfiles();
        setProfileCatalog(refreshed);
        setProfileError(null);
      }
    } catch (caught) {
      setProfileWorkbenchResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to save profile"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleExportWorkbenchYaml = async () => {
    if (workbenchProfileValidationError) {
      setProfileValidationFailure(workbenchProfileValidationError);
      return;
    }
    setIsProfileWorkbenchBusy(true);
    try {
      const result = await exportProfileWorkbenchYaml(builderProfileName, profileStreams);
      setProfileCommandResult(result);
      setProfileWorkbenchResult(null);
      setProfilePacketPreviews(result.data?.packet_previews ?? []);
      if (result.ok && result.data) {
        downloadTextFile(result.data.file_name, result.data.content, "application/x-yaml");
      }
    } catch (caught) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to export profile YAML"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleDuplicateProfile = async () => {
    if (!selectedProfile) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "profile_not_selected",
        error: "No profile selected"
      });
      return;
    }

    setIsProfileWorkbenchBusy(true);
    try {
      const result = await duplicateProfile(selectedProfile.relative_path);
      setProfileCommandResult(result);
      setProfileWorkbenchResult(null);
      if (result.ok && result.data?.profile) {
        setProfilePath(result.data.profile.relative_path);
        const refreshed = await fetchProfiles();
        setProfileCatalog(refreshed);
        setProfileError(null);
      }
    } catch (caught) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to duplicate profile"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfile) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "profile_not_selected",
        error: "No profile selected"
      });
      return;
    }
    if ((overview?.environment?.require_confirmation ?? true) && !window.confirm(`Delete profile ${selectedProfile.relative_path}?`)) {
      return;
    }

    setIsProfileWorkbenchBusy(true);
    try {
      const result = await deleteProfile(selectedProfile.relative_path, "delete-profile");
      setProfileCommandResult(result);
      setProfileWorkbenchResult(null);
      if (result.ok) {
        const refreshed = await fetchProfiles();
        setProfileCatalog(refreshed);
        setProfileError(null);
        const nextProfile = refreshed.data?.profiles.find(
          (profile) => profile.relative_path !== selectedProfile.relative_path
        );
        if (nextProfile) {
          setProfilePath(nextProfile.relative_path);
        }
      }
    } catch (caught) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to delete profile"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleExportProfileJson = async () => {
    if (!selectedProfile) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "profile_not_selected",
        error: "No profile selected"
      });
      return;
    }

    setIsProfileWorkbenchBusy(true);
    try {
      const result = await exportProfileJson(selectedProfile.relative_path);
      setProfileCommandResult(result);
      setProfileWorkbenchResult(null);
      if (result.ok && result.data) {
        downloadTextFile(result.data.file_name, result.data.content, "application/json");
      }
    } catch (caught) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to export profile JSON"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleExportWorkbenchPcap = async () => {
    const selected = profileStreams[selectedStreamIndex];
    if (!selected) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "stream_not_selected",
        error: "No stream selected"
      });
      return;
    }
    if (selectedStreamValidationError) {
      setProfileValidationFailure(selectedStreamValidationError);
      return;
    }

    setIsProfileWorkbenchBusy(true);
    try {
      const result = await exportProfileWorkbenchPcap(selected);
      setProfileCommandResult(result);
      setProfileWorkbenchResult(null);
      if (result.ok && result.data) {
        downloadBase64File(result.data.file_name, result.data.content_base64, "application/vnd.tcpdump.pcap");
        setProfilePacketPreviews([result.data.packet_preview]);
      }
    } catch (caught) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to export stream PCAP"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleImportWorkbenchPcap = async (file: File, options: ProfilePcapImportOptions) => {
    if (profileStreamsDirty && !window.confirm("Discard the unsaved Stream Builder changes and import this PCAP?")) {
      return;
    }
    setIsProfileWorkbenchBusy(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const result = await importProfileWorkbenchPcap(file.name, contentBase64, 512, options);
      setProfileCommandResult(result);
      setProfileWorkbenchResult(null);
      if (result.ok && result.data?.streams.length) {
        setProfileStreams(completeWorkbenchStreams(result.data.streams));
        setProfileStreamsSourcePath(null);
        setProfileStreamsDirty(true);
        setProfilePacketPreviews(result.data.packet_previews ?? []);
        setSelectedStreamIndex(0);
        setBuilderProfileName(`${file.name.replace(/\.(pcap|cap)$/i, "") || "imported"}.yaml`);
      }
    } catch (caught) {
      setProfileCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to import PCAP"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleBuildStream = () => {
    setProfileStreamsDirty(true);
    setProfileStreams((current) => {
      const nextStream = defaultWorkbenchStream(current.length + 1);
      setSelectedStreamIndex(current.length);
      setProfilePacketPreviews([]);
      return [...current, nextStream];
    });
  };

  const handleDuplicateStream = () => {
    setProfileStreamsDirty(true);
    setProfileStreams((current) => {
      const selected = current[selectedStreamIndex];
      if (!selected) {
        return current;
      }
      const clone = {
        ...selected,
        name: `${selected.name}-copy`,
        pg_id: current.length + 1,
        next_stream_id: null,
        action_count: 0
      };
      setSelectedStreamIndex(selectedStreamIndex + 1);
      setProfilePacketPreviews([]);
      return [
        ...current.slice(0, selectedStreamIndex + 1),
        clone,
        ...current.slice(selectedStreamIndex + 1)
      ];
    });
  };

  const handleDeleteStream = () => {
    setProfileStreamsDirty(true);
    setProfileStreams((current) => {
      const deletedStreamId = selectedStreamIndex + 1;
      const next = current
        .filter((_, index) => index !== selectedStreamIndex)
        .map((stream) => {
          if (stream.next_stream_id === null) {
            return stream;
          }
          if (stream.next_stream_id === deletedStreamId) {
            return { ...stream, next_stream_id: null, action_count: 0 };
          }
          if (stream.next_stream_id > deletedStreamId) {
            return { ...stream, next_stream_id: stream.next_stream_id - 1 };
          }
          return stream;
        });
      setSelectedStreamIndex(Math.max(0, Math.min(selectedStreamIndex, next.length - 1)));
      setProfilePacketPreviews([]);
      return next;
    });
  };

  const handleStreamChange = (index: number, patch: Partial<ProfileWorkbenchStream>) => {
    const providesPacketBinary = typeof patch.packet_binary_base64 === "string" && patch.packet_binary_base64.length > 0;
    const clearsImportedPacket = !providesPacketBinary && packetBinaryInvalidatingFields.some((field) => field in patch);
    const normalizedPatch = clearsImportedPacket
      ? {
          ...patch,
          packet_binary_base64: null,
          advanced_mode: false,
          packet_model: null,
          packet_meta_base64: null,
          advanced_vm: null
        }
      : patch;
    setProfilePacketPreviews([]);
    setProfileStreamsDirty(true);
    setProfileStreams((current) =>
      current.map((stream, currentIndex) => (currentIndex === index ? { ...stream, ...normalizedPatch } : stream))
    );
  };

  const handleRenderProfilePreview = async () => {
    if (workbenchStreamValidationError) {
      setProfileValidationFailure(workbenchStreamValidationError);
      return;
    }
    setIsProfileWorkbenchBusy(true);
    try {
      const result = await renderProfileWorkbench(profileStreams);
      setProfilePacketPreviews(result.data?.packet_previews ?? []);
      if (!result.ok) {
        setProfileWorkbenchResult({
          ok: false,
          data: null,
          blocker: result.blocker,
          error: result.error
        });
      }
    } catch (caught) {
      setProfileWorkbenchResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to render packet preview"
      });
    } finally {
      setIsProfileWorkbenchBusy(false);
    }
  };

  const handleConnect = async (request?: ConnectTrexRequest) => {
    setIsConnecting(true);
    try {
      if (request) {
        trafficSessionAuthorityRef.current = null;
        const result = await connectTrex(request);
        setOverview(result);
        setError(null);
        setConnectionEventMessage(null);
        return result;
      }
      return await refreshOverviewState();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to connect to TRex server");
      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirmQuickValidationWorkspaceExit()) {
      return;
    }
    const disconnectResult: TrexResult<TrexDisconnectResult> = await disconnectTrex().catch((caught) => ({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to disconnect from TRex server"
    }));
    if (!disconnectResult.ok) {
      setError(`${disconnectResult.blocker ?? "disconnect_failed"} ${disconnectResult.error ?? ""}`.trim());
      setConnectionEventMessage(null);
      return;
    }
    captureStatusRequestGenerationRef.current += 1;
    captureFilesRequestGenerationRef.current += 1;
    runReportsRequestGenerationRef.current += 1;
    runReportSnapshotRequestGenerationRef.current += 1;
    runReportTrendsRequestGenerationRef.current += 1;
    setIsCaptureStatusLoading(false);
    setIsCaptureFilesLoading(false);
    setIsRunReportsLoading(false);
    setIsRunReportSnapshotLoading(false);
    setIsRunReportTrendsLoading(false);
    setOverview(null);
    setError(null);
    setConnectionEventMessage("Disconnected from TRex server");
    setCommandResult(null);
    setStartResult(null);
    setStatsResult(null);
    setStatsHistory([]);
    setHardwareCounterResult(null);
    setOptimisticTrafficPortIds([]);
    setOptimisticTrafficStartedAt(null);
    setTrafficRuntime(null);
    setTrafficRunSession(null);
    trafficSessionAuthorityRef.current = null;
    setSelectedPortId(null);
    setTrafficPlanDirty(false);
    setActiveDialog(null);
  };

  const handleTrexCommand = async (
    action: string,
    command: (ports: number[] | null, confirmation: string | null) => Promise<TrexResult<Record<string, unknown>>>,
    confirmation?: TrexCommandConfirmation
  ) => {
    const parsed = parsePortsInput(selectedPortText);
    if (parsed.error) {
      setCommandResult({
        ok: false,
        data: null,
        blocker: "invalid_ports",
        error: parsed.error
      });
      return null;
    }

    let confirmationToken: string | null = null;
    if (confirmation && (overview?.environment?.require_confirmation ?? true)) {
      if (!window.confirm(confirmation.message(parsed.ports))) {
        return null;
      }
      confirmationToken = confirmation.token;
    }

    setActiveCommand(action);
    try {
      const result = await command(parsed.ports, confirmationToken);
      setCommandResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : `Unable to run ${action}`
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const refreshRunReportBackingState = useCallback(async (generatedAt: string) => {
    setRunReportGeneratedAt(generatedAt);
    await Promise.allSettled([
      loadRunReportSnapshotInputs(),
      loadRunReports()
    ]);
  }, [loadRunReportSnapshotInputs, loadRunReports]);

  const handleApplyPortConfiguration = async (
    draft: PortConfigurationDraft
  ): Promise<TrexResult<Record<string, unknown>>> => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    setActiveCommand("port-configuration");
    try {
      const result = await applyPortConfiguration({
        port: selectedPort.id,
        mode: draft.mode,
        l2_destination: draft.l2_destination,
        l3_source: draft.l3_source,
        l3_destination: draft.l3_destination,
        vlan: draft.vlan
      });
      setCommandResult(result);
      if (result.ok) {
        await handleConnect();
      }
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to apply port configuration"
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const handlePingFromPort = async (destination: string): Promise<TrexResult<Record<string, unknown>>> => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    setActiveCommand("port-ping");
    try {
      const result = await pingFromPort({
        port: selectedPort.id,
        destination,
        pkt_size: 64,
        count: 5,
        interval_sec: 1,
        vlan: null
      });
      setCommandResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to ping destination"
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const handleResolveArp = async (vlan: number[] | null): Promise<TrexResult<Record<string, unknown>>> => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    setActiveCommand("arp-resolve");
    try {
      const result = await resolvePortsArp({
        ports: [selectedPort.id],
        confirmation: null,
        retries: 1,
        vlan
      });
      setCommandResult(result);
      if (result.ok) {
        await handleConnect();
      }
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to resolve ARP"
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const handleScanIpv6 = async (): Promise<TrexResult<Record<string, unknown>>> => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    setActiveCommand("ipv6-scan");
    try {
      const result = await scanPortsIpv6({
        ports: [selectedPort.id],
        confirmation: null,
        timeout_seconds: 10
      });
      setCommandResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to scan IPv6 hosts"
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const handleAcquirePorts = async () => {
    const result = await handleTrexCommand("acquire", (ports) =>
      acquirePorts({
        ports,
        force: false,
        sync_streams: true,
        confirmation: null
      })
    );
    if (result?.ok) {
      void refreshWorkbenchLiveState(null);
    }
  };

  const handleForceAcquirePorts = async () => {
    const result = await handleTrexCommand(
      "force-acquire",
      (ports, confirmationToken) =>
        acquirePorts({
          ports,
          force: true,
          sync_streams: true,
          confirmation: confirmationToken
        }),
      {
        token: "force-acquire",
        message: (ports) => `Force acquire ${portsLabel(ports)} from another TRex client?`
      }
    );
    if (result?.ok) {
      void refreshWorkbenchLiveState(null);
    }
  };

  const handleReleasePorts = async () => {
    const result = await handleTrexCommand("release", (ports) =>
      releasePorts({
        ports,
        confirmation: null
      })
    );
    if (result?.ok) {
      void refreshWorkbenchLiveState(null);
    }
  };

  const handleResetPorts = async () => {
    const result = await handleTrexCommand(
      "reset",
      (ports, confirmationToken) =>
        resetPorts({
          ports,
          restart: false,
          confirmation: confirmationToken
        }),
      {
        token: "reset",
        message: (ports) => `Reset ${portsLabel(ports)} and remove loaded traffic state?`
      }
    );
    if (result?.ok) {
      setOptimisticTrafficPortIds([]);
      setOptimisticTrafficStartedAt(null);
      void refreshWorkbenchLiveState(null);
    }
  };

  const handleSetSelectedPortServiceMode = async (enabled: boolean) => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    const ports = [selectedPort.id];
    let confirmationToken: string | null = null;
    if (overview?.environment?.require_confirmation ?? true) {
      const actionLabel = enabled ? "Enable" : "Disable";
      if (!window.confirm(`${actionLabel} service mode on ${portsLabel(ports)}?`)) {
        return null;
      }
      confirmationToken = "service-mode";
    }

    setActiveCommand("service-mode");
    try {
      const result = await setServiceMode({
        ports,
        enabled,
        filtered: false,
        mask: null,
        confirmation: confirmationToken
      });
      setCommandResult(result);
      if (result.ok) {
        void refreshWorkbenchLiveState(null);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to set service mode"
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const handleSetSelectedPortAttribute = async (
    attribute: PortAttributeName,
    value: boolean | FlowControlMode
  ): Promise<TrexResult<Record<string, unknown>> | null> => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    const ports = [selectedPort.id];
    let confirmationToken: string | null = null;
    if (attribute === "link" && value === false && (overview?.environment?.require_confirmation ?? true)) {
      if (!window.confirm(`Disable link on ${portsLabel(ports)}?`)) {
        return null;
      }
      confirmationToken = "port-attribute";
    }

    setActiveCommand(`port-attribute-${attribute}`);
    try {
      const result = await setPortAttribute({
        ports,
        attribute,
        value,
        confirmation: confirmationToken
      });
      setCommandResult(result);
      if (result.ok) {
        void refreshWorkbenchLiveState(null);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : `Unable to set ${attribute}`
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
    }
  };

  const handleTrafficControl = async (action: "stop" | "pause" | "resume") => {
    const parsed = parsePortsInput(selectedPortText);
    const result = await handleTrexCommand(
      action,
      async (ports, confirmationToken) => {
        const authority = await resolveTrafficMutationAuthority(
          ports,
          trafficSessionAuthorityRef.current
        );
        if (!authority.ok) {
          return authority.result;
        }
        return controlTraffic(action, {
          ports: authority.ports,
          confirmation: confirmationToken,
          expected_session_id: authority.sessionId
        });
      },
      action === "stop"
        ? {
            token: "stop",
            message: (ports) => `Stop traffic on ${portsLabel(ports)}?`
          }
        : undefined
    );
    if (result?.ok) {
      const responseSessionId = commandTrafficSessionId(result.data);
      if (action === "stop" && commandTrafficSessionState(result.data) === "stopped") {
        trafficSessionAuthorityRef.current = null;
      } else if (responseSessionId !== null) {
        trafficSessionAuthorityRef.current = responseSessionId;
      }
      if (action === "stop") {
        const endedAt = new Date().toISOString();
        const stoppedPorts = parsed.error ? null : normalizedPortIds(parsed.ports, portRecords);
        setOptimisticTrafficPortIds((current) => {
          return stoppedPorts === null ? [] : current.filter((portId) => !stoppedPorts.includes(portId));
        });
        if (stoppedPorts === null || optimisticTrafficPortIds.every((portId) => stoppedPorts.includes(portId))) {
          setOptimisticTrafficStartedAt(null);
        }
        if (commandTrafficSessionState(result.data) === "stopped") {
          await refreshWorkbenchLiveState(null);
          void refreshRunReportBackingState(endedAt);
          return;
        }
      }
      await refreshWorkbenchLiveState(null);
    }
  };

  const handleStopAllTraffic = async () => {
    const result = await handleTrexCommand(
      "stop-all",
      async (_ports, confirmationToken) => {
        const authority = await resolveTrafficMutationAuthority(
          null,
          trafficSessionAuthorityRef.current
        );
        if (!authority.ok) {
          return authority.result;
        }
        return controlTraffic("stop", {
          ports: authority.ports,
          confirmation: confirmationToken,
          expected_session_id: authority.sessionId
        });
      },
      {
        token: "stop",
        message: () => "Stop traffic on all ports?"
      }
    );
    if (result?.ok) {
      trafficSessionAuthorityRef.current = null;
      const endedAt = new Date().toISOString();
      setOptimisticTrafficPortIds([]);
      setOptimisticTrafficStartedAt(null);
      await refreshWorkbenchLiveState(null);
      void refreshRunReportBackingState(endedAt);
    }
  };

  const handleUpdateTraffic = async () => {
    if (!trafficMultiplier.ok) {
      setCommandResult({
        ok: false,
        data: null,
        blocker: "invalid_multiplier",
        error: trafficMultiplier.error
      });
      return;
    }

    const parsed = parsePortsInput(selectedPortText);
    if (parsed.error) {
      setCommandResult({
        ok: false,
        data: null,
        blocker: "invalid_ports",
        error: parsed.error
      });
      return;
    }

    setActiveCommand("update-rate");
    try {
      const authority = await resolveTrafficMutationAuthority(
        parsed.ports,
        trafficSessionAuthorityRef.current
      );
      if (!authority.ok) {
        setCommandResult(authority.result);
        return;
      }
      const result = await updateTraffic({
        ports: authority.ports,
        multiplier: trafficMultiplier.value,
        force: forceStart,
        total: false,
        expected_session_id: authority.sessionId
      });
      setCommandResult(result);
      if (result.ok) {
        const responseSessionId = commandTrafficSessionId(result.data);
        if (responseSessionId !== null) {
          trafficSessionAuthorityRef.current = responseSessionId;
        }
        void refreshWorkbenchLiveState(null);
      }
    } catch (caught) {
      setCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to update traffic rate"
      });
    } finally {
      setActiveCommand(null);
    }
  };

  const handleStartTraffic = async () => {
    if (!trafficMultiplier.ok) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_multiplier",
        error: trafficMultiplier.error
      });
      return;
    }
    if (!trafficDuration.ok) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_duration",
        error: trafficDuration.error
      });
      return;
    }
    if (!parsedProfileTunables.ok) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_tunables",
        error: parsedProfileTunables.error
      });
      return;
    }

    const parsed = parsePortsInput(selectedPortText);
    if (parsed.error) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_ports",
        error: parsed.error
      });
      return;
    }

    let confirmationToken: string | null = null;
    if (overview?.environment?.require_confirmation ?? true) {
      if (!window.confirm(`Start traffic on ${portsLabel(parsed.ports)} with profile ${profilePath.trim()}?`)) {
        return;
      }
      confirmationToken = "start-traffic";
    }

    setIsStarting(true);
    try {
      const authority = await resolveTrafficStartAuthority(
        trafficSessionAuthorityRef.current
      );
      if (!authority.ok) {
        setStartResult(authority.result);
        return;
      }
      if (authority.sessionId === null) {
        trafficSessionAuthorityRef.current = null;
      }
      const result = await startTraffic({
        profile_path: profilePath.trim(),
        ports: parsed.ports,
        multiplier: trafficMultiplier.value,
        duration: trafficDuration.value,
        force: forceStart,
        confirmation: confirmationToken,
        tunables: parsedProfileTunables.value,
        expected_session_id: authority.sessionId
      });
      setStartResult(result);
      if (result.ok) {
        if (result.data?.session) {
          applyTrafficSessionResponse(result.data.session);
        }
        setCapturePacketBuffer({ dropped: 0, packets: [] });
        setRunReportGeneratedAt(result.data?.session?.started_at ?? new Date().toISOString());
        setOptimisticTrafficPortIds(normalizedPortIds(parsed.ports, portRecords));
        setOptimisticTrafficStartedAt(Date.now());
        await refreshWorkbenchLiveState(null);
      }
    } catch (caught) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to start traffic"
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartAllTraffic = async () => {
    if (!trafficMultiplier.ok) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_multiplier",
        error: trafficMultiplier.error
      });
      return;
    }
    if (!trafficDuration.ok) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_duration",
        error: trafficDuration.error
      });
      return;
    }
    if (!parsedProfileTunables.ok) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "invalid_tunables",
        error: parsedProfileTunables.error
      });
      return;
    }

    let confirmationToken: string | null = null;
    if (overview?.environment?.require_confirmation ?? true) {
      if (!window.confirm(`Start traffic on all ports with profile ${profilePath.trim()}?`)) {
        return;
      }
      confirmationToken = "start-traffic";
    }

    setIsStarting(true);
    try {
      const authority = await resolveTrafficStartAuthority(
        trafficSessionAuthorityRef.current
      );
      if (!authority.ok) {
        setStartResult(authority.result);
        return;
      }
      if (authority.sessionId === null) {
        trafficSessionAuthorityRef.current = null;
      }
      const result = await startTraffic({
        profile_path: profilePath.trim(),
        ports: null,
        multiplier: trafficMultiplier.value,
        duration: trafficDuration.value,
        force: forceStart,
        confirmation: confirmationToken,
        tunables: parsedProfileTunables.value,
        expected_session_id: authority.sessionId
      });
      setStartResult(result);
      if (result.ok) {
        if (result.data?.session) {
          applyTrafficSessionResponse(result.data.session);
        }
        setCapturePacketBuffer({ dropped: 0, packets: [] });
        setRunReportGeneratedAt(result.data?.session?.started_at ?? new Date().toISOString());
        setOptimisticTrafficPortIds(normalizedPortIds(null, portRecords));
        setOptimisticTrafficStartedAt(Date.now());
        await refreshWorkbenchLiveState(null);
      }
    } catch (caught) {
      setStartResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to start traffic"
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleRefreshHardwareCounters = useCallback(async (): Promise<TrexResult<TrexPortXstatsSnapshot>> => {
    if (!selectedPort) {
      const result: TrexResult<TrexPortXstatsSnapshot> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setHardwareCounterResult(result);
      return result;
    }

    setIsHardwareCountersLoading(true);
    try {
      const result = await fetchPortXstats(selectedPort.id);
      setHardwareCounterResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<TrexPortXstatsSnapshot> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load hardware counters"
      };
      setHardwareCounterResult(result);
      return result;
    } finally {
      setIsHardwareCountersLoading(false);
    }
  }, [selectedPort]);

  const handleResetHardwareCounters = useCallback(async (): Promise<TrexResult<Record<string, unknown>>> => {
    if (!selectedPort) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "port_not_selected",
        error: "No port selected"
      };
      setCommandResult(result);
      return result;
    }

    setActiveCommand("reset-counters");
    setIsHardwareCountersLoading(true);
    try {
      const result = await clearTrexStats({
        ports: [selectedPort.id],
        confirmation: null,
        clear_global: false,
        clear_flow_stats: true,
        clear_latency_stats: true,
        clear_xstats: true
      });
      setCommandResult(result);
      if (result.ok) {
        const [xstatsRefresh, statsRefresh] = await Promise.allSettled([
          fetchPortXstats(selectedPort.id),
          fetchTrexStats([selectedPort.id])
        ]);
        if (xstatsRefresh.status === "fulfilled") {
          setHardwareCounterResult(xstatsRefresh.value);
        } else {
          setHardwareCounterResult({
            ok: false,
            data: null,
            blocker: "frontend_request_failed",
            error: xstatsRefresh.reason instanceof Error ? xstatsRefresh.reason.message : "Unable to reload hardware counters"
          });
        }
        if (statsRefresh.status === "fulfilled") {
          applyStatsResult(statsRefresh.value);
        }
      }
      return result;
    } catch (caught) {
      const result: TrexResult<Record<string, unknown>> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to reset counters"
      };
      setCommandResult(result);
      return result;
    } finally {
      setActiveCommand(null);
      setIsHardwareCountersLoading(false);
    }
  }, [applyStatsResult, selectedPort]);

  const handleClearStats = async () => {
    setActiveCommand("clear-stats");
    setIsStatsLoading(true);
    try {
      const result = await clearTrexStats({
        ports: null,
        confirmation: null,
        clear_global: true,
        clear_flow_stats: true,
        clear_latency_stats: true,
        clear_xstats: true
      });
      setCommandResult(result);
      if (result.ok) {
        setStatsHistory([]);
        await refreshStatsState(null);
        if (selectedPort) {
          void handleRefreshHardwareCounters();
        }
      }
    } catch (caught) {
      setCommandResult({
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to clear stats"
      });
    } finally {
      setActiveCommand(null);
      setIsStatsLoading(false);
    }
  };

  const handleOpenCapture = () => {
    if (!openWorkbenchDialog("capture")) {
      return;
    }
    setIsCaptureFilesLoading(true);
    setIsCaptureStatusLoading(true);
  };

  const handleOpenQuickValidation = () => {
    openWorkbenchDialog("quick-validation");
  };

  const handleRefreshQuickValidation = async () => {
    await Promise.all([
      loadQuickValidation(true),
      refreshTrafficRuntimeAuthority()
    ]);
  };

  const handleStartQuickValidation = async (
    confirmation: QuickValidationStartConfirmation
  ) => {
    setIsQuickValidationBusy(true);
    let commandFenced = false;
    try {
      const [statusResult, runtimeResult] = await Promise.all([
        loadQuickValidation(false),
        refreshTrafficRuntimeAuthority()
      ]);
      if (!statusResult.ok || !statusResult.data) {
        return;
      }
      if (!runtimeResult.ok || !runtimeResult.data) {
        applyQuickValidationResult({
          ok: false,
          data: statusResult.data,
          blocker: runtimeResult.blocker ?? "traffic_runtime_unavailable",
          error: runtimeResult.error ?? "Unable to read the current saved traffic plan"
        });
        return;
      }
      if (quickValidationIsActive(statusResult.data)) {
        return;
      }
      const currentRun = statusResult.data.run;
      const observedRunId = currentRun?.id ?? null;
      const observedRunRevision = currentRun?.revision ?? null;
      if (
        runtimeResult.data.plan_revision !== confirmation.planRevision
        || observedRunId !== confirmation.expectedRunId
        || observedRunRevision !== confirmation.expectedRunRevision
      ) {
        applyQuickValidationResult({
          ok: false,
          data: statusResult.data,
          blocker: "quick_validation_confirmation_stale",
          error: (
            "The saved traffic plan or Quick Validation run changed after confirmation; "
            + "review the refreshed authority and confirm again"
          )
        });
        return;
      }
      const group = runtimeResult.data.groups.find(
        (candidate) => candidate.id === confirmation.groupId
      );
      if (!group) {
        applyQuickValidationResult({
          ok: false,
          data: statusResult.data,
          blocker: "quick_validation_group_changed",
          error: "The selected saved group changed; refresh Quick Validation and select it again"
        });
        return;
      }
      quickValidationCommandActiveRef.current = true;
      quickValidationRequestGenerationRef.current += 1;
      setIsQuickValidationLoading(false);
      commandFenced = true;
      const result = await startQuickValidation({
        expected_run_id: currentRun?.id ?? null,
        expected_run_revision: currentRun?.revision ?? null,
        group_id: group.id,
        plan_revision: runtimeResult.data.plan_revision,
        duration_seconds: confirmation.durationSeconds,
        confirmation: "start-quick-validation"
      });
      quickValidationRequestGenerationRef.current += 1;
      applyQuickValidationResult(result);
    } catch (caught) {
      if (commandFenced) {
        quickValidationRequestGenerationRef.current += 1;
      }
      applyQuickValidationResult({
        ok: false,
        data: quickValidationStatusAuthorityRef.current,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to start Quick Validation"
      });
    } finally {
      if (commandFenced) {
        quickValidationCommandActiveRef.current = false;
        setQuickValidationPollEpoch((current) => current + 1);
        await Promise.all([
          loadQuickValidation(false),
          refreshTrafficRuntimeAuthority()
        ]);
      }
      setIsQuickValidationBusy(false);
    }
  };

  const handleCancelQuickValidation = async (runId: string, runRevision: number) => {
    quickValidationCommandActiveRef.current = true;
    quickValidationRequestGenerationRef.current += 1;
    setIsQuickValidationLoading(false);
    setIsQuickValidationBusy(true);
    try {
      let result = await cancelQuickValidation({
        run_id: runId,
        run_revision: runRevision,
        confirmation: "cancel-quick-validation"
      });
      const retryRevision = quickValidationCancelRetryRevision(result, runId, runRevision);
      if (retryRevision !== null) {
        result = await cancelQuickValidation({
          run_id: runId,
          run_revision: retryRevision,
          confirmation: "cancel-quick-validation"
        });
      }
      quickValidationRequestGenerationRef.current += 1;
      applyQuickValidationResult(result);
      quickValidationCommandActiveRef.current = false;
      setQuickValidationPollEpoch((current) => current + 1);
      await refreshTrafficRuntimeAuthority();
    } catch (caught) {
      quickValidationRequestGenerationRef.current += 1;
      applyQuickValidationResult({
        ok: false,
        data: quickValidationStatusAuthorityRef.current,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to cancel Quick Validation"
      });
      quickValidationCommandActiveRef.current = false;
      setQuickValidationPollEpoch((current) => current + 1);
    } finally {
      quickValidationCommandActiveRef.current = false;
      setIsQuickValidationBusy(false);
    }
  };

  const handleCloseQuickValidation = () => {
    openWorkbenchDialog(null);
  };

  const handleOpenReports = () => {
    if (!openWorkbenchDialog("reports")) {
      return;
    }
    setRunReportGeneratedAt(new Date().toISOString());
    setIsRunReportsLoading(true);
    setIsRunReportSnapshotLoading(true);
    setIsRunReportTrendsLoading(true);
  };

  const handleRefreshRunReportSnapshot = async () => {
    setRunReportGeneratedAt(new Date().toISOString());
    setRunReportResult(null);
    await loadRunReportSnapshotInputs();
  };

  const handleSaveRunReport = async (): Promise<TrexResult<RunReportSaveResult>> => {
    setIsRunReportBusy(true);
    try {
      if (!runReportSnapshot) {
        const result: TrexResult<RunReportSaveResult> = {
          ok: false,
          data: null,
          blocker: "run_report_loading",
          error: "Run report builder is still loading"
        };
        setRunReportResult(result);
        return result;
      }
      const result = await saveRunReport({
        title: runReportSnapshot.title,
        markdown: runReportSnapshot.markdown,
        payload: runReportSnapshot.payload,
        file_name: runReportSnapshot.fileName,
        traffic_session_id: reportTrafficSession?.session.id ?? null,
        traffic_session_revision: reportTrafficSession?.session.revision ?? null
      });
      setRunReportResult(result);
      if (result.ok) {
        await Promise.all([loadRunReports(), loadRunReportTrends()]);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<RunReportSaveResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to save run report"
      };
      setRunReportResult(result);
      return result;
    } finally {
      setIsRunReportBusy(false);
    }
  };

  const handleDownloadRunReportArchive = async (
    fileName: string
  ): Promise<TrexResult<RunReportDownloadResult>> => {
    setIsRunReportBusy(true);
    try {
      const result = await downloadRunReport({ file_name: fileName });
      setRunReportResult(result);
      if (result.ok && result.data?.file.content) {
        downloadTextFile(result.data.file.name, result.data.file.content, "application/json");
      }
      return result;
    } catch (caught) {
      const result: TrexResult<RunReportDownloadResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to download run report"
      };
      setRunReportResult(result);
      return result;
    } finally {
      setIsRunReportBusy(false);
    }
  };

  const handleLoadRunReportArchive = async (
    fileName: string
  ): Promise<TrexResult<RunReportDownloadResult>> => {
    setIsRunReportBusy(true);
    try {
      const result = await downloadRunReport({ file_name: fileName });
      setRunReportResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<RunReportDownloadResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to load run report"
      };
      setRunReportResult(result);
      return result;
    } finally {
      setIsRunReportBusy(false);
    }
  };

  const handleDownloadRunReportArchiveCsv = async (
    fileName: string
  ): Promise<TrexResult<RunReportDownloadResult>> => {
    setIsRunReportBusy(true);
    try {
      const result = await downloadRunReport({ file_name: fileName });
      setRunReportResult(result);
      if (result.ok && result.data?.file.content) {
        const tools = runReportTools ?? await loadRunReportTools();
        setRunReportTools(tools);
        downloadTextFile(
          tools.runReportCsvFileName(result.data.file.name),
          tools.buildRunReportCsvFromArchiveContent(result.data.file.content),
          "text/csv"
        );
      }
      return result;
    } catch (caught) {
      const result: TrexResult<RunReportDownloadResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to download run report CSV"
      };
      setRunReportResult(result);
      return result;
    } finally {
      setIsRunReportBusy(false);
    }
  };

  const handleDownloadRunReportArchivePdf = async (
    fileName: string
  ): Promise<TrexResult<RunReportDownloadResult>> => {
    setIsRunReportBusy(true);
    try {
      const result = await downloadRunReport({ file_name: fileName });
      setRunReportResult(result);
      if (result.ok && result.data?.file.content) {
        const tools = runReportTools ?? await loadRunReportTools();
        setRunReportTools(tools);
        downloadBinaryFile(
          tools.runReportPdfFileName(result.data.file.name),
          tools.buildRunReportPdfFromArchiveContent(result.data.file.content),
          "application/pdf"
        );
      }
      return result;
    } catch (caught) {
      const result: TrexResult<RunReportDownloadResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to download run report PDF"
      };
      setRunReportResult(result);
      return result;
    } finally {
      setIsRunReportBusy(false);
    }
  };

  const handleDownloadRunReportMarkdown = () => {
    if (!runReportSnapshot) {
      return;
    }
    downloadTextFile(runReportSnapshot.fileName.replace(/\.json$/i, ".md"), runReportSnapshot.markdown, "text/markdown");
  };

  const handleDownloadCurrentRunReportCsv = () => {
    if (!runReportSnapshot || !runReportTools) {
      return;
    }
    downloadTextFile(
      runReportTools.runReportCsvFileName(runReportSnapshot.fileName),
      runReportTools.buildRunReportCsv(runReportSnapshot),
      "text/csv"
    );
  };

  const handleDownloadCurrentRunReportPdf = () => {
    if (!runReportSnapshot || !runReportTools) {
      return;
    }
    downloadBinaryFile(
      runReportTools.runReportPdfFileName(runReportSnapshot.fileName),
      runReportTools.buildRunReportPdf(runReportSnapshot),
      "application/pdf"
    );
  };

  const handleDownloadCurrentRunReportJson = () => {
    if (!runReportSnapshot) {
      return;
    }
    downloadTextFile(
      runReportSnapshot.fileName,
      JSON.stringify(
        {
          version: 1,
          title: runReportSnapshot.title,
          generated_at: runReportSnapshot.generatedAt,
          markdown: runReportSnapshot.markdown,
          payload: runReportSnapshot.payload
        },
        null,
        2
      ),
      "application/json"
    );
  };

  const handleStartCapture = async (
    request: CaptureStartRequest
  ): Promise<TrexResult<TrexCaptureStartResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await startCapture(request);
      setCaptureResult(result);
      if (result.ok && result.data?.captures) {
        setCaptureStatusFromRecords(result.data.captures, result.data.port_usage, result.data.service_mode);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCaptureStartResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to start capture"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  };

  const handleFetchCapture = useCallback(async (
    request: CaptureFetchRequest
  ): Promise<TrexResult<TrexCapturePacketResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await fetchCapture(request);
      setCaptureResult(result);
      if (result.data) {
        const data = result.data;
        setCapturePacketBuffer((current) => appendCapturePackets(current, data.packets));
        setCaptureStatusFromRecords(data.captures, data.port_usage, data.service_mode);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCapturePacketResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to fetch capture"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  }, [setCaptureStatusFromRecords]);

  const handleStopCapture = async (
    request: CaptureStopRequest
  ): Promise<TrexResult<TrexCapturePacketResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await stopCapture(request);
      setCaptureResult(result);
      if (result.data) {
        const data = result.data;
        setCapturePacketBuffer((current) => appendCapturePackets(current, data.packets));
        setCaptureStatusFromRecords(data.captures, data.port_usage, data.service_mode);
        if (request.save_pcap && data.saved_file?.content_base64) {
          downloadBase64File(data.saved_file.name, data.saved_file.content_base64, "application/vnd.tcpdump.pcap");
        }
        if (request.save_pcap && data.saved_file) {
          const modifiedTimestamp = data.saved_file.modified_time;
          const captureCompletedAt = modifiedTimestamp && Number.isFinite(Date.parse(modifiedTimestamp))
            ? modifiedTimestamp
            : new Date().toISOString();
          setTrafficRunSession((current) => {
            if (!current) {
              return current;
            }
            const currentTimestamp = current.captureCompletedAt
              ? Date.parse(current.captureCompletedAt)
              : Number.NEGATIVE_INFINITY;
            return currentTimestamp >= Date.parse(captureCompletedAt)
              ? current
              : { ...current, captureCompletedAt };
          });
          await loadCaptureFiles();
        }
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCapturePacketResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to stop capture"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  };

  const handleDownloadCaptureFile = async (
    request: CaptureFileRequest
  ): Promise<TrexResult<TrexCaptureFileDownloadResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await downloadCaptureFile(request);
      setCaptureResult(result);
      if (result.ok && result.data?.file.content_base64) {
        downloadBase64File(result.data.file.name, result.data.file.content_base64, "application/vnd.tcpdump.pcap");
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCaptureFileDownloadResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to download capture file"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  };

  const handleOpenCaptureFile = async (
    request: CaptureFileRequest
  ): Promise<TrexResult<TrexCaptureFileOpenResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await openCaptureFile(request);
      setCaptureResult(result);
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCaptureFileOpenResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to open capture file"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  };

  const handleRemoveAllCaptures = async (): Promise<TrexResult<TrexCaptureRemoveResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await removeAllCaptures();
      setCaptureResult(result);
      if (result.ok && result.data) {
        setCaptureStatusFromRecords(result.data.captures, result.data.port_usage, result.data.service_mode);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCaptureRemoveResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to remove captures"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  };

  const handleRemoveCapture = async (
    request: CaptureRemoveRequest
  ): Promise<TrexResult<TrexCaptureRemoveResult>> => {
    setIsCaptureBusy(true);
    try {
      const result = await removeCapture(request);
      setCaptureResult(result);
      if (result.ok && result.data) {
        setCaptureStatusFromRecords(result.data.captures, result.data.port_usage, result.data.service_mode);
      }
      return result;
    } catch (caught) {
      const result: TrexResult<TrexCaptureRemoveResult> = {
        ok: false,
        data: null,
        blocker: "frontend_request_failed",
        error: caught instanceof Error ? caught.message : "Unable to remove capture"
      };
      setCaptureResult(result);
      return result;
    } finally {
      setIsCaptureBusy(false);
    }
  };

  const handleClearCapturePackets = () => {
    setCapturePacketBuffer({ dropped: 0, packets: [] });
  };

  const handleOpenDaemon = () => {
    if (!openWorkbenchDialog("daemon")) {
      return;
    }
    void loadDaemonOverview();
  };

  const handleDaemonDisconnect = () => {
    setDaemonConnectionMessage(daemonDisconnectLog(daemonOverview?.environment ?? overview?.environment ?? null));
    setDaemonOverview(null);
    setDaemonConfigVersions(null);
    setDaemonConfigAudit(null);
    setDaemonConfigVersionDiff(null);
    setDaemonConfigVersionMessage(null);
    setDaemonDefaultConfig(null);
    setDaemonResult(null);
    setDaemonReservationResult(null);
    setDaemonConfigOverride(null);
    setDaemonConfigContent(null);
    setDaemonConfigValid(true);
    setDaemonError(null);
  };

  const handleCloseDaemon = () => {
    if (daemonOverview?.rpc.connected) {
      handleDaemonDisconnect();
    }
    setActiveDialog(null);
  };

  const handleLoadDaemonDefaultConfig = async () => {
    setIsDaemonConfigLoading(true);
    try {
      const result = await fetchDaemonDefaultConfig();
      setDaemonDefaultConfig(result);
      setDaemonConfigOverride(null);
      setDaemonConfigVersionDiff(null);
      setDaemonError(result.ok ? null : result.error ?? result.blocker ?? "Unable to get default config from TRex Daemon");
    } catch (caught) {
      setDaemonDefaultConfig(null);
      setDaemonError(caught instanceof Error ? caught.message : "Unable to get default config from TRex Daemon");
    } finally {
      setIsDaemonConfigLoading(false);
    }
  };

  const handleDaemonAction = async (action: "start" | "stop") => {
    const timeout = Number(daemonStartTimeout);
    if (action === "start" && (!Number.isFinite(timeout) || timeout < 1)) {
      setDaemonError("invalid start timeout");
      return;
    }
    if (action === "start" && !daemonConfigValid) {
      setDaemonError("TRex config is invalid");
      return;
    }
    if (
      action === "start"
      && (overview?.environment?.require_confirmation ?? true)
      && !window.confirm("Start TRex through the daemon with the current config preview?")
    ) {
      return;
    }
    if (
      action === "stop"
      && (overview?.environment?.require_confirmation ?? true)
      && !window.confirm("Stop TRex through the daemon on the configured host?")
    ) {
      return;
    }

    setIsDaemonBusy(true);
    try {
      const configContent = daemonConfigContent || daemonDefaultConfig?.content || daemonOverview?.config.content || null;
      const result = action === "start"
        ? await startDaemonTrex(configContent, timeout, "start-trex")
        : await stopDaemonTrex("stop-trex");
      setDaemonResult(result);
      const configVersion = result.config_version;
      if (configVersion) {
        setDaemonConfigVersions((current) => ({
          ok: true,
          source: current?.source ?? "local:daemon_config_versions",
          root_path: current?.root_path ?? null,
          limit: current?.limit ?? 50,
          versions: [
            configVersion,
            ...(current?.versions ?? []).filter((version) => version.name !== configVersion.name)
          ],
          blocker: null,
          error: null
        }));
      }
      setDaemonError(null);
      await Promise.allSettled([loadDaemonOverview(), handleConnect()]);
      if (action === "start" && result.ok && result.audit_record) {
        await refreshDaemonConfigAudit();
      }
    } catch (caught) {
      setDaemonError(caught instanceof Error ? caught.message : `Unable to run ${action}`);
    } finally {
      setIsDaemonBusy(false);
    }
  };

  const handleRefreshDaemonConfigVersions = async () => {
    setIsDaemonConfigVersionBusy(true);
    try {
      const [result, auditResult] = await Promise.all([
        refreshDaemonConfigVersions(),
        refreshDaemonConfigAudit()
      ]);
      setDaemonConfigVersionMessage(
        result.ok
          ? auditResult.ok
            ? `Loaded ${result.versions.length} config versions and ${auditResult.records.length} audit events`
            : auditResult.error ?? auditResult.blocker ?? "Unable to load config audit"
          : result.error ?? result.blocker ?? "Unable to load config versions"
      );
    } catch (caught) {
      setDaemonConfigVersionMessage(caught instanceof Error ? caught.message : "Unable to load config versions");
    } finally {
      setIsDaemonConfigVersionBusy(false);
    }
  };

  const handleSaveDaemonConfigVersion = async (content: string) => {
    setIsDaemonConfigVersionBusy(true);
    try {
      const result = await saveDaemonConfigVersion(content, "manual", "webui preview");
      setDaemonConfigVersionMessage(
        result.ok && result.version
          ? `Saved ${result.version.name}`
          : result.error ?? result.blocker ?? "Unable to save config version"
      );
      if (result.ok) {
        await refreshDaemonConfigVersions();
      }
    } catch (caught) {
      setDaemonConfigVersionMessage(caught instanceof Error ? caught.message : "Unable to save config version");
    } finally {
      setIsDaemonConfigVersionBusy(false);
    }
  };

  const handleLoadDaemonConfigVersion = async (name: string) => {
    setIsDaemonConfigVersionBusy(true);
    try {
      const result = await loadDaemonConfigVersion(name);
      if (result.ok) {
        setDaemonConfigOverride({ content: result.content, label: name });
        setDaemonDefaultConfig(null);
        setDaemonConfigContent(result.content);
        setDaemonConfigValid(true);
        setDaemonConfigVersionDiff(null);
      }
      setDaemonConfigVersionMessage(
        result.ok ? `Loaded ${name}` : result.error ?? result.blocker ?? "Unable to load config version"
      );
    } catch (caught) {
      setDaemonConfigVersionMessage(caught instanceof Error ? caught.message : "Unable to load config version");
    } finally {
      setIsDaemonConfigVersionBusy(false);
    }
  };

  const handleRestoreDaemonConfigVersion = async (name: string) => {
    const configPath = daemonOverview?.environment.config_path ?? overview?.environment?.config_path ?? "the configured TRex config path";
    if (
      (overview?.environment?.require_confirmation ?? true)
      && !window.confirm(`Restore config version ${name} to ${configPath}? Current config will be backed up first.`)
    ) {
      return;
    }

    setIsDaemonConfigVersionBusy(true);
    try {
      const result = await restoreDaemonConfigVersion(name, "restore-config");
      if (result.ok) {
        setDaemonConfigOverride(null);
        setDaemonDefaultConfig(null);
        setDaemonConfigContent(null);
        setDaemonConfigValid(true);
        setDaemonConfigVersionDiff(null);
        await loadDaemonOverview();
        await Promise.all([refreshDaemonConfigVersions(), refreshDaemonConfigAudit()]);
      }
      const beforeName = result.before_version?.name;
      setDaemonConfigVersionMessage(
        result.ok
          ? `Restored ${name}${beforeName ? `; backup ${beforeName}` : ""}${result.audit_written ? "" : "; audit write failed"}`
          : result.error ?? result.blocker ?? "Unable to restore config version"
      );
    } catch (caught) {
      setDaemonConfigVersionMessage(caught instanceof Error ? caught.message : "Unable to restore config version");
    } finally {
      setIsDaemonConfigVersionBusy(false);
    }
  };

  const handleDiffDaemonConfigVersion = async (name: string, content: string) => {
    setIsDaemonConfigVersionBusy(true);
    try {
      const result = await diffDaemonConfigVersion(name, content);
      setDaemonConfigVersionDiff(result);
      setDaemonConfigVersionMessage(
        result.ok ? `Diff ready for ${name}` : result.error ?? result.blocker ?? "Unable to diff config version"
      );
    } catch (caught) {
      setDaemonConfigVersionMessage(caught instanceof Error ? caught.message : "Unable to diff config version");
    } finally {
      setIsDaemonConfigVersionBusy(false);
    }
  };

  const handleDaemonReservationAction = async (action: "reserve" | "cancel") => {
    setIsDaemonReservationBusy(true);
    try {
      const result = action === "reserve"
        ? await reserveDaemonTrex(null)
        : await cancelDaemonTrexReservation(null);
      setDaemonReservationResult(result);
      setDaemonError(null);
      await refreshDaemonOverview();
    } catch (caught) {
      setDaemonError(caught instanceof Error ? caught.message : `Unable to ${action} TRex reservation`);
    } finally {
      setIsDaemonReservationBusy(false);
    }
  };

  const handleCopyLogs = (content: string) => {
    if (!navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(content);
  };

  const handleDaemonConfigContentChange = useCallback((content: string, valid: boolean) => {
    setDaemonConfigContent(content);
    setDaemonConfigValid(valid);
  }, []);

  const handleCloseProfiles = () => {
    const unsavedChangesMessage = profileStreamsDirty && trafficPlanDirty
      ? "Discard the unsaved Stream Builder changes and traffic plan assignments and close Traffic Profiles?"
      : profileStreamsDirty
        ? "Discard the unsaved Stream Builder changes and close Traffic Profiles?"
        : trafficPlanDirty
          ? "Discard unsaved traffic plan assignments and close Traffic Profiles?"
          : null;
    if (unsavedChangesMessage && !window.confirm(unsavedChangesMessage)) {
      return;
    }
    setTrafficPlanDirty(false);
    setActiveDialog(null);
  };

  const handleTrafficPlanStartResult = useCallback((result: TrexResult<TrafficStartResult>) => {
    setStartResult(result);
    const session = result.ok ? result.data?.session : null;
    if (session) {
      applyTrafficSessionResponse(session);
    }
  }, [applyTrafficSessionResponse]);

  return (
    <>
    <a className="skip-link" href="#workspace-main">Skip to main content</a>
    <main className="workbench-shell" id="workspace-main" tabIndex={-1}>
      <WorkbenchChrome
        activeCommand={activeCommand}
        isStarting={isStarting}
        runtimeControlDisabledReason={runtimeDisabledReason}
        onTrafficDurationEnabledChange={setTrafficDurationEnabled}
        onTrafficDurationValueChange={setTrafficDurationValue}
        onTrafficMultiplierUnitChange={setTrafficMultiplierUnit}
        onTrafficMultiplierValueChange={setTrafficMultiplierValue}
        onAcquirePorts={handleAcquirePorts}
        onClearStats={handleClearStats}
        isConnected={Boolean(overview?.trex_probe?.ok)}
        onDisconnect={handleDisconnect}
        onOpenConnect={() => { openWorkbenchDialog("connect"); }}
        onOpenCapture={handleOpenCapture}
        onOpenDashboard={() => { openWorkbenchDialog("dashboard"); }}
        onOpenDaemon={handleOpenDaemon}
        onOpenProfiles={() => { openWorkbenchDialog("profiles"); }}
        onOpenPreferences={() => { openWorkbenchDialog("preferences"); }}
        onOpenQuickValidation={handleOpenQuickValidation}
        onOpenReports={handleOpenReports}
        onOpenAbout={() => { openWorkbenchDialog("about"); }}
        onPauseTraffic={() => handleTrafficControl("pause")}
        onResumeTraffic={() => handleTrafficControl("resume")}
        onReleasePorts={handleReleasePorts}
        onStartAllTraffic={handleStartAllTraffic}
        onStartTraffic={handleStartTraffic}
        onStopAllTraffic={handleStopAllTraffic}
        onStopTraffic={() => handleTrafficControl("stop")}
        onUpdateTraffic={handleUpdateTraffic}
        trafficDurationEnabled={trafficDurationEnabled}
        trafficDurationError={trafficDuration.error}
        trafficDurationValue={trafficDurationValue}
        trafficMultiplierError={trafficMultiplier.error}
        trafficMultiplierUnit={trafficMultiplierUnit}
        trafficMultiplierValue={trafficMultiplierValue}
      />

      <section className="workbench-body">
        <TopologyPane
          overview={overview}
          onSelectPort={setSelectedPortId}
          portStates={topologyPortStates}
          portRecords={portRecords}
          profileByPort={topologyProfileByPort}
          selectedPortId={selectedPort?.id ?? null}
        />

        <section className="workspace-pane">
          <div className="workspace-content">
            <PortControlWorkspace
              activeCommand={activeCommand}
              hardwareCounterResult={hardwareCounterResult}
              isHardwareCountersLoading={isHardwareCountersLoading}
              onAcquirePorts={handleAcquirePorts}
              onApplyPortConfiguration={handleApplyPortConfiguration}
              onForceAcquirePorts={handleForceAcquirePorts}
              onPingFromPort={handlePingFromPort}
              onRefreshHardwareCounters={handleRefreshHardwareCounters}
              onResolveArp={handleResolveArp}
              onReleasePorts={handleReleasePorts}
              onResetHardwareCounters={handleResetHardwareCounters}
              onResetPorts={handleResetPorts}
              onScanIpv6={handleScanIpv6}
              onSetPortAttribute={handleSetSelectedPortAttribute}
              onSetServiceMode={handleSetSelectedPortServiceMode}
              overview={overview}
              captureSummary={selectedPortCaptureSummary}
              selectedPort={selectedPort}
              selectedPortTransmitting={selectedPortTransmitting}
            />

            {activeDialog === "connect" ? (
              <FloatingWindow title="Connect" onClose={() => setActiveDialog(null)} size="connect">
                <ConnectWorkspace
                  error={error}
                  isConnecting={isConnecting}
                  overview={overview}
                  onClose={() => setActiveDialog(null)}
                  onConnect={handleConnect}
                />
              </FloatingWindow>
            ) : null}

            {activeDialog === "dashboard" ? (
              <FloatingWindow title="Dashboard" onClose={() => setActiveDialog(null)} size="wide">
                <Suspense fallback={WORKSPACE_LOADING_FALLBACK}>
                  <DashboardWorkspace
                    isStatsLoading={isStatsLoading}
                    onClearStats={handleClearStats}
                    portRecords={portRecords}
                    startResult={startResult}
                    statsHistory={statsHistory}
                    statsResult={statsResult}
                  />
                </Suspense>
              </FloatingWindow>
            ) : null}

            {activeDialog === "profiles" ? (
              <FloatingWindow title="Traffic Profiles" onClose={handleCloseProfiles} size="large">
                <Suspense fallback={WORKSPACE_LOADING_FALLBACK}>
                  <TrafficProfilesWorkspace
                    activeCommand={activeCommand}
                    builderProfileName={builderProfileName}
                    isProfileWorkbenchBusy={isProfileWorkbenchBusy}
                    isProfilesLoading={isProfilesLoading}
                    isStarting={isStarting}
                    onBuildStream={handleBuildStream}
                    onBuilderProfileNameChange={handleBuilderProfileNameChange}
                    onCreateProfile={handleCreateWorkbenchProfile}
                    onDeleteProfile={handleDeleteProfile}
                    onDuplicateProfile={handleDuplicateProfile}
                    onExportProfileJson={handleExportProfileJson}
                    onExportProfileYaml={handleExportWorkbenchYaml}
                    onExportPcap={handleExportWorkbenchPcap}
                    onImportPcap={handleImportWorkbenchPcap}
                    onDeleteStream={handleDeleteStream}
                    onDuplicateStream={handleDuplicateStream}
                    onLoadProfile={handleLoadWorkbenchProfile}
                    onRenderProfilePreview={handleRenderProfilePreview}
                    onProfilePathChange={handleProfilePathChange}
                    onProfileTunablesChange={setProfileTunables}
                    onSelectedStreamIndexChange={setSelectedStreamIndex}
                    onStartAllTraffic={handleStartAllTraffic}
                    onStartTraffic={handleStartTraffic}
                    onStreamChange={handleStreamChange}
                    onTrafficDurationEnabledChange={setTrafficDurationEnabled}
                    onTrafficDurationValueChange={setTrafficDurationValue}
                    onTrafficPlanDirtyChange={setTrafficPlanDirty}
                    onTrafficRuntimeChange={applyTrafficRuntimeSnapshot}
                    onTrafficStartResult={handleTrafficPlanStartResult}
                    onTrafficMultiplierUnitChange={setTrafficMultiplierUnit}
                    onTrafficMultiplierValueChange={setTrafficMultiplierValue}
                    onUpdateTraffic={handleUpdateTraffic}
                    profileCatalog={profileCatalog}
                    profileCommandResult={profileCommandResult}
                    profileError={profileError}
                    profileOptions={profileOptions}
                    profilePacketPreviews={profilePacketPreviews}
                    profileWorkbenchResult={profileWorkbenchResult}
                    portRecords={portRecords}
                    profilePath={profilePath}
                    requireConfirmation={overview?.environment?.require_confirmation ?? true}
                    streamBuilderEnabled={!isPythonProfile}
                    profileTunables={profileTunables}
                    profileTunablesEnabled={Boolean(isPythonProfile)}
                    profileTunablesError={parsedProfileTunables.error}
                    runtimeControlDisabledReason={runtimeDisabledReason}
                    selectedStreamIndex={selectedStreamIndex}
                    selectedProfile={selectedProfile}
                    selectedStreamValidationError={selectedStreamValidationError}
                    streams={profileStreams}
                    trafficDurationEnabled={trafficDurationEnabled}
                    trafficDurationError={trafficDuration.error}
                    trafficDurationValue={trafficDurationValue}
                    trafficMultiplierError={trafficMultiplier.error}
                    trafficMultiplierPreview={trafficMultiplier.ok ? trafficMultiplier.value : null}
                    trafficMultiplierUnit={trafficMultiplierUnit}
                    trafficMultiplierValue={trafficMultiplierValue}
                    workbenchProfileValidationError={workbenchProfileValidationError}
                    workbenchStreamValidationError={workbenchStreamValidationError}
                  />
                </Suspense>
              </FloatingWindow>
            ) : null}

            {activeDialog === "capture" ? (
              <FloatingWindow title="Packet Capture" onClose={() => setActiveDialog(null)} size="wide">
                <Suspense fallback={WORKSPACE_LOADING_FALLBACK}>
                  <PacketCaptureWorkspace
                    captureFilesResult={captureFilesResult}
                    captureDroppedPacketCount={capturePacketBuffer.dropped}
                    capturePackets={capturePackets}
                    captureResult={captureResult}
                    captureStatusResult={captureStatusResult}
                    isCaptureBusy={isCaptureBusy}
                    isCaptureFilesLoading={isCaptureFilesLoading}
                    isCaptureStatusLoading={isCaptureStatusLoading}
                    portRecords={portRecords}
                    runtimeControlDisabledReason={runtimeDisabledReason}
                    onClearPackets={handleClearCapturePackets}
                    onDownloadCaptureFile={handleDownloadCaptureFile}
                    onFetchCapture={handleFetchCapture}
                    onOpenCaptureFile={handleOpenCaptureFile}
                    onRefreshFiles={loadCaptureFiles}
                    onRefreshStatus={loadCaptureStatus}
                    onRemoveCapture={handleRemoveCapture}
                    onRemoveAllCaptures={handleRemoveAllCaptures}
                    onStartCapture={handleStartCapture}
                    onStopCapture={handleStopCapture}
                  />
                </Suspense>
              </FloatingWindow>
            ) : null}

            {activeDialog === "quick-validation" ? (
              <FloatingWindow title="Quick Validation" onClose={handleCloseQuickValidation} size="wide">
                <Suspense fallback={WORKSPACE_LOADING_FALLBACK}>
                  <QuickValidationWorkspace
                    isBusy={isQuickValidationBusy}
                    isLoading={isQuickValidationLoading}
                    onCancel={handleCancelQuickValidation}
                    onRefresh={handleRefreshQuickValidation}
                    onStart={handleStartQuickValidation}
                    result={quickValidationResult}
                    trafficRuntime={trafficRuntime}
                  />
                </Suspense>
              </FloatingWindow>
            ) : null}

            {activeDialog === "reports" ? (
              <FloatingWindow title="Run Reports" onClose={() => setActiveDialog(null)} size="wide">
                <Suspense fallback={WORKSPACE_LOADING_FALLBACK}>
                  {runReportSnapshot ? (
                    <RunReportsWorkspace
                      isBusy={isRunReportBusy}
                      isReportsLoading={isRunReportsLoading}
                      isSnapshotLoading={isRunReportSnapshotLoading}
                      isTrendsLoading={isRunReportTrendsLoading}
                      onDownloadArchive={handleDownloadRunReportArchive}
                      onDownloadArchiveCsv={handleDownloadRunReportArchiveCsv}
                      onDownloadArchivePdf={handleDownloadRunReportArchivePdf}
                      onDownloadCurrentCsv={handleDownloadCurrentRunReportCsv}
                      onDownloadCurrentJson={handleDownloadCurrentRunReportJson}
                      onDownloadCurrentPdf={handleDownloadCurrentRunReportPdf}
                      onDownloadMarkdown={handleDownloadRunReportMarkdown}
                      onLoadArchive={handleLoadRunReportArchive}
                      onRefreshReports={loadRunReports}
                      onRefreshTrends={loadRunReportTrends}
                      onRefreshSnapshot={handleRefreshRunReportSnapshot}
                      onReportTemplateChange={setRunReportTemplateId}
                      onSaveReport={handleSaveRunReport}
                      reportTemplateId={runReportTemplateId}
                      reportResult={runReportResult}
                      reportsResult={runReportsResult}
                      trendsResult={runReportTrendsResult}
                      snapshot={runReportSnapshot}
                    />
                  ) : WORKSPACE_LOADING_FALLBACK}
                </Suspense>
              </FloatingWindow>
            ) : null}

            {activeDialog === "preferences" ? (
              <FloatingWindow title="Preferences" onClose={() => setActiveDialog(null)} size="compact">
                <PreferencesWorkspace
                  environment={overview?.environment ?? null}
                  onClose={() => setActiveDialog(null)}
                />
              </FloatingWindow>
            ) : null}

            {activeDialog === "daemon" ? (
              <FloatingWindow title="TRex Daemon" onClose={handleCloseDaemon} size="large">
                <Suspense fallback={WORKSPACE_LOADING_FALLBACK}>
                  <TrexDaemonDialog
                    daemonConnectionMessage={daemonConnectionMessage}
                    daemonConfigAudit={daemonConfigAudit}
                    daemonConfigOverride={daemonConfigOverride}
                    daemonConfigVersionDiff={daemonConfigVersionDiff}
                    daemonConfigVersionMessage={daemonConfigVersionMessage}
                    daemonConfigVersions={daemonConfigVersions}
                    daemonDefaultConfig={daemonDefaultConfig}
                    daemonError={daemonError}
                    daemonOverview={daemonOverview}
                    daemonReservationResult={daemonReservationResult}
                    daemonResult={daemonResult}
                    environment={overview?.environment ?? null}
                    isDaemonBusy={isDaemonBusy}
                    isConfigVersionBusy={isDaemonConfigVersionBusy}
                    isDaemonReservationBusy={isDaemonReservationBusy}
                    isConfigLoading={isDaemonConfigLoading}
                    isDaemonLoading={isDaemonLoading}
                    onConnect={loadDaemonOverview}
                    onConfigContentChange={handleDaemonConfigContentChange}
                    onDaemonAction={handleDaemonAction}
                    onDaemonReservationAction={handleDaemonReservationAction}
                    onDisconnect={handleDaemonDisconnect}
                    onDiffConfigVersion={handleDiffDaemonConfigVersion}
                    onLoadDefaultConfig={handleLoadDaemonDefaultConfig}
                    onLoadConfigVersion={handleLoadDaemonConfigVersion}
                    onRefreshConfigVersions={handleRefreshDaemonConfigVersions}
                    onRestoreConfigVersion={handleRestoreDaemonConfigVersion}
                    onSaveConfigVersion={handleSaveDaemonConfigVersion}
                    onStartTimeoutChange={setDaemonStartTimeout}
                    startTimeout={daemonStartTimeout}
                  />
                </Suspense>
              </FloatingWindow>
            ) : null}

            {activeDialog === "about" ? (
              <FloatingWindow title="TRex" onClose={() => setActiveDialog(null)} variant="about">
                <section className="about-dialog" aria-label="About TRex">
                  <div className="about-mark">T</div>
                  <strong>{aboutTrexVersionLabel(overview?.trex_ports?.data?.server_version)}</strong>
                  <button className="normal-button" onClick={() => setActiveDialog(null)} type="button">OK</button>
                </section>
              </FloatingWindow>
            ) : null}
          </div>
        </section>
      </section>

      <LogDock apiLogs={apiLogEntries} rows={logRows} onCopyLogs={handleCopyLogs} />
      <StatusFooter connected={Boolean(overview?.trex_probe?.ok)} />
    </main>
    </>
  );
}
