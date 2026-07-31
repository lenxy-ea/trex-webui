import type { ProfileWorkbenchStream } from "../../../api";

export type L3Selection = "None" | "ARP" | "IPv4" | "IPv6";
export type L4Selection = "None" | "TCP" | "UDP" | "ICMP" | "GRE" | "SCTP";

export function protocolName(packetType: ProfileWorkbenchStream["packet_type"]): L4Selection {
  if (packetType.endsWith("/TCP")) {
    return "TCP";
  }
  if (packetType.endsWith("/UDP")) {
    return "UDP";
  }
  if (packetType.endsWith("/ICMP") || packetType.endsWith("/ICMPv6")) {
    return "ICMP";
  }
  if (packetType.endsWith("/GRE")) {
    return "GRE";
  }
  if (packetType.endsWith("/SCTP")) {
    return "SCTP";
  }
  return "None";
}

export function ipVersionName(packetType: ProfileWorkbenchStream["packet_type"]): L3Selection {
  if (packetType === "Ethernet") {
    return "None";
  }
  if (packetType === "Ethernet/ARP") {
    return "ARP";
  }
  return packetType.includes("/IPv6") ? "IPv6" : "IPv4";
}

export function packetTypeFor(ipVersion: L3Selection, protocol: L4Selection) {
  if (ipVersion === "None") {
    return "Ethernet";
  }
  if (ipVersion === "ARP") {
    return "Ethernet/ARP";
  }
  if (protocol === "None") {
    return ipVersion === "IPv4" ? "Ethernet/IPv4" : "Ethernet/IPv6";
  }
  if (protocol === "ICMP") {
    return ipVersion === "IPv4" ? "Ethernet/IPv4/ICMP" : "Ethernet/IPv6/ICMPv6";
  }
  if (protocol === "GRE") {
    return `Ethernet/${ipVersion}/GRE` as ProfileWorkbenchStream["packet_type"];
  }
  if (protocol === "SCTP") {
    return `Ethernet/${ipVersion}/SCTP` as ProfileWorkbenchStream["packet_type"];
  }
  return `Ethernet/${ipVersion}/${protocol}` as ProfileWorkbenchStream["packet_type"];
}

export function hasIpLayer(packetType: ProfileWorkbenchStream["packet_type"]) {
  return packetType.startsWith("Ethernet/IPv");
}

export function l4ProtocolTitle(protocol: L4Selection, packetType: ProfileWorkbenchStream["packet_type"]) {
  if (protocol === "TCP") {
    return "Transmission Control Protocol";
  }
  if (protocol === "UDP") {
    return "User Datagram Protocol";
  }
  if (protocol === "GRE") {
    return "Generic Routing Encapsulation";
  }
  if (protocol === "SCTP") {
    return "Stream Control Transmission Protocol";
  }
  if (packetType === "Ethernet/IPv6/ICMPv6") {
    return "Internet Control Message Protocol v6";
  }
  if (protocol === "ICMP") {
    return "Internet Control Message Protocol";
  }
  return "";
}
