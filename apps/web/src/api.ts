export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export type JsonObject = {
  [key: string]: JsonValue;
};

export type EnvironmentReadiness = {
  host: string;
  sync_port: number;
  async_port: number;
  scapy_port: number;
  client_name: string;
  connect_timeout_seconds: number;
  daemon_port: number;
  scripts_dir: string;
  daemon_bin: string;
  config_path: string;
  daemon_log: string;
  profile_roots: string[];
  host_valid: boolean;
  scripts_dir_path_valid: boolean;
  daemon_bin_path_valid: boolean;
  config_path_valid: boolean;
  daemon_log_path_valid: boolean;
  scripts_dir_exists: boolean;
  daemon_bin_exists: boolean;
  config_parent_exists: boolean;
  daemon_log_parent_exists: boolean;
  profile_roots_existing: string[];
  command_timeout_seconds: number;
  require_confirmation: boolean;
  daemon_supervisor: "external" | "systemd";
  capture_open_command: string[];
  configuration_errors: Record<string, string>;
};

export type DaemonAction = "show" | "start" | "stop" | "restart" | "start-live";

export type DaemonPreview = {
  action: DaemonAction;
  command: string[];
  requires_confirmation: boolean;
  daemon_bin_exists: boolean;
  working_directory: string;
  available: boolean;
  blocker?: string | null;
};

export type TrexProbe = {
  ok: boolean;
  blocker?: string | null;
  error?: string | null;
  server_version?: JsonValue | null;
  system_info?: JsonValue | null;
};

export type TrexPortRecord = {
  id: number;
  acquired: boolean;
  info: JsonObject;
};

export type TrexPortsSnapshot = {
  server_version: JsonValue | null;
  system_info: JsonValue | null;
  port_ids: number[];
  acquired_ports: number[];
  ports: TrexPortRecord[];
  warnings: JsonValue[];
};

export type TrexResult<T> = {
  ok: boolean;
  data: T | null;
  blocker?: string | null;
  error?: string | null;
};

export type TrexSampledResult<T> = TrexResult<T> & {
  sequence: number;
  sample_time: string;
};

export type ProfileRootRecord = {
  path: string;
  exists: boolean;
  readable: boolean;
  profile_count: number;
  blocker?: string | null;
  error?: string | null;
};

export type ProfileRecord = {
  name: string;
  path: string;
  relative_path: string;
  root: string;
  suffix: string;
  kind: string;
  size_bytes: number;
  modified_time: string;
  previewable: boolean;
  tunables?: ProfileTunableRecord[];
};

export type ProfileTunableRecord = {
  name: string;
  required?: boolean;
  default?: string | number | boolean | null;
  choices?: Array<string | number | boolean>;
  type?: string;
};

export type ProfileCatalog = {
  roots: ProfileRootRecord[];
  profiles: ProfileRecord[];
  supported_suffixes: string[];
};

export type ProfilePreview = {
  profile: ProfileRecord;
  preview_available: boolean;
  content: string | null;
  truncated: boolean;
  bytes_read: number;
  max_bytes: number;
};

