import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataDnsHandlers } from "./workspaceProtocolDataDnsHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataDnsHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

const selectedDnsStream = {
  dhcp_client_ip_mode: "Increment",
  dhcp_client_mac_mode: "Increment",
  dhcp_flags_mode: "Increment",
  dhcp_hops_mode: "Increment",
  dhcp_message_type_mode: "Increment",
  dhcp_operation_mode: "Random",
  dhcp_relay_ip_mode: "Increment",
  dhcp_requested_ip_mode: "Increment",
  dhcp_seconds_mode: "Increment",
  dhcp_server_id_mode: "Increment",
  dhcp_server_ip_mode: "Increment",
  dhcp_xid_mode: "Increment",
  dhcp_your_ip_mode: "Increment",
  dhcp_enabled: true,
  dns_answer_enabled: true,
  dns_answer_ipv4_mode: "Increment",
  dns_answer_ttl_mode: "Random",
  dns_flags: "0100",
  dns_flags_mode: "Random",
  dns_query_class_mode: "Increment",
  dns_query_type: 28,
  dns_query_type_mode: "Decrement",
  dns_transaction_id_mode: "Increment",
  frame_length: 64,
  frame_length_max: 1518,
  frame_length_min: 64,
  l4_dst_port: 1025,
  l4_dst_port_override: false,
  mpls_enabled: false,
  packet_type: "Ethernet/IPv4/UDP",
  udp_checksum_override: true,
  udp_length_mode: "Increment",
  udp_length_override: true,
  vlan_enabled: false
} as unknown as ProfileWorkbenchStream;

describe("workspaceProtocolDataDnsHandlers", () => {
  it("binds DNS query selection and preserves protocol-coupled semantics", () => {
    const { handlers, patches } = collectHandlers(selectedDnsStream);

    expect(handlers.changeDnsSelection(true)).toBe(true);

    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      dhcp_client_ip_mode: "Fixed",
      dhcp_enabled: false,
      dhcp_operation_mode: "Fixed",
      dns_answer_enabled: true,
      dns_answer_ipv4_mode: "Increment",
      dns_answer_ttl_mode: "Random",
      dns_enabled: true,
      dns_flags_mode: "Random",
      dns_query_class_mode: "Increment",
      dns_query_type_mode: "Decrement",
      dns_transaction_id_mode: "Increment",
      l4_dst_port: 53,
      l4_dst_port_override: true,
      udp_checksum_override: false,
      udp_length_mode: "Fixed",
      udp_length_override: false
    });
    expect(patches[0].frame_length).toBeGreaterThan(selectedDnsStream.frame_length);
    expect(patches[0].frame_length_min).toBeGreaterThan(selectedDnsStream.frame_length_min);
  });

  it("binds DNS answer selection and answer minimum frame updates", () => {
    const { handlers, patches } = collectHandlers(selectedDnsStream);

    expect(handlers.changeDnsAnswerSelection(true)).toBe(true);

    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      dns_answer_enabled: true,
      dns_answer_ipv4_mode: "Increment",
      dns_answer_ttl_mode: "Random",
      dns_flags: "8180",
      dns_query_class_mode: "Fixed",
      dns_query_type: 1,
      dns_query_type_mode: "Fixed"
    });
    expect(patches[0].frame_length).toBeGreaterThan(selectedDnsStream.frame_length);
    expect(patches[0].frame_length_min).toBeGreaterThan(selectedDnsStream.frame_length_min);
  });

  it("binds DNS header, question, and answer field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeDnsNumber("transaction-id", 4660)).toBe(true);
    expect(handlers.changeDnsMode("transaction-id", "Increment")).toBe(true);
    expect(handlers.changeDnsCount("transaction-id", 4)).toBe(true);
    expect(handlers.changeDnsStep("transaction-id", 1)).toBe(true);
    expect(handlers.changeDnsText("flags", "8180")).toBe(true);
    expect(handlers.changeDnsMode("flags", "Fixed")).toBe(true);
    expect(handlers.changeDnsText("query-name", "example.com")).toBe(true);
    expect(handlers.changeDnsNumber("query-type", 1)).toBe(true);
    expect(handlers.changeDnsMode("query-type", "Random")).toBe(true);
    expect(handlers.changeDnsNumber("query-class", 1)).toBe(true);
    expect(handlers.changeDnsMode("query-class", "Decrement")).toBe(true);
    expect(handlers.changeDnsNumber("answer-ttl", 300)).toBe(true);
    expect(handlers.changeDnsMode("answer-ttl", "Increment")).toBe(true);
    expect(handlers.changeDnsCount("answer-ttl", 8)).toBe(true);
    expect(handlers.changeDnsStep("answer-ttl", 2)).toBe(true);
    expect(handlers.changeDnsText("answer-ipv4", "198.51.100.10")).toBe(true);
    expect(handlers.changeDnsMode("answer-ipv4", "Random Host")).toBe(true);
    expect(handlers.changeDnsCount("answer-ipv4", 16)).toBe(true);
    expect(handlers.changeDnsStep("answer-ipv4", 4)).toBe(true);

    expect(patches).toEqual([
      { dns_transaction_id: 4660 },
      { dns_transaction_id_mode: "Increment" },
      { dns_transaction_id_count: 4 },
      { dns_transaction_id_step: 1 },
      { dns_flags: "8180" },
      { dns_flags_mode: "Fixed" },
      { dns_query_name: "example.com" },
      { dns_query_type: 1 },
      { dns_query_type_mode: "Random" },
      { dns_query_class: 1 },
      { dns_query_class_mode: "Decrement" },
      { dns_answer_ttl: 300 },
      { dns_answer_ttl_mode: "Increment" },
      { dns_answer_ttl_count: 8 },
      { dns_answer_ttl_step: 2 },
      { dns_answer_ipv4: "198.51.100.10" },
      { dns_answer_ipv4_mode: "Random Host" },
      { dns_answer_ipv4_count: 16 },
      { dns_answer_ipv4_step: 4 }
    ]);
  });

  it("does not synthesize DNS selection patches without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeDnsSelection(true)).toBe(false);
    expect(handlers.changeDnsAnswerSelection(true)).toBe(false);
    expect(handlers.changeDnsNumber("query-type", 1)).toBe(true);
    expect(handlers.changeDnsText("query-name", "example.com")).toBe(true);

    expect(patches).toEqual([
      { dns_query_type: 1 },
      { dns_query_name: "example.com" }
    ]);
  });
});
