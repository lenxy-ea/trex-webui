import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataDhcpHandlers } from "./workspaceProtocolDataDhcpHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataDhcpHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

const selectedDhcpStream = {
  dhcp_client_ip_mode: "Increment Host",
  dhcp_client_mac_mode: "Increment",
  dhcp_flags_mode: "Random",
  dhcp_hops_mode: "Random",
  dhcp_message_type_mode: "Increment",
  dhcp_operation_mode: "Increment",
  dhcp_relay_ip_mode: "Random Host",
  dhcp_requested_ip_mode: "Increment Host",
  dhcp_seconds_mode: "Decrement",
  dhcp_server_id_mode: "Random Host",
  dhcp_server_ip_mode: "Decrement Host",
  dhcp_xid_mode: "Increment",
  dhcp_your_ip_mode: "Fixed",
  dns_answer_enabled: true,
  dns_answer_ipv4_mode: "Increment Host",
  dns_answer_ttl_mode: "Increment",
  dns_enabled: true,
  dns_flags_mode: "Increment",
  dns_query_class_mode: "Increment",
  dns_query_type_mode: "Increment",
  dns_transaction_id_mode: "Increment",
  frame_length: 64,
  frame_length_max: 1518,
  frame_length_min: 64,
  l4_dst_port: 1025,
  l4_dst_port_override: false,
  l4_src_port: 1025,
  l4_src_port_override: false,
  mpls_enabled: false,
  packet_type: "Ethernet/IPv4/UDP",
  udp_checksum_override: true,
  udp_length_mode: "Increment",
  udp_length_override: true,
  vlan_enabled: false
} as unknown as ProfileWorkbenchStream;