export type ProfileWorkbenchStream = {
  name: string;
  packet_type:
    | "Ethernet"
    | "Ethernet/ARP"
    | "Ethernet/IPv4"
    | "Ethernet/IPv6"
    | "Ethernet/IPv4/UDP"
    | "Ethernet/IPv4/TCP"
    | "Ethernet/IPv4/ICMP"
    | "Ethernet/IPv4/GRE"
    | "Ethernet/IPv4/SCTP"
    | "Ethernet/IPv6/UDP"
    | "Ethernet/IPv6/TCP"
    | "Ethernet/IPv6/ICMPv6"
    | "Ethernet/IPv6/GRE"
    | "Ethernet/IPv6/SCTP";
  frame_length_type: "Fixed" | "Increment" | "Decrement" | "Random";
  frame_length: number;
  frame_length_min: number;
  frame_length_max: number;
  mode: "continuous" | "burst" | "multi_burst";
  rate_type: "pps" | "bps L1" | "bps L2" | "percentage";
  rate_value: number;
  enabled: boolean;
  self_start: boolean;
  total_pkts: number;
  pkts_per_burst: number;
  count: number;
  next_stream_id: number | null;
  action_count: number;
  isg: number;
  ibg: number;
  pg_id: number;
  flow_stats_enabled: boolean;
  latency_enabled: boolean;
  ether_dst: string;
  ether_src: string;
  ether_type_override: boolean;
  ether_type: string;
  ether_dst_mode: "Fixed" | "Increment" | "Decrement" | "TRex Config";
  ether_dst_count: number;
  ether_dst_step: number;
  ether_src_mode: "Fixed" | "Increment" | "Decrement" | "TRex Config";
  ether_src_count: number;
  ether_src_step: number;
  arp_hardware_type: number;
  arp_protocol_type: string;
  arp_hardware_size: number;
  arp_protocol_size: number;
  arp_operation: number;
  arp_operation_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  arp_operation_count: number;
  arp_operation_step: number;
  arp_sender_mac: string;
  arp_sender_mac_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  arp_sender_mac_count: number;
  arp_sender_mac_step: number;
  arp_sender_ip: string;
  arp_sender_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  arp_sender_ip_count: number;
  arp_sender_ip_step: number;
  arp_target_mac: string;
  arp_target_mac_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  arp_target_mac_count: number;
  arp_target_mac_step: number;
  arp_target_ip: string;
  arp_target_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  arp_target_ip_count: number;
  arp_target_ip_step: number;
  vlan_enabled: boolean;
  vlan_tpid_override: boolean;
  vlan_tpid: string;
  vlan_priority: number;
  vlan_priority_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vlan_priority_count: number;
  vlan_priority_step: number;
  vlan_cfi: number;
  vlan_id: number;
  vlan_id_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vlan_id_count: number;
  vlan_id_step: number;
  vlan2_enabled: boolean;
  vlan2_tpid_override: boolean;
  vlan2_tpid: string;
  vlan2_priority: number;
  vlan2_priority_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vlan2_priority_count: number;
  vlan2_priority_step: number;
  vlan2_cfi: number;
  vlan2_id: number;
  vlan2_id_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vlan2_id_count: number;
  vlan2_id_step: number;
  mpls_enabled: boolean;
  mpls_label: number;
  mpls_label_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label_count: number;
  mpls_label_step: number;
  mpls_tc: number;
  mpls_tc_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_tc_count: number;
  mpls_tc_step: number;
  mpls_ttl: number;
  mpls_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_ttl_count: number;
  mpls_ttl_step: number;
  mpls_label2_enabled: boolean;
  mpls_label2: number;
  mpls_label2_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label2_count: number;
  mpls_label2_step: number;
  mpls_label2_tc: number;
  mpls_label2_tc_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label2_tc_count: number;
  mpls_label2_tc_step: number;
  mpls_label2_ttl: number;
  mpls_label2_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label2_ttl_count: number;
  mpls_label2_ttl_step: number;
  mpls_label3_enabled: boolean;
  mpls_label3: number;
  mpls_label3_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label3_count: number;
  mpls_label3_step: number;
  mpls_label3_tc: number;
  mpls_label3_tc_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label3_tc_count: number;
  mpls_label3_tc_step: number;
  mpls_label3_ttl: number;
  mpls_label3_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  mpls_label3_ttl_count: number;
  mpls_label3_ttl_step: number;
  vxlan_enabled: boolean;
  vxlan_vni: number;
  vxlan_vni_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vxlan_vni_count: number;
  vxlan_vni_step: number;
  vxlan_inner_ether_dst: string;
  vxlan_inner_ether_src: string;
  vxlan_inner_ip_version: "IPv4" | "IPv6";
  vxlan_inner_ipv4_src: string;
  vxlan_inner_ipv4_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  vxlan_inner_ipv4_src_count: number;
  vxlan_inner_ipv4_src_step: number;
  vxlan_inner_ipv4_dst: string;
  vxlan_inner_ipv4_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  vxlan_inner_ipv4_dst_count: number;
  vxlan_inner_ipv4_dst_step: number;
  vxlan_inner_ipv4_ttl: number;
  vxlan_inner_ipv4_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vxlan_inner_ipv4_ttl_count: number;
  vxlan_inner_ipv4_ttl_step: number;
  vxlan_inner_ipv6_src: string;
  vxlan_inner_ipv6_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  vxlan_inner_ipv6_src_count: number;
  vxlan_inner_ipv6_src_step: number;
  vxlan_inner_ipv6_dst: string;
  vxlan_inner_ipv6_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  vxlan_inner_ipv6_dst_count: number;
  vxlan_inner_ipv6_dst_step: number;
  vxlan_inner_ipv6_hop_limit: number;
  vxlan_inner_ipv6_hop_limit_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vxlan_inner_ipv6_hop_limit_count: number;
  vxlan_inner_ipv6_hop_limit_step: number;
  vxlan_inner_l4_src_port: number;
  vxlan_inner_l4_src_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vxlan_inner_l4_src_port_count: number;
  vxlan_inner_l4_src_port_step: number;
  vxlan_inner_l4_dst_port: number;
  vxlan_inner_l4_dst_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  vxlan_inner_l4_dst_port_count: number;
  vxlan_inner_l4_dst_port_step: number;
  gtpu_enabled: boolean;
  gtpu_message_type: number;
  gtpu_teid: number;
  gtpu_teid_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_teid_count: number;
  gtpu_teid_step: number;
  gtpu_sequence_enabled: boolean;
  gtpu_sequence: number;
  gtpu_sequence_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_sequence_count: number;
  gtpu_sequence_step: number;
  gtpu_npdu_enabled: boolean;
  gtpu_npdu: number;
  gtpu_npdu_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_npdu_count: number;
  gtpu_npdu_step: number;
  gtpu_extension_enabled: boolean;
  gtpu_extension_udp_port: number;
  gtpu_extension_udp_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_extension_udp_port_count: number;
  gtpu_extension_udp_port_step: number;
  gtpu_inner_ip_version: "IPv4" | "IPv6";
  gtpu_inner_ipv4_src: string;
  gtpu_inner_ipv4_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gtpu_inner_ipv4_src_count: number;
  gtpu_inner_ipv4_src_step: number;
  gtpu_inner_ipv4_dst: string;
  gtpu_inner_ipv4_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gtpu_inner_ipv4_dst_count: number;
  gtpu_inner_ipv4_dst_step: number;
  gtpu_inner_ipv4_ttl: number;
  gtpu_inner_ipv4_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_inner_ipv4_ttl_count: number;
  gtpu_inner_ipv4_ttl_step: number;
  gtpu_inner_ipv6_src: string;
  gtpu_inner_ipv6_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gtpu_inner_ipv6_src_count: number;
  gtpu_inner_ipv6_src_step: number;
  gtpu_inner_ipv6_dst: string;
  gtpu_inner_ipv6_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gtpu_inner_ipv6_dst_count: number;
  gtpu_inner_ipv6_dst_step: number;
  gtpu_inner_ipv6_hop_limit: number;
  gtpu_inner_ipv6_hop_limit_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_inner_ipv6_hop_limit_count: number;
  gtpu_inner_ipv6_hop_limit_step: number;
  gtpu_inner_l4_src_port: number;
  gtpu_inner_l4_src_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_inner_l4_src_port_count: number;
  gtpu_inner_l4_src_port_step: number;
  gtpu_inner_l4_dst_port: number;
  gtpu_inner_l4_dst_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gtpu_inner_l4_dst_port_count: number;
  gtpu_inner_l4_dst_port_step: number;
  gre_checksum_present: boolean;
  gre_checksum_override: boolean;
  gre_checksum: string;
  gre_key_present: boolean;
  gre_key: number;
  gre_key_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gre_key_count: number;
  gre_key_step: number;
  gre_sequence_present: boolean;
  gre_sequence: number;
  gre_sequence_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gre_sequence_count: number;
  gre_sequence_step: number;
  gre_protocol_type: string;
  gre_inner_ip_version: "IPv4" | "IPv6";
  gre_inner_ipv4_src: string;
  gre_inner_ipv4_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gre_inner_ipv4_src_count: number;
  gre_inner_ipv4_src_step: number;
  gre_inner_ipv4_dst: string;
  gre_inner_ipv4_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gre_inner_ipv4_dst_count: number;
  gre_inner_ipv4_dst_step: number;
  gre_inner_ipv4_ttl: number;
  gre_inner_ipv4_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gre_inner_ipv4_ttl_count: number;
  gre_inner_ipv4_ttl_step: number;
  gre_inner_ipv6_src: string;
  gre_inner_ipv6_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gre_inner_ipv6_src_count: number;
  gre_inner_ipv6_src_step: number;
  gre_inner_ipv6_dst: string;
  gre_inner_ipv6_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  gre_inner_ipv6_dst_count: number;
  gre_inner_ipv6_dst_step: number;
  gre_inner_ipv6_hop_limit: number;
  gre_inner_ipv6_hop_limit_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gre_inner_ipv6_hop_limit_count: number;
  gre_inner_ipv6_hop_limit_step: number;
  gre_inner_l4_src_port: number;
  gre_inner_l4_src_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gre_inner_l4_src_port_count: number;
  gre_inner_l4_src_port_step: number;
  gre_inner_l4_dst_port: number;
  gre_inner_l4_dst_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  gre_inner_l4_dst_port_count: number;
  gre_inner_l4_dst_port_step: number;
  ipv4_src: string;
  ipv4_dst: string;
  ipv4_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  ipv4_src_count: number | string;
  ipv4_src_step: number;
  ipv4_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  ipv4_dst_count: number | string;
  ipv4_dst_step: number;
  ipv4_dscp: number;
  ipv4_dscp_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv4_dscp_count: number;
  ipv4_dscp_step: number;
  ipv4_ecn: number;
  ipv4_ecn_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv4_ecn_count: number;
  ipv4_ecn_step: number;
  ipv4_id: number;
  ipv4_id_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv4_id_count: number;
  ipv4_id_step: number;
  ipv4_flag_df: boolean;
  ipv4_flag_mf: boolean;
  ipv4_fragment_offset: number;
  ipv4_fragment_offset_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv4_fragment_offset_count: number;
  ipv4_fragment_offset_step: number;
  ipv4_ttl: number;
  ipv4_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv4_ttl_count: number;
  ipv4_ttl_step: number;
  ipv4_checksum_override: boolean;
  ipv4_checksum: string;
  ipv6_src: string;
  ipv6_dst: string;
  ipv6_src_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  ipv6_src_count: number;
  ipv6_src_step: number;
  ipv6_dst_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  ipv6_dst_count: number;
  ipv6_dst_step: number;
  ipv6_traffic_class: number;
  ipv6_traffic_class_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv6_traffic_class_count: number;
  ipv6_traffic_class_step: number;
  ipv6_flow_label: number;
  ipv6_flow_label_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv6_flow_label_count: number;
  ipv6_flow_label_step: number;
  ipv6_hop_limit: number;
  ipv6_hop_limit_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  ipv6_hop_limit_count: number;
  ipv6_hop_limit_step: number;
  l4_src_port_override: boolean;
  l4_src_port: number;
  l4_src_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  l4_src_port_count: number;
  l4_src_port_step: number;
  l4_dst_port_override: boolean;
  l4_dst_port: number;
  l4_dst_port_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  l4_dst_port_count: number;
  l4_dst_port_step: number;
  udp_length_override: boolean;
  udp_length: number;
  udp_length_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  udp_length_count: number;
  udp_length_step: number;
  udp_checksum_override: boolean;
  udp_checksum: string;
  udp_checksum_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  udp_checksum_count: number;
  udp_checksum_step: number;
  dns_enabled: boolean;
  dns_transaction_id: number;
  dns_transaction_id_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dns_transaction_id_count: number;
  dns_transaction_id_step: number;
  dns_flags: string;
  dns_flags_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dns_flags_count: number;
  dns_flags_step: number;
  dns_query_name: string;
  dns_query_type: number;
  dns_query_type_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dns_query_type_count: number;
  dns_query_type_step: number;
  dns_query_class: number;
  dns_query_class_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dns_query_class_count: number;
  dns_query_class_step: number;
  dns_answer_enabled: boolean;
  dns_answer_ttl: number;
  dns_answer_ttl_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dns_answer_ttl_count: number;
  dns_answer_ttl_step: number;
  dns_answer_ipv4: string;
  dns_answer_ipv4_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dns_answer_ipv4_count: number;
  dns_answer_ipv4_step: number;
  dhcp_enabled: boolean;
  dhcp_operation: number;
  dhcp_operation_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_operation_count: number;
  dhcp_operation_step: number;
  dhcp_hops: number;
  dhcp_hops_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_hops_count: number;
  dhcp_hops_step: number;
  dhcp_seconds: number;
  dhcp_seconds_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_seconds_count: number;
  dhcp_seconds_step: number;
  dhcp_message_type: number;
  dhcp_message_type_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_message_type_count: number;
  dhcp_message_type_step: number;
  dhcp_xid: number;
  dhcp_xid_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_xid_count: number;
  dhcp_xid_step: number;
  dhcp_flags: string;
  dhcp_flags_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_flags_count: number;
  dhcp_flags_step: number;
  dhcp_client_ip: string;
  dhcp_client_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dhcp_client_ip_count: number;
  dhcp_client_ip_step: number;
  dhcp_your_ip: string;
  dhcp_your_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dhcp_your_ip_count: number;
  dhcp_your_ip_step: number;
  dhcp_server_ip: string;
  dhcp_server_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dhcp_server_ip_count: number;
  dhcp_server_ip_step: number;
  dhcp_relay_ip: string;
  dhcp_relay_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dhcp_relay_ip_count: number;
  dhcp_relay_ip_step: number;
  dhcp_client_mac: string;
  dhcp_client_mac_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_client_mac_count: number;
  dhcp_client_mac_step: number;
  dhcp_hostname: string;
  dhcp_requested_ip: string;
  dhcp_requested_ip_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dhcp_requested_ip_count: number;
  dhcp_requested_ip_step: number;
  dhcp_server_id: string;
  dhcp_server_id_mode: "Fixed" | "Increment Host" | "Decrement Host" | "Random Host";
  dhcp_server_id_count: number;
  dhcp_server_id_step: number;
  dhcp_parameter_request_list: string;
  dhcp_lease_time: number;
  dhcp_lease_time_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_lease_time_count: number;
  dhcp_lease_time_step: number;
  dhcp_renewal_time: number;
  dhcp_renewal_time_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_renewal_time_count: number;
  dhcp_renewal_time_step: number;
  dhcp_rebinding_time: number;
  dhcp_rebinding_time_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  dhcp_rebinding_time_count: number;
  dhcp_rebinding_time_step: number;
  icmp_type: number;
  icmp_type_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  icmp_type_count: number;
  icmp_type_step: number;
  icmp_code: number;
  icmp_code_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  icmp_code_count: number;
  icmp_code_step: number;
  icmp_checksum_override: boolean;
  icmp_checksum: string;
  icmp_identifier: number;
  icmp_identifier_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  icmp_identifier_count: number;
  icmp_identifier_step: number;
  icmp_sequence: number;
  icmp_sequence_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  icmp_sequence_count: number;
  icmp_sequence_step: number;
  icmpv6_nd_target: string;
  icmpv6_nd_include_option: boolean;
  icmpv6_nd_option_mac: string;
  icmpv6_nd_na_router: boolean;
  icmpv6_nd_na_solicited: boolean;
  icmpv6_nd_na_override: boolean;
  icmpv6_rs_include_slla: boolean;
  icmpv6_rs_slla_mac: string;
  icmpv6_ra_cur_hop_limit: number;
  icmpv6_ra_managed: boolean;
  icmpv6_ra_other: boolean;
  icmpv6_ra_router_lifetime: number;
  icmpv6_ra_reachable_time: number;
  icmpv6_ra_retrans_timer: number;
  icmpv6_ra_include_slla: boolean;
  icmpv6_ra_slla_mac: string;
  icmpv6_ra_include_prefix: boolean;
  icmpv6_ra_prefix: string;
  icmpv6_ra_prefix_length: number;
  icmpv6_ra_prefix_on_link: boolean;
  icmpv6_ra_prefix_autonomous: boolean;
  icmpv6_ra_prefix_valid_lifetime: number;
  icmpv6_ra_prefix_preferred_lifetime: number;
  tcp_sequence_number: number;
  tcp_sequence_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_sequence_count: number;
  tcp_sequence_step: number;
  tcp_ack_number: number;
  tcp_ack_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_ack_count: number;
  tcp_ack_step: number;
  tcp_window: number;
  tcp_window_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_window_count: number;
  tcp_window_step: number;
  tcp_checksum_override: boolean;
  tcp_checksum: string;
  tcp_checksum_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_checksum_count: number;
  tcp_checksum_step: number;
  tcp_option_mss_enabled: boolean;
  tcp_option_mss: number;
  tcp_option_mss_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_option_mss_count: number;
  tcp_option_mss_step: number;
  tcp_option_window_scale_enabled: boolean;
  tcp_option_window_scale: number;
  tcp_option_window_scale_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_option_window_scale_count: number;
  tcp_option_window_scale_step: number;
  tcp_option_sack_permitted_enabled: boolean;
  tcp_option_sack_blocks_enabled: boolean;
  tcp_option_sack_left_edge: number;
  tcp_option_sack_left_edge_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_option_sack_left_edge_count: number;
  tcp_option_sack_left_edge_step: number;
  tcp_option_sack_right_edge: number;
  tcp_option_sack_right_edge_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_option_sack_right_edge_count: number;
  tcp_option_sack_right_edge_step: number;
  tcp_option_timestamp_enabled: boolean;
  tcp_option_timestamp_value: number;
  tcp_option_timestamp_value_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_option_timestamp_value_count: number;
  tcp_option_timestamp_value_step: number;
  tcp_option_timestamp_echo: number;
  tcp_option_timestamp_echo_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_option_timestamp_echo_count: number;
  tcp_option_timestamp_echo_step: number;
  tcp_urgent_pointer: number;
  tcp_urgent_pointer_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_urgent_pointer_count: number;
  tcp_urgent_pointer_step: number;
  tcp_flags_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  tcp_flags_count: number;
  tcp_flags_step: number;
  tcp_flag_urg: boolean;
  tcp_flag_ack: boolean;
  tcp_flag_psh: boolean;
  tcp_flag_rst: boolean;
  tcp_flag_syn: boolean;
  tcp_flag_fin: boolean;
  sctp_verification_tag: number;
  sctp_verification_tag_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  sctp_verification_tag_count: number;
  sctp_verification_tag_step: number;
  sctp_checksum_override: boolean;
  sctp_checksum: string;
  sctp_data_flags: number;
  sctp_data_flags_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  sctp_data_flags_count: number;
  sctp_data_flags_step: number;
  sctp_tsn: number;
  sctp_tsn_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  sctp_tsn_count: number;
  sctp_tsn_step: number;
  sctp_stream_id: number;
  sctp_stream_id_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  sctp_stream_id_count: number;
  sctp_stream_id_step: number;
  sctp_stream_sequence: number;
  sctp_stream_sequence_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  sctp_stream_sequence_count: number;
  sctp_stream_sequence_step: number;
  sctp_payload_protocol_id: number;
  sctp_payload_protocol_id_mode: "Fixed" | "Increment" | "Decrement" | "Random";
  sctp_payload_protocol_id_count: number;
  sctp_payload_protocol_id_step: number;
  payload_enabled: boolean;
  payload_type: "Fixed Word" | "Increment Byte" | "Decrement Byte" | "Random";
  payload_pattern: string;
  advanced_cache_size_type: "Auto" | "Enable" | "Disable";
  advanced_cache_value: number;
  packet_binary_base64?: string | null;
  advanced_mode: boolean;
  packet_model?: string | null;
  packet_meta_base64?: string | null;
  advanced_vm?: Record<string, unknown> | null;
};

