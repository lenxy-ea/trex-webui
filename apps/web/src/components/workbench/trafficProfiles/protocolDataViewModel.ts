import type { ProfileWorkbenchStream } from "../../../api";
import { isIcmpEchoStream, isIcmpv6EchoStream } from "./advancedVmModel";
import {
  arpProtocolViewModel,
  dhcpProtocolViewModel,
  dnsProtocolViewModel,
  ethernetProtocolViewModel,
  greProtocolViewModel,
  gtpuProtocolViewModel,
  icmpProtocolViewModel,
  icmpv6NdProtocolViewModel,
  icmpv6RaProtocolViewModel,
  icmpv6RsProtocolViewModel,
  ipv4AddressProtocolViewModel,
  ipv4FlagsChecksumProtocolViewModel,
  ipv4ScalarProtocolViewModel,
  ipv6AddressProtocolViewModel,
  ipv6ScalarProtocolViewModel,
  l4PortProtocolViewModel,
  mediaAccessProtocolViewModel,
  mplsProtocolViewModel,
  mplsSecondLabelProtocolViewModel,
  mplsThirdLabelProtocolViewModel,
  sctpProtocolViewModel,
  tcpChecksumProtocolViewModel,
  tcpCoreProtocolViewModel,
  tcpMssOptionViewModel,
  tcpSackOptionViewModel,
  tcpTimestampOptionViewModel,
  tcpUrgentFlagsProtocolViewModel,
  tcpWindowScaleOptionViewModel,
  udpProtocolViewModel,
  vlanInnerTagProtocolViewModel,
  vlanProtocolViewModel,
  vxlanProtocolViewModel
} from "./model";

export function protocolDataViewModel(stream: ProfileWorkbenchStream) {
  return {
    mediaAccess: mediaAccessProtocolViewModel(stream),
    vlan: vlanProtocolViewModel(stream),
    vlanInnerTag: vlanInnerTagProtocolViewModel(stream),
    mpls: mplsProtocolViewModel(stream),
    mplsSecondLabel: mplsSecondLabelProtocolViewModel(stream),
    mplsThirdLabel: mplsThirdLabelProtocolViewModel(stream),
    vxlan: vxlanProtocolViewModel(stream),
    gtpu: gtpuProtocolViewModel(stream),
    gre: greProtocolViewModel(stream),
    ethernet: ethernetProtocolViewModel(stream),
    ipv4Address: ipv4AddressProtocolViewModel(stream),
    ipv4Scalar: ipv4ScalarProtocolViewModel(stream),
    ipv4FlagsChecksum: ipv4FlagsChecksumProtocolViewModel(stream),
    ipv6Address: ipv6AddressProtocolViewModel(stream),
    ipv6Scalar: ipv6ScalarProtocolViewModel(stream),
    l4Port: l4PortProtocolViewModel(stream),
    icmp: icmpProtocolViewModel(stream, {
      echoEnabled: isIcmpEchoStream(stream),
      v6EchoEnabled: isIcmpv6EchoStream(stream)
    }),
    icmpv6Rs: icmpv6RsProtocolViewModel(stream),
    icmpv6Ra: icmpv6RaProtocolViewModel(stream),
    icmpv6Nd: icmpv6NdProtocolViewModel(stream),
    udp: udpProtocolViewModel(stream),
    dns: dnsProtocolViewModel(stream),
    dhcp: dhcpProtocolViewModel(stream),
    sctp: sctpProtocolViewModel(stream),
    arp: arpProtocolViewModel(stream),
    tcpCore: tcpCoreProtocolViewModel(stream),
    tcpChecksum: tcpChecksumProtocolViewModel(stream),
    tcpUrgentFlags: tcpUrgentFlagsProtocolViewModel(stream),
    tcpMssOption: tcpMssOptionViewModel(stream),
    tcpWindowScaleOption: tcpWindowScaleOptionViewModel(stream),
    tcpSackOption: tcpSackOptionViewModel(stream),
    tcpTimestampOption: tcpTimestampOptionViewModel(stream)
  };
}

export type ProtocolDataViewModel = ReturnType<typeof protocolDataViewModel>;