describe("workspaceProtocolDataDhcpHandlers", () => {
  it("binds DHCP selection and preserves protocol-coupled semantics", () => {
    const { handlers, patches } = collectHandlers(selectedDhcpStream);

    expect(handlers.changeDhcpSelection(true)).toBe(true);

    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      dhcp_client_ip_mode: "Increment Host",
      dhcp_enabled: true,
      dhcp_operation_mode: "Increment",
      dhcp_xid_mode: "Increment",
      dns_answer_enabled: false,
      dns_answer_ipv4_mode: "Fixed",
      dns_answer_ttl_mode: "Fixed",
      dns_enabled: false,
      dns_transaction_id_mode: "Fixed",
      l4_dst_port: 67,
      l4_dst_port_override: true,
      l4_src_port: 68,
      l4_src_port_override: true,
      udp_checksum_override: false,
      udp_length_mode: "Fixed",
      udp_length_override: false
    });
    expect(patches[0].frame_length).toBeGreaterThan(selectedDhcpStream.frame_length);
    expect(patches[0].frame_length_min).toBeGreaterThan(selectedDhcpStream.frame_length_min);
  });

  it("binds DHCP BOOTP scalar and flag edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeDhcpBootpNumber("operation", 2)).toBe(true);
    expect(handlers.changeDhcpBootpMode("operation", "Increment")).toBe(true);
    expect(handlers.changeDhcpBootpCount("operation", 4)).toBe(true);
    expect(handlers.changeDhcpBootpStep("operation", 1)).toBe(true);
    expect(handlers.changeDhcpBootpNumber("hops", 3)).toBe(true);
    expect(handlers.changeDhcpBootpMode("hops", "Random")).toBe(true);
    expect(handlers.changeDhcpBootpNumber("seconds", 12)).toBe(true);
    expect(handlers.changeDhcpBootpMode("seconds", "Decrement")).toBe(true);
    expect(handlers.changeDhcpBootpNumber("message-type", 5)).toBe(true);
    expect(handlers.changeDhcpBootpMode("message-type", "Fixed")).toBe(true);
    expect(handlers.changeDhcpBootpNumber("xid", 0x3903f326)).toBe(true);
    expect(handlers.changeDhcpBootpMode("xid", "Increment")).toBe(true);
    expect(handlers.changeDhcpBootpText("flags", "8000")).toBe(true);
    expect(handlers.changeDhcpBootpMode("flags", "Random")).toBe(true);
    expect(handlers.changeDhcpBootpCount("flags", 8)).toBe(true);
    expect(handlers.changeDhcpBootpStep("flags", 4)).toBe(true);

    expect(patches).toEqual([
      { dhcp_operation: 2 },
      { dhcp_operation_mode: "Increment" },
      { dhcp_operation_count: 4 },
      { dhcp_operation_step: 1 },
      { dhcp_hops: 3 },
      { dhcp_hops_mode: "Random" },
      { dhcp_seconds: 12 },
      { dhcp_seconds_mode: "Decrement" },
      { dhcp_message_type: 5 },
      { dhcp_message_type_mode: "Fixed" },
      { dhcp_xid: 0x3903f326 },
      { dhcp_xid_mode: "Increment" },
      { dhcp_flags: "8000" },
      { dhcp_flags_mode: "Random" },
      { dhcp_flags_count: 8 },
      { dhcp_flags_step: 4 }
    ]);
  });

  it("binds DHCP BOOTP address edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeDhcpBootpAddressText("client-ip", "0.0.0.0")).toBe(true);
    expect(handlers.changeDhcpBootpAddressMode("client-ip", "Increment Host")).toBe(true);
    expect(handlers.changeDhcpBootpAddressCount("client-ip", 16)).toBe(true);
    expect(handlers.changeDhcpBootpAddressStep("client-ip", 1)).toBe(true);
    expect(handlers.changeDhcpBootpAddressText("your-ip", "192.0.2.10")).toBe(true);
    expect(handlers.changeDhcpBootpAddressMode("your-ip", "Decrement Host")).toBe(true);
    expect(handlers.changeDhcpBootpAddressText("server-ip", "192.0.2.1")).toBe(true);
    expect(handlers.changeDhcpBootpAddressMode("server-ip", "Random Host")).toBe(true);
    expect(handlers.changeDhcpBootpAddressText("relay-ip", "198.51.100.1")).toBe(true);
    expect(handlers.changeDhcpBootpAddressMode("relay-ip", "Fixed")).toBe(true);
    expect(handlers.changeDhcpBootpAddressText("client-mac", "00:de:ad:be:ef:01")).toBe(true);
    expect(handlers.changeDhcpBootpAddressMode("client-mac", "Increment")).toBe(true);
    expect(handlers.changeDhcpBootpAddressCount("client-mac", 32)).toBe(true);
    expect(handlers.changeDhcpBootpAddressStep("client-mac", 2)).toBe(true);

    expect(patches).toEqual([
      { dhcp_client_ip: "0.0.0.0" },
      { dhcp_client_ip_mode: "Increment Host" },
      { dhcp_client_ip_count: 16 },
      { dhcp_client_ip_step: 1 },
      { dhcp_your_ip: "192.0.2.10" },
      { dhcp_your_ip_mode: "Decrement Host" },
      { dhcp_server_ip: "192.0.2.1" },
      { dhcp_server_ip_mode: "Random Host" },
      { dhcp_relay_ip: "198.51.100.1" },
      { dhcp_relay_ip_mode: "Fixed" },
      { dhcp_client_mac: "00:de:ad:be:ef:01" },
      { dhcp_client_mac_mode: "Increment" },
      { dhcp_client_mac_count: 32 },
      { dhcp_client_mac_step: 2 }
    ]);
  });

  it("binds DHCP option edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeDhcpOptionText("hostname", "trex-host")).toBe(true);
    expect(handlers.changeDhcpOptionText("parameter-request-list", "1,3,6,15")).toBe(true);
    expect(handlers.changeDhcpOptionTimerNumber("lease-time", 3600)).toBe(true);
    expect(handlers.changeDhcpOptionTimerMode("lease-time", "Increment")).toBe(true);
    expect(handlers.changeDhcpOptionTimerCount("lease-time", 4)).toBe(true);
    expect(handlers.changeDhcpOptionTimerStep("lease-time", 30)).toBe(true);
    expect(handlers.changeDhcpOptionTimerNumber("renewal-time", 1800)).toBe(true);
    expect(handlers.changeDhcpOptionTimerMode("renewal-time", "Decrement")).toBe(true);
    expect(handlers.changeDhcpOptionTimerNumber("rebinding-time", 3150)).toBe(true);
    expect(handlers.changeDhcpOptionTimerMode("rebinding-time", "Random")).toBe(true);
    expect(handlers.changeDhcpOptionAddressText("requested-ip", "10.0.0.10")).toBe(true);
    expect(handlers.changeDhcpOptionAddressMode("requested-ip", "Increment Host")).toBe(true);
    expect(handlers.changeDhcpOptionAddressCount("requested-ip", 8)).toBe(true);
    expect(handlers.changeDhcpOptionAddressStep("requested-ip", 1)).toBe(true);
    expect(handlers.changeDhcpOptionAddressText("server-id", "10.0.0.1")).toBe(true);
    expect(handlers.changeDhcpOptionAddressMode("server-id", "Random Host")).toBe(true);
    expect(handlers.changeDhcpOptionAddressCount("server-id", 16)).toBe(true);
    expect(handlers.changeDhcpOptionAddressStep("server-id", 2)).toBe(true);

    expect(patches).toEqual([
      { dhcp_hostname: "trex-host" },
      { dhcp_parameter_request_list: "1,3,6,15" },
      { dhcp_lease_time: 3600 },
      { dhcp_lease_time_mode: "Increment" },
      { dhcp_lease_time_count: 4 },
      { dhcp_lease_time_step: 30 },
      { dhcp_renewal_time: 1800 },
      { dhcp_renewal_time_mode: "Decrement" },
      { dhcp_rebinding_time: 3150 },
      { dhcp_rebinding_time_mode: "Random" },
      { dhcp_requested_ip: "10.0.0.10" },
      { dhcp_requested_ip_mode: "Increment Host" },
      { dhcp_requested_ip_count: 8 },
      { dhcp_requested_ip_step: 1 },
      { dhcp_server_id: "10.0.0.1" },
      { dhcp_server_id_mode: "Random Host" },
      { dhcp_server_id_count: 16 },
      { dhcp_server_id_step: 2 }
    ]);
  });

  it("does not synthesize DHCP selection patches without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeDhcpSelection(true)).toBe(false);
    expect(handlers.changeDhcpBootpNumber("operation", 2)).toBe(true);
    expect(handlers.changeDhcpOptionText("hostname", "trex-host")).toBe(true);

    expect(patches).toEqual([
      { dhcp_operation: 2 },
      { dhcp_hostname: "trex-host" }
    ]);
  });
});