export type ProfilePcapImportOptions = {
  name_prefix: string;
  rewrite_src_enabled: boolean;
  src_address: string;
  src_mode: ProfileWorkbenchStream["ipv4_src_mode"];
  src_count: number;
  rewrite_dst_enabled: boolean;
  dst_address: string;
  dst_mode: ProfileWorkbenchStream["ipv4_dst_mode"];
  dst_count: number;
  rate_mode: "speedup" | "ipg";
  speedup: number;
  ipg: number;
  loop_count: number;
};

export type ProfileWorkbenchSummary = {
  index: number;
  name: string;
  packet_type: string;
  length: number;
  mode: string;
  rate: string;
  next_stream: string;
};

export type ProfileWorkbenchDocument = {
  profile?: ProfileRecord;
  content: string;
  streams?: ProfileWorkbenchStream[];
  stream_summaries?: ProfileWorkbenchSummary[];
  packet_previews?: ProfilePacketPreview[];
};

export type ProfileWorkbenchSaveResult = {
  profile: ProfileRecord;
  content: string;
  streams: ProfileWorkbenchSummary[];
  packet_previews?: ProfilePacketPreview[];
};

export type ProfileWorkbenchYamlExportResult = {
  accepted: boolean;
  file_name: string;
  content: string;
  bytes: number;
  streams: ProfileWorkbenchSummary[];
  packet_previews?: ProfilePacketPreview[];
};

