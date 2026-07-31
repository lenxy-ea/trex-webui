import {
  advancedVmDefaultBody,
  isVariableFrameLengthStream,
  type AdvancedVmTemplate
} from "./model";
import {
  buildPacketLengthVmBody
} from "./packetLayoutModel";
import {
  buildArpOperationIncVmBody,
  buildArpSenderIpIncVmBody,
  buildArpSenderMacIncVmBody,
  buildArpTargetIpIncVmBody,
  buildArpTargetMacIncVmBody,
  buildDhcpBootpIpv4IncVmBody,
  buildDhcpClientIdentifierFirstByteIncVmBody,
  buildDhcpClientMacIncVmBody,
  buildDhcpFlagMaskedVmBody,
  buildDhcpHostnameFirstByteIncVmBody,
  buildDhcpNumberIncVmBody,
  buildDhcpOptionIpv4IncVmBody,
  buildDhcpParameterRequestFirstOptionIncVmBody,
  buildDhcpTimerIncVmBody,
  buildDnsAdditionalRrsIncVmBody,
  buildDnsAnswerClassIncVmBody,
  buildDnsAnswerIpv4IncVmBody,
  buildDnsAnswerTtlIncVmBody,
  buildDnsAnswerTypeIncVmBody,
  buildDnsAnswersIncVmBody,
  buildDnsAuthoritativeAnswerFlagVmBody,
  buildDnsAuthorityRrsIncVmBody,
  buildDnsFlagsIncVmBody,
  buildDnsOpcodeIncVmBody,
  buildDnsQueryClassIncVmBody,
  buildDnsQueryNameFirstByteIncVmBody,
  buildDnsQueryTypeIncVmBody,
  buildDnsQuestionsIncVmBody,
  buildDnsRecursionAvailableFlagVmBody,
  buildDnsRecursionDesiredFlagVmBody,
  buildDnsReservedFlagsIncVmBody,
  buildDnsResponseCodeIncVmBody,
  buildDnsResponseFlagVmBody,
  buildDnsTransactionIdIncVmBody,
  buildDnsTruncatedFlagVmBody,
  buildGreInnerFiveTupleVmBody,
  buildGreInnerIpv4DfFlagVaryVmBody,
  buildGreInnerIpv4DscpIncVmBody,
  buildGreInnerIpv4DstIncVmBody,
  buildGreInnerIpv4EcnIncVmBody,
  buildGreInnerIpv4FragmentOffsetIncVmBody,
  buildGreInnerIpv4IdIncVmBody,
  buildGreInnerIpv4MfFlagVaryVmBody,
  buildGreInnerIpv4ReservedFlagVaryVmBody,
  buildGreInnerIpv4SrcIncVmBody,
  buildGreInnerIpv4TtlIncVmBody,
  buildGreInnerIpv6DstIncVmBody,
  buildGreInnerIpv6FlowLabelIncVmBody,
  buildGreInnerIpv6HopLimitIncVmBody,
  buildGreInnerIpv6SrcIncVmBody,
  buildGreInnerIpv6TrafficClassIncVmBody,
  buildGreInnerTcpDstPortIncVmBody,
  buildGreInnerTcpSrcPortIncVmBody,
  buildGreInnerUdpDstPortIncVmBody,
  buildGreInnerUdpSrcPortIncVmBody,
  buildGreKeyIncVmBody,
  buildGreProtocolTypeIncVmBody,
  buildGreSequenceIncVmBody,
  buildGtpuExtensionUdpPortIncVmBody,
  buildGtpuInnerFiveTupleVmBody,
  buildGtpuInnerIpv4DfFlagVaryVmBody,
  buildGtpuInnerIpv4DscpIncVmBody,
  buildGtpuInnerIpv4DstIncVmBody,
  buildGtpuInnerIpv4EcnIncVmBody,
  buildGtpuInnerIpv4FragmentOffsetIncVmBody,
  buildGtpuInnerIpv4IdIncVmBody,
  buildGtpuInnerIpv4MfFlagVaryVmBody,
  buildGtpuInnerIpv4ReservedFlagVaryVmBody,
  buildGtpuInnerIpv4SrcIncVmBody,
  buildGtpuInnerIpv4TtlIncVmBody,
  buildGtpuInnerIpv6DstIncVmBody,
  buildGtpuInnerIpv6FlowLabelIncVmBody,
  buildGtpuInnerIpv6HopLimitIncVmBody,
  buildGtpuInnerIpv6SrcIncVmBody,
  buildGtpuInnerIpv6TrafficClassIncVmBody,
  buildGtpuInnerTcpDstPortIncVmBody,
  buildGtpuInnerTcpSrcPortIncVmBody,
  buildGtpuInnerUdpDstPortIncVmBody,
  buildGtpuInnerUdpSrcPortIncVmBody,
  buildGtpuMessageTypeIncVmBody,
  buildGtpuNpduIncVmBody,
  buildGtpuSequenceIncVmBody,
  buildGtpuTeidVmBody,
  buildIcmpv4CodeChecksumCoupledVmBody,
  buildIcmpv4IdentifierChecksumCoupledVmBody,
  buildIcmpv4SequenceChecksumCoupledVmBody,
  buildIcmpv4TypeChecksumCoupledVmBody,
  buildIcmpv6CodeIncVmBody,
  buildIcmpv6IdentifierIncVmBody,
  buildIcmpv6LinkLayerOptionMacIncVmBody,
  buildIcmpv6NaOverrideFlagVmBody,
  buildIcmpv6NaRouterFlagVmBody,
  buildIcmpv6NaSolicitedFlagVmBody,
  buildIcmpv6NdTargetAddressIncVmBody,
  buildIcmpv6RaCurrentHopLimitIncVmBody,
  buildIcmpv6RaManagedFlagVmBody,
  buildIcmpv6RaOtherFlagVmBody,
  buildIcmpv6RaPrefixAutonomousFlagVmBody,
  buildIcmpv6RaPrefixIncVmBody,
  buildIcmpv6RaPrefixLengthIncVmBody,
  buildIcmpv6RaPrefixOnLinkFlagVmBody,
  buildIcmpv6RaPrefixPreferredLifetimeIncVmBody,
  buildIcmpv6RaPrefixValidLifetimeIncVmBody,
  buildIcmpv6RaReachableTimeIncVmBody,
  buildIcmpv6RaRetransTimerIncVmBody,
  buildIcmpv6RaRouterLifetimeIncVmBody,
  buildIcmpv6SequenceIncVmBody,
  buildIcmpv6TypeIncVmBody,
  buildInnerVlanCfiVaryVmBody,
  buildInnerVlanIdIncVmBody,
  buildInnerVlanPriorityIncVmBody,
  buildIpv4OptionClassIncVmBody,
  buildIpv4OptionCopiedFlagVmBody,
  buildIpv4OptionNumberIncVmBody,
  buildIpv4RouterAlertIncVmBody,
  buildIpv6AhSequenceIncVmBody,
  buildIpv6AhSpiIncVmBody,
  buildIpv6ExtensionOptionActionIncVmBody,
  buildIpv6ExtensionOptionChangeFlagVmBody,
  buildIpv6ExtensionOptionNumberIncVmBody,
  buildIpv6FragmentIdentificationIncVmBody,
  buildIpv6FragmentMoreFragmentsVaryVmBody,
  buildIpv6FragmentOffsetIncVmBody,
  buildIpv6FragmentReservedBitsIncVmBody,
  buildIpv6JumboPayloadIncVmBody,
  buildIpv6RouterAlertIncVmBody,
  buildIpv6RoutingSegmentsLeftIncVmBody,
  buildIpv6RoutingTypeIncVmBody,
  buildMplsLabelIncVmBody,
  buildMplsTrafficClassIncVmBody,
  buildMplsTtlIncVmBody,
  buildOuterEtherTypeIncVmBody,
  buildOuterIpv4DfFlagVaryVmBody,
  buildOuterIpv4DscpIncVmBody,
  buildOuterIpv4DstIncVmBody,
  buildOuterIpv4DstRandomVmBody,
  buildOuterIpv4EcnIncVmBody,
  buildOuterIpv4FragmentOffsetIncVmBody,
  buildOuterIpv4IdIncVmBody,
  buildOuterIpv4MfFlagVaryVmBody,
  buildOuterIpv4ReservedFlagVaryVmBody,
  buildOuterIpv4SrcIncVmBody,
  buildOuterIpv4SrcRandomVmBody,
  buildOuterIpv4TtlIncVmBody,
  buildOuterIpv4UdpChecksumIncVmBody,
  buildOuterIpv4UdpLengthIncVmBody,
  buildOuterIpv6DstIncVmBody,
  buildOuterIpv6FlowLabelIncVmBody,
  buildOuterIpv6HopLimitIncVmBody,
  buildOuterIpv6SrcIncVmBody,
  buildOuterIpv6TcpDstPortIncVmBody,
  buildOuterIpv6TcpFiveTupleVmBody,
  buildOuterIpv6TcpSrcPortIncVmBody,
  buildOuterIpv6TrafficClassIncVmBody,
  buildOuterIpv6UdpChecksumIncVmBody,
  buildOuterIpv6UdpDstPortIncVmBody,
  buildOuterIpv6UdpFiveTupleVmBody,
  buildOuterIpv6UdpLengthIncVmBody,
  buildOuterIpv6UdpSrcPortIncVmBody,
  buildOuterMacDstIncVmBody,
  buildOuterMacSrcIncVmBody,
  buildOuterTcpAckIncVmBody,
  buildOuterTcpChecksumIncVmBody,
  buildOuterTcpDstPortIncVmBody,
  buildOuterTcpFiveTupleVmBody,
  buildOuterTcpFlagVaryVmBody,
  buildOuterTcpFlagsIncVmBody,
  buildOuterTcpOptionMssIncVmBody,
  buildOuterTcpOptionSack2LeftIncVmBody,
  buildOuterTcpOptionSack2RightIncVmBody,
  buildOuterTcpOptionSack3LeftIncVmBody,
  buildOuterTcpOptionSack3RightIncVmBody,
  buildOuterTcpOptionSack4LeftIncVmBody,
  buildOuterTcpOptionSack4RightIncVmBody,
  buildOuterTcpOptionSackLeftIncVmBody,
  buildOuterTcpOptionSackRightIncVmBody,
  buildOuterTcpOptionTimestampEchoIncVmBody,
  buildOuterTcpOptionTimestampValueIncVmBody,
  buildOuterTcpOptionWindowScaleIncVmBody,
  buildOuterTcpReservedBitsIncVmBody,
  buildOuterTcpSequenceIncVmBody,
  buildOuterTcpSrcPortIncVmBody,
  buildOuterTcpUrgentPointerIncVmBody,
  buildOuterTcpWindowIncVmBody,
  buildOuterUdpDstPortIncVmBody,
  buildOuterUdpFiveTupleVmBody,
  buildOuterUdpSrcPortIncVmBody,
  buildSctpDataBeginningFragmentFlagVmBody,
  buildSctpDataEndingFragmentFlagVmBody,
  buildSctpDataFlagsIncVmBody,
  buildSctpDataImmediateSackFlagVmBody,
  buildSctpDataReservedFlagsIncVmBody,
  buildSctpDataUnorderedFlagVmBody,
  buildSctpDestinationPortIncVmBody,
  buildSctpPayloadProtocolIdIncVmBody,
  buildSctpSourcePortIncVmBody,
  buildSctpStreamIdIncVmBody,
  buildSctpStreamSequenceIncVmBody,
  buildSctpTsnIncVmBody,
  buildSctpVerificationTagIncVmBody,
  buildSecondMplsLabelIncVmBody,
  buildSecondMplsTrafficClassIncVmBody,
  buildSecondMplsTtlIncVmBody,
  buildThirdMplsLabelIncVmBody,
  buildThirdMplsTrafficClassIncVmBody,
  buildThirdMplsTtlIncVmBody,
  buildVlanCfiVaryVmBody,
  buildVlanIdIncVmBody,
  buildVlanPriorityIncVmBody,
  buildVxlanIFlagVaryVmBody,
  buildVxlanInnerArpOperationIncVmBody,
  buildVxlanInnerArpSenderIpIncVmBody,
  buildVxlanInnerArpSenderMacIncVmBody,
  buildVxlanInnerArpTargetIpIncVmBody,
  buildVxlanInnerArpTargetMacIncVmBody,
  buildVxlanInnerEtherTypeIncVmBody,
  buildVxlanInnerFiveTupleVmBody,
  buildVxlanInnerIpv4DfFlagVaryVmBody,
  buildVxlanInnerIpv4DscpIncVmBody,
  buildVxlanInnerIpv4DstIncVmBody,
  buildVxlanInnerIpv4EcnIncVmBody,
  buildVxlanInnerIpv4FragmentOffsetIncVmBody,
  buildVxlanInnerIpv4IdIncVmBody,
  buildVxlanInnerIpv4MfFlagVaryVmBody,
  buildVxlanInnerIpv4ReservedFlagVaryVmBody,
  buildVxlanInnerIpv4SrcIncVmBody,
  buildVxlanInnerIpv4TtlIncVmBody,
  buildVxlanInnerIpv6DstIncVmBody,
  buildVxlanInnerIpv6FlowLabelIncVmBody,
  buildVxlanInnerIpv6HopLimitIncVmBody,
  buildVxlanInnerIpv6SrcIncVmBody,
  buildVxlanInnerIpv6TrafficClassIncVmBody,
  buildVxlanInnerMacDstIncVmBody,
  buildVxlanInnerMacSrcIncVmBody,
  buildVxlanInnerSecondVlanCfiVaryVmBody,
  buildVxlanInnerSecondVlanIdIncVmBody,
  buildVxlanInnerSecondVlanPriorityIncVmBody,
  buildVxlanInnerTcpDstPortIncVmBody,
  buildVxlanInnerTcpSrcPortIncVmBody,
  buildVxlanInnerUdpDstPortIncVmBody,
  buildVxlanInnerUdpSrcPortIncVmBody,
  buildVxlanInnerVlanCfiVaryVmBody,
  buildVxlanInnerVlanIdIncVmBody,
  buildVxlanInnerVlanPriorityIncVmBody,
  buildVxlanVniIncVmBody,
  isAdvancedDhcpClientIdentifierStream,
  isAdvancedDhcpHostnameStream,
  isAdvancedDhcpLeaseTimeStream,
  isAdvancedDhcpMessageTypeStream,
  isAdvancedDhcpParameterRequestStream,
  isAdvancedDhcpRebindingTimeStream,
  isAdvancedDhcpRenewalTimeStream,
  isAdvancedDhcpRequestedIpStream,
  isAdvancedDhcpServerIdStream,
  isAdvancedDhcpStream,
  isAdvancedDnsAnswerIpv4Stream,
  isAdvancedDnsAnswerStream,
  isAdvancedDnsQueryNameStream,
  isAdvancedDnsStream,
  isAdvancedIcmpv4EchoCodeStream,
  isAdvancedIcmpv4EchoIdentifierStream,
  isAdvancedIcmpv4EchoSequenceStream,
  isAdvancedIcmpv4EchoTypeStream,
  isAdvancedIcmpv6LinkLayerOptionMacStream,
  isAdvancedIcmpv6NaFlagsStream,
  isAdvancedIcmpv6NdTargetAddressStream,
  isAdvancedIcmpv6RaFixedStream,
  isAdvancedIcmpv6RaPrefixInfoStream,
  isAdvancedOuterIpv4Stream,
  isAdvancedOuterIpv4TcpStream,
  isAdvancedOuterIpv4UdpStream,
  isAdvancedOuterIpv6DstVmStream,
  isAdvancedOuterIpv6SrcVmStream,
  isAdvancedOuterIpv6Stream,
  isAdvancedOuterIpv6TcpFiveTupleStream,
  isAdvancedOuterIpv6TcpStream,
  isAdvancedOuterIpv6UdpFiveTupleStream,
  isAdvancedOuterIpv6UdpStream,
  isAdvancedOuterSctpDataStream,
  isAdvancedOuterSctpStream,
  isAdvancedOuterTcpMssStream,
  isAdvancedOuterTcpSackBlockStream,
  isAdvancedOuterTcpStream,
  isAdvancedOuterTcpTimestampStream,
  isAdvancedOuterTcpWindowScaleStream,
  isAdvancedRawTcpSackFourthBlockStream,
  isAdvancedRawTcpSackSecondBlockStream,
  isAdvancedRawTcpSackThirdBlockStream,
  isArpStream,
  isGreInnerTcpStreamWithoutGreChecksum,
  isGreInnerUdpStreamWithoutGreChecksum,
  isGreKeyStreamWithoutGreChecksum,
  isGreSequenceStreamWithoutGreChecksum,
  isGreStreamWithoutGreChecksum,
  isIcmpv6EchoStream,
  isInnerTaggedVlanStream,
  isIpv4GreAddressStreamWithoutGreChecksum,
  isIpv4GreStreamWithoutGreChecksum,
  isIpv4GreTtlStreamWithoutGreChecksum,
  isIpv6GreDstVmStreamWithoutGreChecksum,
  isIpv6GreSrcVmStreamWithoutGreChecksum,
  isIpv6GreStreamWithoutGreChecksum,
  isMplsStream,
  isOuterEtherTypeStream,
  isOuterIpv4GtpuExtensionStream,
  isOuterIpv4GtpuInnerIpv4AddressStream,
  isOuterIpv4GtpuInnerIpv4Stream,
  isOuterIpv4GtpuInnerIpv4TtlStream,
  isOuterIpv4GtpuInnerIpv6DstVmStream,
  isOuterIpv4GtpuInnerIpv6SrcVmStream,
  isOuterIpv4GtpuInnerIpv6Stream,
  isOuterIpv4GtpuInnerRawIpv4Stream,
  isOuterIpv4GtpuInnerRawIpv6Stream,
  isOuterIpv4GtpuInnerTcpStream,
  isOuterIpv4GtpuInnerUdpStream,
  isOuterIpv4GtpuNpduStream,
  isOuterIpv4GtpuSequenceStream,
  isOuterIpv4GtpuStream,
  isOuterIpv4VxlanInnerArpStream,
  isOuterIpv4VxlanInnerEthernetStream,
  isOuterIpv4VxlanInnerIpv4AddressStream,
  isOuterIpv4VxlanInnerIpv4Stream,
  isOuterIpv4VxlanInnerIpv4TtlStream,
  isOuterIpv4VxlanInnerIpv6DstVmStream,
  isOuterIpv4VxlanInnerIpv6SrcVmStream,
  isOuterIpv4VxlanInnerIpv6Stream,
  isOuterIpv4VxlanInnerRawIpv4Stream,
  isOuterIpv4VxlanInnerRawIpv6Stream,
  isOuterIpv4VxlanInnerSecondVlanStream,
  isOuterIpv4VxlanInnerTcpStream,
  isOuterIpv4VxlanInnerUdpStream,
  isOuterIpv4VxlanInnerVlanStream,
  isOuterIpv4VxlanStream,
  isRawIpv4GreStreamWithoutGreChecksum,
  isRawIpv6GreStreamWithoutGreChecksum,
  isSecondMplsStream,
  isTaggedVlanStream,
  isThirdMplsStream
} from "./advancedVmModel";
import {
  isAdvancedIpv4OptionTypeStream,
  isAdvancedIpv4RouterAlertStream,
  isAdvancedIpv6AhStream,
  isAdvancedIpv6ExtensionOptionTypeStream,
  isAdvancedIpv6FragmentStream,
  isAdvancedIpv6JumboPayloadStream,
  isAdvancedIpv6RouterAlertStream,
  isAdvancedIpv6RoutingStream
} from "./rawPacketModel";