export type ProfilePacketPreviewLayer = {
  name: string;
  fields: Record<string, string | number | boolean>;
};

export type ProfilePacketPreviewLine = {
  offset: string;
  hex: string;
  ascii: string;
};

export type ProfilePacketPreview = {
  index: number;
  name: string;
  packet_type: string;
  frame_length: number;
  wire_length: number;
  binary_base64: string;
  hex: string;
  hex_lines: ProfilePacketPreviewLine[];
  layers: ProfilePacketPreviewLayer[];
};

export type ProfileFileOperationResult = {
  accepted: boolean;
  source?: ProfileRecord;
  profile: ProfileRecord;
};

export type ProfileExportResult = {
  accepted: boolean;
  profile?: ProfileRecord | null;
  file_name: string;
  content: string;
  bytes?: number;
};

export type ProfilePcapExportResult = {
  accepted: boolean;
  file_name: string;
  content_base64: string;
  bytes: number;
  stream: ProfileWorkbenchSummary;
  packet_preview: ProfilePacketPreview;
};

export type ProfilePcapImportResult = {
  accepted: boolean;
  file_name: string;
  import_options?: ProfilePcapImportOptions | null;
  packet_count: number;
  unsupported_count: number;
  content: string;
  streams: ProfileWorkbenchStream[];
  stream_summaries: ProfileWorkbenchSummary[];
  packet_previews: ProfilePacketPreview[];
};

export type DaemonStatus = {
  ok: boolean;
  running: boolean;
  source: string;
  command_executed: boolean;
  command: string[];
  returncode: number | null;
  stdout: string;
  stderr: string;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonActionResult = {
  ok: boolean;
  command: string[];
  returncode: number;
  stdout: string;
  stderr: string;
  blocker?: string | null;
  recovered_from_timeout?: boolean;
};

export type DaemonRpcStatus = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  connected: boolean;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonFileSnapshot = {
  ok?: boolean;
  source?: string;
  path: string;
  exists: boolean;
  readable: boolean;
  size_bytes: number | null;
  modified_time: string | null;
  content: string;
  truncated: boolean;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonDefaultConfig = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  content: string;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonConfigVersionRecord = {
  name: string;
  path: string;
  created_at: string;
  modified_time: string;
  size_bytes: number;
  sha256: string;
  source: string;
  note?: string | null;
  config_path: string;
  host?: string;
  daemon_port?: number;
};

export type DaemonConfigVersions = {
  ok: boolean;
  source: string;
  root_path: string | null;
  limit: number;
  versions: DaemonConfigVersionRecord[];
  blocker?: string | null;
  error?: string | null;
};

export type DaemonConfigVersionSaveResult = {
  ok: boolean;
  source: string;
  root_path: string | null;
  saved: boolean;
  version: DaemonConfigVersionRecord | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonConfigVersionLoadResult = {
  ok: boolean;
  source: string;
  root_path: string | null;
  name: string;
  version: DaemonConfigVersionRecord | null;
  content: string;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonConfigVersionDiffResult = {
  ok: boolean;
  source: string;
  root_path: string | null;
  name: string;
  version: DaemonConfigVersionRecord | null;
  diff: string;
  truncated: boolean;
  compared_to: string | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonConfigVersionRestoreResult = {
  ok: boolean;
  source: string;
  root_path: string | null;
  name: string;
  restored: boolean;
  config_path: string;
  before_version: DaemonConfigVersionRecord | null;
  restored_version: DaemonConfigVersionRecord | null;
  audit_record: Record<string, unknown> | null;
  audit_written: boolean;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonConfigAuditRecord = {
  action: string;
  created_at: string;
  config_path: string;
  restored_name?: string | null;
  restored_sha256?: string | null;
  version_name?: string | null;
  version_sha256?: string | null;
  before_name?: string | null;
  sequence?: number | null;
  config_filename?: string | null;
  files_path?: string | null;
  user?: string | null;
  host: string;
  daemon_port: number;
};

export type DaemonConfigAudit = {
  ok: boolean;
  source: string;
  root_path: string | null;
  audit_path: string | null;
  limit: number;
  records: DaemonConfigAuditRecord[];
  truncated: boolean;
  skipped_lines: number;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonMetadata = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  metadata: unknown;
  devices_info: unknown;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonDevicesInfo = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  devices_info: unknown;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonFilesList = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  path: string | null;
  directories: string[] | null;
  files: string[] | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonFileContent = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  path: string;
  max_bytes: number;
  size_bytes: number | null;
  truncated: boolean;
  content: string;
  content_base64: string;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexRuntimeStatus = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  running: boolean | null;
  status: unknown;
  commands: unknown;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexVersion = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  version: string | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexReservation = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  reserved: boolean | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexReservationResult = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  action: "reserve" | "cancel";
  user: string;
  reserved?: boolean | null;
  canceled?: boolean | null;
  result?: boolean | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexLog = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  max_bytes: number;
  size_bytes: number | null;
  truncated: boolean;
  content: string;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexJsonData = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  data: Record<string, unknown> | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonTrexResult = {
  ok: boolean;
  source: string;
  host: string;
  port: number;
  action: "start" | "stop";
  result?: unknown;
  stopped?: boolean | null;
  sequence?: number | null;
  user?: string | null;
  timeout_seconds?: number | null;
  config_filename?: string | null;
  config_uploaded?: boolean;
  config_version?: DaemonConfigVersionRecord | null;
  audit_record?: Record<string, unknown> | null;
  audit_written?: boolean;
  files_path?: string | null;
  trex_cmd_options?: Record<string, unknown> | null;
  blocker?: string | null;
  error?: string | null;
};

export type DaemonOverview = {
  environment: EnvironmentReadiness;
  status: DaemonStatus;
  rpc: DaemonRpcStatus;
  trex: DaemonTrexRuntimeStatus;
  trex_version: DaemonTrexVersion;
  trex_reservation: DaemonTrexReservation;
  metadata: DaemonMetadata;
  previews: Record<DaemonAction, DaemonPreview>;
  config: DaemonFileSnapshot;
  log: DaemonFileSnapshot;
};

export type SystemOverview = {
  environment: EnvironmentReadiness;
  daemon_preview: DaemonPreview;
  daemon_status: DaemonStatus;
  trex_probe: TrexProbe;
  trex_ports: TrexResult<TrexPortsSnapshot>;
};

export type StartTrafficRequest = {
  profile_path: string;
  ports: number[] | null;
  multiplier: string;
  duration: number;
  force: boolean;
  confirmation: string | null;
  tunables: Record<string, string | number | boolean>;
  expected_session_id: string | null;
};

export type UpdateTrafficRequest = {
  ports: number[] | null;
  multiplier: string;
  force: boolean;
  total: boolean;
  expected_session_id: string;
};

export type TrafficRunState = "running" | "paused" | "stopped" | "mixed" | "unknown";

export type TrafficPlanGroup = {
  id: string;
  name: string;
  ports: number[];
  profile_path: string;
  multiplier: string;
  duration: number;
  force: boolean;
  total: boolean;
  synchronized: boolean;
  clear_existing: boolean;
  tunables: Record<string, JsonValue>;
};

export type TrafficSessionGroup = {
  group_id: string | null;
  ports: number[];
  profile_path: string;
  multiplier: string;
  duration: number;
  tunables: Record<string, JsonValue>;
  state: TrafficRunState;
  port_states: Record<number, Exclude<TrafficRunState, "mixed">>;
  updated_at: string;
};

export type RuntimeAuthorityIdentity = {
  host: string;
  sync_port: number;
  async_port: number;
  scapy_port: number;
  daemon_supervisor: "external" | "systemd";
  generation: string;
};

export type TrafficSession = {
  id: string;
  authority: RuntimeAuthorityIdentity;
  state: TrafficRunState;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
  groups: TrafficSessionGroup[];
  reconciliation: string | null;
};

export type TrafficPortRuntime = {
  port: number;
  state: Exclude<TrafficRunState, "mixed">;
  ownership: "managed" | "external" | "none";
};

export type TrafficRuntimeSnapshot = {
  plan_revision: number;
  groups: TrafficPlanGroup[];
  session: TrafficSession | null;
  config: {
    path: string;
    port_limit: number;
    interfaces: string[];
  };
  available_ports: number[];
  live_state_sampled: boolean;
  port_states: TrafficPortRuntime[];
  reconciliation: string;
};

export type TrafficPlanPutRequest = {
  plan_revision: number;
  groups: TrafficPlanGroup[];
};

export type TrafficGroupStartRequest = {
  plan_revision: number;
  confirmation: string | null;
  expected_session_id: string | null;
};

export type TrafficGroupStartResult = {
  accepted: boolean;
  profile_path: string;
  ports: number[];
  multiplier: string;
  duration: number;
  force: boolean;
  total: boolean;
  synchronized: boolean;
  clear_existing: boolean;
  tunables: Record<string, JsonValue>;
  stream_ids: JsonValue;
  start_result: string | null;
  state_persisted: boolean;
  session?: TrafficSession | null;
};

export type PortsCommandRequest = {
  ports: number[] | null;
  confirmation: string | null;
};

export type TrafficControlRequest = PortsCommandRequest & {
  expected_session_id: string;
};

export type AcquirePortsRequest = PortsCommandRequest & {
  force: boolean;
  sync_streams: boolean;
};

export type ResetPortsRequest = PortsCommandRequest & {
  restart: boolean;
};

export type ServiceModeRequest = PortsCommandRequest & {
  enabled: boolean;
  filtered: boolean;
  mask: number | null;
};

export type PortAttributeName = "promiscuous" | "multicast" | "link" | "led" | "flow_control";
export type FlowControlMode = "NONE" | "TX" | "RX" | "FULL";

export type PortAttributeRequest = PortsCommandRequest & {
  attribute: PortAttributeName;
  value: boolean | FlowControlMode;
};

export type PortLayerConfigurationRequest = {
  port: number;
  mode: "L2" | "L3";
  l2_destination: string | null;
  l3_source: string | null;
  l3_destination: string | null;
  vlan: number[] | null;
};

export type PortArpResolveRequest = PortsCommandRequest & {
  retries: number;
  vlan: number[] | null;
};

export type PortIpv6ScanRequest = PortsCommandRequest & {
  timeout_seconds: number;
};

export type PortPingRequest = {
  port: number;
  destination: string;
  pkt_size: number;
  count: number;
  interval_sec: number;
  vlan: number[] | null;
};

export type ClearStatsRequest = PortsCommandRequest & {
  clear_global: boolean;
  clear_flow_stats: boolean;
  clear_latency_stats: boolean;
  clear_xstats: boolean;
};

export type TrexPortXstatsSnapshot = {
  port: number;
  xstats: JsonValue;
};

export type TrexCaptureFilter = {
  tx?: number | string | Array<number | string> | null;
  rx?: number | string | Array<number | string> | null;
  bpf?: string | null;
};

export type TrexCaptureRecord = {
  id: number | string;
  state?: string;
  status?: string;
  count?: number | string;
  pkt_count?: number | string;
  bytes?: number | string;
  fetched?: number | string;
  matched?: number | string;
  limit?: number | string;
  mode?: string;
  filter?: TrexCaptureFilter | null;
};

export type TrexCapturePacket = {
  index: number;
  time: number;
  port: number | string | null;
  mode: string;
  destination: string;
  source: string;
  type: string;
  length: number;
  wirelen: number;
  info: string;
  binary_base64: string;
  hex_preview: string;
  decoded_layers: Array<{
    name: string;
    fields: Array<{
      name: string;
      value: string;
    }>;
  }>;
};

export type TrexCaptureSavedFile = {
  path: string;
  name: string;
  size_bytes: number;
  modified_time?: string | null;
  download_available?: boolean;
  content_base64?: string | null;
  download_error?: string | null;
};

export type TrexCaptureFetchBudget = {
  requested_packet_count: number;
  target_packet_count: number;
  max_packet_count: number;
  max_bytes: number;
  fetched_bytes: number;
  effective_snaplen: number;
  truncated_by_byte_budget: boolean;
  available_packet_count?: number | null;
  omitted_packet_count?: number | null;
};

export type TrexCaptureError = {
  stage: string;
  error: string;
};

export type TrexCaptureStatus = {
  captures: TrexCaptureRecord[];
  port_usage?: Array<{
    port: number;
    rx_recorder_ids: Array<number | string>;
    tx_recorder_ids: Array<number | string>;
  }>;
  service_mode?: {
    enabled_ports?: number[];
    already_enabled_ports?: number[];
    restored_ports?: number[];
    managed_capture_ids?: Array<number | string>;
    released_capture_ids?: Array<number | string>;
  };
};

export type CaptureStartRequest = {
  tx_ports: number[] | null;
  rx_ports: number[] | null;
  limit: number;
  mode: "fixed" | "cyclic";
  bpf_filter: string;
  snaplen: number;
};

export type CaptureFetchRequest = {
  capture_id: number;
  pkt_count: number;
  fetch_limit: number;
  snaplen: number;
};

export type CaptureStopRequest = {
  capture_id: number;
  pkt_count: number;
  save_pcap: boolean;
  file_name: string | null;
  snaplen: number;
};

export type CaptureRemoveRequest = {
  capture_id: number;
};

export type CaptureFileRequest = {
  file_name: string;
};

export type TrexCaptureStartResult = TrexCaptureStatus & {
  accepted: boolean;
  id: number | string | null;
  start_ts: number | null;
  tx_ports: number[];
  rx_ports: number[];
  limit: number;
  mode: string;
  bpf_filter: string;
  snaplen: number;
};

export type TrexCapturePacketResult = TrexCaptureStatus & {
  accepted: boolean;
  id: number | string;
  packets: TrexCapturePacket[];
  packet_count: number;
  fetch_budget: TrexCaptureFetchBudget;
  saved_file?: TrexCaptureSavedFile | null;
  capture_stopped?: boolean;
  capture_removed?: boolean;
  available_packet_count?: number | null;
  primary_error?: TrexCaptureError | null;
  cleanup_errors?: TrexCaptureError[];
};

export type TrexCaptureRemoveResult = TrexCaptureStatus & {
  accepted: boolean;
  removed_ids: Array<number | string>;
};

export type TrexCaptureFiles = {
  root: string;
  files: TrexCaptureSavedFile[];
};

export type TrexCaptureFileDownloadResult = {
  accepted: boolean;
  file: TrexCaptureSavedFile;
};

export type TrexCaptureFileOpenResult = {
  accepted: boolean;
  file: TrexCaptureSavedFile;
  command: string[];
  pid: number;
};

export type RunReportFile = {
  path: string;
  name: string;
  size_bytes: number;
  modified_time: string;
  title?: string | null;
  generated_at?: string | null;
  download_available?: boolean;
  content?: string | null;
  download_error?: string | null;
};

export type TrexRunReports = {
  root: string;
  files: RunReportFile[];
};

export type RunReportTrendMetric = {
  value: string;
  number: number | null;
  unit: string;
};

export type RunReportTrendRecord = {
  name: string;
  title: string;
  generated_at?: string | null;
  modified_time?: string | null;
  verdict: "pass" | "warn" | "fail" | "unknown";
  summary: string;
  profile?: string | null;
  run_duration?: string | null;
  metrics: Record<string, RunReportTrendMetric>;
};

export type RunReportMetricTrend = {
  label: string;
  latest: string | null;
  previous: string | null;
  delta: number | null;
  unit: string;
  direction: "up" | "down" | "flat" | "changed" | "unknown";
  samples: number;
};

export type RunReportTrendConclusion = {
  verdict: "pass" | "warn" | "fail" | "unknown";
  title: string;
  summary: string;
  reasons: string[];
};

export type TrexRunReportTrends = {
  root: string;
  total: number;
  skipped: number;
  verdict_counts: Record<"pass" | "warn" | "fail" | "unknown", number>;
  conclusion: RunReportTrendConclusion;
  metric_trends: RunReportMetricTrend[];
  records: RunReportTrendRecord[];
};

export type RunReportSaveRequest = {
  title: string;
  markdown: string;
  payload: Record<string, unknown>;
  file_name: string | null;
};

export type RunReportFileRequest = {
  file_name: string;
};

export type RunReportSaveResult = {
  accepted: boolean;
  file: RunReportFile;
};

export type RunReportDownloadResult = {
  accepted: boolean;
  file: RunReportFile;
};

export type TrexStatsSnapshot = JsonObject & {
  global?: JsonObject;
  total?: JsonObject;
  flow_stats?: JsonObject;
  latency?: JsonObject;
  latency_global?: JsonObject;
};

export type TrexDisconnectResult = {
  disconnected: boolean;
  client_cached: boolean;
  stats_sampler_closed?: boolean | null;
  phase?: string | null;
  remaining_capture_ids?: Array<number | string> | null;
  capture_id?: number | string | null;
};

export type TrexConnectResponse = SystemOverview | TrexResult<TrexDisconnectResult>;

export type ConnectTrexRequest = {
  host: string;
  sync_port: number;
  async_port: number;
  scapy_port: number;
  client_name: string;
  timeout_seconds: number;
};

export type ApiLogEntry = {
  id: number;
  method: string;
  path: string;
  started_at: string;
  status: number | null;
  ok: boolean;
  duration_ms: number;
  request_body?: unknown;
  response_body?: unknown;
  request_truncated?: boolean;
  response_truncated?: boolean;
  error?: string | null;
};

type ApiLogBodySnapshot = {
  value: unknown;
  truncated: boolean;
};

const API_LOG_MAX_ENTRIES = 80;
const API_LOG_BODY_MAX_CHARS = 6000;
const API_LOG_ARRAY_MAX_ITEMS = 24;
const API_LOG_OBJECT_MAX_KEYS = 80;
const API_LOG_REDACTED_KEYS = new Set([
  "binary_base64",
  "content_base64",
  "packet_binary_base64"
]);
const API_LOG_IGNORED_READ_MODEL_CALLS = new Set([
  "GET /api/system/overview",
  "GET /api/trex/capture/files",
  "GET /api/trex/capture/status",
  "GET /api/trex/profiles",
  "GET /api/trex/reports",
  "GET /api/trex/reports/trends",
  "GET /api/trex/stats",
  "GET /api/trex/stats/latest",
  "GET /api/trex/traffic/runtime"
]);

let apiLogSequence = 0;
let apiLogEntries: ApiLogEntry[] = [];
const apiLogListeners = new Set<(entries: ApiLogEntry[]) => void>();

export function getApiLogEntries(): ApiLogEntry[] {
  return apiLogEntries;
}

export function subscribeApiLogEntries(listener: (entries: ApiLogEntry[]) => void): () => void {
  apiLogListeners.add(listener);
  listener(apiLogEntries);
  return () => {
    apiLogListeners.delete(listener);
  };
}

export function clearApiLogEntries(): void {
  apiLogEntries = [];
  emitApiLogEntries();
}

function emitApiLogEntries(): void {
  const snapshot = [...apiLogEntries];
  for (const listener of apiLogListeners) {
    listener(snapshot);
  }
}

function appendApiLogEntry(entry: Omit<ApiLogEntry, "id">): void {
  apiLogSequence += 1;
  apiLogEntries = [...apiLogEntries, { id: apiLogSequence, ...entry }].slice(-API_LOG_MAX_ENTRIES);
  emitApiLogEntries();
}

function normalizeApiPath(input: RequestInfo | URL): string {
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  try {
    const parsed = new URL(raw, "http://localhost");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return raw;
  }
}

function apiFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (typeof input !== "string" && !(input instanceof URL) && input.method) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function shouldLogApiCall(path: string, method: string): boolean {
  const pathOnly = path.split("?")[0];
  return pathOnly.startsWith("/api/")
    && !API_LOG_IGNORED_READ_MODEL_CALLS.has(`${method} ${pathOnly}`);
}

function parseJsonBodyOrText(text: string, contentType = ""): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!contentType.includes("json") && !looksLikeJson) {
    return text;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function shouldRedactApiLogKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return API_LOG_REDACTED_KEYS.has(normalized);
}

function sanitizeApiLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > API_LOG_BODY_MAX_CHARS) {
      return `${value.slice(0, API_LOG_BODY_MAX_CHARS)}... [${value.length} chars]`;
    }
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (depth >= 5) {
    return "[nested object]";
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, API_LOG_ARRAY_MAX_ITEMS).map((item) => sanitizeApiLogValue(item, depth + 1));
    if (value.length > API_LOG_ARRAY_MAX_ITEMS) {
      visible.push(`... ${value.length - API_LOG_ARRAY_MAX_ITEMS} more items`);
    }
    return visible;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  let index = 0;
  for (const [key, nested] of Object.entries(record)) {
    if (index >= API_LOG_OBJECT_MAX_KEYS) {
      sanitized.__truncated_keys = Object.keys(record).length - API_LOG_OBJECT_MAX_KEYS;
      break;
    }
    sanitized[key] = shouldRedactApiLogKey(key) && typeof nested === "string"
      ? `<${key}: ${nested.length} chars>`
      : sanitizeApiLogValue(nested, depth + 1);
    index += 1;
  }
  return sanitized;
}

function compactApiLogBody(value: unknown): ApiLogBodySnapshot {
  const sanitized = sanitizeApiLogValue(value);
  const text = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized);
  if (text.length <= API_LOG_BODY_MAX_CHARS) {
    return { value: sanitized, truncated: false };
  }
  return {
    value: `${text.slice(0, API_LOG_BODY_MAX_CHARS)}... [${text.length} chars]`,
    truncated: true
  };
}

function requestBodyForApiLog(init?: RequestInit): ApiLogBodySnapshot | null {
  const body = init?.body;
  if (body === undefined || body === null) {
    return null;
  }
  if (typeof body === "string") {
    return compactApiLogBody(parseJsonBodyOrText(body, "application/json"));
  }
  if (body instanceof URLSearchParams) {
    return compactApiLogBody(Object.fromEntries(body));
  }
  return compactApiLogBody(`[${body.constructor.name} request body]`);
}

async function responseBodyForApiLog(response: Response): Promise<ApiLogBodySnapshot | null> {
  try {
    if (typeof response.clone !== "function") {
      return null;
    }
    const text = await response.clone().text();
    if (!text) {
      return null;
    }
    return compactApiLogBody(parseJsonBodyOrText(text, response.headers.get("content-type") ?? ""));
  } catch (caught) {
    return compactApiLogBody(caught instanceof Error ? caught.message : "Unable to read response body");
  }
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = normalizeApiPath(input);
  const method = apiFetchMethod(input, init);
  const logThisCall = shouldLogApiCall(path, method);
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const requestBody = logThisCall ? requestBodyForApiLog(init) : null;

  try {
    const response = init === undefined ? await fetch(input) : await fetch(input, init);
    if (logThisCall) {
      const responseBody = await responseBodyForApiLog(response);
      appendApiLogEntry({
        method,
        path,
        started_at: startedAt,
        status: response.status,
        ok: response.ok,
        duration_ms: Date.now() - startedAtMs,
        ...(requestBody ? { request_body: requestBody.value, request_truncated: requestBody.truncated } : {}),
        ...(responseBody ? { response_body: responseBody.value, response_truncated: responseBody.truncated } : {}),
        error: null
      });
    }
    return response;
  } catch (caught) {
    if (logThisCall) {
      appendApiLogEntry({
        method,
        path,
        started_at: startedAt,
        status: null,
        ok: false,
        duration_ms: Date.now() - startedAtMs,
        ...(requestBody ? { request_body: requestBody.value, request_truncated: requestBody.truncated } : {}),
        error: caught instanceof Error ? caught.message : "request failed"
      });
    }
    throw caught;
  }
}

export async function fetchSystemOverview(): Promise<SystemOverview> {
  const response = await apiFetch("/api/system/overview");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<SystemOverview>;
}

export async function connectTrex(request: ConnectTrexRequest): Promise<SystemOverview> {
  const response = await apiFetch("/api/trex/connect", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  const payload = await response.json() as TrexConnectResponse;
  if ("ok" in payload) {
    throw new Error(`${payload.blocker ?? "trex_disconnect_failed"}: ${payload.error ?? "unable to replace the current TRex connection"}`);
  }
  return payload;
}

export async function disconnectTrex(): Promise<TrexResult<TrexDisconnectResult>> {
  const response = await apiFetch("/api/trex/disconnect", {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexDisconnectResult>>;
}

export async function fetchDaemonPreview(action: DaemonAction): Promise<DaemonPreview> {
  const response = await apiFetch(`/api/system/daemon/preview/${action}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonPreview>;
}

export async function fetchDaemonOverview(): Promise<DaemonOverview> {
  const response = await apiFetch("/api/system/daemon");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonOverview>;
}

export async function fetchDaemonDefaultConfig(): Promise<DaemonDefaultConfig> {
  const response = await apiFetch("/api/system/daemon/config/default");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonDefaultConfig>;
}

export async function fetchDaemonConfigVersions(limit = 50): Promise<DaemonConfigVersions> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await apiFetch(`/api/system/daemon/config/versions?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonConfigVersions>;
}

export async function fetchDaemonConfigAudit(limit = 50): Promise<DaemonConfigAudit> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await apiFetch(`/api/system/daemon/config/audit?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonConfigAudit>;
}

export async function saveDaemonConfigVersion(
  configContent: string | null,
  source = "manual",
  note: string | null = null
): Promise<DaemonConfigVersionSaveResult> {
  const response = await apiFetch("/api/system/daemon/config/versions/save", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ config_content: configContent, source, note })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonConfigVersionSaveResult>;
}

export async function loadDaemonConfigVersion(name: string): Promise<DaemonConfigVersionLoadResult> {
  const response = await apiFetch("/api/system/daemon/config/versions/load", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonConfigVersionLoadResult>;
}

export async function restoreDaemonConfigVersion(
  name: string,
  confirmation: string | null
): Promise<DaemonConfigVersionRestoreResult> {
  const response = await apiFetch("/api/system/daemon/config/versions/restore", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, confirmation })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonConfigVersionRestoreResult>;
}

export async function diffDaemonConfigVersion(
  name: string,
  configContent: string | null
): Promise<DaemonConfigVersionDiffResult> {
  const response = await apiFetch("/api/system/daemon/config/versions/diff", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, config_content: configContent })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonConfigVersionDiffResult>;
}

export async function fetchDaemonDevicesInfo(): Promise<DaemonDevicesInfo> {
  const response = await apiFetch("/api/system/daemon/devices");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonDevicesInfo>;
}

export async function fetchDaemonFiles(path: string | null = null): Promise<DaemonFilesList> {
  const params = new URLSearchParams();
  if (path !== null) {
    params.set("path", path);
  }
  const query = params.toString();
  const response = await apiFetch(`/api/system/daemon/files${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonFilesList>;
}

export async function fetchDaemonFileContent(path: string, maxBytes = 131_072): Promise<DaemonFileContent> {
  const params = new URLSearchParams({
    path,
    max_bytes: String(maxBytes)
  });
  const response = await apiFetch(`/api/system/daemon/files/content?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonFileContent>;
}

export async function fetchDaemonStatus(): Promise<DaemonStatus> {
  const response = await apiFetch("/api/system/daemon/status");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonStatus>;
}

export async function fetchDaemonTrexStatus(): Promise<DaemonTrexRuntimeStatus> {
  const response = await apiFetch("/api/system/daemon/trex/status");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexRuntimeStatus>;
}

export async function fetchDaemonTrexVersion(): Promise<DaemonTrexVersion> {
  const response = await apiFetch("/api/system/daemon/trex/version");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexVersion>;
}

export async function fetchDaemonTrexLog(): Promise<DaemonTrexLog> {
  const response = await apiFetch("/api/system/daemon/trex/log");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexLog>;
}

export async function fetchDaemonTrexRunningInfo(): Promise<DaemonTrexJsonData> {
  const response = await apiFetch("/api/system/daemon/trex/running-info");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexJsonData>;
}

export async function fetchDaemonTrexLatestDump(): Promise<DaemonTrexJsonData> {
  const response = await apiFetch("/api/system/daemon/trex/latest-dump");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexJsonData>;
}

export async function fetchDaemonTrexReservation(): Promise<DaemonTrexReservation> {
  const response = await apiFetch("/api/system/daemon/trex/reservation");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexReservation>;
}

export async function runDaemonAction(
  action: DaemonAction,
  confirmation: string | null,
  timeoutSeconds?: number | null
): Promise<DaemonActionResult> {
  const response = await apiFetch(`/api/system/daemon/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ confirmation, timeout_seconds: timeoutSeconds ?? null })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonActionResult>;
}

export async function startDaemonTrex(
  configContent: string | null,
  timeoutSeconds: number | null,
  confirmation: string | null
): Promise<DaemonTrexResult> {
  const response = await apiFetch("/api/system/daemon/trex/start", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ config_content: configContent, timeout_seconds: timeoutSeconds, confirmation })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexResult>;
}

export async function stopDaemonTrex(confirmation: string | null): Promise<DaemonTrexResult> {
  const response = await apiFetch("/api/system/daemon/trex/stop", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ confirmation })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexResult>;
}

async function postDaemonTrexReservation(
  action: "reserve" | "cancel",
  user: string | null
): Promise<DaemonTrexReservationResult> {
  const response = await apiFetch(`/api/system/daemon/trex/reservation/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ user })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DaemonTrexReservationResult>;
}

export async function reserveDaemonTrex(user: string | null): Promise<DaemonTrexReservationResult> {
  return postDaemonTrexReservation("reserve", user);
}

export async function cancelDaemonTrexReservation(user: string | null): Promise<DaemonTrexReservationResult> {
  return postDaemonTrexReservation("cancel", user);
}

export async function fetchProfiles(): Promise<TrexResult<ProfileCatalog>> {
  const response = await apiFetch("/api/trex/profiles");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfileCatalog>>;
}

export async function fetchProfilePreview(profilePath: string, maxBytes = 8192): Promise<TrexResult<ProfilePreview>> {
  const params = new URLSearchParams({
    profile_path: profilePath,
    max_bytes: String(maxBytes)
  });
  const response = await apiFetch(`/api/trex/profiles/preview?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfilePreview>>;
}

export async function fetchProfileWorkbench(profilePath: string): Promise<TrexResult<ProfileWorkbenchDocument>> {
  const params = new URLSearchParams({ profile_path: profilePath });
  const response = await apiFetch(`/api/trex/profiles/workbench?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfileWorkbenchDocument>>;
}

export async function renderProfileWorkbench(
  streams: ProfileWorkbenchStream[]
): Promise<TrexResult<ProfileWorkbenchDocument>> {
  const response = await apiFetch("/api/trex/profiles/workbench/render", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ streams })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfileWorkbenchDocument>>;
}

export async function saveProfileWorkbench(
  profileName: string,
  streams: ProfileWorkbenchStream[]
): Promise<TrexResult<ProfileWorkbenchSaveResult>> {
  const response = await apiFetch("/api/trex/profiles/workbench/save", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ profile_name: profileName, streams })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfileWorkbenchSaveResult>>;
}

export async function exportProfileWorkbenchYaml(
  profileName: string,
  streams: ProfileWorkbenchStream[]
): Promise<TrexResult<ProfileWorkbenchYamlExportResult>> {
  const response = await apiFetch("/api/trex/profiles/workbench/export-yaml", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ profile_name: profileName, streams })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfileWorkbenchYamlExportResult>>;
}

export async function exportProfileWorkbenchPcap(
  stream: ProfileWorkbenchStream,
  fileName: string | null = null
): Promise<TrexResult<ProfilePcapExportResult>> {
  const response = await apiFetch("/api/trex/profiles/workbench/export-pcap", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ stream, file_name: fileName })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfilePcapExportResult>>;
}

export async function importProfileWorkbenchPcap(
  fileName: string,
  contentBase64: string,
  maxPackets = 512,
  options: ProfilePcapImportOptions | null = null
): Promise<TrexResult<ProfilePcapImportResult>> {
  const response = await apiFetch("/api/trex/profiles/workbench/import-pcap", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      file_name: fileName,
      content_base64: contentBase64,
      max_packets: maxPackets,
      ...(options ? { options } : {})
    })
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<ProfilePcapImportResult>>;
}

export async function duplicateProfile(
  profilePath: string,
  targetName: string | null = null
): Promise<TrexResult<ProfileFileOperationResult>> {
  return postTrexCommand<ProfileFileOperationResult, { profile_path: string; target_name: string | null }>(
    "/api/trex/profiles/duplicate",
    { profile_path: profilePath, target_name: targetName }
  );
}

export async function deleteProfile(
  profilePath: string,
  confirmation: string | null
): Promise<TrexResult<ProfileFileOperationResult>> {
  return postTrexCommand<ProfileFileOperationResult, { profile_path: string; confirmation: string | null }>(
    "/api/trex/profiles/delete",
    { profile_path: profilePath, confirmation }
  );
}

export async function exportProfileJson(profilePath: string): Promise<TrexResult<ProfileExportResult>> {
  return postTrexCommand<ProfileExportResult, { profile_path: string }>(
    "/api/trex/profiles/export-json",
    { profile_path: profilePath }
  );
}

export async function fetchTrexStats(ports: number[] | null): Promise<TrexResult<TrexStatsSnapshot>> {
  const params = new URLSearchParams();
  for (const port of ports ?? []) {
    params.append("ports", String(port));
  }
  const query = params.toString();
  const response = await apiFetch(`/api/trex/stats${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexStatsSnapshot>>;
}

export async function fetchTrexStatsLatest(): Promise<TrexSampledResult<TrexStatsSnapshot>> {
  const response = await apiFetch("/api/trex/stats/latest");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexSampledResult<TrexStatsSnapshot>>;
}

export function openTrexStatsStream(): EventSource | null {
  if (typeof EventSource === "undefined") {
    return null;
  }
  return new EventSource("/api/trex/stats/stream");
}

export function parseTrexStatsStreamEvent(event: MessageEvent): TrexSampledResult<TrexStatsSnapshot> {
  return JSON.parse(event.data) as TrexSampledResult<TrexStatsSnapshot>;
}

export async function fetchPortXstats(port: number): Promise<TrexResult<TrexPortXstatsSnapshot>> {
  const params = new URLSearchParams({ port: String(port) });
  const response = await apiFetch(`/api/trex/ports/xstats?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexPortXstatsSnapshot>>;
}

async function postTrexCommand<TData = Record<string, unknown>, TRequest extends object = object>(
  path: string,
  request: TRequest
): Promise<TrexResult<TData>> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TData>>;
}

export async function acquirePorts(request: AcquirePortsRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/acquire", request);
}

export async function releasePorts(request: PortsCommandRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/release", request);
}

export async function resetPorts(request: ResetPortsRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/reset", request);
}

export async function setServiceMode(request: ServiceModeRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/service-mode", request);
}

export async function setPortAttribute(request: PortAttributeRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/attribute", request);
}

export async function applyPortConfiguration(
  request: PortLayerConfigurationRequest
): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/configuration/apply", request);
}

export async function resolvePortsArp(request: PortArpResolveRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/arp/resolve", request);
}

export async function scanPortsIpv6(request: PortIpv6ScanRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/ipv6/scan", request);
}

export async function pingFromPort(request: PortPingRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/ports/ping", request);
}

export async function clearTrexStats(request: ClearStatsRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/stats/clear", request);
}

export async function fetchCaptureStatus(): Promise<TrexResult<TrexCaptureStatus>> {
  const response = await apiFetch("/api/trex/capture/status");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexCaptureStatus>>;
}

export async function startCapture(
  request: CaptureStartRequest
): Promise<TrexResult<TrexCaptureStartResult>> {
  return postTrexCommand<TrexCaptureStartResult, CaptureStartRequest>("/api/trex/capture/start", request);
}

export async function fetchCapture(
  request: CaptureFetchRequest
): Promise<TrexResult<TrexCapturePacketResult>> {
  return postTrexCommand<TrexCapturePacketResult, CaptureFetchRequest>("/api/trex/capture/fetch", request);
}

export async function stopCapture(
  request: CaptureStopRequest
): Promise<TrexResult<TrexCapturePacketResult>> {
  return postTrexCommand<TrexCapturePacketResult, CaptureStopRequest>("/api/trex/capture/stop", request);
}

export async function removeCapture(
  request: CaptureRemoveRequest
): Promise<TrexResult<TrexCaptureRemoveResult>> {
  return postTrexCommand<TrexCaptureRemoveResult, CaptureRemoveRequest>("/api/trex/capture/remove", request);
}

export async function removeAllCaptures(): Promise<TrexResult<TrexCaptureRemoveResult>> {
  return postTrexCommand<TrexCaptureRemoveResult, Record<string, never>>("/api/trex/capture/remove-all", {});
}

export async function fetchCaptureFiles(): Promise<TrexResult<TrexCaptureFiles>> {
  const response = await apiFetch("/api/trex/capture/files");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexCaptureFiles>>;
}

export async function downloadCaptureFile(
  request: CaptureFileRequest
): Promise<TrexResult<TrexCaptureFileDownloadResult>> {
  return postTrexCommand<TrexCaptureFileDownloadResult, CaptureFileRequest>("/api/trex/capture/files/download", request);
}

export async function openCaptureFile(
  request: CaptureFileRequest
): Promise<TrexResult<TrexCaptureFileOpenResult>> {
  return postTrexCommand<TrexCaptureFileOpenResult, CaptureFileRequest>("/api/trex/capture/files/open", request);
}

export async function fetchRunReports(): Promise<TrexResult<TrexRunReports>> {
  const response = await apiFetch("/api/trex/reports");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexRunReports>>;
}

export async function fetchRunReportTrends(limit = 30): Promise<TrexResult<TrexRunReportTrends>> {
  const response = await apiFetch(`/api/trex/reports/trends?limit=${encodeURIComponent(String(limit))}`);
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrexRunReportTrends>>;
}

export async function saveRunReport(
  request: RunReportSaveRequest
): Promise<TrexResult<RunReportSaveResult>> {
  return postTrexCommand<RunReportSaveResult, RunReportSaveRequest>("/api/trex/reports/save", request);
}

export async function downloadRunReport(
  request: RunReportFileRequest
): Promise<TrexResult<RunReportDownloadResult>> {
  return postTrexCommand<RunReportDownloadResult, RunReportFileRequest>("/api/trex/reports/download", request);
}

export async function fetchTrafficRuntime(): Promise<TrexResult<TrafficRuntimeSnapshot>> {
  const response = await apiFetch("/api/trex/traffic/runtime");
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrafficRuntimeSnapshot>>;
}

export async function replaceTrafficPlan(
  request: TrafficPlanPutRequest
): Promise<TrexResult<TrafficRuntimeSnapshot>> {
  const response = await apiFetch("/api/trex/traffic/plan", {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<TrexResult<TrafficRuntimeSnapshot>>;
}

export async function startTrafficGroup(
  groupId: string,
  request: TrafficGroupStartRequest
): Promise<TrexResult<TrafficGroupStartResult>> {
  return postTrexCommand<TrafficGroupStartResult, TrafficGroupStartRequest>(
    `/api/trex/traffic/group/${encodeURIComponent(groupId)}/start`,
    request
  );
}

export async function controlTraffic(
  action: "stop" | "pause" | "resume",
  request: TrafficControlRequest
): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand(`/api/trex/traffic/${action}`, request);
}

export async function startTraffic(request: StartTrafficRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/traffic/start", request);
}

export async function updateTraffic(request: UpdateTrafficRequest): Promise<TrexResult<Record<string, unknown>>> {
  return postTrexCommand("/api/trex/traffic/update", request);
}