export const advancedVmTemplates: AdvancedVmTemplate[] = [
  {
    name: "empty",
    label: "Empty VM",
    description: "Replace the editor with an empty Field Engine body.",
    requires: "Any stream",
    body: advancedVmDefaultBody
  },
  {
    name: "packet-length",
    label: "Packet length",
    description: "Vary packet size with trim_pkt_size and update matching IP/UDP length fields.",
    requires: "Frame length mode Increment, Decrement, or Random",
    supports: isVariableFrameLengthStream,
    buildBody: buildPacketLengthVmBody
  },
  {
    name: "mac-dst-inc",
    label: "MAC dst inc",
    description: "Increment the outer Ethernet destination MAC address.",
    requires: "Any Ethernet stream",
    buildBody: buildOuterMacDstIncVmBody
  },
  {
    name: "mac-src-inc",
    label: "MAC src inc",
    description: "Increment the outer Ethernet source MAC address.",
    requires: "Any Ethernet stream",
    buildBody: buildOuterMacSrcIncVmBody
  },
  {
    name: "ether-type-inc",
    label: "EtherType inc",
    description: "Increment the outer Ethernet EtherType field.",
    requires: "Untagged Ethernet stream or raw/imported packet whose outer EtherType is not a VLAN TPID",
    supports: isOuterEtherTypeStream,
    buildBody: buildOuterEtherTypeIncVmBody
  },
  {
    name: "arp-operation-inc",
    label: "ARP operation inc",
    description: "Increment the ARP operation field.",
    requires: "Ethernet[/VLAN/MPLS]/ARP stream",
    supports: isArpStream,
    buildBody: buildArpOperationIncVmBody
  },
  {
    name: "arp-sender-ip-inc",
    label: "ARP sender IP inc",
    description: "Increment the ARP sender protocol address.",
    requires: "Ethernet[/VLAN/MPLS]/ARP stream",
    supports: isArpStream,
    buildBody: buildArpSenderIpIncVmBody
  },
  {
    name: "arp-target-ip-inc",
    label: "ARP target IP inc",
    description: "Increment the ARP target protocol address.",
    requires: "Ethernet[/VLAN/MPLS]/ARP stream",
    supports: isArpStream,
    buildBody: buildArpTargetIpIncVmBody
  },
  {
    name: "arp-sender-mac-inc",
    label: "ARP sender MAC inc",
    description: "Increment the last byte of the ARP sender hardware address.",
    requires: "Ethernet[/VLAN/MPLS]/ARP stream",
    supports: isArpStream,
    buildBody: buildArpSenderMacIncVmBody
  },
  {
    name: "arp-target-mac-inc",
    label: "ARP target MAC inc",
    description: "Increment the last byte of the ARP target hardware address.",
    requires: "Ethernet[/VLAN/MPLS]/ARP stream",
    supports: isArpStream,
    buildBody: buildArpTargetMacIncVmBody
  },
  {
    name: "ipv4-src-inc",
    label: "IPv4 src inc",
    description: "Increment the IPv4 source address and repair IPv4/L4 checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4SrcIncVmBody
  },
  {
    name: "ipv4-src-random",
    label: "IPv4 src random",
    description: "Randomize the IPv4 source address suffix and repair IPv4/L4 checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4SrcRandomVmBody
  },
  {
    name: "ipv4-dst-inc",
    label: "IPv4 dst inc",
    description: "Increment the IPv4 destination address and repair IPv4/L4 checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4DstIncVmBody
  },
  {
    name: "ipv4-dst-random",
    label: "IPv4 dst random",
    description: "Randomize the IPv4 destination address and repair IPv4/L4 checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4DstRandomVmBody
  },
  {
    name: "ipv4-id-inc",
    label: "IPv4 ID inc",
    description: "Increment the IPv4 identification field and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4IdIncVmBody
  },
  {
    name: "ipv4-dscp-inc",
    label: "IPv4 DSCP inc",
    description: "Increment IPv4 DSCP with a masked TOS-byte write and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4DscpIncVmBody
  },
  {
    name: "ipv4-ecn-inc",
    label: "IPv4 ECN inc",
    description: "Increment IPv4 ECN with a masked TOS-byte write and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4EcnIncVmBody
  },
  {
    name: "ipv4-fragment-offset-inc",
    label: "IPv4 fragment offset inc",
    description: "Increment the IPv4 fragment offset bits while preserving flags and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4FragmentOffsetIncVmBody
  },
  {
    name: "ipv4-reserved-flag-vary",
    label: "IPv4 reserved flag vary",
    description: "Vary the IPv4 reserved fragment flag while preserving DF/MF/offset bits and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4ReservedFlagVaryVmBody
  },
  {
    name: "ipv4-df-flag-vary",
    label: "IPv4 DF flag vary",
    description: "Vary the IPv4 Don't Fragment flag while preserving sibling fragment bits and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4DfFlagVaryVmBody
  },
  {
    name: "ipv4-mf-flag-vary",
    label: "IPv4 MF flag vary",
    description: "Vary the IPv4 More Fragments flag while preserving sibling fragment bits and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4MfFlagVaryVmBody
  },
  {
    name: "ipv4-router-alert-inc",
    label: "IPv4 Router Alert inc",
    description: "Increment the value field of an existing IPv4 Router Alert option and repair the IPv4 header checksum.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4 packet containing Router Alert option",
    supports: isAdvancedIpv4RouterAlertStream,
    buildBody: buildIpv4RouterAlertIncVmBody
  },
  {
    name: "ipv4-option-copied-flag-vary",
    label: "IPv4 option copied flag vary",
    description: "Vary the copied flag of the first IPv4 option with a masked write and repair the IPv4 header checksum.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4 packet containing an IPv4 option",
    supports: isAdvancedIpv4OptionTypeStream,
    buildBody: buildIpv4OptionCopiedFlagVmBody
  },
  {
    name: "ipv4-option-class-inc",
    label: "IPv4 option class inc",
    description: "Increment the class bits of the first IPv4 option with a masked write and repair the IPv4 header checksum.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4 packet containing an IPv4 option",
    supports: isAdvancedIpv4OptionTypeStream,
    buildBody: buildIpv4OptionClassIncVmBody
  },
  {
    name: "ipv4-option-number-inc",
    label: "IPv4 option number inc",
    description: "Increment the option-number bits of the first IPv4 option with a masked write and repair the IPv4 header checksum.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4 packet containing an IPv4 option",
    supports: isAdvancedIpv4OptionTypeStream,
    buildBody: buildIpv4OptionNumberIncVmBody
  },
  {
    name: "ipv4-ttl-inc",
    label: "IPv4 TTL inc",
    description: "Increment the IPv4 TTL byte and repair checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4Stream,
    buildBody: buildOuterIpv4TtlIncVmBody
  },
  {
    name: "ipv6-src-inc",
    label: "IPv6 src inc",
    description: "Increment the backend-selected suffix of the outer IPv6 source address.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6 stream with a safely representable IPv6 suffix",
    supports: isAdvancedOuterIpv6SrcVmStream,
    buildBody: buildOuterIpv6SrcIncVmBody
  },
  {
    name: "ipv6-dst-inc",
    label: "IPv6 dst inc",
    description: "Increment the backend-selected suffix of the outer IPv6 destination address.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6 stream with a safely representable IPv6 suffix",
    supports: isAdvancedOuterIpv6DstVmStream,
    buildBody: buildOuterIpv6DstIncVmBody
  },
  {
    name: "ipv6-traffic-class-inc",
    label: "IPv6 traffic class inc",
    description: "Increment the outer IPv6 traffic class with a masked VM write.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6 stream",
    supports: isAdvancedOuterIpv6Stream,
    buildBody: buildOuterIpv6TrafficClassIncVmBody
  },
  {
    name: "ipv6-flow-label-inc",
    label: "IPv6 flow label inc",
    description: "Increment the outer IPv6 flow label with a masked VM write.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6 stream",
    supports: isAdvancedOuterIpv6Stream,
    buildBody: buildOuterIpv6FlowLabelIncVmBody
  },
  {
    name: "ipv6-router-alert-inc",
    label: "IPv6 Router Alert inc",
    description: "Increment the value field of an existing IPv6 extension Router Alert option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Router Alert option",
    supports: isAdvancedIpv6RouterAlertStream,
    buildBody: buildIpv6RouterAlertIncVmBody
  },
  {
    name: "ipv6-option-action-inc",
    label: "IPv6 option action inc",
    description: "Increment the action bits of the first IPv6 extension option with a masked write.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing an IPv6 extension option",
    supports: isAdvancedIpv6ExtensionOptionTypeStream,
    buildBody: buildIpv6ExtensionOptionActionIncVmBody
  },
  {
    name: "ipv6-option-change-en-route-vary",
    label: "IPv6 option change-en-route vary",
    description: "Vary the change-en-route bit of the first IPv6 extension option with a masked write.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing an IPv6 extension option",
    supports: isAdvancedIpv6ExtensionOptionTypeStream,
    buildBody: buildIpv6ExtensionOptionChangeFlagVmBody
  },
  {
    name: "ipv6-option-number-inc",
    label: "IPv6 option number inc",
    description: "Increment the option-number bits of the first IPv6 extension option with a masked write.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing an IPv6 extension option",
    supports: isAdvancedIpv6ExtensionOptionTypeStream,
    buildBody: buildIpv6ExtensionOptionNumberIncVmBody
  },
  {
    name: "ipv6-jumbo-payload-inc",
    label: "IPv6 Jumbo Payload inc",
    description: "Increment the value field of an existing IPv6 Jumbo Payload option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Jumbo Payload option",
    supports: isAdvancedIpv6JumboPayloadStream,
    buildBody: buildIpv6JumboPayloadIncVmBody
  },
  {
    name: "ipv6-routing-type-inc",
    label: "IPv6 routing type inc",
    description: "Increment the Routing Type field of an existing IPv6 Routing header.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Routing header",
    supports: isAdvancedIpv6RoutingStream,
    buildBody: buildIpv6RoutingTypeIncVmBody
  },
  {
    name: "ipv6-routing-segments-left-inc",
    label: "IPv6 routing segments left inc",
    description: "Increment the Segments Left field of an existing IPv6 Routing header.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Routing header",
    supports: isAdvancedIpv6RoutingStream,
    buildBody: buildIpv6RoutingSegmentsLeftIncVmBody
  },
  {
    name: "ipv6-fragment-id-inc",
    label: "IPv6 fragment ID inc",
    description: "Increment the Identification field of an existing IPv6 Fragment header.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Fragment header",
    supports: isAdvancedIpv6FragmentStream,
    buildBody: buildIpv6FragmentIdentificationIncVmBody
  },
  {
    name: "ipv6-fragment-offset-inc",
    label: "IPv6 fragment offset inc",
    description: "Increment the IPv6 Fragment offset bits while preserving reserved and more-fragments bits.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Fragment header",
    supports: isAdvancedIpv6FragmentStream,
    buildBody: buildIpv6FragmentOffsetIncVmBody
  },
  {
    name: "ipv6-fragment-reserved-bits-inc",
    label: "IPv6 fragment reserved bits inc",
    description: "Increment the IPv6 Fragment reserved bits while preserving offset and more-fragments bits.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Fragment header",
    supports: isAdvancedIpv6FragmentStream,
    buildBody: buildIpv6FragmentReservedBitsIncVmBody
  },
  {
    name: "ipv6-fragment-more-fragments-vary",
    label: "IPv6 fragment more fragments vary",
    description: "Vary the IPv6 Fragment More Fragments bit while preserving sibling fragment bits.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing Fragment header",
    supports: isAdvancedIpv6FragmentStream,
    buildBody: buildIpv6FragmentMoreFragmentsVaryVmBody
  },
  {
    name: "ipv6-ah-spi-inc",
    label: "IPv6 AH SPI inc",
    description: "Increment the SPI field of an existing IPv6 Authentication Header.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing AH header",
    supports: isAdvancedIpv6AhStream,
    buildBody: buildIpv6AhSpiIncVmBody
  },
  {
    name: "ipv6-ah-sequence-inc",
    label: "IPv6 AH sequence inc",
    description: "Increment the Sequence Number field of an existing IPv6 Authentication Header.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6 packet containing AH header",
    supports: isAdvancedIpv6AhStream,
    buildBody: buildIpv6AhSequenceIncVmBody
  },
  {
    name: "ipv6-hop-limit-inc",
    label: "IPv6 hop limit inc",
    description: "Increment the outer IPv6 hop limit byte.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6 stream",
    supports: isAdvancedOuterIpv6Stream,
    buildBody: buildOuterIpv6HopLimitIncVmBody
  },
  {
    name: "ipv6-udp-src-port-inc",
    label: "IPv6 UDP src port inc",
    description: "Increment the outer UDP source port on an IPv6 packet and repair the UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/UDP stream",
    supports: isAdvancedOuterIpv6UdpStream,
    buildBody: buildOuterIpv6UdpSrcPortIncVmBody
  },
  {
    name: "ipv6-udp-dst-port-inc",
    label: "IPv6 UDP dst port inc",
    description: "Increment the outer UDP destination port on an IPv6 packet and repair the UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/UDP stream",
    supports: isAdvancedOuterIpv6UdpStream,
    buildBody: buildOuterIpv6UdpDstPortIncVmBody
  },
  {
    name: "ipv6-udp-length-inc",
    label: "IPv6 UDP length inc",
    description: "Increment the outer UDP length field on an IPv6 packet and repair the UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/UDP stream",
    supports: isAdvancedOuterIpv6UdpStream,
    buildBody: buildOuterIpv6UdpLengthIncVmBody
  },
  {
    name: "ipv6-udp-checksum-inc",
    label: "IPv6 UDP checksum inc",
    description: "Increment the outer UDP checksum field as the terminal checksum write on an IPv6 packet.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/UDP stream",
    supports: isAdvancedOuterIpv6UdpStream,
    buildBody: buildOuterIpv6UdpChecksumIncVmBody
  },
  {
    name: "ipv6-udp-5tuple-inc",
    label: "IPv6 UDP 5-tuple inc",
    description: "Increment outer IPv6 source/destination suffixes plus UDP source/destination ports and repair the UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/UDP stream with safely representable IPv6 suffixes",
    supports: isAdvancedOuterIpv6UdpFiveTupleStream,
    buildBody: buildOuterIpv6UdpFiveTupleVmBody
  },
  {
    name: "udp-src-port-inc",
    label: "UDP src port inc",
    description: "Increment the UDP source port and repair IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4UdpStream,
    buildBody: buildOuterUdpSrcPortIncVmBody
  },
  {
    name: "udp-dst-port-inc",
    label: "UDP dst port inc",
    description: "Increment the UDP destination port and repair IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4UdpStream,
    buildBody: buildOuterUdpDstPortIncVmBody
  },
  {
    name: "udp-length-inc",
    label: "UDP length inc",
    description: "Increment the UDP length field and repair IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4UdpStream,
    buildBody: buildOuterIpv4UdpLengthIncVmBody
  },
  {
    name: "udp-checksum-inc",
    label: "UDP checksum inc",
    description: "Increment the UDP checksum field as the terminal checksum write.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4UdpStream,
    buildBody: buildOuterIpv4UdpChecksumIncVmBody
  },
  {
    name: "udp-5tuple-inc",
    label: "UDP 5-tuple inc",
    description: "Increment outer IPv4 source/destination plus UDP source/destination ports and repair IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream without VXLAN/GTP-U",
    supports: isAdvancedOuterIpv4UdpStream,
    buildBody: buildOuterUdpFiveTupleVmBody
  },
  {
    name: "dns-transaction-id-inc",
    label: "DNS transaction ID inc",
    description: "Increment the DNS transaction ID and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsTransactionIdIncVmBody
  },
  {
    name: "dns-flags-inc",
    label: "DNS flags inc",
    description: "Increment the DNS flags word and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsFlagsIncVmBody
  },
  {
    name: "dns-questions-inc",
    label: "DNS questions inc",
    description: "Increment the DNS question count and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsQuestionsIncVmBody
  },
  {
    name: "dns-answers-inc",
    label: "DNS answers inc",
    description: "Increment the DNS answer count and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsAnswersIncVmBody
  },
  {
    name: "dns-authority-rrs-inc",
    label: "DNS authority RRs inc",
    description: "Increment the DNS authority record count and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsAuthorityRrsIncVmBody
  },
  {
    name: "dns-additional-rrs-inc",
    label: "DNS additional RRs inc",
    description: "Increment the DNS additional record count and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsAdditionalRrsIncVmBody
  },
  {
    name: "dns-response-flag-vary",
    label: "DNS response flag vary",
    description: "Vary the DNS QR response flag while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsResponseFlagVmBody
  },
  {
    name: "dns-opcode-inc",
    label: "DNS opcode inc",
    description: "Increment the DNS opcode bitfield while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsOpcodeIncVmBody
  },
  {
    name: "dns-authoritative-answer-flag-vary",
    label: "DNS authoritative answer flag vary",
    description: "Vary the DNS authoritative-answer flag while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsAuthoritativeAnswerFlagVmBody
  },
  {
    name: "dns-truncated-flag-vary",
    label: "DNS truncated flag vary",
    description: "Vary the DNS truncated flag while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsTruncatedFlagVmBody
  },
  {
    name: "dns-recursion-desired-flag-vary",
    label: "DNS recursion desired flag vary",
    description: "Vary the DNS recursion-desired flag while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsRecursionDesiredFlagVmBody
  },
  {
    name: "dns-recursion-available-flag-vary",
    label: "DNS recursion available flag vary",
    description: "Vary the DNS recursion-available flag while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsRecursionAvailableFlagVmBody
  },
  {
    name: "dns-reserved-flags-inc",
    label: "DNS reserved flags inc",
    description: "Increment the DNS reserved flags bitfield while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsReservedFlagsIncVmBody
  },
  {
    name: "dns-response-code-inc",
    label: "DNS response code inc",
    description: "Increment the DNS response-code bitfield while preserving sibling DNS flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsResponseCodeIncVmBody
  },
  {
    name: "dns-query-type-inc",
    label: "DNS query type inc",
    description: "Increment the DNS question type and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsQueryTypeIncVmBody
  },
  {
    name: "dns-query-class-inc",
    label: "DNS query class inc",
    description: "Increment the DNS question class and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DNS stream",
    supports: isAdvancedDnsStream,
    buildBody: buildDnsQueryClassIncVmBody
  },
  {
    name: "dns-query-name-byte-inc",
    label: "DNS query name first byte inc",
    description: "Increment the first DNS question-name label byte and repair the outer UDP checksum.",
    requires: "DNS stream with a non-empty question name",
    supports: isAdvancedDnsQueryNameStream,
    buildBody: buildDnsQueryNameFirstByteIncVmBody
  },
  {
    name: "dns-answer-ttl-inc",
    label: "DNS answer TTL inc",
    description: "Increment the DNS answer TTL and repair the outer UDP checksum.",
    requires: "DNS stream with answer enabled",
    supports: isAdvancedDnsAnswerStream,
    buildBody: buildDnsAnswerTtlIncVmBody
  },
  {
    name: "dns-answer-type-inc",
    label: "DNS answer type inc",
    description: "Increment the first DNS answer type and repair the outer UDP checksum.",
    requires: "DNS stream with answer enabled",
    supports: isAdvancedDnsAnswerStream,
    buildBody: buildDnsAnswerTypeIncVmBody
  },
  {
    name: "dns-answer-class-inc",
    label: "DNS answer class inc",
    description: "Increment the first DNS answer class and repair the outer UDP checksum.",
    requires: "DNS stream with answer enabled",
    supports: isAdvancedDnsAnswerStream,
    buildBody: buildDnsAnswerClassIncVmBody
  },
  {
    name: "dns-answer-ipv4-inc",
    label: "DNS answer IPv4 inc",
    description: "Increment the low DNS answer IPv4 address bytes and repair the outer UDP checksum.",
    requires: "DNS stream with an IPv4 A answer enabled",
    supports: isAdvancedDnsAnswerIpv4Stream,
    buildBody: buildDnsAnswerIpv4IncVmBody
  },
  {
    name: "dhcp-operation-inc",
    label: "DHCP operation inc",
    description: "Increment the DHCP/BOOTP operation byte and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpNumberIncVmBody(stream, "operation")
  },
  {
    name: "dhcp-hops-inc",
    label: "DHCP hops inc",
    description: "Increment the DHCP/BOOTP hops byte and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpNumberIncVmBody(stream, "hops")
  },
  {
    name: "dhcp-seconds-inc",
    label: "DHCP seconds inc",
    description: "Increment the DHCP seconds field and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpNumberIncVmBody(stream, "seconds")
  },
  {
    name: "dhcp-xid-inc",
    label: "DHCP XID inc",
    description: "Increment the DHCP transaction ID and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpNumberIncVmBody(stream, "xid")
  },
  {
    name: "dhcp-message-type-inc",
    label: "DHCP message type inc",
    description: "Increment the DHCP message type option and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpMessageTypeStream,
    buildBody: (stream) => buildDhcpNumberIncVmBody(stream, "message_type")
  },
  {
    name: "dhcp-flags-inc",
    label: "DHCP flags inc",
    description: "Increment the DHCP flags word and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpNumberIncVmBody(stream, "flags")
  },
  {
    name: "dhcp-broadcast-flag-vary",
    label: "DHCP broadcast flag vary",
    description: "Vary the BOOTP/DHCP broadcast flag while preserving reserved flag bits.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpFlagMaskedVmBody(stream, "broadcast")
  },
  {
    name: "dhcp-reserved-flags-inc",
    label: "DHCP reserved flags inc",
    description: "Increment the BOOTP/DHCP reserved flags while preserving the broadcast flag.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpFlagMaskedVmBody(stream, "reserved")
  },
  {
    name: "dhcp-client-ip-inc",
    label: "DHCP client IP inc",
    description: "Increment the BOOTP client IP address and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpBootpIpv4IncVmBody(stream, "client_ip")
  },
  {
    name: "dhcp-your-ip-inc",
    label: "DHCP your IP inc",
    description: "Increment the BOOTP your IP address and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpBootpIpv4IncVmBody(stream, "your_ip")
  },
  {
    name: "dhcp-server-ip-inc",
    label: "DHCP server IP inc",
    description: "Increment the BOOTP server IP address and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpBootpIpv4IncVmBody(stream, "server_ip")
  },
  {
    name: "dhcp-relay-ip-inc",
    label: "DHCP relay IP inc",
    description: "Increment the BOOTP relay IP address and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: (stream) => buildDhcpBootpIpv4IncVmBody(stream, "relay_ip")
  },
  {
    name: "dhcp-client-mac-inc",
    label: "DHCP client MAC inc",
    description: "Increment the DHCP client hardware address and repair the outer UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 UDP DHCP stream",
    supports: isAdvancedDhcpStream,
    buildBody: buildDhcpClientMacIncVmBody
  },
  {
    name: "dhcp-requested-ip-inc",
    label: "DHCP requested IP inc",
    description: "Increment DHCP option 50 requested IP and repair the outer UDP checksum.",
    requires: "DHCP stream with requested IP option",
    supports: isAdvancedDhcpRequestedIpStream,
    buildBody: (stream) => buildDhcpOptionIpv4IncVmBody(stream, "requested_ip")
  },
  {
    name: "dhcp-server-id-inc",
    label: "DHCP server ID inc",
    description: "Increment DHCP option 54 server identifier and repair the outer UDP checksum.",
    requires: "DHCP stream with server ID option",
    supports: isAdvancedDhcpServerIdStream,
    buildBody: (stream) => buildDhcpOptionIpv4IncVmBody(stream, "server_id")
  },
  {
    name: "dhcp-parameter-request-inc",
    label: "DHCP parameter request option inc",
    description: "Increment the first DHCP option 55 requested parameter byte and repair the outer UDP checksum.",
    requires: "DHCP stream with parameter request list option",
    supports: isAdvancedDhcpParameterRequestStream,
    buildBody: buildDhcpParameterRequestFirstOptionIncVmBody
  },
  {
    name: "dhcp-hostname-byte-inc",
    label: "DHCP hostname first byte inc",
    description: "Increment the first DHCP option 12 hostname byte and repair the outer UDP checksum.",
    requires: "DHCP stream with hostname option",
    supports: isAdvancedDhcpHostnameStream,
    buildBody: buildDhcpHostnameFirstByteIncVmBody
  },
  {
    name: "dhcp-client-identifier-byte-inc",
    label: "DHCP client identifier first byte inc",
    description: "Increment the first DHCP option 61 client identifier byte and repair the outer UDP checksum.",
    requires: "Raw/imported DHCP stream with client identifier option",
    supports: isAdvancedDhcpClientIdentifierStream,
    buildBody: buildDhcpClientIdentifierFirstByteIncVmBody
  },
  {
    name: "dhcp-lease-time-inc",
    label: "DHCP lease time inc",
    description: "Increment DHCP option 51 lease time and repair the outer UDP checksum.",
    requires: "DHCP stream with lease time option",
    supports: isAdvancedDhcpLeaseTimeStream,
    buildBody: (stream) => buildDhcpTimerIncVmBody(stream, "lease_time")
  },
  {
    name: "dhcp-renewal-time-inc",
    label: "DHCP renewal time inc",
    description: "Increment DHCP option 58 renewal time and repair the outer UDP checksum.",
    requires: "DHCP stream with renewal time option",
    supports: isAdvancedDhcpRenewalTimeStream,
    buildBody: (stream) => buildDhcpTimerIncVmBody(stream, "renewal_time")
  },
  {
    name: "dhcp-rebinding-time-inc",
    label: "DHCP rebinding time inc",
    description: "Increment DHCP option 59 rebinding time and repair the outer UDP checksum.",
    requires: "DHCP stream with rebinding time option",
    supports: isAdvancedDhcpRebindingTimeStream,
    buildBody: (stream) => buildDhcpTimerIncVmBody(stream, "rebinding_time")
  },
  {
    name: "vxlan-i-flag-vary",
    label: "VXLAN I flag vary",
    description: "Toggle the VXLAN I flag bit while preserving the other VXLAN flag bits.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream",
    supports: isOuterIpv4VxlanStream,
    buildBody: buildVxlanIFlagVaryVmBody
  },
  {
    name: "vxlan-vni-inc",
    label: "VXLAN VNI inc",
    description: "Increment the 24-bit VXLAN VNI field using the current stream VNI, count, and step.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream",
    supports: isOuterIpv4VxlanStream,
    buildBody: buildVxlanVniIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-src-inc",
    label: "VXLAN inner IPv4 src inc",
    description: "Increment the inner IPv4 source address suffix and repair the required inner checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerIpv4AddressStream,
    buildBody: buildVxlanInnerIpv4SrcIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-dst-inc",
    label: "VXLAN inner IPv4 dst inc",
    description: "Increment the inner IPv4 destination address suffix and repair the required inner checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerIpv4AddressStream,
    buildBody: buildVxlanInnerIpv4DstIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-ttl-inc",
    label: "VXLAN inner IPv4 TTL inc",
    description: "Increment the inner IPv4 TTL and repair the inner IPv4 checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerIpv4TtlStream,
    buildBody: buildVxlanInnerIpv4TtlIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-id-inc",
    label: "VXLAN inner IPv4 ID inc",
    description: "Increment the inner IPv4 identification field and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4IdIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-dscp-inc",
    label: "VXLAN inner IPv4 DSCP inc",
    description: "Increment the inner IPv4 DSCP bits while preserving ECN and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4DscpIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-ecn-inc",
    label: "VXLAN inner IPv4 ECN inc",
    description: "Increment the inner IPv4 ECN bits while preserving DSCP and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4EcnIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-fragment-offset-inc",
    label: "VXLAN inner IPv4 fragment offset inc",
    description: "Increment the inner IPv4 fragment offset bits while preserving flags and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4FragmentOffsetIncVmBody
  },
  {
    name: "vxlan-inner-ipv4-reserved-flag-vary",
    label: "VXLAN inner IPv4 reserved flag vary",
    description: "Vary the inner IPv4 reserved fragment flag while preserving DF/MF/offset bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4ReservedFlagVaryVmBody
  },
  {
    name: "vxlan-inner-ipv4-df-flag-vary",
    label: "VXLAN inner IPv4 Don't fragment flag vary",
    description: "Vary the inner IPv4 Don't Fragment flag while preserving sibling fragment bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4DfFlagVaryVmBody
  },
  {
    name: "vxlan-inner-ipv4-mf-flag-vary",
    label: "VXLAN inner IPv4 More fragments flag vary",
    description: "Vary the inner IPv4 More Fragments flag while preserving sibling fragment bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerRawIpv4Stream,
    buildBody: buildVxlanInnerIpv4MfFlagVaryVmBody
  },
  {
    name: "vxlan-inner-mac-dst-inc",
    label: "VXLAN inner MAC dst inc",
    description: "Increment the inner Ethernet destination MAC suffix inside a VXLAN packet.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner Ethernet",
    supports: isOuterIpv4VxlanInnerEthernetStream,
    buildBody: buildVxlanInnerMacDstIncVmBody
  },
  {
    name: "vxlan-inner-mac-src-inc",
    label: "VXLAN inner MAC src inc",
    description: "Increment the inner Ethernet source MAC suffix inside a VXLAN packet.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner Ethernet",
    supports: isOuterIpv4VxlanInnerEthernetStream,
    buildBody: buildVxlanInnerMacSrcIncVmBody
  },
  {
    name: "vxlan-inner-ethertype-inc",
    label: "VXLAN inner EtherType inc",
    description: "Increment the inner Ethernet EtherType field inside a VXLAN packet.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner Ethernet",
    supports: isOuterIpv4VxlanInnerEthernetStream,
    buildBody: buildVxlanInnerEtherTypeIncVmBody
  },
  {
    name: "vxlan-inner-vlan-id-inc",
    label: "VXLAN inner VLAN ID inc",
    description: "Increment the inner 802.1Q VLAN ID inside a VXLAN tenant frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner 802.1Q",
    supports: isOuterIpv4VxlanInnerVlanStream,
    buildBody: buildVxlanInnerVlanIdIncVmBody
  },
  {
    name: "vxlan-inner-vlan-priority-inc",
    label: "VXLAN inner VLAN priority inc",
    description: "Increment the inner 802.1Q priority bits while preserving the rest of the TCI field.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner 802.1Q",
    supports: isOuterIpv4VxlanInnerVlanStream,
    buildBody: buildVxlanInnerVlanPriorityIncVmBody
  },
  {
    name: "vxlan-inner-vlan-cfi-vary",
    label: "VXLAN inner VLAN CFI/DEI vary",
    description: "Toggle the inner 802.1Q CFI/DEI bit while preserving the rest of the TCI field.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner 802.1Q",
    supports: isOuterIpv4VxlanInnerVlanStream,
    buildBody: buildVxlanInnerVlanCfiVaryVmBody
  },
  {
    name: "vxlan-inner-vlan2-id-inc",
    label: "VXLAN inner VLAN second ID inc",
    description: "Increment the second inner 802.1Q VLAN ID inside a VXLAN tenant QinQ frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with two inner 802.1Q tags",
    supports: isOuterIpv4VxlanInnerSecondVlanStream,
    buildBody: buildVxlanInnerSecondVlanIdIncVmBody
  },
  {
    name: "vxlan-inner-vlan2-priority-inc",
    label: "VXLAN inner VLAN second priority inc",
    description: "Increment the second inner 802.1Q priority bits while preserving the rest of the TCI field.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with two inner 802.1Q tags",
    supports: isOuterIpv4VxlanInnerSecondVlanStream,
    buildBody: buildVxlanInnerSecondVlanPriorityIncVmBody
  },
  {
    name: "vxlan-inner-vlan2-cfi-vary",
    label: "VXLAN inner VLAN second CFI/DEI vary",
    description: "Toggle the second inner 802.1Q CFI/DEI bit while preserving the rest of the TCI field.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with two inner 802.1Q tags",
    supports: isOuterIpv4VxlanInnerSecondVlanStream,
    buildBody: buildVxlanInnerSecondVlanCfiVaryVmBody
  },
  {
    name: "vxlan-inner-arp-operation-inc",
    label: "VXLAN inner ARP operation inc",
    description: "Increment the ARP operation field inside a VXLAN tenant frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner ARP",
    supports: isOuterIpv4VxlanInnerArpStream,
    buildBody: buildVxlanInnerArpOperationIncVmBody
  },
  {
    name: "vxlan-inner-arp-sender-ip-inc",
    label: "VXLAN inner ARP sender IP inc",
    description: "Increment the ARP sender protocol address inside a VXLAN tenant frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner ARP",
    supports: isOuterIpv4VxlanInnerArpStream,
    buildBody: buildVxlanInnerArpSenderIpIncVmBody
  },
  {
    name: "vxlan-inner-arp-target-ip-inc",
    label: "VXLAN inner ARP target IP inc",
    description: "Increment the ARP target protocol address inside a VXLAN tenant frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner ARP",
    supports: isOuterIpv4VxlanInnerArpStream,
    buildBody: buildVxlanInnerArpTargetIpIncVmBody
  },
  {
    name: "vxlan-inner-arp-sender-mac-inc",
    label: "VXLAN inner ARP sender MAC inc",
    description: "Increment the ARP sender hardware address suffix inside a VXLAN tenant frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner ARP",
    supports: isOuterIpv4VxlanInnerArpStream,
    buildBody: buildVxlanInnerArpSenderMacIncVmBody
  },
  {
    name: "vxlan-inner-arp-target-mac-inc",
    label: "VXLAN inner ARP target MAC inc",
    description: "Increment the ARP target hardware address suffix inside a VXLAN tenant frame.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner ARP",
    supports: isOuterIpv4VxlanInnerArpStream,
    buildBody: buildVxlanInnerArpTargetMacIncVmBody
  },
  {
    name: "vxlan-inner-ipv6-src-inc",
    label: "VXLAN inner IPv6 src inc",
    description: "Increment the inner IPv6 source address suffix and repair the inner IPv6/UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv6 and a safely representable suffix",
    supports: isOuterIpv4VxlanInnerIpv6SrcVmStream,
    buildBody: buildVxlanInnerIpv6SrcIncVmBody
  },
  {
    name: "vxlan-inner-ipv6-dst-inc",
    label: "VXLAN inner IPv6 dst inc",
    description: "Increment the inner IPv6 destination address suffix and repair the inner IPv6/UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv6 and a safely representable suffix",
    supports: isOuterIpv4VxlanInnerIpv6DstVmStream,
    buildBody: buildVxlanInnerIpv6DstIncVmBody
  },
  {
    name: "vxlan-inner-ipv6-hop-limit-inc",
    label: "VXLAN inner IPv6 hop limit inc",
    description: "Increment the inner IPv6 Hop Limit field.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv6",
    supports: isOuterIpv4VxlanInnerIpv6Stream,
    buildBody: buildVxlanInnerIpv6HopLimitIncVmBody
  },
  {
    name: "vxlan-inner-ipv6-traffic-class-inc",
    label: "VXLAN inner IPv6 traffic class inc",
    description: "Increment the inner IPv6 Traffic Class bits while preserving Version and Flow Label.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv6",
    supports: isOuterIpv4VxlanInnerRawIpv6Stream,
    buildBody: buildVxlanInnerIpv6TrafficClassIncVmBody
  },
  {
    name: "vxlan-inner-ipv6-flow-label-inc",
    label: "VXLAN inner IPv6 flow label inc",
    description: "Increment the inner IPv6 Flow Label bits while preserving Version and Traffic Class.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv6",
    supports: isOuterIpv4VxlanInnerRawIpv6Stream,
    buildBody: buildVxlanInnerIpv6FlowLabelIncVmBody
  },
  {
    name: "vxlan-inner-udp-src-port-inc",
    label: "VXLAN inner UDP src port inc",
    description: "Increment the inner UDP source port and repair the inner UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner UDP",
    supports: isOuterIpv4VxlanInnerUdpStream,
    buildBody: buildVxlanInnerUdpSrcPortIncVmBody
  },
  {
    name: "vxlan-inner-udp-dst-port-inc",
    label: "VXLAN inner UDP dst port inc",
    description: "Increment the inner UDP destination port and repair the inner UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner UDP",
    supports: isOuterIpv4VxlanInnerUdpStream,
    buildBody: buildVxlanInnerUdpDstPortIncVmBody
  },
  {
    name: "vxlan-inner-tcp-src-port-inc",
    label: "VXLAN inner TCP src port inc",
    description: "Increment the inner TCP source port and repair the inner TCP checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IP/TCP",
    supports: isOuterIpv4VxlanInnerTcpStream,
    buildBody: buildVxlanInnerTcpSrcPortIncVmBody
  },
  {
    name: "vxlan-inner-tcp-dst-port-inc",
    label: "VXLAN inner TCP dst port inc",
    description: "Increment the inner TCP destination port and repair the inner TCP checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IP/TCP",
    supports: isOuterIpv4VxlanInnerTcpStream,
    buildBody: buildVxlanInnerTcpDstPortIncVmBody
  },
  {
    name: "vxlan-inner-5tuple-inc",
    label: "VXLAN inner 5-tuple inc",
    description: "Increment inner IPv4 source/destination plus inner UDP source/destination ports and repair inner IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/VXLAN stream with inner IPv4",
    supports: isOuterIpv4VxlanInnerIpv4Stream,
    buildBody: buildVxlanInnerFiveTupleVmBody
  },
  {
    name: "gre-protocol-type-inc",
    label: "GRE protocol type inc",
    description: "Increment the GRE Protocol Type field without adding GRE checksum repair.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with no GRE checksum option",
    supports: isGreStreamWithoutGreChecksum,
    buildBody: buildGreProtocolTypeIncVmBody
  },
  {
    name: "gre-key-inc",
    label: "GRE key inc",
    description: "Increment the optional GRE Key field without adding GRE checksum repair.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with GRE Key present and no GRE checksum option",
    supports: isGreKeyStreamWithoutGreChecksum,
    buildBody: buildGreKeyIncVmBody
  },
  {
    name: "gre-sequence-inc",
    label: "GRE sequence inc",
    description: "Increment the optional GRE Sequence Number field without adding GRE checksum repair.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with GRE Sequence present and no GRE checksum option",
    supports: isGreSequenceStreamWithoutGreChecksum,
    buildBody: buildGreSequenceIncVmBody
  },
  {
    name: "gre-inner-ipv4-src-inc",
    label: "GRE inner IPv4 src inc",
    description: "Increment the GRE inner IPv4 source address suffix and repair the required inner checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isIpv4GreAddressStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4SrcIncVmBody
  },
  {
    name: "gre-inner-ipv4-dst-inc",
    label: "GRE inner IPv4 dst inc",
    description: "Increment the GRE inner IPv4 destination address suffix and repair the required inner checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isIpv4GreAddressStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4DstIncVmBody
  },
  {
    name: "gre-inner-ipv4-ttl-inc",
    label: "GRE inner IPv4 TTL inc",
    description: "Increment the GRE inner IPv4 TTL and repair the inner IPv4 checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isIpv4GreTtlStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4TtlIncVmBody
  },
  {
    name: "gre-inner-ipv4-id-inc",
    label: "GRE inner IPv4 ID inc",
    description: "Increment the GRE inner IPv4 identification field and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4IdIncVmBody
  },
  {
    name: "gre-inner-ipv4-dscp-inc",
    label: "GRE inner IPv4 DSCP inc",
    description: "Increment the GRE inner IPv4 DSCP bits while preserving ECN and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4DscpIncVmBody
  },
  {
    name: "gre-inner-ipv4-ecn-inc",
    label: "GRE inner IPv4 ECN inc",
    description: "Increment the GRE inner IPv4 ECN bits while preserving DSCP and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4EcnIncVmBody
  },
  {
    name: "gre-inner-ipv4-fragment-offset-inc",
    label: "GRE inner IPv4 fragment offset inc",
    description: "Increment the GRE inner IPv4 fragment offset bits while preserving flags and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4FragmentOffsetIncVmBody
  },
  {
    name: "gre-inner-ipv4-reserved-flag-vary",
    label: "GRE inner IPv4 reserved flag vary",
    description: "Vary the GRE inner IPv4 reserved fragment flag while preserving DF/MF/offset bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4ReservedFlagVaryVmBody
  },
  {
    name: "gre-inner-ipv4-df-flag-vary",
    label: "GRE inner IPv4 Don't fragment flag vary",
    description: "Vary the GRE inner IPv4 Don't Fragment flag while preserving sibling fragment bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4DfFlagVaryVmBody
  },
  {
    name: "gre-inner-ipv4-mf-flag-vary",
    label: "GRE inner IPv4 More fragments flag vary",
    description: "Vary the GRE inner IPv4 More Fragments flag while preserving sibling fragment bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 and no GRE checksum option",
    supports: isRawIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv4MfFlagVaryVmBody
  },
  {
    name: "gre-inner-ipv6-src-inc",
    label: "GRE inner IPv6 src inc",
    description: "Increment the GRE inner IPv6 source address suffix and repair the inner IPv6/UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv6, no GRE checksum option, and a safely representable suffix",
    supports: isIpv6GreSrcVmStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv6SrcIncVmBody
  },
  {
    name: "gre-inner-ipv6-dst-inc",
    label: "GRE inner IPv6 dst inc",
    description: "Increment the GRE inner IPv6 destination address suffix and repair the inner IPv6/UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv6, no GRE checksum option, and a safely representable suffix",
    supports: isIpv6GreDstVmStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv6DstIncVmBody
  },
  {
    name: "gre-inner-ipv6-hop-limit-inc",
    label: "GRE inner IPv6 hop limit inc",
    description: "Increment the GRE inner IPv6 Hop Limit field.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv6 and no GRE checksum option",
    supports: isIpv6GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv6HopLimitIncVmBody
  },
  {
    name: "gre-inner-ipv6-traffic-class-inc",
    label: "GRE inner IPv6 traffic class inc",
    description: "Increment the GRE inner IPv6 Traffic Class bits while preserving Version and Flow Label.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv6 and no GRE checksum option",
    supports: isRawIpv6GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv6TrafficClassIncVmBody
  },
  {
    name: "gre-inner-ipv6-flow-label-inc",
    label: "GRE inner IPv6 flow label inc",
    description: "Increment the GRE inner IPv6 Flow Label bits while preserving Version and Traffic Class.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv6 and no GRE checksum option",
    supports: isRawIpv6GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerIpv6FlowLabelIncVmBody
  },
  {
    name: "gre-inner-udp-src-port-inc",
    label: "GRE inner UDP src port inc",
    description: "Increment the GRE inner UDP source port and repair the inner UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 or IPv6 and no GRE checksum option",
    supports: isGreInnerUdpStreamWithoutGreChecksum,
    buildBody: buildGreInnerUdpSrcPortIncVmBody
  },
  {
    name: "gre-inner-udp-dst-port-inc",
    label: "GRE inner UDP dst port inc",
    description: "Increment the GRE inner UDP destination port and repair the inner UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IPv4 or IPv6 and no GRE checksum option",
    supports: isGreInnerUdpStreamWithoutGreChecksum,
    buildBody: buildGreInnerUdpDstPortIncVmBody
  },
  {
    name: "gre-inner-tcp-src-port-inc",
    label: "GRE inner TCP src port inc",
    description: "Increment the GRE inner TCP source port and repair the inner TCP checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IP/TCP and no GRE checksum option",
    supports: isGreInnerTcpStreamWithoutGreChecksum,
    buildBody: buildGreInnerTcpSrcPortIncVmBody
  },
  {
    name: "gre-inner-tcp-dst-port-inc",
    label: "GRE inner TCP dst port inc",
    description: "Increment the GRE inner TCP destination port and repair the inner TCP checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/GRE stream with inner IP/TCP and no GRE checksum option",
    supports: isGreInnerTcpStreamWithoutGreChecksum,
    buildBody: buildGreInnerTcpDstPortIncVmBody
  },
  {
    name: "gre-inner-5tuple-inc",
    label: "GRE inner 5-tuple inc",
    description: "Increment inner IPv4 source/destination plus inner UDP source/destination ports for GRE/IPv4/UDP, including key/sequence options.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/GRE stream without GRE checksum option",
    supports: isIpv4GreStreamWithoutGreChecksum,
    buildBody: buildGreInnerFiveTupleVmBody
  },
  {
    name: "gtpu-message-type-inc",
    label: "GTP-U message type inc",
    description: "Increment the GTP-U message type byte and repair outer IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream with UDP source or destination port 2152",
    supports: isOuterIpv4GtpuStream,
    buildBody: buildGtpuMessageTypeIncVmBody
  },
  {
    name: "gtpu-sequence-inc",
    label: "GTP-U sequence inc",
    description: "Increment the optional GTP-U sequence number field.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with Sequence present",
    supports: isOuterIpv4GtpuSequenceStream,
    buildBody: buildGtpuSequenceIncVmBody
  },
  {
    name: "gtpu-npdu-inc",
    label: "GTP-U N-PDU inc",
    description: "Increment the optional GTP-U N-PDU number field.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with N-PDU present",
    supports: isOuterIpv4GtpuNpduStream,
    buildBody: buildGtpuNpduIncVmBody
  },
  {
    name: "gtpu-extension-udp-port-inc",
    label: "GTP-U extension UDP port inc",
    description: "Increment the GTP-U UDP Port extension header value.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with UDP Port extension",
    supports: isOuterIpv4GtpuExtensionStream,
    buildBody: buildGtpuExtensionUdpPortIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-src-inc",
    label: "GTP-U inner IPv4 src inc",
    description: "Increment the inner IPv4 source address suffix and repair the required inner checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerIpv4AddressStream,
    buildBody: buildGtpuInnerIpv4SrcIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-dst-inc",
    label: "GTP-U inner IPv4 dst inc",
    description: "Increment the inner IPv4 destination address suffix and repair the required inner checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerIpv4AddressStream,
    buildBody: buildGtpuInnerIpv4DstIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-ttl-inc",
    label: "GTP-U inner IPv4 TTL inc",
    description: "Increment the inner IPv4 TTL and repair the inner IPv4 checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerIpv4TtlStream,
    buildBody: buildGtpuInnerIpv4TtlIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-id-inc",
    label: "GTP-U inner IPv4 ID inc",
    description: "Increment the inner IPv4 identification field and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4IdIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-dscp-inc",
    label: "GTP-U inner IPv4 DSCP inc",
    description: "Increment the inner IPv4 DSCP bits while preserving ECN and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4DscpIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-ecn-inc",
    label: "GTP-U inner IPv4 ECN inc",
    description: "Increment the inner IPv4 ECN bits while preserving DSCP and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4EcnIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-fragment-offset-inc",
    label: "GTP-U inner IPv4 fragment offset inc",
    description: "Increment the inner IPv4 fragment offset bits while preserving flags and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4FragmentOffsetIncVmBody
  },
  {
    name: "gtpu-inner-ipv4-reserved-flag-vary",
    label: "GTP-U inner IPv4 reserved flag vary",
    description: "Vary the inner IPv4 reserved fragment flag while preserving DF/MF/offset bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4ReservedFlagVaryVmBody
  },
  {
    name: "gtpu-inner-ipv4-df-flag-vary",
    label: "GTP-U inner IPv4 Don't fragment flag vary",
    description: "Vary the inner IPv4 Don't Fragment flag while preserving sibling fragment bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4DfFlagVaryVmBody
  },
  {
    name: "gtpu-inner-ipv4-mf-flag-vary",
    label: "GTP-U inner IPv4 More fragments flag vary",
    description: "Vary the inner IPv4 More Fragments flag while preserving sibling fragment bits and repair the inner checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerRawIpv4Stream,
    buildBody: buildGtpuInnerIpv4MfFlagVaryVmBody
  },
  {
    name: "gtpu-inner-ipv6-src-inc",
    label: "GTP-U inner IPv6 src inc",
    description: "Increment the inner IPv6 source address suffix and repair the inner IPv6/UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv6 and a safely representable suffix",
    supports: isOuterIpv4GtpuInnerIpv6SrcVmStream,
    buildBody: buildGtpuInnerIpv6SrcIncVmBody
  },
  {
    name: "gtpu-inner-ipv6-dst-inc",
    label: "GTP-U inner IPv6 dst inc",
    description: "Increment the inner IPv6 destination address suffix and repair the inner IPv6/UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv6 and a safely representable suffix",
    supports: isOuterIpv4GtpuInnerIpv6DstVmStream,
    buildBody: buildGtpuInnerIpv6DstIncVmBody
  },
  {
    name: "gtpu-inner-ipv6-hop-limit-inc",
    label: "GTP-U inner IPv6 hop limit inc",
    description: "Increment the inner IPv6 Hop Limit field.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv6",
    supports: isOuterIpv4GtpuInnerIpv6Stream,
    buildBody: buildGtpuInnerIpv6HopLimitIncVmBody
  },
  {
    name: "gtpu-inner-ipv6-traffic-class-inc",
    label: "GTP-U inner IPv6 traffic class inc",
    description: "Increment the inner IPv6 Traffic Class bits while preserving Version and Flow Label.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv6",
    supports: isOuterIpv4GtpuInnerRawIpv6Stream,
    buildBody: buildGtpuInnerIpv6TrafficClassIncVmBody
  },
  {
    name: "gtpu-inner-ipv6-flow-label-inc",
    label: "GTP-U inner IPv6 flow label inc",
    description: "Increment the inner IPv6 Flow Label bits while preserving Version and Traffic Class.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv6",
    supports: isOuterIpv4GtpuInnerRawIpv6Stream,
    buildBody: buildGtpuInnerIpv6FlowLabelIncVmBody
  },
  {
    name: "gtpu-inner-udp-src-port-inc",
    label: "GTP-U inner UDP src port inc",
    description: "Increment the inner UDP source port and repair the inner UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream",
    supports: isOuterIpv4GtpuInnerUdpStream,
    buildBody: buildGtpuInnerUdpSrcPortIncVmBody
  },
  {
    name: "gtpu-inner-udp-dst-port-inc",
    label: "GTP-U inner UDP dst port inc",
    description: "Increment the inner UDP destination port and repair the inner UDP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream",
    supports: isOuterIpv4GtpuInnerUdpStream,
    buildBody: buildGtpuInnerUdpDstPortIncVmBody
  },
  {
    name: "gtpu-inner-tcp-src-port-inc",
    label: "GTP-U inner TCP src port inc",
    description: "Increment the inner TCP source port and repair the inner TCP checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IP/TCP",
    supports: isOuterIpv4GtpuInnerTcpStream,
    buildBody: buildGtpuInnerTcpSrcPortIncVmBody
  },
  {
    name: "gtpu-inner-tcp-dst-port-inc",
    label: "GTP-U inner TCP dst port inc",
    description: "Increment the inner TCP destination port and repair the inner TCP checksum.",
    requires: "Raw/imported Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IP/TCP",
    supports: isOuterIpv4GtpuInnerTcpStream,
    buildBody: buildGtpuInnerTcpDstPortIncVmBody
  },
  {
    name: "gtpu-inner-5tuple-inc",
    label: "GTP-U inner 5-tuple inc",
    description: "Increment inner IPv4 source/destination plus inner UDP source/destination ports and repair inner IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP/GTP-U stream with inner IPv4",
    supports: isOuterIpv4GtpuInnerIpv4Stream,
    buildBody: buildGtpuInnerFiveTupleVmBody
  },
  {
    name: "gtpu-teid-inc",
    label: "GTP-U TEID inc",
    description: "Increment the GTP-U TEID at the current packet offset and repair outer IPv4/UDP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/UDP stream with UDP source or destination port 2152",
    supports: isOuterIpv4GtpuStream,
    buildBody: buildGtpuTeidVmBody
  },
  {
    name: "tcp-src-port-inc",
    label: "TCP src port inc",
    description: "Increment the TCP source port and repair IPv4/TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/TCP stream",
    supports: isAdvancedOuterIpv4TcpStream,
    buildBody: buildOuterTcpSrcPortIncVmBody
  },
  {
    name: "tcp-dst-port-inc",
    label: "TCP dst port inc",
    description: "Increment the TCP destination port and repair IPv4/TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/TCP stream",
    supports: isAdvancedOuterIpv4TcpStream,
    buildBody: buildOuterTcpDstPortIncVmBody
  },
  {
    name: "tcp-5tuple-inc",
    label: "TCP 5-tuple inc",
    description: "Increment outer IPv4 source/destination plus TCP source/destination ports and repair IPv4/TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4/TCP stream",
    supports: isAdvancedOuterIpv4TcpStream,
    buildBody: buildOuterTcpFiveTupleVmBody
  },
  {
    name: "tcp-sequence-inc",
    label: "TCP sequence inc",
    description: "Increment the TCP sequence number and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpSequenceIncVmBody
  },
  {
    name: "tcp-ack-inc",
    label: "TCP acknowledge inc",
    description: "Increment the TCP acknowledge number and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpAckIncVmBody
  },
  {
    name: "tcp-window-inc",
    label: "TCP window inc",
    description: "Increment the TCP window field and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpWindowIncVmBody
  },
  {
    name: "tcp-urgent-pointer-inc",
    label: "TCP urgent pointer inc",
    description: "Increment the TCP urgent pointer field and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpUrgentPointerIncVmBody
  },
  {
    name: "tcp-flags-inc",
    label: "TCP flags inc",
    description: "Increment the low TCP flags bits with a masked VM write and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpFlagsIncVmBody
  },
  {
    name: "tcp-reserved-bits-inc",
    label: "TCP reserved bits inc",
    description: "Increment TCP reserved bits while preserving data offset and flags; repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpReservedBitsIncVmBody
  },
  {
    name: "tcp-urg-flag-vary",
    label: "TCP URG flag vary",
    description: "Vary the TCP URG flag while preserving sibling flags and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: (stream) => buildOuterTcpFlagVaryVmBody(stream, "urg")
  },
  {
    name: "tcp-ack-flag-vary",
    label: "TCP ACK flag vary",
    description: "Vary the TCP ACK flag while preserving sibling flags and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: (stream) => buildOuterTcpFlagVaryVmBody(stream, "ack")
  },
  {
    name: "tcp-psh-flag-vary",
    label: "TCP PSH flag vary",
    description: "Vary the TCP PSH flag while preserving sibling flags and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: (stream) => buildOuterTcpFlagVaryVmBody(stream, "psh")
  },
  {
    name: "tcp-rst-flag-vary",
    label: "TCP RST flag vary",
    description: "Vary the TCP RST flag while preserving sibling flags and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: (stream) => buildOuterTcpFlagVaryVmBody(stream, "rst")
  },
  {
    name: "tcp-syn-flag-vary",
    label: "TCP SYN flag vary",
    description: "Vary the TCP SYN flag while preserving sibling flags and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: (stream) => buildOuterTcpFlagVaryVmBody(stream, "syn")
  },
  {
    name: "tcp-fin-flag-vary",
    label: "TCP FIN flag vary",
    description: "Vary the TCP FIN flag while preserving sibling flags and repair TCP checksums.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: (stream) => buildOuterTcpFlagVaryVmBody(stream, "fin")
  },
  {
    name: "tcp-checksum-inc",
    label: "TCP checksum inc",
    description: "Increment the TCP checksum field as the terminal checksum write.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 TCP stream",
    supports: isAdvancedOuterTcpStream,
    buildBody: buildOuterTcpChecksumIncVmBody
  },
  {
    name: "tcp-option-mss-inc",
    label: "TCP MSS option inc",
    description: "Increment the MSS option value and repair TCP checksums.",
    requires: "TCP stream with MSS option enabled",
    supports: isAdvancedOuterTcpMssStream,
    buildBody: buildOuterTcpOptionMssIncVmBody
  },
  {
    name: "tcp-option-window-scale-inc",
    label: "TCP window scale option inc",
    description: "Increment the Window Scale option value and repair TCP checksums.",
    requires: "TCP stream with Window Scale option enabled",
    supports: isAdvancedOuterTcpWindowScaleStream,
    buildBody: buildOuterTcpOptionWindowScaleIncVmBody
  },
  {
    name: "tcp-option-timestamp-value-inc",
    label: "TCP timestamp value inc",
    description: "Increment the TCP Timestamp value and repair TCP checksums.",
    requires: "TCP stream with Timestamp option enabled",
    supports: isAdvancedOuterTcpTimestampStream,
    buildBody: buildOuterTcpOptionTimestampValueIncVmBody
  },
  {
    name: "tcp-option-timestamp-echo-inc",
    label: "TCP timestamp echo inc",
    description: "Increment the TCP Timestamp echo reply and repair TCP checksums.",
    requires: "TCP stream with Timestamp option enabled",
    supports: isAdvancedOuterTcpTimestampStream,
    buildBody: buildOuterTcpOptionTimestampEchoIncVmBody
  },
  {
    name: "tcp-option-sack-left-inc",
    label: "TCP SACK left edge inc",
    description: "Increment the first SACK left edge and repair TCP checksums.",
    requires: "TCP stream with SACK block option enabled",
    supports: isAdvancedOuterTcpSackBlockStream,
    buildBody: buildOuterTcpOptionSackLeftIncVmBody
  },
  {
    name: "tcp-option-sack-right-inc",
    label: "TCP SACK right edge inc",
    description: "Increment the first SACK right edge and repair TCP checksums.",
    requires: "TCP stream with SACK block option enabled",
    supports: isAdvancedOuterTcpSackBlockStream,
    buildBody: buildOuterTcpOptionSackRightIncVmBody
  },
  {
    name: "tcp-option-sack2-left-inc",
    label: "TCP SACK 2 left edge inc",
    description: "Increment the second raw SACK block left edge and repair TCP checksums.",
    requires: "Raw/imported TCP stream with a second SACK block",
    supports: isAdvancedRawTcpSackSecondBlockStream,
    buildBody: buildOuterTcpOptionSack2LeftIncVmBody
  },
  {
    name: "tcp-option-sack2-right-inc",
    label: "TCP SACK 2 right edge inc",
    description: "Increment the second raw SACK block right edge and repair TCP checksums.",
    requires: "Raw/imported TCP stream with a second SACK block",
    supports: isAdvancedRawTcpSackSecondBlockStream,
    buildBody: buildOuterTcpOptionSack2RightIncVmBody
  },
  {
    name: "tcp-option-sack3-left-inc",
    label: "TCP SACK 3 left edge inc",
    description: "Increment the third raw SACK block left edge and repair TCP checksums.",
    requires: "Raw/imported TCP stream with a third SACK block",
    supports: isAdvancedRawTcpSackThirdBlockStream,
    buildBody: buildOuterTcpOptionSack3LeftIncVmBody
  },
  {
    name: "tcp-option-sack3-right-inc",
    label: "TCP SACK 3 right edge inc",
    description: "Increment the third raw SACK block right edge and repair TCP checksums.",
    requires: "Raw/imported TCP stream with a third SACK block",
    supports: isAdvancedRawTcpSackThirdBlockStream,
    buildBody: buildOuterTcpOptionSack3RightIncVmBody
  },
  {
    name: "tcp-option-sack4-left-inc",
    label: "TCP SACK 4 left edge inc",
    description: "Increment the fourth raw SACK block left edge and repair TCP checksums.",
    requires: "Raw/imported TCP stream with a fourth SACK block",
    supports: isAdvancedRawTcpSackFourthBlockStream,
    buildBody: buildOuterTcpOptionSack4LeftIncVmBody
  },
  {
    name: "tcp-option-sack4-right-inc",
    label: "TCP SACK 4 right edge inc",
    description: "Increment the fourth raw SACK block right edge and repair TCP checksums.",
    requires: "Raw/imported TCP stream with a fourth SACK block",
    supports: isAdvancedRawTcpSackFourthBlockStream,
    buildBody: buildOuterTcpOptionSack4RightIncVmBody
  },
  {
    name: "ipv6-tcp-src-port-inc",
    label: "IPv6 TCP src port inc",
    description: "Increment the outer TCP source port on an IPv6 packet and repair the TCP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/TCP stream",
    supports: isAdvancedOuterIpv6TcpStream,
    buildBody: buildOuterIpv6TcpSrcPortIncVmBody
  },
  {
    name: "ipv6-tcp-dst-port-inc",
    label: "IPv6 TCP dst port inc",
    description: "Increment the outer TCP destination port on an IPv6 packet and repair the TCP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/TCP stream",
    supports: isAdvancedOuterIpv6TcpStream,
    buildBody: buildOuterIpv6TcpDstPortIncVmBody
  },
  {
    name: "ipv6-tcp-5tuple-inc",
    label: "IPv6 TCP 5-tuple inc",
    description: "Increment outer IPv6 source/destination suffixes plus TCP source/destination ports and repair the TCP checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/TCP stream with safely representable IPv6 suffixes",
    supports: isAdvancedOuterIpv6TcpFiveTupleStream,
    buildBody: buildOuterIpv6TcpFiveTupleVmBody
  },
  {
    name: "sctp-src-port-inc",
    label: "SCTP src port inc",
    description: "Increment the SCTP common-header source port.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpSourcePortIncVmBody
  },
  {
    name: "sctp-dst-port-inc",
    label: "SCTP dst port inc",
    description: "Increment the SCTP common-header destination port.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpDestinationPortIncVmBody
  },
  {
    name: "sctp-verification-tag-inc",
    label: "SCTP verification tag inc",
    description: "Increment the SCTP common-header verification tag.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpVerificationTagIncVmBody
  },
  {
    name: "sctp-data-flags-inc",
    label: "SCTP DATA flags inc",
    description: "Increment the SCTP DATA chunk flags byte.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpDataStream,
    buildBody: buildSctpDataFlagsIncVmBody
  },
  {
    name: "sctp-data-reserved-flags-inc",
    label: "SCTP DATA reserved flags inc",
    description: "Increment the SCTP DATA reserved flags nibble while preserving the DATA flag bits.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpDataStream,
    buildBody: buildSctpDataReservedFlagsIncVmBody
  },
  {
    name: "sctp-data-immediate-sack-flag-vary",
    label: "SCTP DATA Immediate SACK flag vary",
    description: "Vary the SCTP DATA Immediate SACK flag while preserving sibling DATA flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpDataStream,
    buildBody: buildSctpDataImmediateSackFlagVmBody
  },
  {
    name: "sctp-data-unordered-flag-vary",
    label: "SCTP DATA Unordered flag vary",
    description: "Vary the SCTP DATA Unordered flag while preserving sibling DATA flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpDataStream,
    buildBody: buildSctpDataUnorderedFlagVmBody
  },
  {
    name: "sctp-data-beginning-flag-vary",
    label: "SCTP DATA Beginning fragment flag vary",
    description: "Vary the SCTP DATA Beginning fragment flag while preserving sibling DATA flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpDataStream,
    buildBody: buildSctpDataBeginningFragmentFlagVmBody
  },
  {
    name: "sctp-data-ending-flag-vary",
    label: "SCTP DATA Ending fragment flag vary",
    description: "Vary the SCTP DATA Ending fragment flag while preserving sibling DATA flags.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpDataStream,
    buildBody: buildSctpDataEndingFragmentFlagVmBody
  },
  {
    name: "sctp-tsn-inc",
    label: "SCTP TSN inc",
    description: "Increment the SCTP DATA chunk transmission sequence number.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpTsnIncVmBody
  },
  {
    name: "sctp-stream-id-inc",
    label: "SCTP stream ID inc",
    description: "Increment the SCTP DATA chunk stream identifier.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpStreamIdIncVmBody
  },
  {
    name: "sctp-stream-sequence-inc",
    label: "SCTP stream sequence inc",
    description: "Increment the SCTP DATA chunk stream sequence number.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpStreamSequenceIncVmBody
  },
  {
    name: "sctp-payload-protocol-id-inc",
    label: "SCTP payload protocol ID inc",
    description: "Increment the SCTP DATA chunk payload protocol identifier.",
    requires: "Ethernet[/VLAN/MPLS]/IPv4 or IPv6 SCTP DATA stream",
    supports: isAdvancedOuterSctpStream,
    buildBody: buildSctpPayloadProtocolIdIncVmBody
  },
  {
    name: "icmpv4-type-paired-inc",
    label: "ICMP type inc",
    description: "Increment an IPv4 ICMP Echo type byte and update the ICMP checksum field in lockstep.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4/ICMP Echo packet with valid checksum and no field/checksum wrap",
    supports: isAdvancedIcmpv4EchoTypeStream,
    buildBody: buildIcmpv4TypeChecksumCoupledVmBody
  },
  {
    name: "icmpv4-code-paired-inc",
    label: "ICMP code inc",
    description: "Increment an IPv4 ICMP Echo code byte and update the ICMP checksum field in lockstep.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4/ICMP Echo packet with valid checksum and no field/checksum wrap",
    supports: isAdvancedIcmpv4EchoCodeStream,
    buildBody: buildIcmpv4CodeChecksumCoupledVmBody
  },
  {
    name: "icmpv4-identifier-paired-inc",
    label: "ICMP identifier inc",
    description: "Increment an IPv4 ICMP Echo identifier and update the ICMP checksum field in lockstep.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4/ICMP Echo packet with valid checksum and no field/checksum wrap",
    supports: isAdvancedIcmpv4EchoIdentifierStream,
    hideWhenUnsupportedWithoutRaw: true,
    buildBody: buildIcmpv4IdentifierChecksumCoupledVmBody
  },
  {
    name: "icmpv4-sequence-paired-inc",
    label: "ICMP sequence inc",
    description: "Increment an IPv4 ICMP Echo sequence and update the ICMP checksum field in lockstep.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv4/ICMP Echo packet with valid checksum and no field/checksum wrap",
    supports: isAdvancedIcmpv4EchoSequenceStream,
    hideWhenUnsupportedWithoutRaw: true,
    buildBody: buildIcmpv4SequenceChecksumCoupledVmBody
  },
  {
    name: "icmpv6-type-inc",
    label: "ICMPv6 type inc",
    description: "Increment ICMPv6 Echo type and repair the IPv6 pseudo-header checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Echo Request/Reply stream",
    supports: isIcmpv6EchoStream,
    buildBody: buildIcmpv6TypeIncVmBody
  },
  {
    name: "icmpv6-code-inc",
    label: "ICMPv6 code inc",
    description: "Increment ICMPv6 Echo code and repair the IPv6 pseudo-header checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Echo Request/Reply stream",
    supports: isIcmpv6EchoStream,
    buildBody: buildIcmpv6CodeIncVmBody
  },
  {
    name: "icmpv6-identifier-inc",
    label: "ICMPv6 identifier inc",
    description: "Increment ICMPv6 Echo identifier and repair the IPv6 pseudo-header checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Echo Request/Reply stream",
    supports: isIcmpv6EchoStream,
    buildBody: buildIcmpv6IdentifierIncVmBody
  },
  {
    name: "icmpv6-sequence-inc",
    label: "ICMPv6 sequence inc",
    description: "Increment ICMPv6 Echo sequence and repair the IPv6 pseudo-header checksum.",
    requires: "Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Echo Request/Reply stream",
    supports: isIcmpv6EchoStream,
    buildBody: buildIcmpv6SequenceIncVmBody
  },
  {
    name: "icmpv6-nd-target-inc",
    label: "ICMPv6 ND target inc",
    description: "Increment the suffix of an existing ICMPv6 Neighbor Discovery target address from raw packet bytes.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Neighbor Solicitation or Advertisement packet",
    supports: isAdvancedIcmpv6NdTargetAddressStream,
    buildBody: buildIcmpv6NdTargetAddressIncVmBody
  },
  {
    name: "icmpv6-na-router-flag-vary",
    label: "ICMPv6 NA router flag vary",
    description: "Vary the Router flag inside an existing ICMPv6 Neighbor Advertisement without changing sibling flags.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Neighbor Advertisement packet",
    supports: isAdvancedIcmpv6NaFlagsStream,
    buildBody: buildIcmpv6NaRouterFlagVmBody
  },
  {
    name: "icmpv6-na-solicited-flag-vary",
    label: "ICMPv6 NA solicited flag vary",
    description: "Vary the Solicited flag inside an existing ICMPv6 Neighbor Advertisement without changing sibling flags.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Neighbor Advertisement packet",
    supports: isAdvancedIcmpv6NaFlagsStream,
    buildBody: buildIcmpv6NaSolicitedFlagVmBody
  },
  {
    name: "icmpv6-na-override-flag-vary",
    label: "ICMPv6 NA override flag vary",
    description: "Vary the Override flag inside an existing ICMPv6 Neighbor Advertisement without changing sibling flags.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Neighbor Advertisement packet",
    supports: isAdvancedIcmpv6NaFlagsStream,
    buildBody: buildIcmpv6NaOverrideFlagVmBody
  },
  {
    name: "icmpv6-link-layer-mac-inc",
    label: "ICMPv6 link-layer MAC inc",
    description: "Increment the suffix of an existing ICMPv6 Source or Target Link-Layer Address option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 RS/RA/NS/NA packet with a link-layer option",
    supports: isAdvancedIcmpv6LinkLayerOptionMacStream,
    buildBody: buildIcmpv6LinkLayerOptionMacIncVmBody
  },
  {
    name: "icmpv6-ra-managed-flag-vary",
    label: "ICMPv6 RA managed flag vary",
    description: "Vary the Managed address configuration flag inside an existing ICMPv6 Router Advertisement.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement packet",
    supports: isAdvancedIcmpv6RaFixedStream,
    buildBody: buildIcmpv6RaManagedFlagVmBody
  },
  {
    name: "icmpv6-ra-other-flag-vary",
    label: "ICMPv6 RA other flag vary",
    description: "Vary the Other configuration flag inside an existing ICMPv6 Router Advertisement.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement packet",
    supports: isAdvancedIcmpv6RaFixedStream,
    buildBody: buildIcmpv6RaOtherFlagVmBody
  },
  {
    name: "icmpv6-ra-router-lifetime-inc",
    label: "ICMPv6 RA router lifetime inc",
    description: "Increment the Router Lifetime field of an existing ICMPv6 Router Advertisement.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement packet",
    supports: isAdvancedIcmpv6RaFixedStream,
    buildBody: buildIcmpv6RaRouterLifetimeIncVmBody
  },
  {
    name: "icmpv6-ra-current-hop-limit-inc",
    label: "ICMPv6 RA current hop limit inc",
    description: "Increment the Current Hop Limit field of an existing ICMPv6 Router Advertisement.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement packet",
    supports: isAdvancedIcmpv6RaFixedStream,
    buildBody: buildIcmpv6RaCurrentHopLimitIncVmBody
  },
  {
    name: "icmpv6-ra-reachable-time-inc",
    label: "ICMPv6 RA reachable time inc",
    description: "Increment the Reachable Time field of an existing ICMPv6 Router Advertisement.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement packet",
    supports: isAdvancedIcmpv6RaFixedStream,
    buildBody: buildIcmpv6RaReachableTimeIncVmBody
  },
  {
    name: "icmpv6-ra-retrans-timer-inc",
    label: "ICMPv6 RA retrans timer inc",
    description: "Increment the Retrans Timer field of an existing ICMPv6 Router Advertisement.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement packet",
    supports: isAdvancedIcmpv6RaFixedStream,
    buildBody: buildIcmpv6RaRetransTimerIncVmBody
  },
  {
    name: "icmpv6-ra-prefix-on-link-flag-vary",
    label: "ICMPv6 RA prefix on-link flag vary",
    description: "Vary the On-link flag inside an existing ICMPv6 Prefix Information option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement with Prefix Information option",
    supports: isAdvancedIcmpv6RaPrefixInfoStream,
    buildBody: buildIcmpv6RaPrefixOnLinkFlagVmBody
  },
  {
    name: "icmpv6-ra-prefix-autonomous-flag-vary",
    label: "ICMPv6 RA prefix autonomous flag vary",
    description: "Vary the Autonomous address-configuration flag inside an existing ICMPv6 Prefix Information option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement with Prefix Information option",
    supports: isAdvancedIcmpv6RaPrefixInfoStream,
    buildBody: buildIcmpv6RaPrefixAutonomousFlagVmBody
  },
  {
    name: "icmpv6-ra-prefix-length-inc",
    label: "ICMPv6 RA prefix length inc",
    description: "Increment the Prefix Length field of an existing ICMPv6 Prefix Information option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement with Prefix Information option",
    supports: isAdvancedIcmpv6RaPrefixInfoStream,
    buildBody: buildIcmpv6RaPrefixLengthIncVmBody
  },
  {
    name: "icmpv6-ra-prefix-valid-lifetime-inc",
    label: "ICMPv6 RA prefix valid lifetime inc",
    description: "Increment the Valid Lifetime field of an existing ICMPv6 Prefix Information option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement with Prefix Information option",
    supports: isAdvancedIcmpv6RaPrefixInfoStream,
    buildBody: buildIcmpv6RaPrefixValidLifetimeIncVmBody
  },
  {
    name: "icmpv6-ra-prefix-preferred-lifetime-inc",
    label: "ICMPv6 RA prefix preferred lifetime inc",
    description: "Increment the Preferred Lifetime field of an existing ICMPv6 Prefix Information option.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement with Prefix Information option",
    supports: isAdvancedIcmpv6RaPrefixInfoStream,
    buildBody: buildIcmpv6RaPrefixPreferredLifetimeIncVmBody
  },
  {
    name: "icmpv6-ra-prefix-inc",
    label: "ICMPv6 RA prefix inc",
    description: "Increment the suffix of an existing ICMPv6 Prefix Information prefix.",
    requires: "Advanced/raw Ethernet[/VLAN/MPLS]/IPv6/ICMPv6 Router Advertisement with Prefix Information option",
    supports: isAdvancedIcmpv6RaPrefixInfoStream,
    buildBody: buildIcmpv6RaPrefixIncVmBody
  },
  {
    name: "vlan-id-inc",
    label: "VLAN ID inc",
    description: "Increment the 802.1Q VLAN ID inside the outer VLAN TCI.",
    requires: "Tagged VLAN stream",
    supports: isTaggedVlanStream,
    buildBody: buildVlanIdIncVmBody
  },
  {
    name: "vlan-priority-inc",
    label: "VLAN priority inc",
    description: "Increment the 802.1Q PCP priority bits inside the outer VLAN TCI.",
    requires: "Tagged VLAN stream",
    supports: isTaggedVlanStream,
    buildBody: buildVlanPriorityIncVmBody
  },
  {
    name: "vlan-cfi-vary",
    label: "VLAN CFI/DEI vary",
    description: "Vary the outer 802.1Q CFI/DEI bit while preserving priority and VLAN ID.",
    requires: "Tagged VLAN stream",
    supports: isTaggedVlanStream,
    buildBody: buildVlanCfiVaryVmBody
  },
  {
    name: "vlan-inner-id-inc",
    label: "VLAN inner ID inc",
    description: "Increment the inner 802.1Q VLAN ID inside the QinQ inner TCI.",
    requires: "QinQ inner VLAN stream",
    supports: isInnerTaggedVlanStream,
    buildBody: buildInnerVlanIdIncVmBody
  },
  {
    name: "vlan-inner-priority-inc",
    label: "VLAN inner priority inc",
    description: "Increment the inner 802.1Q PCP priority bits on a QinQ stream.",
    requires: "QinQ inner VLAN stream",
    supports: isInnerTaggedVlanStream,
    buildBody: buildInnerVlanPriorityIncVmBody
  },
  {
    name: "vlan-inner-cfi-vary",
    label: "VLAN inner CFI/DEI vary",
    description: "Vary the QinQ inner CFI/DEI bit while preserving inner priority and VLAN ID.",
    requires: "QinQ inner VLAN stream",
    supports: isInnerTaggedVlanStream,
    buildBody: buildInnerVlanCfiVaryVmBody
  },
  {
    name: "mpls-label-inc",
    label: "MPLS label inc",
    description: "Increment the top MPLS label field.",
    requires: "MPLS stream",
    supports: isMplsStream,
    buildBody: buildMplsLabelIncVmBody
  },
  {
    name: "mpls-tc-inc",
    label: "MPLS TC inc",
    description: "Increment the top MPLS traffic class bits.",
    requires: "MPLS stream",
    supports: isMplsStream,
    buildBody: buildMplsTrafficClassIncVmBody
  },
  {
    name: "mpls-ttl-inc",
    label: "MPLS TTL inc",
    description: "Increment the top MPLS TTL byte.",
    requires: "MPLS stream",
    supports: isMplsStream,
    buildBody: buildMplsTtlIncVmBody
  },
  {
    name: "mpls-label2-inc",
    label: "Second MPLS label inc",
    description: "Increment the second MPLS label field.",
    requires: "MPLS stream with second label enabled",
    supports: isSecondMplsStream,
    buildBody: buildSecondMplsLabelIncVmBody
  },
  {
    name: "mpls-label2-tc-inc",
    label: "Second MPLS TC inc",
    description: "Increment the second MPLS traffic class bits.",
    requires: "MPLS stream with second label enabled",
    supports: isSecondMplsStream,
    buildBody: buildSecondMplsTrafficClassIncVmBody
  },
  {
    name: "mpls-label2-ttl-inc",
    label: "Second MPLS TTL inc",
    description: "Increment the second MPLS TTL byte.",
    requires: "MPLS stream with second label enabled",
    supports: isSecondMplsStream,
    buildBody: buildSecondMplsTtlIncVmBody
  },
  {
    name: "mpls-label3-inc",
    label: "Third MPLS label inc",
    description: "Increment the third MPLS label field.",
    requires: "MPLS stream with third label enabled",
    supports: isThirdMplsStream,
    buildBody: buildThirdMplsLabelIncVmBody
  },
  {
    name: "mpls-label3-tc-inc",
    label: "Third MPLS TC inc",
    description: "Increment the third MPLS traffic class bits.",
    requires: "MPLS stream with third label enabled",
    supports: isThirdMplsStream,
    buildBody: buildThirdMplsTrafficClassIncVmBody
  },
  {
    name: "mpls-label3-ttl-inc",
    label: "Third MPLS TTL inc",
    description: "Increment the third MPLS TTL byte.",
    requires: "MPLS stream with third label enabled",
    supports: isThirdMplsStream,
    buildBody: buildThirdMplsTtlIncVmBody
  },
  {
    name: "disable-cache",
    label: "Disable VM cache",
    description: "Set VM cache size to zero while leaving instructions empty.",
    requires: "Any stream",
    body: {
      cache_size: 0,
      instructions: [],
      split_by_var: ""
    }
  }
];
