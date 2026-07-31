import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  afterStreamGotoAction,
  afterStreamGotoPatch,
  afterStreamStopAction,
  afterStreamStopPatch,
  arpHardwareSizeAction,
  arpHardwareTypeAction,
  arpOperationAction,
  arpOperationCountAction,
  arpOperationModeAction,
  arpOperationStepAction,
  arpProtocolSizeAction,
  arpProtocolTypeAction,
  arpSenderIpAction,
  arpSenderIpCountAction,
  arpSenderIpModeAction,
  arpSenderIpStepAction,
  arpSenderMacAction,
  arpSenderMacCountAction,
  arpSenderMacModeAction,
  arpSenderMacStepAction,
  arpTargetIpAction,
  arpTargetIpCountAction,
  arpTargetIpModeAction,
  arpTargetIpStepAction,
  arpTargetMacAction,
  arpTargetMacCountAction,
  arpTargetMacModeAction,
  arpTargetMacStepAction,
  burstCountAction,
  dhcpBootpAddressCountAction,
  dhcpBootpAddressModeAction,
  dhcpBootpAddressStepAction,
  dhcpBootpAddressTextAction,
  dhcpBootpCountAction,
  dhcpBootpModeAction,
  dhcpBootpNumberAction,
  dhcpBootpStepAction,
  dhcpBootpTextAction,
  dhcpOptionAddressCountAction,
  dhcpOptionAddressModeAction,
  dhcpOptionAddressStepAction,
  dhcpOptionAddressTextAction,
  dhcpOptionTextAction,
  dhcpOptionTimerCountAction,
  dhcpOptionTimerModeAction,
  dhcpOptionTimerNumberAction,
  dhcpOptionTimerStepAction,
  dhcpSelectionAction,
  dhcpSelectionPatch,
  etherDestinationAction,
  etherDestinationCountAction,
  etherDestinationModeAction,
  etherDestinationStepAction,
  etherSourceAction,
  etherSourceCountAction,
  etherSourceModeAction,
  etherSourceStepAction,
  dnsAnswerSelectionAction,
  dnsAnswerSelectionPatch,
  dnsCountAction,
  dnsModeAction,
  dnsNumberAction,
  dnsSelectionAction,
  dnsSelectionPatch,
  dnsStepAction,
  dnsTextAction,
  etherTypeAction,
  etherTypeOverrideAction,
  flowStatsEnabledAction,
  frameLengthMaxAction,
  frameLengthTypeAction,
  frameLengthMinAction,
  frameLengthMaxPatch,
  frameLengthMinPatch,
  frameLengthTypePatch,
  frameLengthValuePatch,
  greChecksumInvalidatingModePatch,
  greChecksumAction,
  greChecksumOverrideAction,
  greChecksumSelectionAction,
  greChecksumSelectionPatch,
  greInnerIpVersionPatch,
  greInnerIpv4DestinationAction,
  greInnerIpv4DestinationCountAction,
  greInnerIpv4DestinationModeAction,
  greInnerIpv4DestinationStepAction,
  greInnerIpv4SourceAction,
  greInnerIpv4SourceCountAction,
  greInnerIpv4SourceModeAction,
  greInnerIpv4SourceStepAction,
  greInnerIpv4TtlAction,
  greInnerIpv4TtlCountAction,
  greInnerIpv4TtlModeAction,
  greInnerIpv4TtlStepAction,
  greInnerIpv6DestinationAction,
  greInnerIpv6DestinationCountAction,
  greInnerIpv6DestinationModeAction,
  greInnerIpv6DestinationStepAction,
  greInnerIpv6HopLimitAction,
  greInnerIpv6HopLimitCountAction,
  greInnerIpv6HopLimitModeAction,
  greInnerIpv6HopLimitStepAction,
  greInnerIpv6SourceAction,
  greInnerIpv6SourceCountAction,
  greInnerIpv6SourceModeAction,
  greInnerIpv6SourceStepAction,
  greInnerIpVersionAction,
  greInnerL4DestinationPortAction,
  greInnerL4DestinationPortCountAction,
  greInnerL4DestinationPortModeAction,
  greInnerL4DestinationPortStepAction,
  greInnerL4SourcePortAction,
  greInnerL4SourcePortCountAction,
  greInnerL4SourcePortModeAction,
  greInnerL4SourcePortStepAction,
  greKeyAction,
  greKeyCountAction,
  greKeyModeAction,
  greKeySelectionAction,
  greKeySelectionPatch,
  greKeyStepAction,
  greSequenceAction,
  greSequenceCountAction,
  greSequenceModeAction,
  greSequenceSelectionAction,
  greSequenceSelectionPatch,
  greSequenceStepAction,
  gtpuExtensionSelectionPatch,
  gtpuExtensionSelectionAction,
  gtpuExtensionUdpPortAction,
  gtpuExtensionUdpPortCountAction,
  gtpuExtensionUdpPortModeAction,
  gtpuExtensionUdpPortStepAction,
  gtpuInnerIpVersionPatch,
  gtpuInnerIpVersionAction,
  gtpuInnerIpv4DestinationAction,
  gtpuInnerIpv4DestinationCountAction,
  gtpuInnerIpv4DestinationModeAction,
  gtpuInnerIpv4DestinationStepAction,
  gtpuInnerIpv4SourceAction,
  gtpuInnerIpv4SourceCountAction,
  gtpuInnerIpv4SourceModeAction,
  gtpuInnerIpv4SourceStepAction,
  gtpuInnerIpv4TtlAction,
  gtpuInnerIpv4TtlCountAction,
  gtpuInnerIpv4TtlModeAction,
  gtpuInnerIpv4TtlStepAction,
  gtpuInnerIpv6DestinationAction,
  gtpuInnerIpv6DestinationCountAction,
  gtpuInnerIpv6DestinationModeAction,
  gtpuInnerIpv6DestinationStepAction,
  gtpuInnerIpv6HopLimitAction,
  gtpuInnerIpv6HopLimitCountAction,
  gtpuInnerIpv6HopLimitModeAction,
  gtpuInnerIpv6HopLimitStepAction,
  gtpuInnerIpv6SourceAction,
  gtpuInnerIpv6SourceCountAction,
  gtpuInnerIpv6SourceModeAction,
  gtpuInnerIpv6SourceStepAction,
  gtpuInnerL4DestinationPortAction,
  gtpuInnerL4DestinationPortCountAction,
  gtpuInnerL4DestinationPortModeAction,
  gtpuInnerL4DestinationPortStepAction,
  gtpuInnerL4SourcePortAction,
  gtpuInnerL4SourcePortCountAction,
  gtpuInnerL4SourcePortModeAction,
  gtpuInnerL4SourcePortStepAction,
  gtpuMessageTypeAction,
  gtpuNpduAction,
  gtpuNpduCountAction,
  gtpuNpduModeAction,
  gtpuNpduSelectionAction,
  gtpuNpduStepAction,
  gtpuNpduSelectionPatch,
  gtpuSequenceAction,
  gtpuSequenceCountAction,
  gtpuSequenceModeAction,
  gtpuSequenceSelectionAction,
  gtpuSequenceStepAction,
  gtpuSequenceSelectionPatch,
  gtpuSelectionPatch,
  gtpuTeidAction,
  gtpuTeidCountAction,
  gtpuTeidModeAction,
  gtpuTeidStepAction,
  ibgAction,
  icmpChecksumAction,
  icmpChecksumOverrideAction,
  icmpChecksumCoupledModePatch,
  icmpCodeAction,
  icmpCodeCountAction,
  icmpCodeModeAction,
  icmpCodeStepAction,
  icmpIdentifierAction,
  icmpIdentifierCountAction,
  icmpIdentifierModeAction,
  icmpIdentifierStepAction,
  icmpSequenceAction,
  icmpSequenceCountAction,
  icmpSequenceModeAction,
  icmpSequenceStepAction,
  icmpTypeAction,
  icmpTypeCountAction,
  icmpTypeModeAction,
  icmpTypePatch,
  icmpTypeStepAction,
  icmpv6NdNaOverrideFlagAction,
  icmpv6NdNaRouterFlagAction,
  icmpv6NdNaSolicitedFlagAction,
  icmpv6NdOptionMacAction,
  icmpv6NdOptionSelectionAction,
  icmpv6NdTargetAction,
  icmpv6RaCurrentHopLimitAction,
  icmpv6RaManagedFlagAction,
  icmpv6RaOtherFlagAction,
  icmpv6RaPrefixAction,
  icmpv6RaPrefixAutonomousFlagAction,
  icmpv6RaPrefixLengthAction,
  icmpv6RaPrefixOnLinkFlagAction,
  icmpv6RaPrefixPreferredLifetimeAction,
  icmpv6RaPrefixSelectionAction,
  icmpv6RaPrefixValidLifetimeAction,
  icmpv6RaReachableTimeAction,
  icmpv6RaRetransTimerAction,
  icmpv6RaRouterLifetimeAction,
  icmpv6RaSllaMacAction,
  icmpv6RaSllaSelectionAction,
  icmpv6RsSllaMacAction,
  icmpv6RsSllaSelectionAction,
  ipv4ChecksumAction,
  ipv4ChecksumOverrideAction,
  ipv4DestinationAction,
  ipv4DestinationCountAction,
  ipv4DestinationModeAction,
  ipv4DestinationStepAction,
  ipv4DfFlagAction,
  ipv4DscpAction,
  ipv4DscpCountAction,
  ipv4DscpModeAction,
  ipv4DscpStepAction,
  ipv4EcnAction,
  ipv4EcnCountAction,
  ipv4EcnModeAction,
  ipv4EcnStepAction,
  ipv4FragmentOffsetAction,
  ipv4FragmentOffsetCountAction,
  ipv4FragmentOffsetModeAction,
  ipv4FragmentOffsetStepAction,
  ipv4IdentificationAction,
  ipv4IdentificationCountAction,
  ipv4IdentificationModeAction,
  ipv4IdentificationStepAction,
  ipv4MfFlagAction,
  ipv4SourceAction,
  ipv4SourceCountAction,
  ipv4SourceModeAction,
  ipv4SourceStepAction,
  ipv4TtlAction,
  ipv4TtlCountAction,
  ipv4TtlModeAction,
  ipv4TtlStepAction,
  ipv6DestinationAction,
  ipv6DestinationCountAction,
  ipv6DestinationModeAction,
  ipv6DestinationStepAction,
  ipv6FlowLabelAction,
  ipv6FlowLabelCountAction,
  ipv6FlowLabelModeAction,
  ipv6FlowLabelStepAction,
  ipv6HopLimitAction,
  ipv6HopLimitCountAction,
  ipv6HopLimitModeAction,
  ipv6HopLimitStepAction,
  ipv6SourceAction,
  ipv6SourceCountAction,
  ipv6SourceModeAction,
  ipv6SourceStepAction,
  ipv6TrafficClassAction,
  ipv6TrafficClassCountAction,
  ipv6TrafficClassModeAction,
  ipv6TrafficClassStepAction,
  isgAction,
  l4DestinationPortAction,
  l4DestinationPortCountAction,
  l4DestinationPortModeAction,
  l4DestinationPortOverrideSelectionAction,
  l4DestinationPortStepAction,
  l3SelectionAction,
  l4PortOverrideSelectionPatch,
  l4SelectionAction,
  l4SourcePortAction,
  l4SourcePortCountAction,
  l4SourcePortModeAction,
  l4SourcePortOverrideSelectionAction,
  l4SourcePortStepAction,
  latencyEnabledAction,
  loopActionCountAction,
  loopActionCountEnabledAction,
  loopActionCountEnabledPatch,
  mplsLabelAction,
  mplsLabelCountAction,
  mplsLabelModeAction,
  mplsLabelStepAction,
  mplsSelectionAction,
  mplsSecondLabelAction,
  mplsSecondLabelCountAction,
  mplsSecondLabelModeAction,
  mplsSecondLabelSelectionAction,
  mplsSecondLabelStepAction,
  mplsSecondTrafficClassAction,
  mplsSecondTrafficClassCountAction,
  mplsSecondTrafficClassModeAction,
  mplsSecondTrafficClassStepAction,
  mplsSecondTtlAction,
  mplsSecondTtlCountAction,
  mplsSecondTtlModeAction,
  mplsSecondTtlStepAction,
  mplsThirdLabelAction,
  mplsThirdLabelCountAction,
  mplsThirdLabelModeAction,
  mplsThirdLabelSelectionAction,
  mplsThirdLabelStepAction,
  mplsSecondLabelSelectionPatch,
  mplsSelectionPatch,
  mplsThirdLabelSelectionPatch,
  mplsThirdTrafficClassAction,
  mplsThirdTrafficClassCountAction,
  mplsThirdTrafficClassModeAction,
  mplsThirdTrafficClassStepAction,
  mplsThirdTtlAction,
  mplsThirdTtlCountAction,
  mplsThirdTtlModeAction,
  mplsThirdTtlStepAction,
  mplsTrafficClassAction,
  mplsTrafficClassCountAction,
  mplsTrafficClassModeAction,
  mplsTrafficClassStepAction,
  mplsTtlAction,
  mplsTtlCountAction,
  mplsTtlModeAction,
  mplsTtlStepAction,
  nextStreamAction,
  nextStreamSelectionPatch,
  packetFrameLengthAction,
  packetsPerBurstAction,
  packetTypeForL3Selection,
  packetTypeForL4Selection,
  packetTypeAction,
  packetTypePatch,
  advancedCacheSizeTypeAction,
  advancedCacheValueAction,
  payloadPatternAction,
  payloadPatternImportAction,
  payloadPatternImportPatch,
  payloadSelectionAction,
  payloadTypeAction,
  payloadSelectionPatch,
  pgIdAction,
  rateTypeAction,
  rateValueAction,
  runAdvancedCacheSizeTypeChange,
  runAdvancedCacheValueChange,
  runAfterStreamGotoChange,
  runAfterStreamStopChange,
  runArpHardwareSizeChange,
  runArpHardwareTypeChange,
  runArpOperationChange,
  runArpOperationCountChange,
  runArpOperationModeChange,
  runArpOperationStepChange,
  runArpProtocolSizeChange,
  runArpProtocolTypeChange,
  runArpSenderIpChange,
  runArpSenderIpCountChange,
  runArpSenderIpModeChange,
  runArpSenderIpStepChange,
  runArpSenderMacChange,
  runArpSenderMacCountChange,
  runArpSenderMacModeChange,
  runArpSenderMacStepChange,
  runArpTargetIpChange,
  runArpTargetIpCountChange,
  runArpTargetIpModeChange,
  runArpTargetIpStepChange,
  runArpTargetMacChange,
  runArpTargetMacCountChange,
  runArpTargetMacModeChange,
  runArpTargetMacStepChange,
  runBurstCountChange,
  runEtherDestinationChange,
  runEtherDestinationCountChange,
  runEtherDestinationModeChange,
  runEtherDestinationStepChange,
  runEtherSourceChange,
  runEtherSourceCountChange,
  runEtherSourceModeChange,
  runEtherSourceStepChange,
  runEtherTypeChange,
  runEtherTypeOverrideChange,
  runFrameLengthMaxChange,
  runFrameLengthMinChange,
  runFrameLengthTypeChange,
  runFlowStatsEnabledChange,
  runGreChecksumSelectionChange,
  runGreInnerIpVersionChange,
  runGreInnerIpv4SourceChange,
  runGreInnerIpv4TtlModeChange,
  runGreInnerIpv6SourceModeChange,
  runGreInnerL4DestinationPortStepChange,
  runGreKeyModeChange,
  runGreSequenceStepChange,
  runGtpuExtensionUdpPortStepChange,
  runGtpuInnerIpVersionChange,
  runGtpuInnerIpv4DestinationChange,
  runGtpuInnerIpv4SourceChange,
  runGtpuInnerIpv4SourceModeChange,
  runGtpuInnerIpv4TtlModeChange,
  runGtpuInnerIpv6DestinationChange,
  runGtpuInnerIpv6DestinationStepChange,
  runGtpuInnerIpv6SourceChange,
  runGtpuInnerL4DestinationPortStepChange,
  runGtpuMessageTypeChange,
  runGtpuSequenceSelectionChange,
  runGtpuTeidModeChange,
  runIbgChange,
  runIcmpChecksumChange,
  runIcmpChecksumOverrideChange,
  runIcmpCodeChange,
  runIcmpCodeCountChange,
  runIcmpCodeModeChange,
  runIcmpCodeStepChange,
  runIcmpIdentifierChange,
  runIcmpIdentifierCountChange,
  runIcmpIdentifierModeChange,
  runIcmpIdentifierStepChange,
  runIcmpSequenceChange,
  runIcmpSequenceCountChange,
  runIcmpSequenceModeChange,
  runIcmpSequenceStepChange,
  runIcmpTypeCountChange,
  runIcmpTypeChange,
  runIcmpTypeModeChange,
  runIcmpTypeStepChange,
  runIcmpv6NdNaOverrideFlagChange,
  runIcmpv6NdNaRouterFlagChange,
  runIcmpv6NdNaSolicitedFlagChange,
  runIcmpv6NdOptionMacChange,
  runIcmpv6NdOptionSelectionChange,
  runIcmpv6NdTargetChange,
  runIcmpv6RaCurrentHopLimitChange,
  runIcmpv6RaManagedFlagChange,
  runIcmpv6RaOtherFlagChange,
  runIcmpv6RaPrefixAutonomousFlagChange,
  runIcmpv6RaPrefixChange,
  runIcmpv6RaPrefixLengthChange,
  runIcmpv6RaPrefixOnLinkFlagChange,
  runIcmpv6RaPrefixPreferredLifetimeChange,
  runIcmpv6RaPrefixSelectionChange,
  runIcmpv6RaPrefixValidLifetimeChange,
  runIcmpv6RaReachableTimeChange,
  runIcmpv6RaRetransTimerChange,
  runIcmpv6RaRouterLifetimeChange,
  runIcmpv6RaSllaMacChange,
  runIcmpv6RaSllaSelectionChange,
  runIcmpv6RsSllaMacChange,
  runIcmpv6RsSllaSelectionChange,
  runIsgChange,
  runIpv4DestinationChange,
  runIpv4DestinationCountChange,
  runIpv4DestinationModeChange,
  runIpv4DestinationStepChange,
  runIpv4ChecksumChange,
  runIpv4ChecksumOverrideChange,
  runIpv4DfFlagChange,
  runIpv4DscpChange,
  runIpv4DscpCountChange,
  runIpv4DscpModeChange,
  runIpv4DscpStepChange,
  runIpv4EcnChange,
  runIpv4EcnCountChange,
  runIpv4EcnModeChange,
  runIpv4EcnStepChange,
  runIpv4FragmentOffsetChange,
  runIpv4FragmentOffsetCountChange,
  runIpv4FragmentOffsetModeChange,
  runIpv4FragmentOffsetStepChange,
  runIpv4IdentificationChange,
  runIpv4IdentificationCountChange,
  runIpv4IdentificationModeChange,
  runIpv4IdentificationStepChange,
  runIpv4MfFlagChange,
  runIpv4SourceChange,
  runIpv4SourceCountChange,
  runIpv4SourceModeChange,
  runIpv4SourceStepChange,
  runIpv4TtlChange,
  runIpv4TtlCountChange,
  runIpv4TtlModeChange,
  runIpv4TtlStepChange,
  runIpv6DestinationChange,
  runIpv6DestinationCountChange,
  runIpv6DestinationModeChange,
  runIpv6DestinationStepChange,
  runIpv6FlowLabelChange,
  runIpv6FlowLabelCountChange,
  runIpv6FlowLabelModeChange,
  runIpv6FlowLabelStepChange,
  runIpv6HopLimitChange,
  runIpv6HopLimitCountChange,
  runIpv6HopLimitModeChange,
  runIpv6HopLimitStepChange,
  runIpv6SourceChange,
  runIpv6SourceCountChange,
  runIpv6SourceModeChange,
  runIpv6SourceStepChange,
  runIpv6TrafficClassChange,
  runIpv6TrafficClassCountChange,
  runIpv6TrafficClassModeChange,
  runIpv6TrafficClassStepChange,
  runL3SelectionChange,
  runL4DestinationPortChange,
  runL4DestinationPortCountChange,
  runL4DestinationPortModeChange,
  runL4DestinationPortOverrideSelectionChange,
  runL4DestinationPortStepChange,
  runL4SelectionChange,
  runL4SourcePortChange,
  runL4SourcePortCountChange,
  runL4SourcePortModeChange,
  runL4SourcePortOverrideSelectionChange,
  runL4SourcePortStepChange,
  runLatencyEnabledChange,
  runLoopActionCountChange,
  runLoopActionCountEnabledChange,
  runMplsLabelChange,
  runMplsLabelCountChange,
  runMplsLabelModeChange,
  runMplsLabelStepChange,
  runMplsSelectionChange,
  runMplsSecondLabelChange,
  runMplsSecondLabelCountChange,
  runMplsSecondLabelModeChange,
  runMplsSecondLabelSelectionChange,
  runMplsSecondLabelStepChange,
  runMplsSecondTrafficClassChange,
  runMplsSecondTrafficClassCountChange,
  runMplsSecondTrafficClassModeChange,
  runMplsSecondTrafficClassStepChange,
  runMplsSecondTtlChange,
  runMplsSecondTtlCountChange,
  runMplsSecondTtlModeChange,
  runMplsSecondTtlStepChange,
  runMplsThirdLabelChange,
  runMplsThirdLabelCountChange,
  runMplsThirdLabelModeChange,
  runMplsThirdLabelSelectionChange,
  runMplsThirdLabelStepChange,
  runMplsThirdTrafficClassChange,
  runMplsThirdTrafficClassCountChange,
  runMplsThirdTrafficClassModeChange,
  runMplsThirdTrafficClassStepChange,
  runMplsThirdTtlChange,
  runMplsThirdTtlCountChange,
  runMplsThirdTtlModeChange,
  runMplsThirdTtlStepChange,
  runMplsTrafficClassChange,
  runMplsTrafficClassCountChange,
  runMplsTrafficClassModeChange,
  runMplsTrafficClassStepChange,
  runMplsTtlChange,
  runMplsTtlCountChange,
  runMplsTtlModeChange,
  runMplsTtlStepChange,
  runNextStreamChange,
  runPacketFrameLengthChange,
  runPacketsPerBurstChange,
  runPacketTypeChange,
  runPayloadPatternChange,
  runPayloadPatternImportChange,
  runPayloadSelectionChange,
  runPayloadTypeChange,
  runPgIdChange,
  runRateTypeChange,
  runRateValueChange,
  runSelectedStreamPatch,
  runSelectedStreamPatchAction,
  selectedStreamPatchHandlersForIndex,
  runSelfStartChange,
  runStreamEnabledChange,
  runStreamModeChange,
  runStreamNameChange,
  runTunnelSelectionChange,
  runStreamPatch,
  runTotalPacketsChange,
  runDnsAnswerSelectionChange,
  runDnsCountChange,
  runDnsModeChange,
  runDnsNumberChange,
  runDnsSelectionChange,
  runDnsStepChange,
  runDnsTextChange,
  runDhcpBootpAddressCountChange,
  runDhcpBootpAddressModeChange,
  runDhcpBootpAddressStepChange,
  runDhcpBootpAddressTextChange,
  runDhcpBootpCountChange,
  runDhcpBootpModeChange,
  runDhcpBootpNumberChange,
  runDhcpBootpStepChange,
  runDhcpBootpTextChange,
  runDhcpOptionAddressCountChange,
  runDhcpOptionAddressModeChange,
  runDhcpOptionAddressStepChange,
  runDhcpOptionAddressTextChange,
  runDhcpOptionTextChange,
  runDhcpOptionTimerCountChange,
  runDhcpOptionTimerModeChange,
  runDhcpOptionTimerNumberChange,
  runDhcpOptionTimerStepChange,
  runDhcpSelectionChange,
  runUdpChecksumChange,
  runUdpChecksumCountChange,
  runUdpChecksumModeChange,
  runUdpChecksumOverrideChange,
  runUdpChecksumStepChange,
  runUdpLengthChange,
  runUdpLengthCountChange,
  runUdpLengthModeChange,
  runUdpLengthOverrideSelectionChange,
  runUdpLengthStepChange,
  runVlanCfiChange,
  runVlanIdChange,
  runVlanIdCountChange,
  runVlanIdModeChange,
  runVlanIdStepChange,
  runVlanInnerCfiChange,
  runVlanInnerIdChange,
  runVlanInnerIdCountChange,
  runVlanInnerIdModeChange,
  runVlanInnerIdStepChange,
  runVlanInnerPriorityChange,
  runVlanInnerPriorityCountChange,
  runVlanInnerPriorityModeChange,
  runVlanInnerPriorityStepChange,
  runVlanInnerSelectionChange,
  runVlanInnerTpidChange,
  runVlanInnerTpidOverrideChange,
  runVlanPriorityChange,
  runVlanPriorityCountChange,
  runVlanPriorityModeChange,
  runVlanPriorityStepChange,
  runVlanSelectionChange,
  runVlanTpidChange,
  runVlanTpidOverrideChange,
  runVxlanInnerEtherSourceChange,
  runVxlanInnerIpVersionChange,
  runVxlanInnerIpv4SourceChange,
  runVxlanInnerIpv4TtlModeChange,
  runVxlanInnerIpv6DestinationModeChange,
  runVxlanInnerL4DestinationPortStepChange,
  runVxlanVniChange,
  runSctpChecksumChange,
  runSctpChecksumOverrideChange,
  runSctpCountChange,
  runSctpModeChange,
  runSctpNumberChange,
  runSctpStepChange,
  runTcpChecksumChange,
  runTcpChecksumOverrideChange,
  runTcpCoreCountChange,
  runTcpCoreModeChange,
  runTcpCoreNumberChange,
  runTcpCoreStepChange,
  runTcpFlagChange,
  runTcpOptionCountChange,
  runTcpOptionModeChange,
  runTcpOptionNumberChange,
  runTcpOptionSelectionChange,
  runTcpOptionStepChange,
  selectedStreamPatch,
  sctpChecksumAction,
  sctpChecksumCoupledModePatch,
  sctpChecksumOverrideAction,
  sctpCountAction,
  sctpModeAction,
  sctpNumberAction,
  sctpStepAction,
  selfStartAction,
  streamEnabledAction,
  streamModeAction,
  streamModePatch,
  streamNameAction,
  tcpChecksumAction,
  tcpChecksumOverrideAction,
  tcpCoreCountAction,
  tcpCoreModeAction,
  tcpCoreNumberAction,
  tcpCoreStepAction,
  tcpFlagAction,
  tcpOptionCountAction,
  tcpOptionModeAction,
  tcpOptionNumberAction,
  tcpOptionSelectionAction,
  tcpOptionSelectionPatch,
  tcpOptionStepAction,
  totalPacketsAction,
  tunnelSelectionAction,
  vlanCfiAction,
  vlanIdAction,
  vlanIdCountAction,
  vlanIdModeAction,
  vlanIdStepAction,
  vlanInnerCfiAction,
  vlanInnerIdAction,
  vlanInnerIdCountAction,
  vlanInnerIdModeAction,
  vlanInnerIdStepAction,
  vlanInnerPriorityAction,
  vlanInnerPriorityCountAction,
  vlanInnerPriorityModeAction,
  vlanInnerPriorityStepAction,
  vlanInnerSelectionAction,
  vlanInnerTpidAction,
  vlanInnerTpidOverrideAction,
  vlanPriorityAction,
  vlanPriorityCountAction,
  vlanPriorityModeAction,
  vlanPriorityStepAction,
  tunnelDisabledPatch,
  udpChecksumAction,
  udpChecksumCountAction,
  udpChecksumModeAction,
  udpChecksumOverrideAction,
  udpChecksumStepAction,
  udpLengthAction,
  udpLengthCountAction,
  udpLengthModeAction,
  udpLengthOverrideSelectionAction,
  udpLengthStepAction,
  vlanTpidAction,
  vlanTpidOverrideAction,
  udpLengthOverrideSelectionPatch,
  vlanInnerTagSelectionPatch,
  vlanSelectionAction,
  vlanSelectionPatch,
  vxlanInnerEtherDestinationAction,
  vxlanInnerEtherSourceAction,
  vxlanInnerIpv4DestinationAction,
  vxlanInnerIpv4DestinationCountAction,
  vxlanInnerIpv4DestinationModeAction,
  vxlanInnerIpv4DestinationStepAction,
  vxlanInnerIpv4SourceAction,
  vxlanInnerIpv4SourceCountAction,
  vxlanInnerIpv4SourceModeAction,
  vxlanInnerIpv4SourceStepAction,
  vxlanInnerIpv4TtlAction,
  vxlanInnerIpv4TtlCountAction,
  vxlanInnerIpv4TtlModeAction,
  vxlanInnerIpv4TtlStepAction,
  vxlanInnerIpVersionPatch,
  vxlanInnerIpVersionAction,
  vxlanInnerIpv6DestinationAction,
  vxlanInnerIpv6DestinationCountAction,
  vxlanInnerIpv6DestinationModeAction,
  vxlanInnerIpv6DestinationStepAction,
  vxlanInnerIpv6HopLimitAction,
  vxlanInnerIpv6HopLimitCountAction,
  vxlanInnerIpv6HopLimitModeAction,
  vxlanInnerIpv6HopLimitStepAction,
  vxlanInnerIpv6SourceAction,
  vxlanInnerIpv6SourceCountAction,
  vxlanInnerIpv6SourceModeAction,
  vxlanInnerIpv6SourceStepAction,
  vxlanInnerL4DestinationPortAction,
  vxlanInnerL4DestinationPortCountAction,
  vxlanInnerL4DestinationPortModeAction,
  vxlanInnerL4DestinationPortStepAction,
  vxlanInnerL4SourcePortAction,
  vxlanInnerL4SourcePortCountAction,
  vxlanInnerL4SourcePortModeAction,
  vxlanInnerL4SourcePortStepAction,
  vxlanVniAction,
  vxlanVniCountAction,
  vxlanVniModeAction,
  vxlanVniStepAction,
  vxlanSelectionPatch
} from "./streamPatchModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

function udpApplicationStream(fields: Partial<ProfileWorkbenchStream> = {}) {
  return stream({
    dhcp_client_ip_mode: "Increment Host",
    dhcp_client_mac_mode: "Increment",
    dhcp_flags_mode: "Increment",
    dhcp_hops_mode: "Increment",
    dhcp_message_type_mode: "Increment",
    dhcp_operation_mode: "Increment",
    dhcp_relay_ip_mode: "Increment Host",
    dhcp_requested_ip_mode: "Increment Host",
    dhcp_seconds_mode: "Increment",
    dhcp_server_id_mode: "Increment Host",
    dhcp_server_ip_mode: "Increment Host",
    dhcp_xid_mode: "Increment",
    dhcp_your_ip_mode: "Increment Host",
    dns_answer_ipv4_mode: "Increment Host",
    dns_answer_ttl_mode: "Increment",
    dns_flags: "0100",
    dns_flags_mode: "Increment",
    dns_query_class: 1,
    dns_query_class_mode: "Increment",
    dns_query_type: 28,
    dns_query_type_mode: "Increment",
    dns_transaction_id_mode: "Increment",
    frame_length: 64,
    frame_length_max: 64,
    frame_length_min: 64,
    l4_dst_port: 1025,
    l4_dst_port_override: false,
    l4_src_port: 1025,
    l4_src_port_override: false,
    mpls_enabled: true,
    packet_type: "Ethernet/IPv4/UDP",
    udp_checksum_override: true,
    udp_length_mode: "Increment",
    udp_length_override: true,
    vlan_enabled: true,
    ...fields
  });
}

describe("trafficProfiles stream patch model", () => {
  it("runs optional stream patches through workspace callbacks", () => {
    const patches: unknown[] = [];

    expect(runStreamPatch(null, {
      applyPatch: (patch) => patches.push(patch)
    })).toBe(false);
    expect(patches).toEqual([]);

    expect(runStreamPatch({
      frame_length: 128
    }, {
      applyPatch: (patch) => patches.push(patch)
    })).toBe(true);
    expect(patches).toEqual([{ frame_length: 128 }]);
  });

  it("runs selected-stream patch actions through workspace callbacks", () => {
    const patches: unknown[] = [];

    expect(runSelectedStreamPatchAction({
      kind: "frame-length-type",
      frameLengthType: "Random"
    }, stream({
      frame_length: 64,
      frame_length_max: 64,
      frame_length_min: 64,
      packet_type: "Ethernet/IPv4/UDP"
    }), {
      applyPatch: (patch) => patches.push(patch)
    })).toBe(true);
    expect(patches).toEqual([{
      frame_length: 69,
      frame_length_max: 69,
      frame_length_min: 64,
      frame_length_type: "Random"
    }]);

    expect(runSelectedStreamPatchAction({
      kind: "packet-type",
      packetType: "Ethernet/IPv6/TCP"
    }, stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true
    }), {
      applyPatch: (patch) => patches.push(patch)
    })).toBe(false);
    expect(patches).toHaveLength(1);

    expect(runSelectedStreamPatch({
      kind: "stream-name",
      name: "wrapped"
    }, stream({}), {
      applyPatch: (patch) => patches.push(patch)
    })).toBe(true);
    expect(patches[patches.length - 1]).toEqual({ name: "wrapped" });
  });

  it("builds selected-stream patch handlers for a workspace stream index", () => {
    const changes: Array<{ patch: Partial<ProfileWorkbenchStream>; streamIndex: number }> = [];
    const handlers = selectedStreamPatchHandlersForIndex(3, (streamIndex, patch) => {
      changes.push({ patch, streamIndex });
    });

    handlers.applyPatch({ name: "stream-4" });

    expect(changes).toEqual([{ patch: { name: "stream-4" }, streamIndex: 3 }]);
  });

  it("runs common editor change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runStreamModeChange("burst", stream({}), handlers)).toBe(true);
    expect(patches[0]).toMatchObject({ count: 1, mode: "burst" });

    expect(runFrameLengthTypeChange("Random", stream({
      frame_length: 64,
      frame_length_max: 64,
      frame_length_min: 64,
      packet_type: "Ethernet/IPv4/UDP"
    }), handlers)).toBe(true);
    expect(patches[1]).toMatchObject({
      frame_length: 69,
      frame_length_type: "Random"
    });

    expect(runPacketTypeChange("Ethernet/ARP", stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    }), handlers)).toBe(true);
    expect(patches[2]).toMatchObject({ packet_type: "Ethernet/ARP" });

    expect(runIcmpTypeChange(8, stream({}), handlers)).toBe(true);
    expect(patches[3]).toMatchObject({ icmp_type: 8 });

    expect(runVxlanInnerIpVersionChange("IPv6", stream({}), handlers)).toBe(true);
    expect(patches[4]).toMatchObject({ vxlan_inner_ip_version: "IPv6" });

    expect(runGtpuInnerIpVersionChange("IPv4", stream({}), handlers)).toBe(true);
    expect(patches[5]).toMatchObject({ gtpu_inner_ip_version: "IPv4" });

    expect(runGreInnerIpVersionChange("IPv6", stream({}), handlers)).toBe(true);
    expect(patches[6]).toMatchObject({
      gre_inner_ip_version: "IPv6",
      gre_protocol_type: "86DD"
    });

    expect(runGtpuInnerIpv4SourceChange("172.20.0.10", stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ gtpu_inner_ipv4_src: "172.20.0.10" });

    expect(runGtpuInnerIpv4DestinationChange("172.20.0.20", stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ gtpu_inner_ipv4_dst: "172.20.0.20" });

    expect(runGtpuInnerIpv6SourceChange("2001:db8:80::10", stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ gtpu_inner_ipv6_src: "2001:db8:80::10" });

    expect(runGtpuInnerIpv6DestinationChange("2001:db8:80::20", stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ gtpu_inner_ipv6_dst: "2001:db8:80::20" });

    expect(runVxlanVniChange(4096, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ vxlan_vni: 4096 });

    expect(runVxlanInnerEtherSourceChange("00:11:22:33:44:55", stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ vxlan_inner_ether_src: "00:11:22:33:44:55" });

    expect(runVxlanInnerIpv4TtlModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ vxlan_inner_ipv4_ttl_mode: "Increment" });

    expect(runVxlanInnerIpv4SourceChange("192.0.2.10", stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ vxlan_inner_ipv4_src: "192.0.2.10" });

    expect(runVxlanInnerIpv6DestinationModeChange("Random Host", stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ vxlan_inner_ipv6_dst_mode: "Random Host" });

    expect(runVxlanInnerL4DestinationPortStepChange(7, stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ vxlan_inner_l4_dst_port_step: 7 });

    expect(runGtpuMessageTypeChange(255, stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ gtpu_message_type: 255 });

    expect(runGtpuTeidModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ gtpu_teid_mode: "Increment" });

    expect(runGtpuSequenceSelectionChange(true, stream({ gtpu_sequence_mode: "Random" }), handlers)).toBe(true);
    expect(patches[19]).toEqual({
      gtpu_sequence_enabled: true,
      gtpu_sequence_mode: "Random"
    });

    expect(runGtpuExtensionUdpPortStepChange(9, stream({}), handlers)).toBe(true);
    expect(patches[20]).toEqual({ gtpu_extension_udp_port_step: 9 });

    expect(runGtpuInnerIpv4TtlModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[21]).toEqual({ gtpu_inner_ipv4_ttl_mode: "Increment" });

    expect(runGtpuInnerIpv4SourceModeChange("Random Host", stream({}), handlers)).toBe(true);
    expect(patches[22]).toEqual({ gtpu_inner_ipv4_src_mode: "Random Host" });

    expect(runGtpuInnerIpv6DestinationStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[23]).toEqual({ gtpu_inner_ipv6_dst_step: 4 });

    expect(runGtpuInnerL4DestinationPortStepChange(11, stream({}), handlers)).toBe(true);
    expect(patches[24]).toEqual({ gtpu_inner_l4_dst_port_step: 11 });

    expect(runGreChecksumSelectionChange(true, stream({
      frame_length: 64,
      gre_checksum_override: true
    }), handlers)).toBe(true);
    expect(patches[25]).toEqual({
      frame_length: 100,
      gre_checksum_override: true,
      gre_checksum_present: true
    });

    expect(runGreKeyModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[26]).toEqual({
      gre_checksum_override: false,
      gre_checksum_present: false,
      gre_key_mode: "Increment",
      gre_key_present: true
    });

    expect(runGreSequenceStepChange(9, stream({}), handlers)).toBe(true);
    expect(patches[27]).toEqual({ gre_sequence_step: 9 });

    expect(runGreInnerIpv4SourceChange("172.18.0.10", stream({}), handlers)).toBe(true);
    expect(patches[28]).toEqual({ gre_inner_ipv4_src: "172.18.0.10" });

    expect(runGreInnerIpv4TtlModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[29]).toEqual({
      gre_checksum_override: false,
      gre_checksum_present: false,
      gre_inner_ipv4_ttl_mode: "Increment"
    });

    expect(runGreInnerIpv6SourceModeChange("Increment Host", stream({}), handlers)).toBe(true);
    expect(patches[30]).toEqual({
      gre_checksum_override: false,
      gre_checksum_present: false,
      gre_inner_ipv6_src_mode: "Increment Host"
    });

    expect(runGreInnerL4DestinationPortStepChange(17, stream({}), handlers)).toBe(true);
    expect(patches[31]).toEqual({ gre_inner_l4_dst_port_step: 17 });
  });

  it("runs ICMP protocol-data change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };
    const checksumStream = stream({ icmp_checksum_override: true });

    expect(runIcmpTypeModeChange("Increment", checksumStream, handlers)).toBe(true);
    expect(patches[0]).toEqual({
      icmp_checksum_override: false,
      icmp_type_mode: "Increment"
    });

    expect(runIcmpTypeCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ icmp_type_count: 16 });

    expect(runIcmpTypeStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ icmp_type_step: 2 });

    expect(runIcmpCodeChange(3, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ icmp_code: 3 });

    expect(runIcmpCodeModeChange("Fixed", checksumStream, handlers)).toBe(true);
    expect(patches[4]).toEqual({
      icmp_checksum_override: true,
      icmp_code_mode: "Fixed"
    });

    expect(runIcmpCodeCountChange(17, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ icmp_code_count: 17 });

    expect(runIcmpCodeStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ icmp_code_step: 3 });

    expect(runIcmpIdentifierChange(4096, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ icmp_identifier: 4096 });

    expect(runIcmpIdentifierModeChange("Random", checksumStream, handlers)).toBe(true);
    expect(patches[8]).toEqual({
      icmp_checksum_override: false,
      icmp_identifier_mode: "Random"
    });

    expect(runIcmpIdentifierCountChange(18, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ icmp_identifier_count: 18 });

    expect(runIcmpIdentifierStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ icmp_identifier_step: 4 });

    expect(runIcmpSequenceChange(8192, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ icmp_sequence: 8192 });

    expect(runIcmpSequenceModeChange("Increment", checksumStream, handlers)).toBe(true);
    expect(patches[12]).toEqual({
      icmp_checksum_override: false,
      icmp_sequence_mode: "Increment"
    });

    expect(runIcmpSequenceCountChange(19, stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ icmp_sequence_count: 19 });

    expect(runIcmpSequenceStepChange(5, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ icmp_sequence_step: 5 });

    expect(runIcmpChecksumOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ icmp_checksum_override: true });

    expect(runIcmpChecksumChange("b3e3", stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ icmp_checksum: "b3e3" });
  });

  it("runs ICMPv6 control-message helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };
    const controlStream = stream({
      frame_length: 64,
      packet_type: "Ethernet/IPv6/ICMPv6"
    });

    expect(runIcmpv6RsSllaSelectionChange(true, controlStream, handlers)).toBe(true);
    expect(patches[0]).toMatchObject({ icmpv6_rs_include_slla: true });

    expect(runIcmpv6RsSllaMacChange("00:11:22:33:44:55", controlStream, handlers)).toBe(true);
    expect(patches[1]).toEqual({ icmpv6_rs_slla_mac: "00:11:22:33:44:55" });

    expect(runIcmpv6RaCurrentHopLimitChange(64, controlStream, handlers)).toBe(true);
    expect(patches[2]).toEqual({ icmpv6_ra_cur_hop_limit: 64 });

    expect(runIcmpv6RaRouterLifetimeChange(1800, controlStream, handlers)).toBe(true);
    expect(patches[3]).toEqual({ icmpv6_ra_router_lifetime: 1800 });

    expect(runIcmpv6RaReachableTimeChange(30000, controlStream, handlers)).toBe(true);
    expect(patches[4]).toEqual({ icmpv6_ra_reachable_time: 30000 });

    expect(runIcmpv6RaRetransTimerChange(1000, controlStream, handlers)).toBe(true);
    expect(patches[5]).toEqual({ icmpv6_ra_retrans_timer: 1000 });

    expect(runIcmpv6RaManagedFlagChange(true, controlStream, handlers)).toBe(true);
    expect(patches[6]).toEqual({ icmpv6_ra_managed: true });

    expect(runIcmpv6RaOtherFlagChange(false, controlStream, handlers)).toBe(true);
    expect(patches[7]).toEqual({ icmpv6_ra_other: false });

    expect(runIcmpv6RaSllaSelectionChange(true, controlStream, handlers)).toBe(true);
    expect(patches[8]).toMatchObject({ icmpv6_ra_include_slla: true });

    expect(runIcmpv6RaSllaMacChange("00:aa:bb:cc:dd:ee", controlStream, handlers)).toBe(true);
    expect(patches[9]).toEqual({ icmpv6_ra_slla_mac: "00:aa:bb:cc:dd:ee" });

    expect(runIcmpv6RaPrefixSelectionChange(true, controlStream, handlers)).toBe(true);
    expect(patches[10]).toMatchObject({ icmpv6_ra_include_prefix: true });

    expect(runIcmpv6RaPrefixChange("2001:db8:1::", controlStream, handlers)).toBe(true);
    expect(patches[11]).toEqual({ icmpv6_ra_prefix: "2001:db8:1::" });

    expect(runIcmpv6RaPrefixLengthChange(64, controlStream, handlers)).toBe(true);
    expect(patches[12]).toEqual({ icmpv6_ra_prefix_length: 64 });

    expect(runIcmpv6RaPrefixOnLinkFlagChange(true, controlStream, handlers)).toBe(true);
    expect(patches[13]).toEqual({ icmpv6_ra_prefix_on_link: true });

    expect(runIcmpv6RaPrefixAutonomousFlagChange(false, controlStream, handlers)).toBe(true);
    expect(patches[14]).toEqual({ icmpv6_ra_prefix_autonomous: false });

    expect(runIcmpv6RaPrefixValidLifetimeChange(2592000, controlStream, handlers)).toBe(true);
    expect(patches[15]).toEqual({ icmpv6_ra_prefix_valid_lifetime: 2592000 });

    expect(runIcmpv6RaPrefixPreferredLifetimeChange(604800, controlStream, handlers)).toBe(true);
    expect(patches[16]).toEqual({ icmpv6_ra_prefix_preferred_lifetime: 604800 });

    expect(runIcmpv6NdTargetChange("2001:db8::1", controlStream, handlers)).toBe(true);
    expect(patches[17]).toEqual({ icmpv6_nd_target: "2001:db8::1" });

    expect(runIcmpv6NdOptionSelectionChange(false, controlStream, handlers)).toBe(true);
    expect(patches[18]).toEqual({ icmpv6_nd_include_option: false });

    expect(runIcmpv6NdOptionMacChange("00:11:22:33:44:66", controlStream, handlers)).toBe(true);
    expect(patches[19]).toEqual({ icmpv6_nd_option_mac: "00:11:22:33:44:66" });

    expect(runIcmpv6NdNaRouterFlagChange(true, controlStream, handlers)).toBe(true);
    expect(patches[20]).toEqual({ icmpv6_nd_na_router: true });

    expect(runIcmpv6NdNaSolicitedFlagChange(false, controlStream, handlers)).toBe(true);
    expect(patches[21]).toEqual({ icmpv6_nd_na_solicited: false });

    expect(runIcmpv6NdNaOverrideFlagChange(true, controlStream, handlers)).toBe(true);
    expect(patches[22]).toEqual({ icmpv6_nd_na_override: true });
  });

  it("runs stream properties change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runStreamEnabledChange(false, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ enabled: false });

    expect(runSelfStartChange(true, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ self_start: true });

    expect(runTotalPacketsChange(10, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ total_pkts: 10 });

    expect(runBurstCountChange(2, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ count: 2 });

    expect(runPacketsPerBurstChange(3, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ pkts_per_burst: 3 });

    expect(runRateTypeChange("pps", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ rate_type: "pps" });

    expect(runRateValueChange(5000, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ rate_value: 5000 });

    expect(runAfterStreamStopChange(stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ action_count: 0, next_stream_id: null });

    expect(runAfterStreamGotoChange(stream({ action_count: 2 }), handlers)).toBe(true);
    expect(patches[8]).toEqual({ action_count: 2, next_stream_id: 1 });

    expect(runNextStreamChange(7, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ next_stream_id: 7 });

    expect(runLoopActionCountEnabledChange(true, stream({ action_count: 0 }), handlers)).toBe(true);
    expect(patches[10]).toEqual({ action_count: 1 });

    expect(runLoopActionCountChange(4, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ action_count: 4 });

    expect(runIsgChange(0.1, stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ isg: 0.1 });

    expect(runIbgChange(0.2, stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ ibg: 0.2 });

    expect(runFlowStatsEnabledChange(true, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ flow_stats_enabled: true });

    expect(runPgIdChange(12, stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ pg_id: 12 });

    expect(runLatencyEnabledChange(true, stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ latency_enabled: true });

    expect(runStreamNameChange("next", stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ name: "next" });

    expect(runPacketFrameLengthChange(128, stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ frame_length: 128 });
  });

  it("runs protocol selection change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runFrameLengthMinChange(96, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ frame_length_min: 96 });

    expect(runFrameLengthMaxChange(256, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ frame_length: 256, frame_length_max: 256 });

    expect(runVlanSelectionChange(false, stream({}), handlers)).toBe(true);
    expect(patches[2]).toMatchObject({
      vlan_enabled: false,
      vlan_id_mode: "Fixed",
      vlan_priority_mode: "Fixed"
    });

    expect(runMplsSelectionChange(true, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ mpls_enabled: true });

    expect(runTunnelSelectionChange("vxlan", stream({
      frame_length: 64,
      frame_length_max: 64
    }), handlers)).toBe(true);
    expect(patches[4]).toMatchObject({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true
    });

    expect(runL3SelectionChange("IPv6", stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    }), handlers)).toBe(true);
    expect(patches[5]).toMatchObject({ packet_type: "Ethernet/IPv6/UDP" });

    expect(runL4SelectionChange("TCP", stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    }), handlers)).toBe(true);
    expect(patches[6]).toMatchObject({ packet_type: "Ethernet/IPv4/TCP" });

    expect(runPayloadSelectionChange(true, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ payload_enabled: true });
  });

  it("runs payload data and advanced settings helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runPayloadTypeChange("Fixed Word", stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ payload_type: "Fixed Word" });

    expect(runPayloadPatternChange("AABBCCDD", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ payload_pattern: "AABBCCDD" });

    expect(runPayloadPatternImportChange("ccdd", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({
      payload_enabled: true,
      payload_pattern: "CCDD",
      payload_type: "Fixed Word"
    });

    expect(runAdvancedCacheSizeTypeChange("Enable", stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ advanced_cache_size_type: "Enable" });

    expect(runAdvancedCacheValueChange(2048, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ advanced_cache_value: 2048 });
  });

  it("runs media access and VLAN field change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runEtherTypeOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ ether_type_override: true });

    expect(runEtherTypeChange("88b5", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ ether_type: "88b5" });

    expect(runEtherDestinationChange("00:11:22:33:44:55", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ ether_dst: "00:11:22:33:44:55" });

    expect(runEtherDestinationModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ ether_dst_mode: "Increment" });

    expect(runEtherDestinationCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ ether_dst_count: 16 });

    expect(runEtherDestinationStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ ether_dst_step: 2 });

    expect(runEtherSourceChange("66:77:88:99:aa:bb", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ ether_src: "66:77:88:99:aa:bb" });

    expect(runEtherSourceModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ ether_src_mode: "Decrement" });

    expect(runEtherSourceCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ ether_src_count: 32 });

    expect(runEtherSourceStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ ether_src_step: 3 });

    expect(runVlanTpidOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ vlan_tpid_override: true });

    expect(runVlanTpidChange("88a8", stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ vlan_tpid: "88a8" });

    expect(runVlanPriorityChange(5, stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ vlan_priority: 5 });

    expect(runVlanPriorityModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ vlan_priority_mode: "Increment" });

    expect(runVlanPriorityCountChange(4, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ vlan_priority_count: 4 });

    expect(runVlanPriorityStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ vlan_priority_step: 2 });

    expect(runVlanCfiChange(1, stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ vlan_cfi: 1 });

    expect(runVlanIdChange(120, stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ vlan_id: 120 });

    expect(runVlanIdModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ vlan_id_mode: "Random" });

    expect(runVlanIdCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[19]).toEqual({ vlan_id_count: 16 });

    expect(runVlanIdStepChange(10, stream({}), handlers)).toBe(true);
    expect(patches[20]).toEqual({ vlan_id_step: 10 });

    expect(runVlanInnerSelectionChange(true, stream({
      vlan2_id_mode: "Random",
      vlan2_priority_mode: "Increment"
    }), handlers)).toBe(true);
    expect(patches[21]).toEqual({
      vlan2_enabled: true,
      vlan2_id_mode: "Random",
      vlan2_priority_mode: "Increment"
    });

    expect(runVlanInnerTpidOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[22]).toEqual({ vlan2_tpid_override: true });

    expect(runVlanInnerTpidChange("88a8", stream({}), handlers)).toBe(true);
    expect(patches[23]).toEqual({ vlan2_tpid: "88a8" });

    expect(runVlanInnerPriorityChange(6, stream({}), handlers)).toBe(true);
    expect(patches[24]).toEqual({ vlan2_priority: 6 });

    expect(runVlanInnerPriorityModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[25]).toEqual({ vlan2_priority_mode: "Increment" });

    expect(runVlanInnerPriorityCountChange(4, stream({}), handlers)).toBe(true);
    expect(patches[26]).toEqual({ vlan2_priority_count: 4 });

    expect(runVlanInnerPriorityStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[27]).toEqual({ vlan2_priority_step: 2 });

    expect(runVlanInnerCfiChange(1, stream({}), handlers)).toBe(true);
    expect(patches[28]).toEqual({ vlan2_cfi: 1 });

    expect(runVlanInnerIdChange(220, stream({}), handlers)).toBe(true);
    expect(patches[29]).toEqual({ vlan2_id: 220 });

    expect(runVlanInnerIdModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[30]).toEqual({ vlan2_id_mode: "Random" });

    expect(runVlanInnerIdCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[31]).toEqual({ vlan2_id_count: 16 });

    expect(runVlanInnerIdStepChange(10, stream({}), handlers)).toBe(true);
    expect(patches[32]).toEqual({ vlan2_id_step: 10 });
  });

  it("runs ARP field change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runArpHardwareTypeChange(1, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ arp_hardware_type: 1 });

    expect(runArpProtocolTypeChange("0800", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ arp_protocol_type: "0800" });

    expect(runArpHardwareSizeChange(6, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ arp_hardware_size: 6 });

    expect(runArpProtocolSizeChange(4, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ arp_protocol_size: 4 });

    expect(runArpOperationChange(2, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ arp_operation: 2 });

    expect(runArpOperationModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ arp_operation_mode: "Increment" });

    expect(runArpOperationCountChange(8, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ arp_operation_count: 8 });

    expect(runArpOperationStepChange(1, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ arp_operation_step: 1 });

    expect(runArpSenderMacChange("00:11:22:33:44:55", stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ arp_sender_mac: "00:11:22:33:44:55" });

    expect(runArpSenderMacModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ arp_sender_mac_mode: "Increment" });

    expect(runArpSenderMacCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ arp_sender_mac_count: 16 });

    expect(runArpSenderMacStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ arp_sender_mac_step: 2 });

    expect(runArpSenderIpChange("10.0.0.1", stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ arp_sender_ip: "10.0.0.1" });

    expect(runArpSenderIpModeChange("Increment Host", stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ arp_sender_ip_mode: "Increment Host" });

    expect(runArpSenderIpCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ arp_sender_ip_count: 32 });

    expect(runArpSenderIpStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ arp_sender_ip_step: 3 });

    expect(runArpTargetMacChange("66:77:88:99:aa:bb", stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ arp_target_mac: "66:77:88:99:aa:bb" });

    expect(runArpTargetMacModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ arp_target_mac_mode: "Decrement" });

    expect(runArpTargetMacCountChange(64, stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ arp_target_mac_count: 64 });

    expect(runArpTargetMacStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[19]).toEqual({ arp_target_mac_step: 4 });

    expect(runArpTargetIpChange("10.0.0.2", stream({}), handlers)).toBe(true);
    expect(patches[20]).toEqual({ arp_target_ip: "10.0.0.2" });

    expect(runArpTargetIpModeChange("Random Host", stream({}), handlers)).toBe(true);
    expect(patches[21]).toEqual({ arp_target_ip_mode: "Random Host" });

    expect(runArpTargetIpCountChange(128, stream({}), handlers)).toBe(true);
    expect(patches[22]).toEqual({ arp_target_ip_count: 128 });

    expect(runArpTargetIpStepChange(5, stream({}), handlers)).toBe(true);
    expect(patches[23]).toEqual({ arp_target_ip_step: 5 });
  });

  it("runs outer IPv4 address change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runIpv4DestinationChange("192.0.2.1", stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ ipv4_dst: "192.0.2.1" });

    expect(runIpv4DestinationModeChange("Increment Host", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ ipv4_dst_mode: "Increment Host" });

    expect(runIpv4DestinationCountChange("1000", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ ipv4_dst_count: "1000" });

    expect(runIpv4DestinationStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ ipv4_dst_step: 2 });

    expect(runIpv4SourceChange("198.51.100.1", stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ ipv4_src: "198.51.100.1" });

    expect(runIpv4SourceModeChange("Random Host", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ ipv4_src_mode: "Random Host" });

    expect(runIpv4SourceCountChange("2000", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ ipv4_src_count: "2000" });

    expect(runIpv4SourceStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ ipv4_src_step: 3 });
  });

  it("runs outer IPv4 scalar flag and checksum helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runIpv4DscpChange(10, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ ipv4_dscp: 10 });

    expect(runIpv4DscpModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ ipv4_dscp_mode: "Increment" });

    expect(runIpv4DscpCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ ipv4_dscp_count: 32 });

    expect(runIpv4DscpStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ ipv4_dscp_step: 4 });

    expect(runIpv4EcnChange(3, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ ipv4_ecn: 3 });

    expect(runIpv4EcnModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ ipv4_ecn_mode: "Random" });

    expect(runIpv4EcnCountChange(4, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ ipv4_ecn_count: 4 });

    expect(runIpv4EcnStepChange(1, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ ipv4_ecn_step: 1 });

    expect(runIpv4IdentificationChange(4096, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ ipv4_id: 4096 });

    expect(runIpv4IdentificationModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ ipv4_id_mode: "Decrement" });

    expect(runIpv4IdentificationCountChange(64, stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ ipv4_id_count: 64 });

    expect(runIpv4IdentificationStepChange(8, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ ipv4_id_step: 8 });

    expect(runIpv4DfFlagChange(true, stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ ipv4_flag_df: true });

    expect(runIpv4MfFlagChange(false, stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ ipv4_flag_mf: false });

    expect(runIpv4FragmentOffsetChange(512, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ ipv4_fragment_offset: 512 });

    expect(runIpv4FragmentOffsetModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ ipv4_fragment_offset_mode: "Increment" });

    expect(runIpv4FragmentOffsetCountChange(128, stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ ipv4_fragment_offset_count: 128 });

    expect(runIpv4FragmentOffsetStepChange(16, stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ ipv4_fragment_offset_step: 16 });

    expect(runIpv4TtlChange(63, stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ ipv4_ttl: 63 });

    expect(runIpv4TtlModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[19]).toEqual({ ipv4_ttl_mode: "Random" });

    expect(runIpv4TtlCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[20]).toEqual({ ipv4_ttl_count: 16 });

    expect(runIpv4TtlStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[21]).toEqual({ ipv4_ttl_step: 2 });

    expect(runIpv4ChecksumOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[22]).toEqual({ ipv4_checksum_override: true });

    expect(runIpv4ChecksumChange("b3e3", stream({}), handlers)).toBe(true);
    expect(patches[23]).toEqual({ ipv4_checksum: "b3e3" });
  });

  it("runs outer IPv6 address and scalar helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runIpv6DestinationChange("2001:db8::1", stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ ipv6_dst: "2001:db8::1" });

    expect(runIpv6DestinationModeChange("Increment Host", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ ipv6_dst_mode: "Increment Host" });

    expect(runIpv6DestinationCountChange(2048, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ ipv6_dst_count: 2048 });

    expect(runIpv6DestinationStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ ipv6_dst_step: 2 });

    expect(runIpv6SourceChange("2001:db8::2", stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ ipv6_src: "2001:db8::2" });

    expect(runIpv6SourceModeChange("Random Host", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ ipv6_src_mode: "Random Host" });

    expect(runIpv6SourceCountChange(4096, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ ipv6_src_count: 4096 });

    expect(runIpv6SourceStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ ipv6_src_step: 3 });

    expect(runIpv6TrafficClassChange(128, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ ipv6_traffic_class: 128 });

    expect(runIpv6TrafficClassModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ ipv6_traffic_class_mode: "Increment" });

    expect(runIpv6TrafficClassCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ ipv6_traffic_class_count: 32 });

    expect(runIpv6TrafficClassStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ ipv6_traffic_class_step: 4 });

    expect(runIpv6FlowLabelChange(4096, stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ ipv6_flow_label: 4096 });

    expect(runIpv6FlowLabelModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ ipv6_flow_label_mode: "Random" });

    expect(runIpv6FlowLabelCountChange(64, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ ipv6_flow_label_count: 64 });

    expect(runIpv6FlowLabelStepChange(8, stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ ipv6_flow_label_step: 8 });

    expect(runIpv6HopLimitChange(63, stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ ipv6_hop_limit: 63 });

    expect(runIpv6HopLimitModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ ipv6_hop_limit_mode: "Decrement" });

    expect(runIpv6HopLimitCountChange(16, stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ ipv6_hop_limit_count: 16 });

    expect(runIpv6HopLimitStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[19]).toEqual({ ipv6_hop_limit_step: 2 });
  });

  it("runs primary MPLS field change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runMplsLabelChange(104857, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ mpls_label: 104857 });

    expect(runMplsLabelModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ mpls_label_mode: "Increment" });

    expect(runMplsLabelCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ mpls_label_count: 32 });

    expect(runMplsLabelStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ mpls_label_step: 4 });

    expect(runMplsTrafficClassChange(5, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ mpls_tc: 5 });

    expect(runMplsTrafficClassModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ mpls_tc_mode: "Random" });

    expect(runMplsTrafficClassCountChange(6, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ mpls_tc_count: 6 });

    expect(runMplsTrafficClassStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ mpls_tc_step: 2 });

    expect(runMplsTtlChange(63, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ mpls_ttl: 63 });

    expect(runMplsTtlModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ mpls_ttl_mode: "Decrement" });

    expect(runMplsTtlCountChange(8, stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ mpls_ttl_count: 8 });

    expect(runMplsTtlStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ mpls_ttl_step: 3 });
  });

  it("runs second MPLS field change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runMplsSecondLabelSelectionChange(true, stream({
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement"
    }), handlers)).toBe(true);
    expect(patches[0]).toEqual({
      mpls_label2_enabled: true,
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement"
    });

    expect(runMplsSecondLabelChange(200, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ mpls_label2: 200 });

    expect(runMplsSecondLabelModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ mpls_label2_mode: "Increment" });

    expect(runMplsSecondLabelCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ mpls_label2_count: 32 });

    expect(runMplsSecondLabelStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ mpls_label2_step: 4 });

    expect(runMplsSecondTrafficClassChange(5, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ mpls_label2_tc: 5 });

    expect(runMplsSecondTrafficClassModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ mpls_label2_tc_mode: "Random" });

    expect(runMplsSecondTrafficClassCountChange(6, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ mpls_label2_tc_count: 6 });

    expect(runMplsSecondTrafficClassStepChange(2, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ mpls_label2_tc_step: 2 });

    expect(runMplsSecondTtlChange(62, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ mpls_label2_ttl: 62 });

    expect(runMplsSecondTtlModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ mpls_label2_ttl_mode: "Decrement" });

    expect(runMplsSecondTtlCountChange(9, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ mpls_label2_ttl_count: 9 });

    expect(runMplsSecondTtlStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ mpls_label2_ttl_step: 3 });
  });

  it("runs third MPLS field change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runMplsThirdLabelSelectionChange(true, stream({
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }), handlers)).toBe(true);
    expect(patches[0]).toEqual({
      mpls_label2_enabled: true,
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    });

    expect(runMplsThirdLabelChange(300, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ mpls_label3: 300 });

    expect(runMplsThirdLabelModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ mpls_label3_mode: "Increment" });

    expect(runMplsThirdLabelCountChange(42, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ mpls_label3_count: 42 });

    expect(runMplsThirdLabelStepChange(5, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ mpls_label3_step: 5 });

    expect(runMplsThirdTrafficClassChange(7, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ mpls_label3_tc: 7 });

    expect(runMplsThirdTrafficClassModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ mpls_label3_tc_mode: "Random" });

    expect(runMplsThirdTrafficClassCountChange(7, stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ mpls_label3_tc_count: 7 });

    expect(runMplsThirdTrafficClassStepChange(3, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ mpls_label3_tc_step: 3 });

    expect(runMplsThirdTtlChange(61, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ mpls_label3_ttl: 61 });

    expect(runMplsThirdTtlModeChange("Decrement", stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ mpls_label3_ttl_mode: "Decrement" });

    expect(runMplsThirdTtlCountChange(10, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ mpls_label3_ttl_count: 10 });

    expect(runMplsThirdTtlStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ mpls_label3_ttl_step: 4 });
  });

  it("runs outer L4 port field change helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runL4SourcePortOverrideSelectionChange(true, stream({
      l4_src_port_mode: "Increment"
    }), handlers)).toBe(true);
    expect(patches[0]).toEqual({
      l4_src_port_mode: "Increment",
      l4_src_port_override: true
    });

    expect(runL4SourcePortChange(1025, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ l4_src_port: 1025 });

    expect(runL4SourcePortModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ l4_src_port_mode: "Increment" });

    expect(runL4SourcePortCountChange(64, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ l4_src_port_count: 64 });

    expect(runL4SourcePortStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ l4_src_port_step: 4 });

    expect(runL4DestinationPortOverrideSelectionChange(false, stream({
      l4_dst_port_mode: "Decrement"
    }), handlers)).toBe(true);
    expect(patches[5]).toEqual({
      l4_dst_port_mode: "Fixed",
      l4_dst_port_override: false
    });

    expect(runL4DestinationPortChange(4789, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ l4_dst_port: 4789 });

    expect(runL4DestinationPortModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ l4_dst_port_mode: "Random" });

    expect(runL4DestinationPortCountChange(128, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ l4_dst_port_count: 128 });

    expect(runL4DestinationPortStepChange(8, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ l4_dst_port_step: 8 });
  });

  it("runs UDP length and checksum helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runUdpLengthOverrideSelectionChange(true, stream({
      udp_length_mode: "Increment"
    }), handlers)).toBe(true);
    expect(patches[0]).toEqual({
      udp_length_mode: "Increment",
      udp_length_override: true
    });

    expect(runUdpLengthChange(128, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ udp_length: 128 });

    expect(runUdpLengthModeChange("Increment", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ udp_length_mode: "Increment" });

    expect(runUdpLengthCountChange(32, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ udp_length_count: 32 });

    expect(runUdpLengthStepChange(8, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ udp_length_step: 8 });

    expect(runUdpChecksumOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ udp_checksum_override: true });

    expect(runUdpChecksumChange("b3e3", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ udp_checksum: "b3e3" });

    expect(runUdpChecksumModeChange("Random", stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ udp_checksum_mode: "Random" });

    expect(runUdpChecksumCountChange(64, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ udp_checksum_count: 64 });

    expect(runUdpChecksumStepChange(4, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ udp_checksum_step: 4 });
  });

  it("runs DNS helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runDnsSelectionChange(true, udpApplicationStream({
      dhcp_enabled: true,
      dns_answer_enabled: true
    }), handlers)).toBe(true);
    expect(patches[0]).toMatchObject({
      dhcp_enabled: false,
      dns_answer_enabled: true,
      dns_enabled: true,
      l4_dst_port: 53
    });

    expect(runDnsAnswerSelectionChange(true, udpApplicationStream(), handlers)).toBe(true);
    expect(patches[1]).toMatchObject({
      dns_answer_enabled: true,
      dns_flags: "8180",
      dns_query_type: 1
    });

    expect(runDnsNumberChange("transaction-id", 4660, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ dns_transaction_id: 4660 });

    expect(runDnsTextChange("query-name", "example.com", stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ dns_query_name: "example.com" });

    expect(runDnsModeChange("flags", "Random", stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ dns_flags_mode: "Random" });

    expect(runDnsCountChange("query-type", 8, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ dns_query_type_count: 8 });

    expect(runDnsStepChange("answer-ipv4", 4, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ dns_answer_ipv4_step: 4 });
  });

  it("runs DHCP helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runDhcpSelectionChange(true, udpApplicationStream({
      dns_enabled: true
    }), handlers)).toBe(true);
    expect(patches[0]).toMatchObject({
      dhcp_enabled: true,
      dns_enabled: false,
      l4_dst_port: 67,
      l4_src_port: 68
    });

    expect(runDhcpBootpNumberChange("operation", 2, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ dhcp_operation: 2 });

    expect(runDhcpBootpTextChange("flags", "8000", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ dhcp_flags: "8000" });

    expect(runDhcpBootpModeChange("xid", "Increment", stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ dhcp_xid_mode: "Increment" });

    expect(runDhcpBootpCountChange("message-type", 8, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ dhcp_message_type_count: 8 });

    expect(runDhcpBootpStepChange("flags", 4, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ dhcp_flags_step: 4 });

    expect(runDhcpBootpAddressTextChange("client-ip", "0.0.0.0", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ dhcp_client_ip: "0.0.0.0" });

    expect(runDhcpBootpAddressModeChange("client-mac", "Increment", stream({}), handlers)).toBe(true);
    expect(patches[7]).toEqual({ dhcp_client_mac_mode: "Increment" });

    expect(runDhcpBootpAddressCountChange("client-ip", 16, stream({}), handlers)).toBe(true);
    expect(patches[8]).toEqual({ dhcp_client_ip_count: 16 });

    expect(runDhcpBootpAddressStepChange("server-ip", 4, stream({}), handlers)).toBe(true);
    expect(patches[9]).toEqual({ dhcp_server_ip_step: 4 });

    expect(runDhcpOptionTextChange("hostname", "trex-host", stream({}), handlers)).toBe(true);
    expect(patches[10]).toEqual({ dhcp_hostname: "trex-host" });

    expect(runDhcpOptionTimerNumberChange("lease-time", 3600, stream({}), handlers)).toBe(true);
    expect(patches[11]).toEqual({ dhcp_lease_time: 3600 });

    expect(runDhcpOptionTimerModeChange("renewal-time", "Decrement", stream({}), handlers)).toBe(true);
    expect(patches[12]).toEqual({ dhcp_renewal_time_mode: "Decrement" });

    expect(runDhcpOptionTimerCountChange("lease-time", 4, stream({}), handlers)).toBe(true);
    expect(patches[13]).toEqual({ dhcp_lease_time_count: 4 });

    expect(runDhcpOptionTimerStepChange("renewal-time", 30, stream({}), handlers)).toBe(true);
    expect(patches[14]).toEqual({ dhcp_renewal_time_step: 30 });

    expect(runDhcpOptionAddressTextChange("requested-ip", "10.0.0.10", stream({}), handlers)).toBe(true);
    expect(patches[15]).toEqual({ dhcp_requested_ip: "10.0.0.10" });

    expect(runDhcpOptionAddressModeChange("server-id", "Random Host", stream({}), handlers)).toBe(true);
    expect(patches[16]).toEqual({ dhcp_server_id_mode: "Random Host" });

    expect(runDhcpOptionAddressCountChange("requested-ip", 8, stream({}), handlers)).toBe(true);
    expect(patches[17]).toEqual({ dhcp_requested_ip_count: 8 });

    expect(runDhcpOptionAddressStepChange("server-id", 2, stream({}), handlers)).toBe(true);
    expect(patches[18]).toEqual({ dhcp_server_id_step: 2 });
  });

  it("runs SCTP helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runSctpNumberChange("verification-tag", 12345, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ sctp_verification_tag: 12345 });

    expect(runSctpModeChange("data-flags", "Increment", stream({
      sctp_checksum: "12345678",
      sctp_checksum_override: false
    }), handlers)).toBe(true);
    expect(patches[1]).toEqual({
      sctp_checksum: "00000000",
      sctp_checksum_override: true,
      sctp_data_flags_mode: "Increment"
    });

    expect(runSctpModeChange("payload-protocol-id", "Fixed", stream({
      sctp_checksum: "12345678",
      sctp_checksum_override: false
    }), handlers)).toBe(true);
    expect(patches[2]).toEqual({
      sctp_checksum: "12345678",
      sctp_checksum_override: false,
      sctp_payload_protocol_id_mode: "Fixed"
    });

    expect(runSctpCountChange("tsn", 64, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ sctp_tsn_count: 64 });

    expect(runSctpStepChange("stream-id", 2, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ sctp_stream_id_step: 2 });

    expect(runSctpChecksumOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ sctp_checksum_override: true });

    expect(runSctpChecksumChange("DEADBEEF", stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ sctp_checksum: "DEADBEEF" });
  });

  it("runs TCP core helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runTcpCoreNumberChange("sequence", 12345, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ tcp_sequence_number: 12345 });

    expect(runTcpCoreModeChange("acknowledge", "Increment", stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ tcp_ack_mode: "Increment" });

    expect(runTcpCoreCountChange("checksum", 64, stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ tcp_checksum_count: 64 });

    expect(runTcpCoreStepChange("urgent-pointer", 2, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ tcp_urgent_pointer_step: 2 });

    expect(runTcpChecksumOverrideChange(true, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ tcp_checksum_override: true });

    expect(runTcpChecksumChange("BEEF", stream({}), handlers)).toBe(true);
    expect(patches[5]).toEqual({ tcp_checksum: "BEEF" });

    expect(runTcpFlagChange("tcp_flag_syn", true, stream({}), handlers)).toBe(true);
    expect(patches[6]).toEqual({ tcp_flag_syn: true });
  });

  it("runs TCP option helpers through selected-stream patch callbacks", () => {
    const patches: Partial<ProfileWorkbenchStream>[] = [];
    const handlers = {
      applyPatch: (patch: Partial<ProfileWorkbenchStream>) => patches.push(patch)
    };

    expect(runTcpOptionSelectionChange("timestamp", true, stream({}), handlers)).toBe(true);
    expect(patches[0]).toEqual({ tcp_option_timestamp_enabled: true });

    expect(runTcpOptionNumberChange("mss", 1460, stream({}), handlers)).toBe(true);
    expect(patches[1]).toEqual({ tcp_option_mss: 1460 });

    expect(runTcpOptionModeChange("window-scale", "Increment", stream({}), handlers)).toBe(true);
    expect(patches[2]).toEqual({ tcp_option_window_scale_mode: "Increment" });

    expect(runTcpOptionCountChange("sack-left-edge", 16, stream({}), handlers)).toBe(true);
    expect(patches[3]).toEqual({ tcp_option_sack_left_edge_count: 16 });

    expect(runTcpOptionStepChange("timestamp-echo", 4, stream({}), handlers)).toBe(true);
    expect(patches[4]).toEqual({ tcp_option_timestamp_echo_step: 4 });
  });

  it("creates selected-stream actions for common workspace controls", () => {
    expect(streamModeAction("burst")).toEqual({ kind: "stream-mode", mode: "burst" });
    expect(frameLengthTypeAction("Random")).toEqual({
      frameLengthType: "Random",
      kind: "frame-length-type"
    });
    expect(packetTypeAction("Ethernet/IPv6/TCP")).toEqual({
      kind: "packet-type",
      packetType: "Ethernet/IPv6/TCP"
    });
    expect(icmpTypeAction(8)).toEqual({ icmpType: 8, kind: "icmp-type" });
    expect(vxlanInnerIpVersionAction("IPv6")).toEqual({
      kind: "vxlan-inner-ip-version",
      version: "IPv6"
    });
    expect(gtpuInnerIpVersionAction("IPv6")).toEqual({
      kind: "gtpu-inner-ip-version",
      version: "IPv6"
    });
    expect(greInnerIpVersionAction("IPv6")).toEqual({
      kind: "gre-inner-ip-version",
      version: "IPv6"
    });
  });

  it("creates selected-stream actions for ICMP echo controls", () => {
    expect(icmpTypeModeAction("Increment")).toEqual({
      kind: "icmp-type-mode",
      mode: "Increment"
    });
    expect(icmpTypeCountAction(16)).toEqual({
      count: 16,
      kind: "icmp-type-count"
    });
    expect(icmpTypeStepAction(2)).toEqual({
      kind: "icmp-type-step",
      step: 2
    });
    expect(icmpCodeAction(3)).toEqual({
      code: 3,
      kind: "icmp-code"
    });
    expect(icmpCodeModeAction("Fixed")).toEqual({
      kind: "icmp-code-mode",
      mode: "Fixed"
    });
    expect(icmpCodeCountAction(17)).toEqual({
      count: 17,
      kind: "icmp-code-count"
    });
    expect(icmpCodeStepAction(3)).toEqual({
      kind: "icmp-code-step",
      step: 3
    });
    expect(icmpIdentifierAction(4096)).toEqual({
      identifier: 4096,
      kind: "icmp-identifier"
    });
    expect(icmpIdentifierModeAction("Random")).toEqual({
      kind: "icmp-identifier-mode",
      mode: "Random"
    });
    expect(icmpIdentifierCountAction(18)).toEqual({
      count: 18,
      kind: "icmp-identifier-count"
    });
    expect(icmpIdentifierStepAction(4)).toEqual({
      kind: "icmp-identifier-step",
      step: 4
    });
    expect(icmpSequenceAction(8192)).toEqual({
      kind: "icmp-sequence",
      sequence: 8192
    });
    expect(icmpSequenceModeAction("Increment")).toEqual({
      kind: "icmp-sequence-mode",
      mode: "Increment"
    });
    expect(icmpSequenceCountAction(19)).toEqual({
      count: 19,
      kind: "icmp-sequence-count"
    });
    expect(icmpSequenceStepAction(5)).toEqual({
      kind: "icmp-sequence-step",
      step: 5
    });
    expect(icmpChecksumOverrideAction(true)).toEqual({
      kind: "icmp-checksum-override",
      override: true
    });
    expect(icmpChecksumAction("b3e3")).toEqual({
      checksum: "b3e3",
      kind: "icmp-checksum"
    });
  });

  it("creates selected-stream actions for ICMPv6 control message fields", () => {
    expect(icmpv6RsSllaSelectionAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-rs-slla-selection"
    });
    expect(icmpv6RsSllaMacAction("00:11:22:33:44:55")).toEqual({
      kind: "icmpv6-rs-slla-mac",
      mac: "00:11:22:33:44:55"
    });
    expect(icmpv6RaCurrentHopLimitAction(64)).toEqual({
      hopLimit: 64,
      kind: "icmpv6-ra-current-hop-limit"
    });
    expect(icmpv6RaRouterLifetimeAction(1800)).toEqual({
      kind: "icmpv6-ra-router-lifetime",
      lifetime: 1800
    });
    expect(icmpv6RaReachableTimeAction(30000)).toEqual({
      kind: "icmpv6-ra-reachable-time",
      reachableTime: 30000
    });
    expect(icmpv6RaRetransTimerAction(1000)).toEqual({
      kind: "icmpv6-ra-retrans-timer",
      retransTimer: 1000
    });
    expect(icmpv6RaManagedFlagAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-ra-managed-flag"
    });
    expect(icmpv6RaOtherFlagAction(false)).toEqual({
      enabled: false,
      kind: "icmpv6-ra-other-flag"
    });
    expect(icmpv6RaSllaSelectionAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-ra-slla-selection"
    });
    expect(icmpv6RaSllaMacAction("00:aa:bb:cc:dd:ee")).toEqual({
      kind: "icmpv6-ra-slla-mac",
      mac: "00:aa:bb:cc:dd:ee"
    });
    expect(icmpv6RaPrefixSelectionAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-ra-prefix-selection"
    });
    expect(icmpv6RaPrefixAction("2001:db8:1::")).toEqual({
      kind: "icmpv6-ra-prefix",
      prefix: "2001:db8:1::"
    });
    expect(icmpv6RaPrefixLengthAction(64)).toEqual({
      kind: "icmpv6-ra-prefix-length",
      prefixLength: 64
    });
    expect(icmpv6RaPrefixOnLinkFlagAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-ra-prefix-on-link-flag"
    });
    expect(icmpv6RaPrefixAutonomousFlagAction(false)).toEqual({
      enabled: false,
      kind: "icmpv6-ra-prefix-autonomous-flag"
    });
    expect(icmpv6RaPrefixValidLifetimeAction(2592000)).toEqual({
      kind: "icmpv6-ra-prefix-valid-lifetime",
      lifetime: 2592000
    });
    expect(icmpv6RaPrefixPreferredLifetimeAction(604800)).toEqual({
      kind: "icmpv6-ra-prefix-preferred-lifetime",
      lifetime: 604800
    });
    expect(icmpv6NdTargetAction("2001:db8::1")).toEqual({
      kind: "icmpv6-nd-target",
      target: "2001:db8::1"
    });
    expect(icmpv6NdOptionSelectionAction(false)).toEqual({
      enabled: false,
      kind: "icmpv6-nd-option-selection"
    });
    expect(icmpv6NdOptionMacAction("00:11:22:33:44:66")).toEqual({
      kind: "icmpv6-nd-option-mac",
      mac: "00:11:22:33:44:66"
    });
    expect(icmpv6NdNaRouterFlagAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-nd-na-router-flag"
    });
    expect(icmpv6NdNaSolicitedFlagAction(true)).toEqual({
      enabled: true,
      kind: "icmpv6-nd-na-solicited-flag"
    });
    expect(icmpv6NdNaOverrideFlagAction(false)).toEqual({
      enabled: false,
      kind: "icmpv6-nd-na-override-flag"
    });
  });

  it("creates selected-stream actions for DNS controls", () => {
    expect(dnsSelectionAction(true)).toEqual({
      enabled: true,
      kind: "dns-selection"
    });
    expect(dnsAnswerSelectionAction(false)).toEqual({
      enabled: false,
      kind: "dns-answer-selection"
    });
    expect(dnsNumberAction("transaction-id", 4660)).toEqual({
      field: "transaction-id",
      kind: "dns-number",
      value: 4660
    });
    expect(dnsNumberAction("answer-ttl", 300)).toEqual({
      field: "answer-ttl",
      kind: "dns-number",
      value: 300
    });
    expect(dnsTextAction("query-name", "example.com")).toEqual({
      field: "query-name",
      kind: "dns-text",
      value: "example.com"
    });
    expect(dnsTextAction("answer-ipv4", "192.0.2.10")).toEqual({
      field: "answer-ipv4",
      kind: "dns-text",
      value: "192.0.2.10"
    });
    expect(dnsModeAction("flags", "Random")).toEqual({
      field: "flags",
      kind: "dns-mode",
      mode: "Random"
    });
    expect(dnsModeAction("answer-ipv4", "Increment Host")).toEqual({
      field: "answer-ipv4",
      kind: "dns-mode",
      mode: "Increment Host"
    });
    expect(dnsCountAction("query-type", 8)).toEqual({
      count: 8,
      field: "query-type",
      kind: "dns-count"
    });
    expect(dnsStepAction("answer-ipv4", 4)).toEqual({
      field: "answer-ipv4",
      kind: "dns-step",
      step: 4
    });
  });

  it("creates selected-stream actions for VXLAN inner L4 port fields", () => {
    expect(vxlanInnerL4SourcePortAction(32000)).toEqual({
      kind: "vxlan-inner-l4-src-port",
      port: 32000
    });
    expect(vxlanInnerL4SourcePortModeAction("Increment")).toEqual({
      kind: "vxlan-inner-l4-src-port-mode",
      mode: "Increment"
    });
    expect(vxlanInnerL4SourcePortCountAction(68)).toEqual({
      count: 68,
      kind: "vxlan-inner-l4-src-port-count"
    });
    expect(vxlanInnerL4SourcePortStepAction(6)).toEqual({
      kind: "vxlan-inner-l4-src-port-step",
      step: 6
    });
    expect(vxlanInnerL4DestinationPortAction(32100)).toEqual({
      kind: "vxlan-inner-l4-dst-port",
      port: 32100
    });
    expect(vxlanInnerL4DestinationPortModeAction("Random")).toEqual({
      kind: "vxlan-inner-l4-dst-port-mode",
      mode: "Random"
    });
    expect(vxlanInnerL4DestinationPortCountAction(69)).toEqual({
      count: 69,
      kind: "vxlan-inner-l4-dst-port-count"
    });
    expect(vxlanInnerL4DestinationPortStepAction(7)).toEqual({
      kind: "vxlan-inner-l4-dst-port-step",
      step: 7
    });
  });

  it("creates selected-stream actions for VXLAN VNI and inner TTL/Hop-Limit fields", () => {
    expect(vxlanVniAction(5000)).toEqual({ kind: "vxlan-vni", vni: 5000 });
    expect(vxlanVniModeAction("Increment")).toEqual({
      kind: "vxlan-vni-mode",
      mode: "Increment"
    });
    expect(vxlanVniCountAction(128)).toEqual({
      count: 128,
      kind: "vxlan-vni-count"
    });
    expect(vxlanVniStepAction(16)).toEqual({
      kind: "vxlan-vni-step",
      step: 16
    });
    expect(vxlanInnerIpv6HopLimitAction(48)).toEqual({
      hopLimit: 48,
      kind: "vxlan-inner-ipv6-hop-limit"
    });
    expect(vxlanInnerIpv6HopLimitModeAction("Increment")).toEqual({
      kind: "vxlan-inner-ipv6-hop-limit-mode",
      mode: "Increment"
    });
    expect(vxlanInnerIpv6HopLimitCountAction(12)).toEqual({
      count: 12,
      kind: "vxlan-inner-ipv6-hop-limit-count"
    });
    expect(vxlanInnerIpv6HopLimitStepAction(4)).toEqual({
      kind: "vxlan-inner-ipv6-hop-limit-step",
      step: 4
    });
    expect(vxlanInnerIpv4TtlAction(47)).toEqual({
      kind: "vxlan-inner-ipv4-ttl",
      ttl: 47
    });
    expect(vxlanInnerIpv4TtlModeAction("Decrement")).toEqual({
      kind: "vxlan-inner-ipv4-ttl-mode",
      mode: "Decrement"
    });
    expect(vxlanInnerIpv4TtlCountAction(10)).toEqual({
      count: 10,
      kind: "vxlan-inner-ipv4-ttl-count"
    });
    expect(vxlanInnerIpv4TtlStepAction(5)).toEqual({
      kind: "vxlan-inner-ipv4-ttl-step",
      step: 5
    });
  });

  it("creates selected-stream actions for VXLAN inner address fields", () => {
    expect(vxlanInnerEtherDestinationAction("00:11:22:33:44:55")).toEqual({
      address: "00:11:22:33:44:55",
      kind: "vxlan-inner-ether-dst"
    });
    expect(vxlanInnerEtherSourceAction("66:77:88:99:aa:bb")).toEqual({
      address: "66:77:88:99:aa:bb",
      kind: "vxlan-inner-ether-src"
    });
    expect(vxlanInnerIpv6SourceAction("2001:db8::1")).toEqual({
      address: "2001:db8::1",
      kind: "vxlan-inner-ipv6-src"
    });
    expect(vxlanInnerIpv6SourceModeAction("Increment Host")).toEqual({
      kind: "vxlan-inner-ipv6-src-mode",
      mode: "Increment Host"
    });
    expect(vxlanInnerIpv6SourceCountAction(64)).toEqual({
      count: 64,
      kind: "vxlan-inner-ipv6-src-count"
    });
    expect(vxlanInnerIpv6SourceStepAction(2)).toEqual({
      kind: "vxlan-inner-ipv6-src-step",
      step: 2
    });
    expect(vxlanInnerIpv6DestinationAction("2001:db8::2")).toEqual({
      address: "2001:db8::2",
      kind: "vxlan-inner-ipv6-dst"
    });
    expect(vxlanInnerIpv6DestinationModeAction("Random Host")).toEqual({
      kind: "vxlan-inner-ipv6-dst-mode",
      mode: "Random Host"
    });
    expect(vxlanInnerIpv6DestinationCountAction(65)).toEqual({
      count: 65,
      kind: "vxlan-inner-ipv6-dst-count"
    });
    expect(vxlanInnerIpv6DestinationStepAction(3)).toEqual({
      kind: "vxlan-inner-ipv6-dst-step",
      step: 3
    });
    expect(vxlanInnerIpv4SourceAction("10.0.0.1")).toEqual({
      address: "10.0.0.1",
      kind: "vxlan-inner-ipv4-src"
    });
    expect(vxlanInnerIpv4SourceModeAction("Increment Host")).toEqual({
      kind: "vxlan-inner-ipv4-src-mode",
      mode: "Increment Host"
    });
    expect(vxlanInnerIpv4SourceCountAction(32)).toEqual({
      count: 32,
      kind: "vxlan-inner-ipv4-src-count"
    });
    expect(vxlanInnerIpv4SourceStepAction(4)).toEqual({
      kind: "vxlan-inner-ipv4-src-step",
      step: 4
    });
    expect(vxlanInnerIpv4DestinationAction("10.0.0.2")).toEqual({
      address: "10.0.0.2",
      kind: "vxlan-inner-ipv4-dst"
    });
    expect(vxlanInnerIpv4DestinationModeAction("Random Host")).toEqual({
      kind: "vxlan-inner-ipv4-dst-mode",
      mode: "Random Host"
    });
    expect(vxlanInnerIpv4DestinationCountAction(33)).toEqual({
      count: 33,
      kind: "vxlan-inner-ipv4-dst-count"
    });
    expect(vxlanInnerIpv4DestinationStepAction(5)).toEqual({
      kind: "vxlan-inner-ipv4-dst-step",
      step: 5
    });
  });

  it("creates selected-stream actions for GTP-U top fields", () => {
    expect(gtpuMessageTypeAction(255)).toEqual({
      kind: "gtpu-message-type",
      messageType: 255
    });
    expect(gtpuTeidAction(12345)).toEqual({
      kind: "gtpu-teid",
      teid: 12345
    });
    expect(gtpuTeidModeAction("Increment")).toEqual({
      kind: "gtpu-teid-mode",
      mode: "Increment"
    });
    expect(gtpuTeidCountAction(70)).toEqual({
      count: 70,
      kind: "gtpu-teid-count"
    });
    expect(gtpuTeidStepAction(8)).toEqual({
      kind: "gtpu-teid-step",
      step: 8
    });
    expect(gtpuSequenceSelectionAction(true)).toEqual({
      enabled: true,
      kind: "gtpu-sequence-selection"
    });
    expect(gtpuSequenceAction(4096)).toEqual({
      kind: "gtpu-sequence",
      sequence: 4096
    });
    expect(gtpuSequenceModeAction("Random")).toEqual({
      kind: "gtpu-sequence-mode",
      mode: "Random"
    });
    expect(gtpuSequenceCountAction(71)).toEqual({
      count: 71,
      kind: "gtpu-sequence-count"
    });
    expect(gtpuSequenceStepAction(9)).toEqual({
      kind: "gtpu-sequence-step",
      step: 9
    });
    expect(gtpuNpduSelectionAction(true)).toEqual({
      enabled: true,
      kind: "gtpu-npdu-selection"
    });
    expect(gtpuNpduAction(11)).toEqual({
      kind: "gtpu-npdu",
      npdu: 11
    });
    expect(gtpuNpduModeAction("Decrement")).toEqual({
      kind: "gtpu-npdu-mode",
      mode: "Decrement"
    });
    expect(gtpuNpduCountAction(72)).toEqual({
      count: 72,
      kind: "gtpu-npdu-count"
    });
    expect(gtpuNpduStepAction(10)).toEqual({
      kind: "gtpu-npdu-step",
      step: 10
    });
    expect(gtpuExtensionSelectionAction(true)).toEqual({
      enabled: true,
      kind: "gtpu-extension-selection"
    });
    expect(gtpuExtensionUdpPortAction(2152)).toEqual({
      kind: "gtpu-extension-udp-port",
      port: 2152
    });
    expect(gtpuExtensionUdpPortModeAction("Increment")).toEqual({
      kind: "gtpu-extension-udp-port-mode",
      mode: "Increment"
    });
    expect(gtpuExtensionUdpPortCountAction(73)).toEqual({
      count: 73,
      kind: "gtpu-extension-udp-port-count"
    });
    expect(gtpuExtensionUdpPortStepAction(11)).toEqual({
      kind: "gtpu-extension-udp-port-step",
      step: 11
    });
  });

  it("creates selected-stream actions for GTP-U inner TTL/Hop-Limit fields", () => {
    expect(gtpuInnerIpv4TtlAction(64)).toEqual({
      kind: "gtpu-inner-ipv4-ttl",
      ttl: 64
    });
    expect(gtpuInnerIpv4TtlModeAction("Increment")).toEqual({
      kind: "gtpu-inner-ipv4-ttl-mode",
      mode: "Increment"
    });
    expect(gtpuInnerIpv4TtlCountAction(74)).toEqual({
      count: 74,
      kind: "gtpu-inner-ipv4-ttl-count"
    });
    expect(gtpuInnerIpv4TtlStepAction(12)).toEqual({
      kind: "gtpu-inner-ipv4-ttl-step",
      step: 12
    });
    expect(gtpuInnerIpv6HopLimitAction(63)).toEqual({
      hopLimit: 63,
      kind: "gtpu-inner-ipv6-hop-limit"
    });
    expect(gtpuInnerIpv6HopLimitModeAction("Random")).toEqual({
      kind: "gtpu-inner-ipv6-hop-limit-mode",
      mode: "Random"
    });
    expect(gtpuInnerIpv6HopLimitCountAction(75)).toEqual({
      count: 75,
      kind: "gtpu-inner-ipv6-hop-limit-count"
    });
    expect(gtpuInnerIpv6HopLimitStepAction(13)).toEqual({
      kind: "gtpu-inner-ipv6-hop-limit-step",
      step: 13
    });
  });

  it("creates selected-stream actions for GTP-U inner address fields", () => {
    expect(gtpuInnerIpv4SourceAction("172.20.0.10")).toEqual({
      address: "172.20.0.10",
      kind: "gtpu-inner-ipv4-src"
    });
    expect(gtpuInnerIpv4SourceModeAction("Increment Host")).toEqual({
      kind: "gtpu-inner-ipv4-src-mode",
      mode: "Increment Host"
    });
    expect(gtpuInnerIpv4SourceCountAction(76)).toEqual({
      count: 76,
      kind: "gtpu-inner-ipv4-src-count"
    });
    expect(gtpuInnerIpv4SourceStepAction(14)).toEqual({
      kind: "gtpu-inner-ipv4-src-step",
      step: 14
    });
    expect(gtpuInnerIpv4DestinationAction("172.20.0.20")).toEqual({
      address: "172.20.0.20",
      kind: "gtpu-inner-ipv4-dst"
    });
    expect(gtpuInnerIpv4DestinationModeAction("Random Host")).toEqual({
      kind: "gtpu-inner-ipv4-dst-mode",
      mode: "Random Host"
    });
    expect(gtpuInnerIpv4DestinationCountAction(77)).toEqual({
      count: 77,
      kind: "gtpu-inner-ipv4-dst-count"
    });
    expect(gtpuInnerIpv4DestinationStepAction(15)).toEqual({
      kind: "gtpu-inner-ipv4-dst-step",
      step: 15
    });
    expect(gtpuInnerIpv6SourceAction("2001:db8:80::10")).toEqual({
      address: "2001:db8:80::10",
      kind: "gtpu-inner-ipv6-src"
    });
    expect(gtpuInnerIpv6SourceModeAction("Increment Host")).toEqual({
      kind: "gtpu-inner-ipv6-src-mode",
      mode: "Increment Host"
    });
    expect(gtpuInnerIpv6SourceCountAction(78)).toEqual({
      count: 78,
      kind: "gtpu-inner-ipv6-src-count"
    });
    expect(gtpuInnerIpv6SourceStepAction(16)).toEqual({
      kind: "gtpu-inner-ipv6-src-step",
      step: 16
    });
    expect(gtpuInnerIpv6DestinationAction("2001:db8:80::20")).toEqual({
      address: "2001:db8:80::20",
      kind: "gtpu-inner-ipv6-dst"
    });
    expect(gtpuInnerIpv6DestinationModeAction("Decrement Host")).toEqual({
      kind: "gtpu-inner-ipv6-dst-mode",
      mode: "Decrement Host"
    });
    expect(gtpuInnerIpv6DestinationCountAction(79)).toEqual({
      count: 79,
      kind: "gtpu-inner-ipv6-dst-count"
    });
    expect(gtpuInnerIpv6DestinationStepAction(17)).toEqual({
      kind: "gtpu-inner-ipv6-dst-step",
      step: 17
    });
  });

  it("creates selected-stream actions for GTP-U inner L4 port fields", () => {
    expect(gtpuInnerL4SourcePortAction(1025)).toEqual({
      kind: "gtpu-inner-l4-src-port",
      port: 1025
    });
    expect(gtpuInnerL4SourcePortModeAction("Increment")).toEqual({
      kind: "gtpu-inner-l4-src-port-mode",
      mode: "Increment"
    });
    expect(gtpuInnerL4SourcePortCountAction(80)).toEqual({
      count: 80,
      kind: "gtpu-inner-l4-src-port-count"
    });
    expect(gtpuInnerL4SourcePortStepAction(18)).toEqual({
      kind: "gtpu-inner-l4-src-port-step",
      step: 18
    });
    expect(gtpuInnerL4DestinationPortAction(2048)).toEqual({
      kind: "gtpu-inner-l4-dst-port",
      port: 2048
    });
    expect(gtpuInnerL4DestinationPortModeAction("Random")).toEqual({
      kind: "gtpu-inner-l4-dst-port-mode",
      mode: "Random"
    });
    expect(gtpuInnerL4DestinationPortCountAction(81)).toEqual({
      count: 81,
      kind: "gtpu-inner-l4-dst-port-count"
    });
    expect(gtpuInnerL4DestinationPortStepAction(19)).toEqual({
      kind: "gtpu-inner-l4-dst-port-step",
      step: 19
    });
  });

  it("creates selected-stream actions for stream properties controls", () => {
    expect(streamEnabledAction(true)).toEqual({ enabled: true, kind: "stream-enabled" });
    expect(selfStartAction(false)).toEqual({ kind: "self-start", selfStart: false });
    expect(totalPacketsAction(10)).toEqual({ kind: "total-packets", totalPackets: 10 });
    expect(burstCountAction(3)).toEqual({ count: 3, kind: "burst-count" });
    expect(packetsPerBurstAction(4)).toEqual({ kind: "packets-per-burst", packetsPerBurst: 4 });
    expect(rateTypeAction("pps")).toEqual({ kind: "rate-type", rateType: "pps" });
    expect(rateValueAction(5000)).toEqual({ kind: "rate-value", rateValue: 5000 });
    expect(afterStreamStopAction()).toEqual({ kind: "after-stream-stop" });
    expect(afterStreamGotoAction()).toEqual({ kind: "after-stream-goto" });
    expect(nextStreamAction(7)).toEqual({ kind: "next-stream", nextStreamId: 7 });
    expect(loopActionCountEnabledAction(true)).toEqual({
      enabled: true,
      kind: "loop-action-count-enabled"
    });
    expect(loopActionCountAction(2)).toEqual({ actionCount: 2, kind: "loop-action-count" });
    expect(isgAction(0.1)).toEqual({ isg: 0.1, kind: "isg" });
    expect(ibgAction(0.2)).toEqual({ ibg: 0.2, kind: "ibg" });
    expect(flowStatsEnabledAction(true)).toEqual({ enabled: true, kind: "flow-stats-enabled" });
    expect(pgIdAction(12)).toEqual({ kind: "pg-id", pgId: 12 });
    expect(latencyEnabledAction(false)).toEqual({ enabled: false, kind: "latency-enabled" });
    expect(streamNameAction("stream-2")).toEqual({ kind: "stream-name", name: "stream-2" });
    expect(packetFrameLengthAction(128)).toEqual({
      frameLength: 128,
      kind: "packet-frame-length"
    });
  });

  it("creates selected-stream actions for protocol selection controls", () => {
    expect(packetFrameLengthAction(256)).toEqual({
      frameLength: 256,
      kind: "packet-frame-length"
    });
    expect(frameLengthMinAction(64)).toEqual({
      frameLengthMin: 64,
      kind: "frame-length-min"
    });
    expect(frameLengthMaxAction(1518)).toEqual({
      frameLengthMax: 1518,
      kind: "frame-length-max"
    });
    expect(vlanSelectionAction(true)).toEqual({ enabled: true, kind: "vlan-selection" });
    expect(mplsSelectionAction(false)).toEqual({ enabled: false, kind: "mpls-selection" });
    expect(tunnelSelectionAction("vxlan")).toEqual({ kind: "tunnel-selection", tunnel: "vxlan" });
    expect(l3SelectionAction("IPv6")).toEqual({ kind: "l3-selection", selection: "IPv6" });
    expect(l4SelectionAction("TCP")).toEqual({ kind: "l4-selection", selection: "TCP" });
    expect(payloadSelectionAction(true)).toEqual({ enabled: true, kind: "payload-selection" });
  });

  it("creates selected-stream actions for payload and advanced controls", () => {
    expect(payloadTypeAction("Fixed Word")).toEqual({
      kind: "payload-type",
      payloadType: "Fixed Word"
    });
    expect(payloadPatternAction("AABBCCDD")).toEqual({
      kind: "payload-pattern",
      pattern: "AABBCCDD"
    });
    expect(payloadPatternImportAction("ccdd")).toEqual({
      kind: "payload-pattern-import",
      pattern: "ccdd"
    });
    expect(advancedCacheSizeTypeAction("Enable")).toEqual({
      cacheSizeType: "Enable",
      kind: "advanced-cache-size-type"
    });
    expect(advancedCacheValueAction(2048)).toEqual({
      cacheValue: 2048,
      kind: "advanced-cache-value"
    });
  });

  it("creates selected-stream actions for media access controls", () => {
    expect(etherTypeOverrideAction(true)).toEqual({
      kind: "ether-type-override",
      override: true
    });
    expect(etherTypeAction("88b5")).toEqual({
      etherType: "88b5",
      kind: "ether-type"
    });
    expect(etherDestinationAction("00:11:22:33:44:55")).toEqual({
      address: "00:11:22:33:44:55",
      kind: "ether-dst"
    });
    expect(etherDestinationModeAction("Increment")).toEqual({
      kind: "ether-dst-mode",
      mode: "Increment"
    });
    expect(etherDestinationCountAction(16)).toEqual({
      count: 16,
      kind: "ether-dst-count"
    });
    expect(etherDestinationStepAction(2)).toEqual({
      kind: "ether-dst-step",
      step: 2
    });
    expect(etherSourceAction("66:77:88:99:aa:bb")).toEqual({
      address: "66:77:88:99:aa:bb",
      kind: "ether-src"
    });
    expect(etherSourceModeAction("Decrement")).toEqual({
      kind: "ether-src-mode",
      mode: "Decrement"
    });
    expect(etherSourceCountAction(32)).toEqual({
      count: 32,
      kind: "ether-src-count"
    });
    expect(etherSourceStepAction(3)).toEqual({
      kind: "ether-src-step",
      step: 3
    });
  });

  it("creates selected-stream actions for ARP controls", () => {
    expect(arpHardwareTypeAction(1)).toEqual({
      kind: "arp-hardware-type",
      value: 1
    });
    expect(arpProtocolTypeAction("0800")).toEqual({
      kind: "arp-protocol-type",
      value: "0800"
    });
    expect(arpHardwareSizeAction(6)).toEqual({
      kind: "arp-hardware-size",
      value: 6
    });
    expect(arpProtocolSizeAction(4)).toEqual({
      kind: "arp-protocol-size",
      value: 4
    });
    expect(arpOperationAction(2)).toEqual({
      kind: "arp-operation",
      value: 2
    });
    expect(arpOperationModeAction("Increment")).toEqual({
      kind: "arp-operation-mode",
      mode: "Increment"
    });
    expect(arpOperationCountAction(8)).toEqual({
      count: 8,
      kind: "arp-operation-count"
    });
    expect(arpOperationStepAction(1)).toEqual({
      kind: "arp-operation-step",
      step: 1
    });
    expect(arpSenderMacAction("00:11:22:33:44:55")).toEqual({
      kind: "arp-sender-mac",
      value: "00:11:22:33:44:55"
    });
    expect(arpSenderMacModeAction("Increment")).toEqual({
      kind: "arp-sender-mac-mode",
      mode: "Increment"
    });
    expect(arpSenderMacCountAction(16)).toEqual({
      count: 16,
      kind: "arp-sender-mac-count"
    });
    expect(arpSenderMacStepAction(2)).toEqual({
      kind: "arp-sender-mac-step",
      step: 2
    });
    expect(arpSenderIpAction("10.0.0.1")).toEqual({
      kind: "arp-sender-ip",
      value: "10.0.0.1"
    });
    expect(arpSenderIpModeAction("Increment Host")).toEqual({
      kind: "arp-sender-ip-mode",
      mode: "Increment Host"
    });
    expect(arpSenderIpCountAction(32)).toEqual({
      count: 32,
      kind: "arp-sender-ip-count"
    });
    expect(arpSenderIpStepAction(3)).toEqual({
      kind: "arp-sender-ip-step",
      step: 3
    });
    expect(arpTargetMacAction("66:77:88:99:aa:bb")).toEqual({
      kind: "arp-target-mac",
      value: "66:77:88:99:aa:bb"
    });
    expect(arpTargetMacModeAction("Decrement")).toEqual({
      kind: "arp-target-mac-mode",
      mode: "Decrement"
    });
    expect(arpTargetMacCountAction(64)).toEqual({
      count: 64,
      kind: "arp-target-mac-count"
    });
    expect(arpTargetMacStepAction(4)).toEqual({
      kind: "arp-target-mac-step",
      step: 4
    });
    expect(arpTargetIpAction("10.0.0.2")).toEqual({
      kind: "arp-target-ip",
      value: "10.0.0.2"
    });
    expect(arpTargetIpModeAction("Random Host")).toEqual({
      kind: "arp-target-ip-mode",
      mode: "Random Host"
    });
    expect(arpTargetIpCountAction(128)).toEqual({
      count: 128,
      kind: "arp-target-ip-count"
    });
    expect(arpTargetIpStepAction(5)).toEqual({
      kind: "arp-target-ip-step",
      step: 5
    });
  });

  it("creates selected-stream actions for outer IP address controls", () => {
    expect(ipv4DestinationAction("192.0.2.1")).toEqual({
      address: "192.0.2.1",
      kind: "ipv4-dst"
    });
    expect(ipv4DestinationModeAction("Increment Host")).toEqual({
      kind: "ipv4-dst-mode",
      mode: "Increment Host"
    });
    expect(ipv4DestinationCountAction("1000")).toEqual({
      count: "1000",
      kind: "ipv4-dst-count"
    });
    expect(ipv4DestinationStepAction(2)).toEqual({
      kind: "ipv4-dst-step",
      step: 2
    });
    expect(ipv4SourceAction("198.51.100.1")).toEqual({
      address: "198.51.100.1",
      kind: "ipv4-src"
    });
    expect(ipv4SourceModeAction("Random Host")).toEqual({
      kind: "ipv4-src-mode",
      mode: "Random Host"
    });
    expect(ipv4SourceCountAction("2000")).toEqual({
      count: "2000",
      kind: "ipv4-src-count"
    });
    expect(ipv4SourceStepAction(3)).toEqual({
      kind: "ipv4-src-step",
      step: 3
    });
    expect(ipv6DestinationAction("2001:db8::1")).toEqual({
      address: "2001:db8::1",
      kind: "ipv6-dst"
    });
    expect(ipv6DestinationModeAction("Increment Host")).toEqual({
      kind: "ipv6-dst-mode",
      mode: "Increment Host"
    });
    expect(ipv6DestinationCountAction(2048)).toEqual({
      count: 2048,
      kind: "ipv6-dst-count"
    });
    expect(ipv6DestinationStepAction(4)).toEqual({
      kind: "ipv6-dst-step",
      step: 4
    });
    expect(ipv6SourceAction("2001:db8::2")).toEqual({
      address: "2001:db8::2",
      kind: "ipv6-src"
    });
    expect(ipv6SourceModeAction("Decrement Host")).toEqual({
      kind: "ipv6-src-mode",
      mode: "Decrement Host"
    });
    expect(ipv6SourceCountAction(4096)).toEqual({
      count: 4096,
      kind: "ipv6-src-count"
    });
    expect(ipv6SourceStepAction(5)).toEqual({
      kind: "ipv6-src-step",
      step: 5
    });
  });

  it("creates selected-stream actions for outer IPv4 scalar controls", () => {
    expect(ipv4DscpAction(10)).toEqual({
      dscp: 10,
      kind: "ipv4-dscp"
    });
    expect(ipv4DscpModeAction("Increment")).toEqual({
      kind: "ipv4-dscp-mode",
      mode: "Increment"
    });
    expect(ipv4DscpCountAction(32)).toEqual({
      count: 32,
      kind: "ipv4-dscp-count"
    });
    expect(ipv4DscpStepAction(4)).toEqual({
      kind: "ipv4-dscp-step",
      step: 4
    });
    expect(ipv4EcnAction(3)).toEqual({
      ecn: 3,
      kind: "ipv4-ecn"
    });
    expect(ipv4EcnModeAction("Random")).toEqual({
      kind: "ipv4-ecn-mode",
      mode: "Random"
    });
    expect(ipv4EcnCountAction(4)).toEqual({
      count: 4,
      kind: "ipv4-ecn-count"
    });
    expect(ipv4EcnStepAction(1)).toEqual({
      kind: "ipv4-ecn-step",
      step: 1
    });
    expect(ipv4IdentificationAction(4096)).toEqual({
      identification: 4096,
      kind: "ipv4-identification"
    });
    expect(ipv4IdentificationModeAction("Decrement")).toEqual({
      kind: "ipv4-identification-mode",
      mode: "Decrement"
    });
    expect(ipv4IdentificationCountAction(64)).toEqual({
      count: 64,
      kind: "ipv4-identification-count"
    });
    expect(ipv4IdentificationStepAction(8)).toEqual({
      kind: "ipv4-identification-step",
      step: 8
    });
    expect(ipv4DfFlagAction(true)).toEqual({
      enabled: true,
      kind: "ipv4-df-flag"
    });
    expect(ipv4MfFlagAction(false)).toEqual({
      enabled: false,
      kind: "ipv4-mf-flag"
    });
    expect(ipv4FragmentOffsetAction(512)).toEqual({
      fragmentOffset: 512,
      kind: "ipv4-fragment-offset"
    });
    expect(ipv4FragmentOffsetModeAction("Increment")).toEqual({
      kind: "ipv4-fragment-offset-mode",
      mode: "Increment"
    });
    expect(ipv4FragmentOffsetCountAction(128)).toEqual({
      count: 128,
      kind: "ipv4-fragment-offset-count"
    });
    expect(ipv4FragmentOffsetStepAction(16)).toEqual({
      kind: "ipv4-fragment-offset-step",
      step: 16
    });
    expect(ipv4TtlAction(63)).toEqual({
      kind: "ipv4-ttl",
      ttl: 63
    });
    expect(ipv4TtlModeAction("Random")).toEqual({
      kind: "ipv4-ttl-mode",
      mode: "Random"
    });
    expect(ipv4TtlCountAction(16)).toEqual({
      count: 16,
      kind: "ipv4-ttl-count"
    });
    expect(ipv4TtlStepAction(2)).toEqual({
      kind: "ipv4-ttl-step",
      step: 2
    });
    expect(ipv4ChecksumOverrideAction(true)).toEqual({
      kind: "ipv4-checksum-override",
      override: true
    });
    expect(ipv4ChecksumAction("b3e3")).toEqual({
      checksum: "b3e3",
      kind: "ipv4-checksum"
    });
  });

  it("creates selected-stream actions for outer IPv6 scalar controls", () => {
    expect(ipv6TrafficClassAction(128)).toEqual({
      kind: "ipv6-traffic-class",
      trafficClass: 128
    });
    expect(ipv6TrafficClassModeAction("Increment")).toEqual({
      kind: "ipv6-traffic-class-mode",
      mode: "Increment"
    });
    expect(ipv6TrafficClassCountAction(32)).toEqual({
      count: 32,
      kind: "ipv6-traffic-class-count"
    });
    expect(ipv6TrafficClassStepAction(4)).toEqual({
      kind: "ipv6-traffic-class-step",
      step: 4
    });
    expect(ipv6FlowLabelAction(12345)).toEqual({
      flowLabel: 12345,
      kind: "ipv6-flow-label"
    });
    expect(ipv6FlowLabelModeAction("Random")).toEqual({
      kind: "ipv6-flow-label-mode",
      mode: "Random"
    });
    expect(ipv6FlowLabelCountAction(64)).toEqual({
      count: 64,
      kind: "ipv6-flow-label-count"
    });
    expect(ipv6FlowLabelStepAction(8)).toEqual({
      kind: "ipv6-flow-label-step",
      step: 8
    });
    expect(ipv6HopLimitAction(63)).toEqual({
      hopLimit: 63,
      kind: "ipv6-hop-limit"
    });
    expect(ipv6HopLimitModeAction("Decrement")).toEqual({
      kind: "ipv6-hop-limit-mode",
      mode: "Decrement"
    });
    expect(ipv6HopLimitCountAction(128)).toEqual({
      count: 128,
      kind: "ipv6-hop-limit-count"
    });
    expect(ipv6HopLimitStepAction(16)).toEqual({
      kind: "ipv6-hop-limit-step",
      step: 16
    });
  });

  it("creates selected-stream actions for outer VLAN controls", () => {
    expect(vlanTpidOverrideAction(true)).toEqual({
      kind: "vlan-tpid-override",
      override: true
    });
    expect(vlanTpidAction("88a8")).toEqual({
      kind: "vlan-tpid",
      tpid: "88a8"
    });
    expect(vlanPriorityAction(5)).toEqual({
      kind: "vlan-priority",
      priority: 5
    });
    expect(vlanPriorityModeAction("Increment")).toEqual({
      kind: "vlan-priority-mode",
      mode: "Increment"
    });
    expect(vlanPriorityCountAction(4)).toEqual({
      count: 4,
      kind: "vlan-priority-count"
    });
    expect(vlanPriorityStepAction(2)).toEqual({
      kind: "vlan-priority-step",
      step: 2
    });
    expect(vlanCfiAction(1)).toEqual({
      cfi: 1,
      kind: "vlan-cfi"
    });
    expect(vlanIdAction(120)).toEqual({
      kind: "vlan-id",
      vlanId: 120
    });
    expect(vlanIdModeAction("Random")).toEqual({
      kind: "vlan-id-mode",
      mode: "Random"
    });
    expect(vlanIdCountAction(16)).toEqual({
      count: 16,
      kind: "vlan-id-count"
    });
    expect(vlanIdStepAction(10)).toEqual({
      kind: "vlan-id-step",
      step: 10
    });
  });

  it("creates selected-stream actions for QinQ inner VLAN controls", () => {
    expect(vlanInnerSelectionAction(true)).toEqual({
      enabled: true,
      kind: "vlan-inner-selection"
    });
    expect(vlanInnerTpidOverrideAction(true)).toEqual({
      kind: "vlan-inner-tpid-override",
      override: true
    });
    expect(vlanInnerTpidAction("88a8")).toEqual({
      kind: "vlan-inner-tpid",
      tpid: "88a8"
    });
    expect(vlanInnerPriorityAction(6)).toEqual({
      kind: "vlan-inner-priority",
      priority: 6
    });
    expect(vlanInnerPriorityModeAction("Increment")).toEqual({
      kind: "vlan-inner-priority-mode",
      mode: "Increment"
    });
    expect(vlanInnerPriorityCountAction(4)).toEqual({
      count: 4,
      kind: "vlan-inner-priority-count"
    });
    expect(vlanInnerPriorityStepAction(2)).toEqual({
      kind: "vlan-inner-priority-step",
      step: 2
    });
    expect(vlanInnerCfiAction(1)).toEqual({
      cfi: 1,
      kind: "vlan-inner-cfi"
    });
    expect(vlanInnerIdAction(220)).toEqual({
      kind: "vlan-inner-id",
      vlanId: 220
    });
    expect(vlanInnerIdModeAction("Random")).toEqual({
      kind: "vlan-inner-id-mode",
      mode: "Random"
    });
    expect(vlanInnerIdCountAction(16)).toEqual({
      count: 16,
      kind: "vlan-inner-id-count"
    });
    expect(vlanInnerIdStepAction(10)).toEqual({
      kind: "vlan-inner-id-step",
      step: 10
    });
  });

  it("creates selected-stream actions for primary MPLS controls", () => {
    expect(mplsLabelAction(104857)).toEqual({
      kind: "mpls-label",
      label: 104857
    });
    expect(mplsLabelModeAction("Increment")).toEqual({
      kind: "mpls-label-mode",
      mode: "Increment"
    });
    expect(mplsLabelCountAction(32)).toEqual({
      count: 32,
      kind: "mpls-label-count"
    });
    expect(mplsLabelStepAction(4)).toEqual({
      kind: "mpls-label-step",
      step: 4
    });
    expect(mplsTrafficClassAction(5)).toEqual({
      kind: "mpls-traffic-class",
      trafficClass: 5
    });
    expect(mplsTrafficClassModeAction("Random")).toEqual({
      kind: "mpls-traffic-class-mode",
      mode: "Random"
    });
    expect(mplsTrafficClassCountAction(6)).toEqual({
      count: 6,
      kind: "mpls-traffic-class-count"
    });
    expect(mplsTrafficClassStepAction(2)).toEqual({
      kind: "mpls-traffic-class-step",
      step: 2
    });
    expect(mplsTtlAction(63)).toEqual({
      kind: "mpls-ttl",
      ttl: 63
    });
    expect(mplsTtlModeAction("Decrement")).toEqual({
      kind: "mpls-ttl-mode",
      mode: "Decrement"
    });
    expect(mplsTtlCountAction(8)).toEqual({
      count: 8,
      kind: "mpls-ttl-count"
    });
    expect(mplsTtlStepAction(3)).toEqual({
      kind: "mpls-ttl-step",
      step: 3
    });
  });

  it("creates selected-stream actions for second MPLS controls", () => {
    expect(mplsSecondLabelSelectionAction(true)).toEqual({
      enabled: true,
      kind: "mpls-second-label-selection"
    });
    expect(mplsSecondLabelAction(200)).toEqual({
      kind: "mpls-second-label",
      label: 200
    });
    expect(mplsSecondLabelModeAction("Increment")).toEqual({
      kind: "mpls-second-label-mode",
      mode: "Increment"
    });
    expect(mplsSecondLabelCountAction(32)).toEqual({
      count: 32,
      kind: "mpls-second-label-count"
    });
    expect(mplsSecondLabelStepAction(4)).toEqual({
      kind: "mpls-second-label-step",
      step: 4
    });
    expect(mplsSecondTrafficClassAction(5)).toEqual({
      kind: "mpls-second-traffic-class",
      trafficClass: 5
    });
    expect(mplsSecondTrafficClassModeAction("Random")).toEqual({
      kind: "mpls-second-traffic-class-mode",
      mode: "Random"
    });
    expect(mplsSecondTrafficClassCountAction(6)).toEqual({
      count: 6,
      kind: "mpls-second-traffic-class-count"
    });
    expect(mplsSecondTrafficClassStepAction(2)).toEqual({
      kind: "mpls-second-traffic-class-step",
      step: 2
    });
    expect(mplsSecondTtlAction(62)).toEqual({
      kind: "mpls-second-ttl",
      ttl: 62
    });
    expect(mplsSecondTtlModeAction("Decrement")).toEqual({
      kind: "mpls-second-ttl-mode",
      mode: "Decrement"
    });
    expect(mplsSecondTtlCountAction(9)).toEqual({
      count: 9,
      kind: "mpls-second-ttl-count"
    });
    expect(mplsSecondTtlStepAction(3)).toEqual({
      kind: "mpls-second-ttl-step",
      step: 3
    });
  });

  it("creates selected-stream actions for third MPLS controls", () => {
    expect(mplsThirdLabelSelectionAction(true)).toEqual({
      enabled: true,
      kind: "mpls-third-label-selection"
    });
    expect(mplsThirdLabelAction(300)).toEqual({
      kind: "mpls-third-label",
      label: 300
    });
    expect(mplsThirdLabelModeAction("Increment")).toEqual({
      kind: "mpls-third-label-mode",
      mode: "Increment"
    });
    expect(mplsThirdLabelCountAction(42)).toEqual({
      count: 42,
      kind: "mpls-third-label-count"
    });
    expect(mplsThirdLabelStepAction(5)).toEqual({
      kind: "mpls-third-label-step",
      step: 5
    });
    expect(mplsThirdTrafficClassAction(7)).toEqual({
      kind: "mpls-third-traffic-class",
      trafficClass: 7
    });
    expect(mplsThirdTrafficClassModeAction("Random")).toEqual({
      kind: "mpls-third-traffic-class-mode",
      mode: "Random"
    });
    expect(mplsThirdTrafficClassCountAction(7)).toEqual({
      count: 7,
      kind: "mpls-third-traffic-class-count"
    });
    expect(mplsThirdTrafficClassStepAction(3)).toEqual({
      kind: "mpls-third-traffic-class-step",
      step: 3
    });
    expect(mplsThirdTtlAction(61)).toEqual({
      kind: "mpls-third-ttl",
      ttl: 61
    });
    expect(mplsThirdTtlModeAction("Decrement")).toEqual({
      kind: "mpls-third-ttl-mode",
      mode: "Decrement"
    });
    expect(mplsThirdTtlCountAction(11)).toEqual({
      count: 11,
      kind: "mpls-third-ttl-count"
    });
    expect(mplsThirdTtlStepAction(4)).toEqual({
      kind: "mpls-third-ttl-step",
      step: 4
    });
  });

  it("creates selected-stream actions for outer L4 port controls", () => {
    expect(l4SourcePortOverrideSelectionAction(true)).toEqual({
      enabled: true,
      kind: "l4-src-port-override-selection"
    });
    expect(l4SourcePortAction(1025)).toEqual({
      kind: "l4-src-port",
      port: 1025
    });
    expect(l4SourcePortModeAction("Increment")).toEqual({
      kind: "l4-src-port-mode",
      mode: "Increment"
    });
    expect(l4SourcePortCountAction(64)).toEqual({
      count: 64,
      kind: "l4-src-port-count"
    });
    expect(l4SourcePortStepAction(4)).toEqual({
      kind: "l4-src-port-step",
      step: 4
    });
    expect(l4DestinationPortOverrideSelectionAction(false)).toEqual({
      enabled: false,
      kind: "l4-dst-port-override-selection"
    });
    expect(l4DestinationPortAction(4789)).toEqual({
      kind: "l4-dst-port",
      port: 4789
    });
    expect(l4DestinationPortModeAction("Random")).toEqual({
      kind: "l4-dst-port-mode",
      mode: "Random"
    });
    expect(l4DestinationPortCountAction(128)).toEqual({
      count: 128,
      kind: "l4-dst-port-count"
    });
    expect(l4DestinationPortStepAction(8)).toEqual({
      kind: "l4-dst-port-step",
      step: 8
    });
  });

  it("creates selected-stream actions for UDP length and checksum controls", () => {
    expect(udpLengthOverrideSelectionAction(true)).toEqual({
      enabled: true,
      kind: "udp-length-override-selection"
    });
    expect(udpLengthAction(128)).toEqual({
      kind: "udp-length",
      length: 128
    });
    expect(udpLengthModeAction("Increment")).toEqual({
      kind: "udp-length-mode",
      mode: "Increment"
    });
    expect(udpLengthCountAction(32)).toEqual({
      count: 32,
      kind: "udp-length-count"
    });
    expect(udpLengthStepAction(8)).toEqual({
      kind: "udp-length-step",
      step: 8
    });
    expect(udpChecksumOverrideAction(true)).toEqual({
      kind: "udp-checksum-override",
      override: true
    });
    expect(udpChecksumAction("b3e3")).toEqual({
      checksum: "b3e3",
      kind: "udp-checksum"
    });
    expect(udpChecksumModeAction("Random")).toEqual({
      kind: "udp-checksum-mode",
      mode: "Random"
    });
    expect(udpChecksumCountAction(64)).toEqual({
      count: 64,
      kind: "udp-checksum-count"
    });
    expect(udpChecksumStepAction(4)).toEqual({
      kind: "udp-checksum-step",
      step: 4
    });
  });

  it("derives selected-stream patch actions for common protocol controls", () => {
    expect(selectedStreamPatch({
      kind: "stream-mode",
      mode: "multi_burst"
    }, stream({
      count: 1
    }))).toMatchObject({
      count: 2,
      mode: "multi_burst"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-selection"
    }, stream({
      frame_length: 64,
      frame_length_max: 64,
      gtpu_inner_ip_version: "IPv6"
    }))).toMatchObject({
      frame_length: 96,
      gtpu_enabled: true,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    });
  });

  it("derives selected-stream patch actions for protocol selection controls", () => {
    expect(selectedStreamPatch({
      kind: "ether-type-override",
      override: true
    }, null)).toEqual({
      ether_type_override: true
    });

    expect(selectedStreamPatch({
      etherType: "88b5",
      kind: "ether-type"
    }, null)).toEqual({
      ether_type: "88b5"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "vlan-selection"
    }, null)).toEqual(vlanSelectionPatch(false));

    expect(selectedStreamPatch({
      enabled: true,
      kind: "mpls-selection"
    }, null)).toEqual(mplsSelectionPatch(true));

    expect(selectedStreamPatch({
      enabled: true,
      kind: "payload-selection"
    }, null)).toEqual(payloadSelectionPatch(true));

    expect(selectedStreamPatch({
      kind: "payload-type",
      payloadType: "Fixed Word"
    }, null)).toEqual({
      payload_type: "Fixed Word"
    });

    expect(selectedStreamPatch({
      kind: "payload-pattern",
      pattern: "AABBCCDD"
    }, null)).toEqual({
      payload_pattern: "AABBCCDD"
    });

    expect(selectedStreamPatch({
      cacheSizeType: "Enable",
      kind: "advanced-cache-size-type"
    }, null)).toEqual({
      advanced_cache_size_type: "Enable"
    });

    expect(selectedStreamPatch({
      cacheValue: 2048,
      kind: "advanced-cache-value"
    }, null)).toEqual({
      advanced_cache_value: 2048
    });

    expect(selectedStreamPatch({
      kind: "tunnel-selection",
      tunnel: "none"
    }, null)).toEqual(tunnelDisabledPatch());

    expect(selectedStreamPatch({
      kind: "tunnel-selection",
      tunnel: "vxlan"
    }, stream({
      frame_length: 64,
      frame_length_max: 64,
      gtpu_enabled: true,
      vxlan_inner_ip_version: "IPv6"
    }))).toMatchObject({
      frame_length: 128,
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true,
      vxlan_inner_ip_version: "IPv6"
    });

    expect(selectedStreamPatch({
      kind: "l3-selection",
      selection: "IPv6"
    }, stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/TCP",
      vxlan_enabled: false
    }))).toMatchObject({
      packet_type: "Ethernet/IPv6/TCP"
    });

    expect(selectedStreamPatch({
      kind: "l4-selection",
      selection: "ICMP"
    }, stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv6/TCP",
      vxlan_enabled: false
    }))).toMatchObject({
      icmp_type: 128,
      packet_type: "Ethernet/IPv6/ICMPv6"
    });

    expect(selectedStreamPatch({
      kind: "l3-selection",
      selection: "IPv4"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      kind: "l4-selection",
      selection: "UDP"
    }, null)).toBeNull();
  });

  it("derives selected-stream patch actions for outer Ethernet addresses", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ address: "00:11:22:33:44:55", kind: "ether-dst" }, { ether_dst: "00:11:22:33:44:55" }],
      [{ kind: "ether-dst-mode", mode: "Increment" }, { ether_dst_mode: "Increment" }],
      [{ count: 16, kind: "ether-dst-count" }, { ether_dst_count: 16 }],
      [{ kind: "ether-dst-step", step: 2 }, { ether_dst_step: 2 }],
      [{ address: "66:77:88:99:aa:bb", kind: "ether-src" }, { ether_src: "66:77:88:99:aa:bb" }],
      [{ kind: "ether-src-mode", mode: "Decrement" }, { ether_src_mode: "Decrement" }],
      [{ count: 32, kind: "ether-src-count" }, { ether_src_count: 32 }],
      [{ kind: "ether-src-step", step: 3 }, { ether_src_step: 3 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for outer ARP fields", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "arp-hardware-type", value: 1 }, { arp_hardware_type: 1 }],
      [{ kind: "arp-protocol-type", value: "0800" }, { arp_protocol_type: "0800" }],
      [{ kind: "arp-hardware-size", value: 6 }, { arp_hardware_size: 6 }],
      [{ kind: "arp-protocol-size", value: 4 }, { arp_protocol_size: 4 }],
      [{ kind: "arp-operation", value: 2 }, { arp_operation: 2 }],
      [{ kind: "arp-operation-mode", mode: "Random" }, { arp_operation_mode: "Random" }],
      [{ count: 8, kind: "arp-operation-count" }, { arp_operation_count: 8 }],
      [{ kind: "arp-operation-step", step: 1 }, { arp_operation_step: 1 }],
      [{ kind: "arp-sender-mac", value: "00:11:22:33:44:55" }, { arp_sender_mac: "00:11:22:33:44:55" }],
      [{ kind: "arp-sender-mac-mode", mode: "Increment" }, { arp_sender_mac_mode: "Increment" }],
      [{ count: 16, kind: "arp-sender-mac-count" }, { arp_sender_mac_count: 16 }],
      [{ kind: "arp-sender-mac-step", step: 2 }, { arp_sender_mac_step: 2 }],
      [{ kind: "arp-sender-ip", value: "10.0.0.1" }, { arp_sender_ip: "10.0.0.1" }],
      [{ kind: "arp-sender-ip-mode", mode: "Increment Host" }, { arp_sender_ip_mode: "Increment Host" }],
      [{ count: 32, kind: "arp-sender-ip-count" }, { arp_sender_ip_count: 32 }],
      [{ kind: "arp-sender-ip-step", step: 3 }, { arp_sender_ip_step: 3 }],
      [{ kind: "arp-target-mac", value: "66:77:88:99:aa:bb" }, { arp_target_mac: "66:77:88:99:aa:bb" }],
      [{ kind: "arp-target-mac-mode", mode: "Decrement" }, { arp_target_mac_mode: "Decrement" }],
      [{ count: 64, kind: "arp-target-mac-count" }, { arp_target_mac_count: 64 }],
      [{ kind: "arp-target-mac-step", step: 4 }, { arp_target_mac_step: 4 }],
      [{ kind: "arp-target-ip", value: "10.0.0.2" }, { arp_target_ip: "10.0.0.2" }],
      [{ kind: "arp-target-ip-mode", mode: "Random Host" }, { arp_target_ip_mode: "Random Host" }],
      [{ count: 128, kind: "arp-target-ip-count" }, { arp_target_ip_count: 128 }],
      [{ kind: "arp-target-ip-step", step: 5 }, { arp_target_ip_step: 5 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for outer IPv4 addresses", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ address: "192.0.2.1", kind: "ipv4-dst" }, { ipv4_dst: "192.0.2.1" }],
      [{ kind: "ipv4-dst-mode", mode: "Increment Host" }, { ipv4_dst_mode: "Increment Host" }],
      [{ count: "1000", kind: "ipv4-dst-count" }, { ipv4_dst_count: "1000" }],
      [{ kind: "ipv4-dst-step", step: 2 }, { ipv4_dst_step: 2 }],
      [{ address: "198.51.100.1", kind: "ipv4-src" }, { ipv4_src: "198.51.100.1" }],
      [{ kind: "ipv4-src-mode", mode: "Random Host" }, { ipv4_src_mode: "Random Host" }],
      [{ count: 1024, kind: "ipv4-src-count" }, { ipv4_src_count: 1024 }],
      [{ kind: "ipv4-src-step", step: 3 }, { ipv4_src_step: 3 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for outer IPv4 scalar fields", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ dscp: 10, kind: "ipv4-dscp" }, { ipv4_dscp: 10 }],
      [{ kind: "ipv4-dscp-mode", mode: "Increment" }, { ipv4_dscp_mode: "Increment" }],
      [{ count: 32, kind: "ipv4-dscp-count" }, { ipv4_dscp_count: 32 }],
      [{ kind: "ipv4-dscp-step", step: 4 }, { ipv4_dscp_step: 4 }],
      [{ ecn: 3, kind: "ipv4-ecn" }, { ipv4_ecn: 3 }],
      [{ kind: "ipv4-ecn-mode", mode: "Random" }, { ipv4_ecn_mode: "Random" }],
      [{ count: 4, kind: "ipv4-ecn-count" }, { ipv4_ecn_count: 4 }],
      [{ kind: "ipv4-ecn-step", step: 1 }, { ipv4_ecn_step: 1 }],
      [{ identification: 4096, kind: "ipv4-identification" }, { ipv4_id: 4096 }],
      [{ kind: "ipv4-identification-mode", mode: "Decrement" }, { ipv4_id_mode: "Decrement" }],
      [{ count: 64, kind: "ipv4-identification-count" }, { ipv4_id_count: 64 }],
      [{ kind: "ipv4-identification-step", step: 8 }, { ipv4_id_step: 8 }],
      [{ enabled: true, kind: "ipv4-df-flag" }, { ipv4_flag_df: true }],
      [{ enabled: false, kind: "ipv4-mf-flag" }, { ipv4_flag_mf: false }],
      [{ fragmentOffset: 512, kind: "ipv4-fragment-offset" }, { ipv4_fragment_offset: 512 }],
      [{ kind: "ipv4-fragment-offset-mode", mode: "Increment" }, { ipv4_fragment_offset_mode: "Increment" }],
      [{ count: 128, kind: "ipv4-fragment-offset-count" }, { ipv4_fragment_offset_count: 128 }],
      [{ kind: "ipv4-fragment-offset-step", step: 16 }, { ipv4_fragment_offset_step: 16 }],
      [{ kind: "ipv4-ttl", ttl: 63 }, { ipv4_ttl: 63 }],
      [{ kind: "ipv4-ttl-mode", mode: "Random" }, { ipv4_ttl_mode: "Random" }],
      [{ count: 16, kind: "ipv4-ttl-count" }, { ipv4_ttl_count: 16 }],
      [{ kind: "ipv4-ttl-step", step: 2 }, { ipv4_ttl_step: 2 }],
      [{ kind: "ipv4-checksum-override", override: true }, { ipv4_checksum_override: true }],
      [{ checksum: "b3e3", kind: "ipv4-checksum" }, { ipv4_checksum: "b3e3" }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for outer IPv6 addresses", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ address: "2001:db8::1", kind: "ipv6-dst" }, { ipv6_dst: "2001:db8::1" }],
      [{ kind: "ipv6-dst-mode", mode: "Increment Host" }, { ipv6_dst_mode: "Increment Host" }],
      [{ count: 2048, kind: "ipv6-dst-count" }, { ipv6_dst_count: 2048 }],
      [{ kind: "ipv6-dst-step", step: 2 }, { ipv6_dst_step: 2 }],
      [{ address: "2001:db8::2", kind: "ipv6-src" }, { ipv6_src: "2001:db8::2" }],
      [{ kind: "ipv6-src-mode", mode: "Random Host" }, { ipv6_src_mode: "Random Host" }],
      [{ count: 4096, kind: "ipv6-src-count" }, { ipv6_src_count: 4096 }],
      [{ kind: "ipv6-src-step", step: 3 }, { ipv6_src_step: 3 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for outer IPv6 scalar fields", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "ipv6-traffic-class", trafficClass: 128 }, { ipv6_traffic_class: 128 }],
      [{ kind: "ipv6-traffic-class-mode", mode: "Increment" }, { ipv6_traffic_class_mode: "Increment" }],
      [{ count: 32, kind: "ipv6-traffic-class-count" }, { ipv6_traffic_class_count: 32 }],
      [{ kind: "ipv6-traffic-class-step", step: 4 }, { ipv6_traffic_class_step: 4 }],
      [{ flowLabel: 4096, kind: "ipv6-flow-label" }, { ipv6_flow_label: 4096 }],
      [{ kind: "ipv6-flow-label-mode", mode: "Random" }, { ipv6_flow_label_mode: "Random" }],
      [{ count: 64, kind: "ipv6-flow-label-count" }, { ipv6_flow_label_count: 64 }],
      [{ kind: "ipv6-flow-label-step", step: 8 }, { ipv6_flow_label_step: 8 }],
      [{ hopLimit: 63, kind: "ipv6-hop-limit" }, { ipv6_hop_limit: 63 }],
      [{ kind: "ipv6-hop-limit-mode", mode: "Decrement" }, { ipv6_hop_limit_mode: "Decrement" }],
      [{ count: 16, kind: "ipv6-hop-limit-count" }, { ipv6_hop_limit_count: 16 }],
      [{ kind: "ipv6-hop-limit-step", step: 2 }, { ipv6_hop_limit_step: 2 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for ICMP fields", () => {
    const fixedChecksumStream = stream({
      icmp_checksum_override: true
    });
    const dynamicChecksumStream = stream({
      icmp_checksum_override: false
    });
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], ProfileWorkbenchStream | null, unknown]> = [
      [{ kind: "icmp-type-mode", mode: "Increment" }, fixedChecksumStream, {
        icmp_checksum_override: false,
        icmp_type_mode: "Increment"
      }],
      [{ count: 16, kind: "icmp-type-count" }, null, { icmp_type_count: 16 }],
      [{ kind: "icmp-type-step", step: 2 }, null, { icmp_type_step: 2 }],
      [{ code: 3, kind: "icmp-code" }, null, { icmp_code: 3 }],
      [{ kind: "icmp-code-mode", mode: "Fixed" }, fixedChecksumStream, {
        icmp_checksum_override: true,
        icmp_code_mode: "Fixed"
      }],
      [{ count: 17, kind: "icmp-code-count" }, null, { icmp_code_count: 17 }],
      [{ kind: "icmp-code-step", step: 3 }, null, { icmp_code_step: 3 }],
      [{ identifier: 4096, kind: "icmp-identifier" }, null, { icmp_identifier: 4096 }],
      [{ kind: "icmp-identifier-mode", mode: "Random" }, dynamicChecksumStream, {
        icmp_checksum_override: false,
        icmp_identifier_mode: "Random"
      }],
      [{ count: 18, kind: "icmp-identifier-count" }, null, { icmp_identifier_count: 18 }],
      [{ kind: "icmp-identifier-step", step: 4 }, null, { icmp_identifier_step: 4 }],
      [{ kind: "icmp-sequence", sequence: 8192 }, null, { icmp_sequence: 8192 }],
      [{ kind: "icmp-sequence-mode", mode: "Increment" }, fixedChecksumStream, {
        icmp_checksum_override: false,
        icmp_sequence_mode: "Increment"
      }],
      [{ count: 19, kind: "icmp-sequence-count" }, null, { icmp_sequence_count: 19 }],
      [{ kind: "icmp-sequence-step", step: 5 }, null, { icmp_sequence_step: 5 }],
      [{ kind: "icmp-checksum-override", override: true }, null, { icmp_checksum_override: true }],
      [{ checksum: "b3e3", kind: "icmp-checksum" }, null, { icmp_checksum: "b3e3" }]
    ];

    for (const [action, currentStream, patch] of cases) {
      expect(selectedStreamPatch(action, currentStream)).toEqual(patch);
    }

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-rs-slla-selection"
    }, stream({
      frame_length: 64,
      icmp_type: 133,
      mpls_enabled: false,
      packet_type: "Ethernet/IPv6/ICMPv6",
      vlan_enabled: false
    }))).toEqual({
      frame_length: 74,
      icmpv6_rs_include_slla: true
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-rs-slla-mac",
      mac: "00:11:22:33:44:55"
    }, null)).toEqual({
      icmpv6_rs_slla_mac: "00:11:22:33:44:55"
    });

    expect(selectedStreamPatch({
      hopLimit: 64,
      kind: "icmpv6-ra-current-hop-limit"
    }, null)).toEqual({
      icmpv6_ra_cur_hop_limit: 64
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-router-lifetime",
      lifetime: 1800
    }, null)).toEqual({
      icmpv6_ra_router_lifetime: 1800
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-reachable-time",
      reachableTime: 30000
    }, null)).toEqual({
      icmpv6_ra_reachable_time: 30000
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-retrans-timer",
      retransTimer: 1000
    }, null)).toEqual({
      icmpv6_ra_retrans_timer: 1000
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-ra-managed-flag"
    }, null)).toEqual({
      icmpv6_ra_managed: true
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-ra-other-flag"
    }, null)).toEqual({
      icmpv6_ra_other: true
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-ra-slla-selection"
    }, stream({
      frame_length: 64,
      icmp_type: 134,
      icmpv6_ra_include_prefix: false,
      mpls_enabled: false,
      packet_type: "Ethernet/IPv6/ICMPv6",
      vlan_enabled: false
    }))).toEqual({
      frame_length: 82,
      icmpv6_ra_include_slla: true
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-slla-mac",
      mac: "00:aa:bb:cc:dd:ee"
    }, null)).toEqual({
      icmpv6_ra_slla_mac: "00:aa:bb:cc:dd:ee"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-ra-prefix-selection"
    }, stream({
      frame_length: 64,
      icmp_type: 134,
      icmpv6_ra_include_slla: false,
      mpls_enabled: false,
      packet_type: "Ethernet/IPv6/ICMPv6",
      vlan_enabled: false
    }))).toEqual({
      frame_length: 106,
      icmpv6_ra_include_prefix: true
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-prefix",
      prefix: "2001:db8:1::"
    }, null)).toEqual({
      icmpv6_ra_prefix: "2001:db8:1::"
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-prefix-length",
      prefixLength: 64
    }, null)).toEqual({
      icmpv6_ra_prefix_length: 64
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-ra-prefix-on-link-flag"
    }, null)).toEqual({
      icmpv6_ra_prefix_on_link: true
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "icmpv6-ra-prefix-autonomous-flag"
    }, null)).toEqual({
      icmpv6_ra_prefix_autonomous: false
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-prefix-valid-lifetime",
      lifetime: 2592000
    }, null)).toEqual({
      icmpv6_ra_prefix_valid_lifetime: 2592000
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-ra-prefix-preferred-lifetime",
      lifetime: 604800
    }, null)).toEqual({
      icmpv6_ra_prefix_preferred_lifetime: 604800
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-nd-target",
      target: "2001:db8::1"
    }, null)).toEqual({
      icmpv6_nd_target: "2001:db8::1"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "icmpv6-nd-option-selection"
    }, null)).toEqual({
      icmpv6_nd_include_option: false
    });

    expect(selectedStreamPatch({
      kind: "icmpv6-nd-option-mac",
      mac: "00:11:22:33:44:66"
    }, null)).toEqual({
      icmpv6_nd_option_mac: "00:11:22:33:44:66"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-nd-na-router-flag"
    }, null)).toEqual({
      icmpv6_nd_na_router: true
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-nd-na-solicited-flag"
    }, null)).toEqual({
      icmpv6_nd_na_solicited: true
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "icmpv6-nd-na-override-flag"
    }, null)).toEqual({
      icmpv6_nd_na_override: true
    });
  });

  it("derives selected-stream patch actions for outer L4 ports", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "l4-src-port-override-selection"
    }, stream({
      l4_src_port_mode: "Increment"
    }))).toEqual({
      l4_src_port_mode: "Increment",
      l4_src_port_override: true
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "l4-src-port-override-selection"
    }, stream({
      l4_src_port_mode: "Random"
    }))).toEqual({
      l4_src_port_mode: "Fixed",
      l4_src_port_override: false
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "l4-dst-port-override-selection"
    }, stream({
      l4_dst_port_mode: "Decrement"
    }))).toEqual({
      l4_dst_port_mode: "Decrement",
      l4_dst_port_override: true
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "l4-dst-port-override-selection"
    }, stream({
      l4_dst_port_mode: "Random"
    }))).toEqual({
      l4_dst_port_mode: "Fixed",
      l4_dst_port_override: false
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "l4-src-port-override-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      enabled: true,
      kind: "l4-dst-port-override-selection"
    }, null)).toBeNull();

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "l4-src-port", port: 1025 }, { l4_src_port: 1025 }],
      [{ kind: "l4-src-port-mode", mode: "Increment" }, { l4_src_port_mode: "Increment" }],
      [{ count: 64, kind: "l4-src-port-count" }, { l4_src_port_count: 64 }],
      [{ kind: "l4-src-port-step", step: 4 }, { l4_src_port_step: 4 }],
      [{ kind: "l4-dst-port", port: 4789 }, { l4_dst_port: 4789 }],
      [{ kind: "l4-dst-port-mode", mode: "Random" }, { l4_dst_port_mode: "Random" }],
      [{ count: 128, kind: "l4-dst-port-count" }, { l4_dst_port_count: 128 }],
      [{ kind: "l4-dst-port-step", step: 8 }, { l4_dst_port_step: 8 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for UDP length and checksum", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "udp-length-override-selection"
    }, stream({
      udp_length_mode: "Increment"
    }))).toEqual({
      udp_length_mode: "Increment",
      udp_length_override: true
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "udp-length-override-selection"
    }, stream({
      udp_length_mode: "Random"
    }))).toEqual({
      udp_length_mode: "Fixed",
      udp_length_override: false
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "udp-length-override-selection"
    }, null)).toBeNull();

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "udp-length", length: 128 }, { udp_length: 128 }],
      [{ kind: "udp-length-mode", mode: "Increment" }, { udp_length_mode: "Increment" }],
      [{ count: 32, kind: "udp-length-count" }, { udp_length_count: 32 }],
      [{ kind: "udp-length-step", step: 8 }, { udp_length_step: 8 }],
      [{ kind: "udp-checksum-override", override: true }, { udp_checksum_override: true }],
      [{ checksum: "b3e3", kind: "udp-checksum" }, { udp_checksum: "b3e3" }],
      [{ kind: "udp-checksum-mode", mode: "Random" }, { udp_checksum_mode: "Random" }],
      [{ count: 64, kind: "udp-checksum-count" }, { udp_checksum_count: 64 }],
      [{ kind: "udp-checksum-step", step: 4 }, { udp_checksum_step: 4 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for outer VLAN protocol data", () => {
    expect(selectedStreamPatch({
      kind: "vlan-tpid-override",
      override: true
    }, null)).toEqual({
      vlan_tpid_override: true
    });

    expect(selectedStreamPatch({
      kind: "vlan-tpid",
      tpid: "88a8"
    }, null)).toEqual({
      vlan_tpid: "88a8"
    });

    expect(selectedStreamPatch({
      kind: "vlan-priority",
      priority: 5
    }, null)).toEqual({
      vlan_priority: 5
    });

    expect(selectedStreamPatch({
      kind: "vlan-priority-mode",
      mode: "Increment"
    }, null)).toEqual({
      vlan_priority_mode: "Increment"
    });

    expect(selectedStreamPatch({
      count: 4,
      kind: "vlan-priority-count"
    }, null)).toEqual({
      vlan_priority_count: 4
    });

    expect(selectedStreamPatch({
      kind: "vlan-priority-step",
      step: 2
    }, null)).toEqual({
      vlan_priority_step: 2
    });

    expect(selectedStreamPatch({
      cfi: 1,
      kind: "vlan-cfi"
    }, null)).toEqual({
      vlan_cfi: 1
    });

    expect(selectedStreamPatch({
      kind: "vlan-id",
      vlanId: 120
    }, null)).toEqual({
      vlan_id: 120
    });

    expect(selectedStreamPatch({
      kind: "vlan-id-mode",
      mode: "Random"
    }, null)).toEqual({
      vlan_id_mode: "Random"
    });

    expect(selectedStreamPatch({
      count: 16,
      kind: "vlan-id-count"
    }, null)).toEqual({
      vlan_id_count: 16
    });

    expect(selectedStreamPatch({
      kind: "vlan-id-step",
      step: 10
    }, null)).toEqual({
      vlan_id_step: 10
    });
  });

  it("derives selected-stream patch actions for QinQ inner VLAN protocol data", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "vlan-inner-selection"
    }, stream({
      vlan2_id_mode: "Random",
      vlan2_priority_mode: "Increment"
    }))).toEqual({
      vlan2_enabled: true,
      vlan2_id_mode: "Random",
      vlan2_priority_mode: "Increment"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "vlan-inner-selection"
    }, stream({
      vlan2_id_mode: "Random",
      vlan2_priority_mode: "Increment"
    }))).toEqual({
      vlan2_enabled: false,
      vlan2_id_mode: "Fixed",
      vlan2_priority_mode: "Fixed"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "vlan-inner-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      kind: "vlan-inner-tpid-override",
      override: true
    }, null)).toEqual({
      vlan2_tpid_override: true
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-tpid",
      tpid: "88a8"
    }, null)).toEqual({
      vlan2_tpid: "88a8"
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-priority",
      priority: 6
    }, null)).toEqual({
      vlan2_priority: 6
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-priority-mode",
      mode: "Increment"
    }, null)).toEqual({
      vlan2_priority_mode: "Increment"
    });

    expect(selectedStreamPatch({
      count: 5,
      kind: "vlan-inner-priority-count"
    }, null)).toEqual({
      vlan2_priority_count: 5
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-priority-step",
      step: 3
    }, null)).toEqual({
      vlan2_priority_step: 3
    });

    expect(selectedStreamPatch({
      cfi: 1,
      kind: "vlan-inner-cfi"
    }, null)).toEqual({
      vlan2_cfi: 1
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-id",
      vlanId: 220
    }, null)).toEqual({
      vlan2_id: 220
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-id-mode",
      mode: "Random"
    }, null)).toEqual({
      vlan2_id_mode: "Random"
    });

    expect(selectedStreamPatch({
      count: 32,
      kind: "vlan-inner-id-count"
    }, null)).toEqual({
      vlan2_id_count: 32
    });

    expect(selectedStreamPatch({
      kind: "vlan-inner-id-step",
      step: 11
    }, null)).toEqual({
      vlan2_id_step: 11
    });
  });

  it("derives selected-stream patch actions for primary MPLS protocol data", () => {
    expect(selectedStreamPatch({
      kind: "mpls-label",
      label: 104857
    }, null)).toEqual({
      mpls_label: 104857
    });

    expect(selectedStreamPatch({
      kind: "mpls-label-mode",
      mode: "Increment"
    }, null)).toEqual({
      mpls_label_mode: "Increment"
    });

    expect(selectedStreamPatch({
      count: 64,
      kind: "mpls-label-count"
    }, null)).toEqual({
      mpls_label_count: 64
    });

    expect(selectedStreamPatch({
      kind: "mpls-label-step",
      step: 10
    }, null)).toEqual({
      mpls_label_step: 10
    });

    expect(selectedStreamPatch({
      kind: "mpls-traffic-class",
      trafficClass: 6
    }, null)).toEqual({
      mpls_tc: 6
    });

    expect(selectedStreamPatch({
      kind: "mpls-traffic-class-mode",
      mode: "Random"
    }, null)).toEqual({
      mpls_tc_mode: "Random"
    });

    expect(selectedStreamPatch({
      count: 4,
      kind: "mpls-traffic-class-count"
    }, null)).toEqual({
      mpls_tc_count: 4
    });

    expect(selectedStreamPatch({
      kind: "mpls-traffic-class-step",
      step: 2
    }, null)).toEqual({
      mpls_tc_step: 2
    });

    expect(selectedStreamPatch({
      kind: "mpls-ttl",
      ttl: 63
    }, null)).toEqual({
      mpls_ttl: 63
    });

    expect(selectedStreamPatch({
      kind: "mpls-ttl-mode",
      mode: "Increment"
    }, null)).toEqual({
      mpls_ttl_mode: "Increment"
    });

    expect(selectedStreamPatch({
      count: 16,
      kind: "mpls-ttl-count"
    }, null)).toEqual({
      mpls_ttl_count: 16
    });

    expect(selectedStreamPatch({
      kind: "mpls-ttl-step",
      step: 3
    }, null)).toEqual({
      mpls_ttl_step: 3
    });
  });

  it("derives selected-stream patch actions for stacked MPLS protocol data", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "mpls-second-label-selection"
    }, stream({
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: true,
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "mpls-second-label-selection"
    }, stream({
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: false,
      mpls_label2_mode: "Fixed",
      mpls_label2_tc_mode: "Fixed",
      mpls_label2_ttl_mode: "Fixed",
      mpls_label3_enabled: false,
      mpls_label3_mode: "Fixed",
      mpls_label3_tc_mode: "Fixed",
      mpls_label3_ttl_mode: "Fixed"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "mpls-third-label-selection"
    }, stream({
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: true,
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "mpls-third-label-selection"
    }, stream({
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: true,
      mpls_label3_enabled: false,
      mpls_label3_mode: "Fixed",
      mpls_label3_tc_mode: "Fixed",
      mpls_label3_ttl_mode: "Fixed"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "mpls-second-label-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      enabled: true,
      kind: "mpls-third-label-selection"
    }, null)).toBeNull();

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "mpls-second-label", label: 200 }, { mpls_label2: 200 }],
      [{ kind: "mpls-second-label-mode", mode: "Increment" }, { mpls_label2_mode: "Increment" }],
      [{ count: 32, kind: "mpls-second-label-count" }, { mpls_label2_count: 32 }],
      [{ kind: "mpls-second-label-step", step: 4 }, { mpls_label2_step: 4 }],
      [{ kind: "mpls-second-traffic-class", trafficClass: 5 }, { mpls_label2_tc: 5 }],
      [{ kind: "mpls-second-traffic-class-mode", mode: "Random" }, { mpls_label2_tc_mode: "Random" }],
      [{ count: 6, kind: "mpls-second-traffic-class-count" }, { mpls_label2_tc_count: 6 }],
      [{ kind: "mpls-second-traffic-class-step", step: 2 }, { mpls_label2_tc_step: 2 }],
      [{ kind: "mpls-second-ttl", ttl: 62 }, { mpls_label2_ttl: 62 }],
      [{ kind: "mpls-second-ttl-mode", mode: "Decrement" }, { mpls_label2_ttl_mode: "Decrement" }],
      [{ count: 9, kind: "mpls-second-ttl-count" }, { mpls_label2_ttl_count: 9 }],
      [{ kind: "mpls-second-ttl-step", step: 3 }, { mpls_label2_ttl_step: 3 }],
      [{ kind: "mpls-third-label", label: 300 }, { mpls_label3: 300 }],
      [{ kind: "mpls-third-label-mode", mode: "Increment" }, { mpls_label3_mode: "Increment" }],
      [{ count: 42, kind: "mpls-third-label-count" }, { mpls_label3_count: 42 }],
      [{ kind: "mpls-third-label-step", step: 5 }, { mpls_label3_step: 5 }],
      [{ kind: "mpls-third-traffic-class", trafficClass: 7 }, { mpls_label3_tc: 7 }],
      [{ kind: "mpls-third-traffic-class-mode", mode: "Random" }, { mpls_label3_tc_mode: "Random" }],
      [{ count: 7, kind: "mpls-third-traffic-class-count" }, { mpls_label3_tc_count: 7 }],
      [{ kind: "mpls-third-traffic-class-step", step: 3 }, { mpls_label3_tc_step: 3 }],
      [{ kind: "mpls-third-ttl", ttl: 61 }, { mpls_label3_ttl: 61 }],
      [{ kind: "mpls-third-ttl-mode", mode: "Decrement" }, { mpls_label3_ttl_mode: "Decrement" }],
      [{ count: 11, kind: "mpls-third-ttl-count" }, { mpls_label3_ttl_count: 11 }],
      [{ kind: "mpls-third-ttl-step", step: 4 }, { mpls_label3_ttl_step: 4 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for VXLAN protocol data", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "vxlan-vni", vni: 5000 }, { vxlan_vni: 5000 }],
      [{ kind: "vxlan-vni-mode", mode: "Increment" }, { vxlan_vni_mode: "Increment" }],
      [{ count: 128, kind: "vxlan-vni-count" }, { vxlan_vni_count: 128 }],
      [{ kind: "vxlan-vni-step", step: 16 }, { vxlan_vni_step: 16 }],
      [
        { hopLimit: 48, kind: "vxlan-inner-ipv6-hop-limit" },
        { vxlan_inner_ipv6_hop_limit: 48 }
      ],
      [
        { kind: "vxlan-inner-ipv6-hop-limit-mode", mode: "Increment" },
        { vxlan_inner_ipv6_hop_limit_mode: "Increment" }
      ],
      [
        { count: 12, kind: "vxlan-inner-ipv6-hop-limit-count" },
        { vxlan_inner_ipv6_hop_limit_count: 12 }
      ],
      [
        { kind: "vxlan-inner-ipv6-hop-limit-step", step: 4 },
        { vxlan_inner_ipv6_hop_limit_step: 4 }
      ],
      [{ kind: "vxlan-inner-ipv4-ttl", ttl: 47 }, { vxlan_inner_ipv4_ttl: 47 }],
      [
        { kind: "vxlan-inner-ipv4-ttl-mode", mode: "Decrement" },
        { vxlan_inner_ipv4_ttl_mode: "Decrement" }
      ],
      [
        { count: 10, kind: "vxlan-inner-ipv4-ttl-count" },
        { vxlan_inner_ipv4_ttl_count: 10 }
      ],
      [
        { kind: "vxlan-inner-ipv4-ttl-step", step: 5 },
        { vxlan_inner_ipv4_ttl_step: 5 }
      ],
      [
        { address: "00:11:22:33:44:55", kind: "vxlan-inner-ether-dst" },
        { vxlan_inner_ether_dst: "00:11:22:33:44:55" }
      ],
      [
        { address: "66:77:88:99:aa:bb", kind: "vxlan-inner-ether-src" },
        { vxlan_inner_ether_src: "66:77:88:99:aa:bb" }
      ],
      [
        { address: "2001:db8::1", kind: "vxlan-inner-ipv6-src" },
        { vxlan_inner_ipv6_src: "2001:db8::1" }
      ],
      [
        { kind: "vxlan-inner-ipv6-src-mode", mode: "Increment Host" },
        { vxlan_inner_ipv6_src_mode: "Increment Host" }
      ],
      [
        { count: 64, kind: "vxlan-inner-ipv6-src-count" },
        { vxlan_inner_ipv6_src_count: 64 }
      ],
      [
        { kind: "vxlan-inner-ipv6-src-step", step: 2 },
        { vxlan_inner_ipv6_src_step: 2 }
      ],
      [
        { address: "2001:db8::2", kind: "vxlan-inner-ipv6-dst" },
        { vxlan_inner_ipv6_dst: "2001:db8::2" }
      ],
      [
        { kind: "vxlan-inner-ipv6-dst-mode", mode: "Random Host" },
        { vxlan_inner_ipv6_dst_mode: "Random Host" }
      ],
      [
        { count: 65, kind: "vxlan-inner-ipv6-dst-count" },
        { vxlan_inner_ipv6_dst_count: 65 }
      ],
      [
        { kind: "vxlan-inner-ipv6-dst-step", step: 3 },
        { vxlan_inner_ipv6_dst_step: 3 }
      ],
      [
        { address: "10.0.0.1", kind: "vxlan-inner-ipv4-src" },
        { vxlan_inner_ipv4_src: "10.0.0.1" }
      ],
      [
        { kind: "vxlan-inner-ipv4-src-mode", mode: "Increment Host" },
        { vxlan_inner_ipv4_src_mode: "Increment Host" }
      ],
      [
        { count: 66, kind: "vxlan-inner-ipv4-src-count" },
        { vxlan_inner_ipv4_src_count: 66 }
      ],
      [
        { kind: "vxlan-inner-ipv4-src-step", step: 4 },
        { vxlan_inner_ipv4_src_step: 4 }
      ],
      [
        { address: "10.0.0.2", kind: "vxlan-inner-ipv4-dst" },
        { vxlan_inner_ipv4_dst: "10.0.0.2" }
      ],
      [
        { kind: "vxlan-inner-ipv4-dst-mode", mode: "Random Host" },
        { vxlan_inner_ipv4_dst_mode: "Random Host" }
      ],
      [
        { count: 67, kind: "vxlan-inner-ipv4-dst-count" },
        { vxlan_inner_ipv4_dst_count: 67 }
      ],
      [
        { kind: "vxlan-inner-ipv4-dst-step", step: 5 },
        { vxlan_inner_ipv4_dst_step: 5 }
      ],
      [
        { kind: "vxlan-inner-l4-src-port", port: 32000 },
        { vxlan_inner_l4_src_port: 32000 }
      ],
      [
        { kind: "vxlan-inner-l4-src-port-mode", mode: "Increment" },
        { vxlan_inner_l4_src_port_mode: "Increment" }
      ],
      [
        { count: 68, kind: "vxlan-inner-l4-src-port-count" },
        { vxlan_inner_l4_src_port_count: 68 }
      ],
      [
        { kind: "vxlan-inner-l4-src-port-step", step: 6 },
        { vxlan_inner_l4_src_port_step: 6 }
      ],
      [
        { kind: "vxlan-inner-l4-dst-port", port: 32100 },
        { vxlan_inner_l4_dst_port: 32100 }
      ],
      [
        { kind: "vxlan-inner-l4-dst-port-mode", mode: "Random" },
        { vxlan_inner_l4_dst_port_mode: "Random" }
      ],
      [
        { count: 69, kind: "vxlan-inner-l4-dst-port-count" },
        { vxlan_inner_l4_dst_port_count: 69 }
      ],
      [
        { kind: "vxlan-inner-l4-dst-port-step", step: 7 },
        { vxlan_inner_l4_dst_port_step: 7 }
      ]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("derives selected-stream patch actions for stream properties", () => {
    expect(selectedStreamPatch({
      enabled: false,
      kind: "stream-enabled"
    }, null)).toEqual({
      enabled: false
    });

    expect(selectedStreamPatch({
      kind: "rate-type",
      rateType: "pps"
    }, null)).toEqual({
      rate_type: "pps"
    });

    expect(selectedStreamPatch({
      kind: "packet-frame-length",
      frameLength: 512
    }, null)).toEqual({
      frame_length: 512
    });

    expect(selectedStreamPatch({
      kind: "after-stream-goto"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      kind: "after-stream-goto"
    }, stream({
      action_count: 3,
      next_stream_id: null
    }))).toEqual({
      action_count: 3,
      next_stream_id: 1
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "loop-action-count-enabled"
    }, stream({
      action_count: 0
    }))).toEqual({
      action_count: 1
    });
  });

  it("normalizes stream mode transitions", () => {
    expect(streamModePatch("continuous", stream({ count: 9 }))).toMatchObject({
      action_count: 0,
      count: 1,
      mode: "continuous",
      next_stream_id: null
    });
    expect(streamModePatch("multi_burst", stream({ count: 1 }))).toMatchObject({
      count: 2,
      mode: "multi_burst"
    });
  });

  it("normalizes after-stream routing patches", () => {
    expect(afterStreamStopPatch()).toEqual({
      action_count: 0,
      next_stream_id: null
    });

    expect(afterStreamGotoPatch(stream({
      action_count: 0,
      next_stream_id: null
    }))).toEqual({
      action_count: 0,
      next_stream_id: 1
    });

    expect(afterStreamGotoPatch(stream({
      action_count: 3,
      next_stream_id: 4
    }))).toEqual({
      action_count: 3,
      next_stream_id: 4
    });

    expect(nextStreamSelectionPatch(2)).toEqual({
      next_stream_id: 2
    });
  });

  it("normalizes after-stream loop count enablement", () => {
    expect(loopActionCountEnabledPatch(true, stream({
      action_count: 0
    }))).toEqual({
      action_count: 1
    });

    expect(loopActionCountEnabledPatch(true, stream({
      action_count: 5
    }))).toEqual({
      action_count: 5
    });

    expect(loopActionCountEnabledPatch(false, stream({
      action_count: 5
    }))).toEqual({
      action_count: 0
    });
  });

  it("normalizes frame length value patches", () => {
    expect(frameLengthValuePatch(128)).toEqual({
      frame_length: 128
    });

    expect(frameLengthMinPatch(64)).toEqual({
      frame_length_min: 64
    });

    expect(frameLengthMaxPatch(512)).toEqual({
      frame_length: 512,
      frame_length_max: 512
    });

    expect(selectedStreamPatch({
      frameLength: 256,
      kind: "packet-frame-length"
    }, null)).toEqual({
      frame_length: 256
    });

    expect(selectedStreamPatch({
      frameLengthMin: 128,
      kind: "frame-length-min"
    }, null)).toEqual({
      frame_length_min: 128
    });

    expect(selectedStreamPatch({
      frameLengthMax: 1518,
      kind: "frame-length-max"
    }, null)).toEqual({
      frame_length: 1518,
      frame_length_max: 1518
    });
  });

  it("normalizes L4 port override selection patches", () => {
    expect(l4PortOverrideSelectionPatch("source", true, stream({
      l4_src_port_mode: "Increment"
    }))).toEqual({
      l4_src_port_mode: "Increment",
      l4_src_port_override: true
    });

    expect(l4PortOverrideSelectionPatch("destination", false, stream({
      l4_dst_port_mode: "Decrement"
    }))).toEqual({
      l4_dst_port_mode: "Fixed",
      l4_dst_port_override: false
    });
  });

  it("normalizes UDP length override selection patches", () => {
    expect(udpLengthOverrideSelectionPatch(true, stream({
      udp_length_mode: "Increment"
    }))).toEqual({
      udp_length_mode: "Increment",
      udp_length_override: true
    });

    expect(udpLengthOverrideSelectionPatch(false, stream({
      udp_length_mode: "Random"
    }))).toEqual({
      udp_length_mode: "Fixed",
      udp_length_override: false
    });
  });

  it("rejects variable frame length for fixed-size protocol layouts", () => {
    expect(frameLengthTypePatch("Increment", stream({
      frame_length: 96,
      frame_length_max: 128,
      frame_length_min: 64,
      packet_type: "Ethernet/IPv4/GRE"
    }))).toBeNull();

    expect(frameLengthTypePatch("Random", stream({
      frame_length: 64,
      frame_length_max: 64,
      frame_length_min: 64,
      packet_type: "Ethernet/IPv4/UDP"
    }))).toMatchObject({
      frame_length: 69,
      frame_length_max: 69,
      frame_length_min: 64,
      frame_length_type: "Random"
    });
  });

  it("guards packet type changes while a tunnel is selected", () => {
    expect(packetTypePatch("Ethernet/IPv6/TCP", stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true
    }))).toBeNull();

    expect(packetTypePatch("Ethernet/ARP", stream({
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    }))).toMatchObject({
      flow_stats_enabled: false,
      gtpu_enabled: false,
      l4_dst_port_override: false,
      l4_src_port_override: false,
      latency_enabled: false,
      mpls_enabled: false,
      packet_type: "Ethernet/ARP",
      vxlan_enabled: false
    });
  });

  it("keeps SCTP frame length above its generated header floor", () => {
    expect(packetTypePatch("Ethernet/IPv4/SCTP", stream({
      frame_length: 64,
      frame_length_min: 64,
      gtpu_enabled: false,
      mpls_enabled: true,
      mpls_label2_enabled: true,
      mpls_label3_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vlan2_enabled: true,
      vlan_enabled: true,
      vxlan_enabled: false
    }))).toMatchObject({
      frame_length: 82,
      frame_length_min: 82,
      frame_length_type: "Fixed",
      packet_type: "Ethernet/IPv4/SCTP"
    });
  });

  it("normalizes ICMPv6 control messages", () => {
    expect(icmpTypePatch(135, stream({
      ether_src: "00:11:22:33:44:55",
      frame_length: 64,
      icmpv6_nd_include_option: undefined,
      icmpv6_nd_option_mac: "",
      icmpv6_nd_target: "",
      ipv6_dst: "2001:db8::2",
      packet_type: "Ethernet/IPv6/ICMPv6",
      vlan_enabled: false,
      mpls_enabled: false
    }))).toMatchObject({
      frame_length_type: "Fixed",
      icmp_code: 0,
      icmp_type: 135,
      icmp_type_mode: "Fixed",
      icmpv6_nd_include_option: true,
      icmpv6_nd_option_mac: "00:11:22:33:44:55",
      icmpv6_nd_target: "2001:db8::2",
      ipv6_hop_limit: 255
    });
  });

  it("normalizes VLAN selection patches", () => {
    expect(vlanSelectionPatch(true)).toEqual({
      vlan_enabled: true
    });

    expect(vlanSelectionPatch(false)).toEqual({
      vlan_enabled: false,
      vlan_priority_mode: "Fixed",
      vlan_id_mode: "Fixed",
      vlan2_enabled: false,
      vlan2_priority_mode: "Fixed",
      vlan2_id_mode: "Fixed"
    });
  });

  it("normalizes MPLS and payload selection patches", () => {
    expect(mplsSelectionPatch(true)).toEqual({
      mpls_enabled: true
    });
    expect(mplsSelectionPatch(false)).toEqual({
      mpls_enabled: false
    });
    expect(payloadSelectionPatch(true)).toEqual({
      payload_enabled: true
    });
    expect(payloadSelectionPatch(false)).toEqual({
      payload_enabled: false
    });
  });

  it("normalizes DNS selection patches and resets mutually exclusive DHCP fields", () => {
    expect(dnsSelectionPatch(true, udpApplicationStream({
      dhcp_enabled: true,
      dns_answer_enabled: true
    }))).toMatchObject({
      dhcp_client_ip_mode: "Fixed",
      dhcp_enabled: false,
      dhcp_operation_mode: "Fixed",
      dhcp_xid_mode: "Fixed",
      dns_answer_enabled: true,
      dns_enabled: true,
      dns_transaction_id_mode: "Increment",
      frame_length: 83,
      frame_length_max: 83,
      frame_length_min: 83,
      l4_dst_port: 53,
      l4_dst_port_override: true,
      udp_checksum_override: false,
      udp_length_mode: "Fixed",
      udp_length_override: false
    });

    expect(dnsSelectionPatch(false, udpApplicationStream({
      dhcp_enabled: false,
      dns_answer_enabled: true
    }))).toMatchObject({
      dhcp_operation_mode: "Increment",
      dns_answer_enabled: false,
      dns_answer_ipv4_mode: "Fixed",
      dns_answer_ttl_mode: "Fixed",
      dns_enabled: false,
      dns_flags_mode: "Fixed",
      dns_query_class_mode: "Fixed",
      dns_query_type_mode: "Fixed",
      dns_transaction_id_mode: "Fixed",
      frame_length: 64,
      l4_dst_port: 1025,
      l4_dst_port_override: false,
      udp_checksum_override: true,
      udp_length_mode: "Increment",
      udp_length_override: true
    });
  });

  it("normalizes DNS answer selection patches", () => {
    expect(dnsAnswerSelectionPatch(true, udpApplicationStream())).toMatchObject({
      dns_answer_enabled: true,
      dns_answer_ipv4_mode: "Increment Host",
      dns_answer_ttl_mode: "Increment",
      dns_flags: "8180",
      dns_query_class_mode: "Fixed",
      dns_query_type: 1,
      dns_query_type_mode: "Fixed",
      frame_length: 99,
      frame_length_max: 99,
      frame_length_min: 99
    });

    expect(dnsAnswerSelectionPatch(false, udpApplicationStream({
      dns_flags: "8180",
      dns_query_type: 1
    }))).toMatchObject({
      dns_answer_enabled: false,
      dns_answer_ipv4_mode: "Fixed",
      dns_answer_ttl_mode: "Fixed",
      dns_flags: "8180",
      dns_query_class_mode: "Increment",
      dns_query_type: 1,
      dns_query_type_mode: "Increment",
      frame_length: 64
    });
  });

  it("derives selected-stream patch actions for DNS controls", () => {
    const selected = udpApplicationStream({
      dhcp_enabled: true,
      dns_answer_enabled: true
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "dns-selection"
    }, selected)).toMatchObject({
      dhcp_enabled: false,
      dns_enabled: true,
      dns_answer_enabled: true,
      l4_dst_port: 53
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "dns-answer-selection"
    }, udpApplicationStream())).toMatchObject({
      dns_answer_enabled: true,
      dns_flags: "8180",
      dns_query_type: 1
    });

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ field: "transaction-id", kind: "dns-number", value: 4660 }, { dns_transaction_id: 4660 }],
      [{ field: "query-type", kind: "dns-number", value: 28 }, { dns_query_type: 28 }],
      [{ field: "query-class", kind: "dns-number", value: 1 }, { dns_query_class: 1 }],
      [{ field: "answer-ttl", kind: "dns-number", value: 300 }, { dns_answer_ttl: 300 }],
      [{ field: "flags", kind: "dns-text", value: "8180" }, { dns_flags: "8180" }],
      [{ field: "query-name", kind: "dns-text", value: "example.com" }, { dns_query_name: "example.com" }],
      [{ field: "answer-ipv4", kind: "dns-text", value: "192.0.2.10" }, { dns_answer_ipv4: "192.0.2.10" }],
      [{ field: "transaction-id", kind: "dns-mode", mode: "Increment" }, { dns_transaction_id_mode: "Increment" }],
      [{ field: "flags", kind: "dns-mode", mode: "Random" }, { dns_flags_mode: "Random" }],
      [{ field: "query-type", kind: "dns-mode", mode: "Decrement" }, { dns_query_type_mode: "Decrement" }],
      [{ field: "query-class", kind: "dns-mode", mode: "Fixed" }, { dns_query_class_mode: "Fixed" }],
      [{ field: "answer-ttl", kind: "dns-mode", mode: "Increment" }, { dns_answer_ttl_mode: "Increment" }],
      [{ field: "answer-ipv4", kind: "dns-mode", mode: "Increment Host" }, { dns_answer_ipv4_mode: "Increment Host" }],
      [{ count: 9, field: "query-type", kind: "dns-count" }, { dns_query_type_count: 9 }],
      [{ field: "answer-ipv4", kind: "dns-step", step: 4 }, { dns_answer_ipv4_step: 4 }]
    ];

    for (const [action, expected] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(expected);
    }
  });

  it("normalizes DHCP selection patches and resets mutually exclusive DNS fields", () => {
    expect(dhcpSelectionPatch(true, udpApplicationStream({
      dns_answer_enabled: true,
      dns_enabled: true
    }))).toMatchObject({
      dhcp_enabled: true,
      dhcp_operation_mode: "Increment",
      dhcp_xid_mode: "Increment",
      dns_answer_enabled: false,
      dns_answer_ipv4_mode: "Fixed",
      dns_answer_ttl_mode: "Fixed",
      dns_enabled: false,
      dns_transaction_id_mode: "Fixed",
      frame_length: 354,
      frame_length_max: 354,
      frame_length_min: 354,
      l4_dst_port: 67,
      l4_dst_port_override: true,
      l4_src_port: 68,
      l4_src_port_override: true,
      udp_checksum_override: false,
      udp_length_mode: "Fixed",
      udp_length_override: false
    });

    expect(dhcpSelectionPatch(false, udpApplicationStream({
      dhcp_enabled: true,
      dns_enabled: false
    }))).toMatchObject({
      dhcp_client_ip_mode: "Fixed",
      dhcp_enabled: false,
      dhcp_operation_mode: "Fixed",
      dhcp_xid_mode: "Fixed",
      dns_enabled: false,
      dns_flags_mode: "Increment",
      frame_length: 64,
      l4_dst_port: 1025,
      l4_dst_port_override: false,
      l4_src_port: 1025,
      l4_src_port_override: false,
      udp_checksum_override: true,
      udp_length_mode: "Increment",
      udp_length_override: true
    });
  });

  it("creates selected-stream actions for DHCP controls", () => {
    expect(dhcpSelectionAction(true)).toEqual({
      enabled: true,
      kind: "dhcp-selection"
    });
    expect(dhcpBootpNumberAction("operation", 2)).toEqual({
      field: "operation",
      kind: "dhcp-bootp-number",
      value: 2
    });
    expect(dhcpBootpTextAction("flags", "8000")).toEqual({
      field: "flags",
      kind: "dhcp-bootp-text",
      value: "8000"
    });
    expect(dhcpBootpModeAction("xid", "Increment")).toEqual({
      field: "xid",
      kind: "dhcp-bootp-mode",
      mode: "Increment"
    });
    expect(dhcpBootpCountAction("message-type", 8)).toEqual({
      count: 8,
      field: "message-type",
      kind: "dhcp-bootp-count"
    });
    expect(dhcpBootpStepAction("flags", 4)).toEqual({
      field: "flags",
      kind: "dhcp-bootp-step",
      step: 4
    });
    expect(dhcpBootpAddressTextAction("client-ip", "0.0.0.0")).toEqual({
      field: "client-ip",
      kind: "dhcp-bootp-address-text",
      value: "0.0.0.0"
    });
    expect(dhcpBootpAddressModeAction("client-mac", "Increment")).toEqual({
      field: "client-mac",
      kind: "dhcp-bootp-address-mode",
      mode: "Increment"
    });
    expect(dhcpBootpAddressCountAction("client-ip", 16)).toEqual({
      count: 16,
      field: "client-ip",
      kind: "dhcp-bootp-address-count"
    });
    expect(dhcpBootpAddressStepAction("server-ip", 4)).toEqual({
      field: "server-ip",
      kind: "dhcp-bootp-address-step",
      step: 4
    });
    expect(dhcpOptionTextAction("hostname", "trex-host")).toEqual({
      field: "hostname",
      kind: "dhcp-option-text",
      value: "trex-host"
    });
    expect(dhcpOptionTimerNumberAction("lease-time", 3600)).toEqual({
      field: "lease-time",
      kind: "dhcp-option-timer-number",
      value: 3600
    });
    expect(dhcpOptionTimerModeAction("renewal-time", "Decrement")).toEqual({
      field: "renewal-time",
      kind: "dhcp-option-timer-mode",
      mode: "Decrement"
    });
    expect(dhcpOptionTimerCountAction("lease-time", 4)).toEqual({
      count: 4,
      field: "lease-time",
      kind: "dhcp-option-timer-count"
    });
    expect(dhcpOptionTimerStepAction("renewal-time", 30)).toEqual({
      field: "renewal-time",
      kind: "dhcp-option-timer-step",
      step: 30
    });
    expect(dhcpOptionAddressTextAction("requested-ip", "10.0.0.10")).toEqual({
      field: "requested-ip",
      kind: "dhcp-option-address-text",
      value: "10.0.0.10"
    });
    expect(dhcpOptionAddressModeAction("server-id", "Random Host")).toEqual({
      field: "server-id",
      kind: "dhcp-option-address-mode",
      mode: "Random Host"
    });
    expect(dhcpOptionAddressCountAction("requested-ip", 8)).toEqual({
      count: 8,
      field: "requested-ip",
      kind: "dhcp-option-address-count"
    });
    expect(dhcpOptionAddressStepAction("server-id", 2)).toEqual({
      field: "server-id",
      kind: "dhcp-option-address-step",
      step: 2
    });
  });

  it("derives selected-stream patch actions for DHCP BOOTP controls", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "dhcp-selection"
    }, udpApplicationStream({
      dns_enabled: true
    }))).toMatchObject({
      dhcp_enabled: true,
      dns_enabled: false,
      l4_dst_port: 67,
      l4_src_port: 68
    });

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ field: "operation", kind: "dhcp-bootp-number", value: 2 }, { dhcp_operation: 2 }],
      [{ field: "hops", kind: "dhcp-bootp-number", value: 3 }, { dhcp_hops: 3 }],
      [{ field: "seconds", kind: "dhcp-bootp-number", value: 12 }, { dhcp_seconds: 12 }],
      [{ field: "message-type", kind: "dhcp-bootp-number", value: 5 }, { dhcp_message_type: 5 }],
      [{ field: "xid", kind: "dhcp-bootp-number", value: 0x3903f326 }, { dhcp_xid: 0x3903f326 }],
      [{ field: "flags", kind: "dhcp-bootp-text", value: "8000" }, { dhcp_flags: "8000" }],
      [{ field: "operation", kind: "dhcp-bootp-mode", mode: "Increment" }, { dhcp_operation_mode: "Increment" }],
      [{ field: "hops", kind: "dhcp-bootp-mode", mode: "Random" }, { dhcp_hops_mode: "Random" }],
      [{ field: "seconds", kind: "dhcp-bootp-mode", mode: "Decrement" }, { dhcp_seconds_mode: "Decrement" }],
      [{ field: "message-type", kind: "dhcp-bootp-mode", mode: "Fixed" }, { dhcp_message_type_mode: "Fixed" }],
      [{ field: "xid", kind: "dhcp-bootp-mode", mode: "Increment" }, { dhcp_xid_mode: "Increment" }],
      [{ field: "flags", kind: "dhcp-bootp-mode", mode: "Random" }, { dhcp_flags_mode: "Random" }],
      [{ count: 8, field: "message-type", kind: "dhcp-bootp-count" }, { dhcp_message_type_count: 8 }],
      [{ field: "flags", kind: "dhcp-bootp-step", step: 4 }, { dhcp_flags_step: 4 }]
    ];

    for (const [action, expected] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(expected);
    }
  });

  it("derives selected-stream patch actions for DHCP BOOTP address controls", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ field: "client-ip", kind: "dhcp-bootp-address-text", value: "0.0.0.0" }, { dhcp_client_ip: "0.0.0.0" }],
      [{ field: "your-ip", kind: "dhcp-bootp-address-text", value: "192.0.2.10" }, { dhcp_your_ip: "192.0.2.10" }],
      [{ field: "server-ip", kind: "dhcp-bootp-address-text", value: "192.0.2.1" }, { dhcp_server_ip: "192.0.2.1" }],
      [{ field: "relay-ip", kind: "dhcp-bootp-address-text", value: "198.51.100.1" }, { dhcp_relay_ip: "198.51.100.1" }],
      [{ field: "client-mac", kind: "dhcp-bootp-address-text", value: "00:de:ad:be:ef:01" }, { dhcp_client_mac: "00:de:ad:be:ef:01" }],
      [{ field: "client-ip", kind: "dhcp-bootp-address-mode", mode: "Increment Host" }, { dhcp_client_ip_mode: "Increment Host" }],
      [{ field: "your-ip", kind: "dhcp-bootp-address-mode", mode: "Decrement Host" }, { dhcp_your_ip_mode: "Decrement Host" }],
      [{ field: "server-ip", kind: "dhcp-bootp-address-mode", mode: "Random Host" }, { dhcp_server_ip_mode: "Random Host" }],
      [{ field: "relay-ip", kind: "dhcp-bootp-address-mode", mode: "Fixed" }, { dhcp_relay_ip_mode: "Fixed" }],
      [{ field: "client-mac", kind: "dhcp-bootp-address-mode", mode: "Increment" }, { dhcp_client_mac_mode: "Increment" }],
      [{ count: 16, field: "client-ip", kind: "dhcp-bootp-address-count" }, { dhcp_client_ip_count: 16 }],
      [{ count: 32, field: "client-mac", kind: "dhcp-bootp-address-count" }, { dhcp_client_mac_count: 32 }],
      [{ field: "server-ip", kind: "dhcp-bootp-address-step", step: 4 }, { dhcp_server_ip_step: 4 }],
      [{ field: "client-mac", kind: "dhcp-bootp-address-step", step: 2 }, { dhcp_client_mac_step: 2 }]
    ];

    for (const [action, expected] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(expected);
    }
  });

  it("derives selected-stream patch actions for DHCP option controls", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ field: "hostname", kind: "dhcp-option-text", value: "trex-host" }, { dhcp_hostname: "trex-host" }],
      [{ field: "parameter-request-list", kind: "dhcp-option-text", value: "1,3,6,15" }, { dhcp_parameter_request_list: "1,3,6,15" }],
      [{ field: "lease-time", kind: "dhcp-option-timer-number", value: 3600 }, { dhcp_lease_time: 3600 }],
      [{ field: "renewal-time", kind: "dhcp-option-timer-number", value: 1800 }, { dhcp_renewal_time: 1800 }],
      [{ field: "rebinding-time", kind: "dhcp-option-timer-number", value: 3150 }, { dhcp_rebinding_time: 3150 }],
      [{ field: "lease-time", kind: "dhcp-option-timer-mode", mode: "Increment" }, { dhcp_lease_time_mode: "Increment" }],
      [{ field: "renewal-time", kind: "dhcp-option-timer-mode", mode: "Decrement" }, { dhcp_renewal_time_mode: "Decrement" }],
      [{ field: "rebinding-time", kind: "dhcp-option-timer-mode", mode: "Random" }, { dhcp_rebinding_time_mode: "Random" }],
      [{ count: 4, field: "lease-time", kind: "dhcp-option-timer-count" }, { dhcp_lease_time_count: 4 }],
      [{ field: "renewal-time", kind: "dhcp-option-timer-step", step: 30 }, { dhcp_renewal_time_step: 30 }],
      [{ field: "requested-ip", kind: "dhcp-option-address-text", value: "10.0.0.10" }, { dhcp_requested_ip: "10.0.0.10" }],
      [{ field: "server-id", kind: "dhcp-option-address-text", value: "10.0.0.1" }, { dhcp_server_id: "10.0.0.1" }],
      [{ field: "requested-ip", kind: "dhcp-option-address-mode", mode: "Increment Host" }, { dhcp_requested_ip_mode: "Increment Host" }],
      [{ field: "server-id", kind: "dhcp-option-address-mode", mode: "Random Host" }, { dhcp_server_id_mode: "Random Host" }],
      [{ count: 8, field: "requested-ip", kind: "dhcp-option-address-count" }, { dhcp_requested_ip_count: 8 }],
      [{ field: "server-id", kind: "dhcp-option-address-step", step: 2 }, { dhcp_server_id_step: 2 }]
    ];

    for (const [action, expected] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(expected);
    }
  });

  it("normalizes MPLS stacked-label selection patches", () => {
    expect(mplsSecondLabelSelectionPatch(true, stream({
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: true,
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    });

    expect(mplsSecondLabelSelectionPatch(false, stream({
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: false,
      mpls_label2_mode: "Fixed",
      mpls_label2_tc_mode: "Fixed",
      mpls_label2_ttl_mode: "Fixed",
      mpls_label3_enabled: false,
      mpls_label3_mode: "Fixed",
      mpls_label3_tc_mode: "Fixed",
      mpls_label3_ttl_mode: "Fixed"
    });

    expect(mplsThirdLabelSelectionPatch(true, stream({
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: true,
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    });

    expect(mplsThirdLabelSelectionPatch(false, stream({
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    }))).toEqual({
      mpls_label2_enabled: true,
      mpls_label3_enabled: false,
      mpls_label3_mode: "Fixed",
      mpls_label3_tc_mode: "Fixed",
      mpls_label3_ttl_mode: "Fixed"
    });
  });

  it("normalizes payload pattern import patches", () => {
    expect(payloadPatternImportPatch("aabb")).toEqual({
      payload_enabled: true,
      payload_pattern: "AABB",
      payload_type: "Fixed Word"
    });

    expect(payloadPatternImportPatch("")).toEqual({
      payload_enabled: true,
      payload_pattern: "00",
      payload_type: "Fixed Word"
    });

    expect(selectedStreamPatch({
      kind: "payload-pattern-import",
      pattern: "ccdd"
    }, null)).toEqual({
      payload_enabled: true,
      payload_pattern: "CCDD",
      payload_type: "Fixed Word"
    });

    expect(selectedStreamPatch({
      kind: "payload-pattern-import",
      pattern: ""
    }, null)).toEqual({
      payload_enabled: true,
      payload_pattern: "00",
      payload_type: "Fixed Word"
    });
  });

  it("normalizes VLAN inner-tag selection patches", () => {
    expect(vlanInnerTagSelectionPatch(true, stream({
      vlan2_id_mode: "Increment",
      vlan2_priority_mode: "Random"
    }))).toEqual({
      vlan2_enabled: true,
      vlan2_id_mode: "Increment",
      vlan2_priority_mode: "Random"
    });

    expect(vlanInnerTagSelectionPatch(false, stream({
      vlan2_id_mode: "Increment",
      vlan2_priority_mode: "Random"
    }))).toEqual({
      vlan2_enabled: false,
      vlan2_id_mode: "Fixed",
      vlan2_priority_mode: "Fixed"
    });
  });

  it("derives L3 protocol selection while preserving the current L4 intent", () => {
    expect(packetTypeForL3Selection("IPv6", stream({
      packet_type: "Ethernet/IPv4/TCP"
    }))).toBe("Ethernet/IPv6/TCP");

    expect(packetTypeForL3Selection("IPv4", stream({
      packet_type: "Ethernet/IPv6/ICMPv6"
    }))).toBe("Ethernet/IPv4/ICMP");

    expect(packetTypeForL3Selection("None", stream({
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe("Ethernet");

    expect(packetTypeForL3Selection("ARP", stream({
      packet_type: "Ethernet/IPv6/SCTP"
    }))).toBe("Ethernet/ARP");
  });

  it("derives L4 protocol selection while preserving the current L3 intent", () => {
    expect(packetTypeForL4Selection("GRE", stream({
      packet_type: "Ethernet/IPv6/UDP"
    }))).toBe("Ethernet/IPv6/GRE");

    expect(packetTypeForL4Selection("None", stream({
      packet_type: "Ethernet/IPv4/TCP"
    }))).toBe("Ethernet/IPv4");

    expect(packetTypeForL4Selection("ICMP", stream({
      packet_type: "Ethernet/IPv6/TCP"
    }))).toBe("Ethernet/IPv6/ICMPv6");
  });

  it("normalizes no-tunnel selection patches", () => {
    expect(tunnelDisabledPatch()).toEqual({
      gtpu_enabled: false,
      gtpu_teid_mode: "Fixed",
      gtpu_sequence_enabled: false,
      gtpu_sequence_mode: "Fixed",
      gtpu_npdu_enabled: false,
      gtpu_npdu_mode: "Fixed",
      gtpu_extension_enabled: false,
      gtpu_extension_udp_port_mode: "Fixed",
      gtpu_inner_ipv4_src_mode: "Fixed",
      gtpu_inner_ipv4_dst_mode: "Fixed",
      gtpu_inner_ipv4_ttl_mode: "Fixed",
      gtpu_inner_ipv6_src_mode: "Fixed",
      gtpu_inner_ipv6_dst_mode: "Fixed",
      gtpu_inner_ipv6_hop_limit_mode: "Fixed",
      gtpu_inner_l4_src_port_mode: "Fixed",
      gtpu_inner_l4_dst_port_mode: "Fixed",
      vxlan_enabled: false
    });
  });

  it("builds mutually exclusive VXLAN and GTP-U selection patches", () => {
    expect(vxlanSelectionPatch(true, stream({
      frame_length: 64,
      frame_length_max: 64,
      gtpu_enabled: true,
      vxlan_inner_ip_version: "IPv6"
    }))).toMatchObject({
      gtpu_enabled: false,
      l4_dst_port: 4789,
      l4_src_port: 1337,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true,
      vxlan_inner_ip_version: "IPv6"
    });

    expect(gtpuSelectionPatch(true, stream({
      frame_length: 64,
      frame_length_max: 64,
      gtpu_inner_ip_version: "IPv6",
      vxlan_enabled: true
    }))).toMatchObject({
      dhcp_enabled: false,
      dns_enabled: false,
      gtpu_enabled: true,
      gtpu_inner_ip_version: "IPv6",
      l4_dst_port: 2152,
      l4_src_port: 2152,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    });
  });

  it("normalizes GTP-U optional-header selection patches", () => {
    expect(gtpuSequenceSelectionPatch(true, stream({
      gtpu_sequence_mode: "Increment"
    }))).toEqual({
      gtpu_sequence_enabled: true,
      gtpu_sequence_mode: "Increment"
    });

    expect(gtpuSequenceSelectionPatch(false, stream({
      gtpu_sequence_mode: "Random"
    }))).toEqual({
      gtpu_sequence_enabled: false,
      gtpu_sequence_mode: "Fixed"
    });

    expect(gtpuNpduSelectionPatch(true, stream({
      gtpu_npdu_mode: "Decrement"
    }))).toEqual({
      gtpu_npdu_enabled: true,
      gtpu_npdu_mode: "Decrement"
    });

    expect(gtpuNpduSelectionPatch(false, stream({
      gtpu_npdu_mode: "Random"
    }))).toEqual({
      gtpu_npdu_enabled: false,
      gtpu_npdu_mode: "Fixed"
    });

    expect(gtpuExtensionSelectionPatch(true, stream({
      gtpu_extension_udp_port_mode: "Increment"
    }))).toEqual({
      gtpu_extension_enabled: true,
      gtpu_extension_udp_port_mode: "Increment"
    });

    expect(gtpuExtensionSelectionPatch(false, stream({
      gtpu_extension_udp_port_mode: "Random"
    }))).toEqual({
      gtpu_extension_enabled: false,
      gtpu_extension_udp_port_mode: "Fixed"
    });
  });

  it("derives selected-stream patch actions for GTP-U protocol data", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-sequence-selection"
    }, stream({
      gtpu_sequence_mode: "Increment"
    }))).toEqual({
      gtpu_sequence_enabled: true,
      gtpu_sequence_mode: "Increment"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "gtpu-sequence-selection"
    }, stream({
      gtpu_sequence_mode: "Random"
    }))).toEqual({
      gtpu_sequence_enabled: false,
      gtpu_sequence_mode: "Fixed"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-npdu-selection"
    }, stream({
      gtpu_npdu_mode: "Decrement"
    }))).toEqual({
      gtpu_npdu_enabled: true,
      gtpu_npdu_mode: "Decrement"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "gtpu-npdu-selection"
    }, stream({
      gtpu_npdu_mode: "Random"
    }))).toEqual({
      gtpu_npdu_enabled: false,
      gtpu_npdu_mode: "Fixed"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-extension-selection"
    }, stream({
      gtpu_extension_udp_port_mode: "Increment"
    }))).toEqual({
      gtpu_extension_enabled: true,
      gtpu_extension_udp_port_mode: "Increment"
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "gtpu-extension-selection"
    }, stream({
      gtpu_extension_udp_port_mode: "Random"
    }))).toEqual({
      gtpu_extension_enabled: false,
      gtpu_extension_udp_port_mode: "Fixed"
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-sequence-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-npdu-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gtpu-extension-selection"
    }, null)).toBeNull();

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ kind: "gtpu-message-type", messageType: 255 }, { gtpu_message_type: 255 }],
      [{ kind: "gtpu-teid", teid: 12345 }, { gtpu_teid: 12345 }],
      [{ kind: "gtpu-teid-mode", mode: "Increment" }, { gtpu_teid_mode: "Increment" }],
      [{ count: 70, kind: "gtpu-teid-count" }, { gtpu_teid_count: 70 }],
      [{ kind: "gtpu-teid-step", step: 8 }, { gtpu_teid_step: 8 }],
      [{ kind: "gtpu-sequence", sequence: 4096 }, { gtpu_sequence: 4096 }],
      [{ kind: "gtpu-sequence-mode", mode: "Random" }, { gtpu_sequence_mode: "Random" }],
      [{ count: 71, kind: "gtpu-sequence-count" }, { gtpu_sequence_count: 71 }],
      [{ kind: "gtpu-sequence-step", step: 9 }, { gtpu_sequence_step: 9 }],
      [{ kind: "gtpu-npdu", npdu: 11 }, { gtpu_npdu: 11 }],
      [{ kind: "gtpu-npdu-mode", mode: "Decrement" }, { gtpu_npdu_mode: "Decrement" }],
      [{ count: 72, kind: "gtpu-npdu-count" }, { gtpu_npdu_count: 72 }],
      [{ kind: "gtpu-npdu-step", step: 10 }, { gtpu_npdu_step: 10 }],
      [{ kind: "gtpu-extension-udp-port", port: 2152 }, { gtpu_extension_udp_port: 2152 }],
      [
        { kind: "gtpu-extension-udp-port-mode", mode: "Increment" },
        { gtpu_extension_udp_port_mode: "Increment" }
      ],
      [
        { count: 73, kind: "gtpu-extension-udp-port-count" },
        { gtpu_extension_udp_port_count: 73 }
      ],
      [
        { kind: "gtpu-extension-udp-port-step", step: 11 },
        { gtpu_extension_udp_port_step: 11 }
      ],
      [{ kind: "gtpu-inner-ipv4-ttl", ttl: 64 }, { gtpu_inner_ipv4_ttl: 64 }],
      [
        { kind: "gtpu-inner-ipv4-ttl-mode", mode: "Increment" },
        { gtpu_inner_ipv4_ttl_mode: "Increment" }
      ],
      [{ count: 74, kind: "gtpu-inner-ipv4-ttl-count" }, { gtpu_inner_ipv4_ttl_count: 74 }],
      [{ kind: "gtpu-inner-ipv4-ttl-step", step: 12 }, { gtpu_inner_ipv4_ttl_step: 12 }],
      [
        { hopLimit: 63, kind: "gtpu-inner-ipv6-hop-limit" },
        { gtpu_inner_ipv6_hop_limit: 63 }
      ],
      [
        { kind: "gtpu-inner-ipv6-hop-limit-mode", mode: "Random" },
        { gtpu_inner_ipv6_hop_limit_mode: "Random" }
      ],
      [
        { count: 75, kind: "gtpu-inner-ipv6-hop-limit-count" },
        { gtpu_inner_ipv6_hop_limit_count: 75 }
      ],
      [
        { kind: "gtpu-inner-ipv6-hop-limit-step", step: 13 },
        { gtpu_inner_ipv6_hop_limit_step: 13 }
      ],
      [
        { address: "172.16.0.10", kind: "gtpu-inner-ipv4-src" },
        { gtpu_inner_ipv4_src: "172.16.0.10" }
      ],
      [
        { kind: "gtpu-inner-ipv4-src-mode", mode: "Increment Host" },
        { gtpu_inner_ipv4_src_mode: "Increment Host" }
      ],
      [{ count: 76, kind: "gtpu-inner-ipv4-src-count" }, { gtpu_inner_ipv4_src_count: 76 }],
      [{ kind: "gtpu-inner-ipv4-src-step", step: 14 }, { gtpu_inner_ipv4_src_step: 14 }],
      [
        { address: "172.16.0.20", kind: "gtpu-inner-ipv4-dst" },
        { gtpu_inner_ipv4_dst: "172.16.0.20" }
      ],
      [
        { kind: "gtpu-inner-ipv4-dst-mode", mode: "Random Host" },
        { gtpu_inner_ipv4_dst_mode: "Random Host" }
      ],
      [{ count: 77, kind: "gtpu-inner-ipv4-dst-count" }, { gtpu_inner_ipv4_dst_count: 77 }],
      [{ kind: "gtpu-inner-ipv4-dst-step", step: 15 }, { gtpu_inner_ipv4_dst_step: 15 }],
      [
        { address: "2001:db8:60::10", kind: "gtpu-inner-ipv6-src" },
        { gtpu_inner_ipv6_src: "2001:db8:60::10" }
      ],
      [
        { kind: "gtpu-inner-ipv6-src-mode", mode: "Increment Host" },
        { gtpu_inner_ipv6_src_mode: "Increment Host" }
      ],
      [{ count: 78, kind: "gtpu-inner-ipv6-src-count" }, { gtpu_inner_ipv6_src_count: 78 }],
      [{ kind: "gtpu-inner-ipv6-src-step", step: 16 }, { gtpu_inner_ipv6_src_step: 16 }],
      [
        { address: "2001:db8:60::20", kind: "gtpu-inner-ipv6-dst" },
        { gtpu_inner_ipv6_dst: "2001:db8:60::20" }
      ],
      [
        { kind: "gtpu-inner-ipv6-dst-mode", mode: "Decrement Host" },
        { gtpu_inner_ipv6_dst_mode: "Decrement Host" }
      ],
      [{ count: 79, kind: "gtpu-inner-ipv6-dst-count" }, { gtpu_inner_ipv6_dst_count: 79 }],
      [{ kind: "gtpu-inner-ipv6-dst-step", step: 17 }, { gtpu_inner_ipv6_dst_step: 17 }],
      [{ kind: "gtpu-inner-l4-src-port", port: 1025 }, { gtpu_inner_l4_src_port: 1025 }],
      [
        { kind: "gtpu-inner-l4-src-port-mode", mode: "Increment" },
        { gtpu_inner_l4_src_port_mode: "Increment" }
      ],
      [
        { count: 80, kind: "gtpu-inner-l4-src-port-count" },
        { gtpu_inner_l4_src_port_count: 80 }
      ],
      [
        { kind: "gtpu-inner-l4-src-port-step", step: 18 },
        { gtpu_inner_l4_src_port_step: 18 }
      ],
      [{ kind: "gtpu-inner-l4-dst-port", port: 2048 }, { gtpu_inner_l4_dst_port: 2048 }],
      [
        { kind: "gtpu-inner-l4-dst-port-mode", mode: "Random" },
        { gtpu_inner_l4_dst_port_mode: "Random" }
      ],
      [
        { count: 81, kind: "gtpu-inner-l4-dst-port-count" },
        { gtpu_inner_l4_dst_port_count: 81 }
      ],
      [
        { kind: "gtpu-inner-l4-dst-port-step", step: 19 },
        { gtpu_inner_l4_dst_port_step: 19 }
      ]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("normalizes TCP option selection patches", () => {
    expect(tcpOptionSelectionPatch("mss", true)).toEqual({
      tcp_option_mss_enabled: true
    });
    expect(tcpOptionSelectionPatch("window-scale", false)).toEqual({
      tcp_option_window_scale_enabled: false
    });
    expect(tcpOptionSelectionPatch("sack-permitted", true)).toEqual({
      tcp_option_sack_permitted_enabled: true
    });
    expect(tcpOptionSelectionPatch("sack-block", false)).toEqual({
      tcp_option_sack_blocks_enabled: false
    });
    expect(tcpOptionSelectionPatch("timestamp", true)).toEqual({
      tcp_option_timestamp_enabled: true
    });
  });

  it("derives selected-stream patch actions for TCP option controls", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "tcp-option-selection",
      option: "mss"
    }, null)).toEqual({ tcp_option_mss_enabled: true });
    expect(selectedStreamPatch({
      enabled: false,
      kind: "tcp-option-selection",
      option: "sack-block"
    }, null)).toEqual({ tcp_option_sack_blocks_enabled: false });
    expect(selectedStreamPatch({
      field: "mss",
      kind: "tcp-option-number",
      value: 1460
    }, null)).toEqual({ tcp_option_mss: 1460 });
    expect(selectedStreamPatch({
      field: "window-scale",
      kind: "tcp-option-mode",
      mode: "Random"
    }, null)).toEqual({ tcp_option_window_scale_mode: "Random" });
    expect(selectedStreamPatch({
      count: 16,
      field: "sack-left-edge",
      kind: "tcp-option-count"
    }, null)).toEqual({ tcp_option_sack_left_edge_count: 16 });
    expect(selectedStreamPatch({
      field: "sack-right-edge",
      kind: "tcp-option-step",
      step: 8
    }, null)).toEqual({ tcp_option_sack_right_edge_step: 8 });
    expect(selectedStreamPatch({
      field: "timestamp-value",
      kind: "tcp-option-number",
      value: 123456
    }, null)).toEqual({ tcp_option_timestamp_value: 123456 });
    expect(selectedStreamPatch({
      field: "timestamp-echo",
      kind: "tcp-option-mode",
      mode: "Increment"
    }, null)).toEqual({ tcp_option_timestamp_echo_mode: "Increment" });
    expect(selectedStreamPatch({
      count: 64,
      field: "timestamp-echo",
      kind: "tcp-option-count"
    }, null)).toEqual({ tcp_option_timestamp_echo_count: 64 });
    expect(selectedStreamPatch({
      field: "timestamp-value",
      kind: "tcp-option-step",
      step: 4
    }, null)).toEqual({ tcp_option_timestamp_value_step: 4 });
  });

  it("normalizes SCTP checksum-coupled mode patches", () => {
    expect(sctpChecksumCoupledModePatch("sctp_tsn_mode", "Increment", stream({
      sctp_checksum: "12345678",
      sctp_checksum_override: false
    }))).toEqual({
      sctp_checksum: "00000000",
      sctp_checksum_override: true,
      sctp_tsn_mode: "Increment"
    });

    expect(sctpChecksumCoupledModePatch("sctp_payload_protocol_id_mode", "Fixed", stream({
      sctp_checksum: "12345678",
      sctp_checksum_override: false
    }))).toEqual({
      sctp_checksum: "12345678",
      sctp_checksum_override: false,
      sctp_payload_protocol_id_mode: "Fixed"
    });
  });

  it("creates selected-stream actions for SCTP controls", () => {
    expect(sctpNumberAction("verification-tag", 12345)).toEqual({
      field: "verification-tag",
      kind: "sctp-number",
      value: 12345
    });
    expect(sctpModeAction("data-flags", "Increment")).toEqual({
      field: "data-flags",
      kind: "sctp-mode",
      mode: "Increment"
    });
    expect(sctpCountAction("tsn", 64)).toEqual({
      count: 64,
      field: "tsn",
      kind: "sctp-count"
    });
    expect(sctpStepAction("stream-id", 2)).toEqual({
      field: "stream-id",
      kind: "sctp-step",
      step: 2
    });
    expect(sctpChecksumOverrideAction(true)).toEqual({
      kind: "sctp-checksum-override",
      override: true
    });
    expect(sctpChecksumAction("DEADBEEF")).toEqual({
      checksum: "DEADBEEF",
      kind: "sctp-checksum"
    });
  });

  it("creates selected-stream actions for TCP controls", () => {
    expect(tcpCoreNumberAction("sequence", 12345)).toEqual({
      field: "sequence",
      kind: "tcp-core-number",
      value: 12345
    });
    expect(tcpCoreModeAction("acknowledge", "Increment")).toEqual({
      field: "acknowledge",
      kind: "tcp-core-mode",
      mode: "Increment"
    });
    expect(tcpCoreCountAction("checksum", 64)).toEqual({
      count: 64,
      field: "checksum",
      kind: "tcp-core-count"
    });
    expect(tcpCoreStepAction("flags", 2)).toEqual({
      field: "flags",
      kind: "tcp-core-step",
      step: 2
    });
    expect(tcpChecksumOverrideAction(true)).toEqual({
      kind: "tcp-checksum-override",
      override: true
    });
    expect(tcpChecksumAction("BEEF")).toEqual({
      checksum: "BEEF",
      kind: "tcp-checksum"
    });
    expect(tcpFlagAction("tcp_flag_syn", true)).toEqual({
      checked: true,
      flag: "tcp_flag_syn",
      kind: "tcp-flag"
    });
    expect(tcpOptionSelectionAction("timestamp", true)).toEqual({
      enabled: true,
      kind: "tcp-option-selection",
      option: "timestamp"
    });
    expect(tcpOptionNumberAction("mss", 1460)).toEqual({
      field: "mss",
      kind: "tcp-option-number",
      value: 1460
    });
    expect(tcpOptionModeAction("window-scale", "Increment")).toEqual({
      field: "window-scale",
      kind: "tcp-option-mode",
      mode: "Increment"
    });
    expect(tcpOptionCountAction("sack-left-edge", 16)).toEqual({
      count: 16,
      field: "sack-left-edge",
      kind: "tcp-option-count"
    });
    expect(tcpOptionStepAction("timestamp-echo", 4)).toEqual({
      field: "timestamp-echo",
      kind: "tcp-option-step",
      step: 4
    });
  });

  it("derives selected-stream patch actions for SCTP controls", () => {
    expect(selectedStreamPatch({
      field: "verification-tag",
      kind: "sctp-number",
      value: 12345
    }, null)).toEqual({ sctp_verification_tag: 12345 });
    expect(selectedStreamPatch({
      field: "data-flags",
      kind: "sctp-number",
      value: 3
    }, null)).toEqual({ sctp_data_flags: 3 });
    expect(selectedStreamPatch({
      field: "tsn",
      kind: "sctp-count",
      count: 64
    }, null)).toEqual({ sctp_tsn_count: 64 });
    expect(selectedStreamPatch({
      field: "stream-id",
      kind: "sctp-step",
      step: 2
    }, null)).toEqual({ sctp_stream_id_step: 2 });
    expect(selectedStreamPatch({
      field: "stream-sequence",
      kind: "sctp-count",
      count: 16
    }, null)).toEqual({ sctp_stream_sequence_count: 16 });
    expect(selectedStreamPatch({
      field: "payload-protocol-id",
      kind: "sctp-step",
      step: 4
    }, null)).toEqual({ sctp_payload_protocol_id_step: 4 });
    expect(selectedStreamPatch({
      kind: "sctp-checksum-override",
      override: true
    }, null)).toEqual({ sctp_checksum_override: true });
    expect(selectedStreamPatch({
      checksum: "DEADBEEF",
      kind: "sctp-checksum"
    }, null)).toEqual({ sctp_checksum: "DEADBEEF" });
    expect(selectedStreamPatch({
      field: "tsn",
      kind: "sctp-mode",
      mode: "Increment"
    }, stream({
      sctp_checksum: "12345678",
      sctp_checksum_override: false
    }))).toEqual({
      sctp_checksum: "00000000",
      sctp_checksum_override: true,
      sctp_tsn_mode: "Increment"
    });
    expect(selectedStreamPatch({
      field: "payload-protocol-id",
      kind: "sctp-mode",
      mode: "Fixed"
    }, stream({
      sctp_checksum: "12345678",
      sctp_checksum_override: false
    }))).toEqual({
      sctp_checksum: "12345678",
      sctp_checksum_override: false,
      sctp_payload_protocol_id_mode: "Fixed"
    });
    expect(selectedStreamPatch({
      field: "stream-id",
      kind: "sctp-mode",
      mode: "Increment"
    }, null)).toBeNull();
  });

  it("derives selected-stream patch actions for TCP core controls", () => {
    expect(selectedStreamPatch({
      field: "sequence",
      kind: "tcp-core-number",
      value: 12345
    }, null)).toEqual({ tcp_sequence_number: 12345 });
    expect(selectedStreamPatch({
      field: "acknowledge",
      kind: "tcp-core-number",
      value: 67890
    }, null)).toEqual({ tcp_ack_number: 67890 });
    expect(selectedStreamPatch({
      field: "window",
      kind: "tcp-core-mode",
      mode: "Random"
    }, null)).toEqual({ tcp_window_mode: "Random" });
    expect(selectedStreamPatch({
      count: 32,
      field: "checksum",
      kind: "tcp-core-count"
    }, null)).toEqual({ tcp_checksum_count: 32 });
    expect(selectedStreamPatch({
      field: "urgent-pointer",
      kind: "tcp-core-step",
      step: 4
    }, null)).toEqual({ tcp_urgent_pointer_step: 4 });
    expect(selectedStreamPatch({
      field: "flags",
      kind: "tcp-core-count",
      count: 8
    }, null)).toEqual({ tcp_flags_count: 8 });
    expect(selectedStreamPatch({
      field: "flags",
      kind: "tcp-core-step",
      step: 2
    }, null)).toEqual({ tcp_flags_step: 2 });
    expect(selectedStreamPatch({
      kind: "tcp-checksum-override",
      override: true
    }, null)).toEqual({ tcp_checksum_override: true });
    expect(selectedStreamPatch({
      checksum: "BEEF",
      kind: "tcp-checksum"
    }, null)).toEqual({ tcp_checksum: "BEEF" });
    expect(selectedStreamPatch({
      checked: true,
      flag: "tcp_flag_syn",
      kind: "tcp-flag"
    }, null)).toEqual({ tcp_flag_syn: true });
  });

  it("normalizes ICMP checksum-coupled mode patches", () => {
    expect(icmpChecksumCoupledModePatch("icmp_type_mode", "Increment", stream({
      icmp_checksum_override: true
    }))).toEqual({
      icmp_checksum_override: false,
      icmp_type_mode: "Increment"
    });

    expect(icmpChecksumCoupledModePatch("icmp_sequence_mode", "Fixed", stream({
      icmp_checksum_override: true
    }))).toEqual({
      icmp_checksum_override: true,
      icmp_sequence_mode: "Fixed"
    });
  });

  it("normalizes GRE checksum and optional-field selection patches", () => {
    expect(greChecksumSelectionPatch(true, stream({
      frame_length: 64,
      gre_checksum_override: true
    }))).toEqual({
      frame_length: 100,
      gre_checksum_override: true,
      gre_checksum_present: true
    });

    expect(greChecksumSelectionPatch(false, stream({
      frame_length: 128,
      gre_checksum_override: true
    }))).toEqual({
      frame_length: 128,
      gre_checksum_override: false,
      gre_checksum_present: false
    });

    expect(greKeySelectionPatch(false, stream({
      frame_length: 64,
      gre_key_mode: "Increment"
    }))).toEqual({
      frame_length: 96,
      gre_key_mode: "Fixed",
      gre_key_present: false
    });

    expect(greSequenceSelectionPatch(true, stream({
      frame_length: 128,
      gre_sequence_mode: "Increment"
    }))).toEqual({
      frame_length: 128,
      gre_sequence_mode: "Increment",
      gre_sequence_present: true
    });
  });

  it("creates selected-stream actions for GRE top fields", () => {
    expect(greChecksumSelectionAction(true)).toEqual({
      enabled: true,
      kind: "gre-checksum-selection"
    });
    expect(greChecksumOverrideAction(false)).toEqual({
      enabled: false,
      kind: "gre-checksum-override"
    });
    expect(greChecksumAction("BEEF")).toEqual({
      checksum: "BEEF",
      kind: "gre-checksum"
    });
    expect(greKeySelectionAction(true)).toEqual({
      enabled: true,
      kind: "gre-key-selection"
    });
    expect(greKeyAction(12345)).toEqual({
      key: 12345,
      kind: "gre-key"
    });
    expect(greKeyModeAction("Increment")).toEqual({
      kind: "gre-key-mode",
      mode: "Increment"
    });
    expect(greKeyCountAction(64)).toEqual({
      count: 64,
      kind: "gre-key-count"
    });
    expect(greKeyStepAction(8)).toEqual({
      kind: "gre-key-step",
      step: 8
    });
    expect(greSequenceSelectionAction(false)).toEqual({
      enabled: false,
      kind: "gre-sequence-selection"
    });
    expect(greSequenceAction(4096)).toEqual({
      kind: "gre-sequence",
      sequence: 4096
    });
    expect(greSequenceModeAction("Random")).toEqual({
      kind: "gre-sequence-mode",
      mode: "Random"
    });
    expect(greSequenceCountAction(65)).toEqual({
      count: 65,
      kind: "gre-sequence-count"
    });
    expect(greSequenceStepAction(9)).toEqual({
      kind: "gre-sequence-step",
      step: 9
    });
  });

  it("derives selected-stream patch actions for GRE top fields", () => {
    expect(selectedStreamPatch({
      enabled: true,
      kind: "gre-checksum-selection"
    }, stream({
      frame_length: 64,
      gre_checksum_override: true
    }))).toEqual({
      frame_length: 100,
      gre_checksum_override: true,
      gre_checksum_present: true
    });

    expect(selectedStreamPatch({
      enabled: false,
      kind: "gre-key-selection"
    }, stream({
      frame_length: 64,
      gre_key_mode: "Increment"
    }))).toEqual({
      frame_length: 96,
      gre_key_mode: "Fixed",
      gre_key_present: false
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gre-sequence-selection"
    }, stream({
      frame_length: 128,
      gre_sequence_mode: "Increment"
    }))).toEqual({
      frame_length: 128,
      gre_sequence_mode: "Increment",
      gre_sequence_present: true
    });

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gre-checksum-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gre-key-selection"
    }, null)).toBeNull();

    expect(selectedStreamPatch({
      enabled: true,
      kind: "gre-sequence-selection"
    }, null)).toBeNull();

    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [{ enabled: true, kind: "gre-checksum-override" }, { gre_checksum_override: true }],
      [{ checksum: "BEEF", kind: "gre-checksum" }, { gre_checksum: "BEEF" }],
      [{ key: 12345, kind: "gre-key" }, { gre_key: 12345 }],
      [
        { kind: "gre-key-mode", mode: "Increment" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_key_mode: "Increment",
          gre_key_present: true
        }
      ],
      [{ count: 64, kind: "gre-key-count" }, { gre_key_count: 64 }],
      [{ kind: "gre-key-step", step: 8 }, { gre_key_step: 8 }],
      [{ kind: "gre-sequence", sequence: 4096 }, { gre_sequence: 4096 }],
      [
        { kind: "gre-sequence-mode", mode: "Random" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_sequence_mode: "Random",
          gre_sequence_present: true
        }
      ],
      [{ count: 65, kind: "gre-sequence-count" }, { gre_sequence_count: 65 }],
      [{ kind: "gre-sequence-step", step: 9 }, { gre_sequence_step: 9 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("creates selected-stream actions for GRE inner IPv6 fields", () => {
    expect(greInnerIpv6SourceAction("2001:db8:70::10")).toEqual({
      address: "2001:db8:70::10",
      kind: "gre-inner-ipv6-src"
    });
    expect(greInnerIpv6SourceModeAction("Increment Host")).toEqual({
      kind: "gre-inner-ipv6-src-mode",
      mode: "Increment Host"
    });
    expect(greInnerIpv6SourceCountAction(66)).toEqual({
      count: 66,
      kind: "gre-inner-ipv6-src-count"
    });
    expect(greInnerIpv6SourceStepAction(10)).toEqual({
      kind: "gre-inner-ipv6-src-step",
      step: 10
    });
    expect(greInnerIpv6DestinationAction("2001:db8:70::20")).toEqual({
      address: "2001:db8:70::20",
      kind: "gre-inner-ipv6-dst"
    });
    expect(greInnerIpv6DestinationModeAction("Decrement Host")).toEqual({
      kind: "gre-inner-ipv6-dst-mode",
      mode: "Decrement Host"
    });
    expect(greInnerIpv6DestinationCountAction(67)).toEqual({
      count: 67,
      kind: "gre-inner-ipv6-dst-count"
    });
    expect(greInnerIpv6DestinationStepAction(11)).toEqual({
      kind: "gre-inner-ipv6-dst-step",
      step: 11
    });
    expect(greInnerIpv6HopLimitAction(63)).toEqual({
      hopLimit: 63,
      kind: "gre-inner-ipv6-hop-limit"
    });
    expect(greInnerIpv6HopLimitModeAction("Random")).toEqual({
      kind: "gre-inner-ipv6-hop-limit-mode",
      mode: "Random"
    });
    expect(greInnerIpv6HopLimitCountAction(68)).toEqual({
      count: 68,
      kind: "gre-inner-ipv6-hop-limit-count"
    });
    expect(greInnerIpv6HopLimitStepAction(12)).toEqual({
      kind: "gre-inner-ipv6-hop-limit-step",
      step: 12
    });
  });

  it("creates selected-stream actions for GRE inner IPv4 fields", () => {
    expect(greInnerIpv4SourceAction("172.18.0.10")).toEqual({
      address: "172.18.0.10",
      kind: "gre-inner-ipv4-src"
    });
    expect(greInnerIpv4SourceModeAction("Increment Host")).toEqual({
      kind: "gre-inner-ipv4-src-mode",
      mode: "Increment Host"
    });
    expect(greInnerIpv4SourceCountAction(69)).toEqual({
      count: 69,
      kind: "gre-inner-ipv4-src-count"
    });
    expect(greInnerIpv4SourceStepAction(13)).toEqual({
      kind: "gre-inner-ipv4-src-step",
      step: 13
    });
    expect(greInnerIpv4DestinationAction("172.18.0.20")).toEqual({
      address: "172.18.0.20",
      kind: "gre-inner-ipv4-dst"
    });
    expect(greInnerIpv4DestinationModeAction("Random Host")).toEqual({
      kind: "gre-inner-ipv4-dst-mode",
      mode: "Random Host"
    });
    expect(greInnerIpv4DestinationCountAction(70)).toEqual({
      count: 70,
      kind: "gre-inner-ipv4-dst-count"
    });
    expect(greInnerIpv4DestinationStepAction(14)).toEqual({
      kind: "gre-inner-ipv4-dst-step",
      step: 14
    });
    expect(greInnerIpv4TtlAction(64)).toEqual({
      kind: "gre-inner-ipv4-ttl",
      ttl: 64
    });
    expect(greInnerIpv4TtlModeAction("Increment")).toEqual({
      kind: "gre-inner-ipv4-ttl-mode",
      mode: "Increment"
    });
    expect(greInnerIpv4TtlCountAction(71)).toEqual({
      count: 71,
      kind: "gre-inner-ipv4-ttl-count"
    });
    expect(greInnerIpv4TtlStepAction(15)).toEqual({
      kind: "gre-inner-ipv4-ttl-step",
      step: 15
    });
  });

  it("creates selected-stream actions for GRE inner L4 port fields", () => {
    expect(greInnerL4SourcePortAction(1025)).toEqual({
      kind: "gre-inner-l4-src-port",
      port: 1025
    });
    expect(greInnerL4SourcePortModeAction("Increment")).toEqual({
      kind: "gre-inner-l4-src-port-mode",
      mode: "Increment"
    });
    expect(greInnerL4SourcePortCountAction(72)).toEqual({
      count: 72,
      kind: "gre-inner-l4-src-port-count"
    });
    expect(greInnerL4SourcePortStepAction(16)).toEqual({
      kind: "gre-inner-l4-src-port-step",
      step: 16
    });
    expect(greInnerL4DestinationPortAction(2048)).toEqual({
      kind: "gre-inner-l4-dst-port",
      port: 2048
    });
    expect(greInnerL4DestinationPortModeAction("Random")).toEqual({
      kind: "gre-inner-l4-dst-port-mode",
      mode: "Random"
    });
    expect(greInnerL4DestinationPortCountAction(73)).toEqual({
      count: 73,
      kind: "gre-inner-l4-dst-port-count"
    });
    expect(greInnerL4DestinationPortStepAction(17)).toEqual({
      kind: "gre-inner-l4-dst-port-step",
      step: 17
    });
  });

  it("derives selected-stream patch actions for GRE inner fields", () => {
    const cases: Array<[Parameters<typeof selectedStreamPatch>[0], unknown]> = [
      [
        { address: "2001:db8:70::10", kind: "gre-inner-ipv6-src" },
        { gre_inner_ipv6_src: "2001:db8:70::10" }
      ],
      [
        { kind: "gre-inner-ipv6-src-mode", mode: "Increment Host" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_ipv6_src_mode: "Increment Host"
        }
      ],
      [{ count: 66, kind: "gre-inner-ipv6-src-count" }, { gre_inner_ipv6_src_count: 66 }],
      [{ kind: "gre-inner-ipv6-src-step", step: 10 }, { gre_inner_ipv6_src_step: 10 }],
      [
        { address: "2001:db8:70::20", kind: "gre-inner-ipv6-dst" },
        { gre_inner_ipv6_dst: "2001:db8:70::20" }
      ],
      [
        { kind: "gre-inner-ipv6-dst-mode", mode: "Decrement Host" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_ipv6_dst_mode: "Decrement Host"
        }
      ],
      [{ count: 67, kind: "gre-inner-ipv6-dst-count" }, { gre_inner_ipv6_dst_count: 67 }],
      [{ kind: "gre-inner-ipv6-dst-step", step: 11 }, { gre_inner_ipv6_dst_step: 11 }],
      [
        { hopLimit: 63, kind: "gre-inner-ipv6-hop-limit" },
        { gre_inner_ipv6_hop_limit: 63 }
      ],
      [
        { kind: "gre-inner-ipv6-hop-limit-mode", mode: "Random" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_ipv6_hop_limit_mode: "Random"
        }
      ],
      [
        { count: 68, kind: "gre-inner-ipv6-hop-limit-count" },
        { gre_inner_ipv6_hop_limit_count: 68 }
      ],
      [
        { kind: "gre-inner-ipv6-hop-limit-step", step: 12 },
        { gre_inner_ipv6_hop_limit_step: 12 }
      ],
      [
        { address: "172.18.0.10", kind: "gre-inner-ipv4-src" },
        { gre_inner_ipv4_src: "172.18.0.10" }
      ],
      [
        { kind: "gre-inner-ipv4-src-mode", mode: "Increment Host" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_ipv4_src_mode: "Increment Host"
        }
      ],
      [{ count: 69, kind: "gre-inner-ipv4-src-count" }, { gre_inner_ipv4_src_count: 69 }],
      [{ kind: "gre-inner-ipv4-src-step", step: 13 }, { gre_inner_ipv4_src_step: 13 }],
      [
        { address: "172.18.0.20", kind: "gre-inner-ipv4-dst" },
        { gre_inner_ipv4_dst: "172.18.0.20" }
      ],
      [
        { kind: "gre-inner-ipv4-dst-mode", mode: "Random Host" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_ipv4_dst_mode: "Random Host"
        }
      ],
      [{ count: 70, kind: "gre-inner-ipv4-dst-count" }, { gre_inner_ipv4_dst_count: 70 }],
      [{ kind: "gre-inner-ipv4-dst-step", step: 14 }, { gre_inner_ipv4_dst_step: 14 }],
      [{ kind: "gre-inner-ipv4-ttl", ttl: 64 }, { gre_inner_ipv4_ttl: 64 }],
      [
        { kind: "gre-inner-ipv4-ttl-mode", mode: "Increment" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_ipv4_ttl_mode: "Increment"
        }
      ],
      [{ count: 71, kind: "gre-inner-ipv4-ttl-count" }, { gre_inner_ipv4_ttl_count: 71 }],
      [{ kind: "gre-inner-ipv4-ttl-step", step: 15 }, { gre_inner_ipv4_ttl_step: 15 }],
      [{ kind: "gre-inner-l4-src-port", port: 1025 }, { gre_inner_l4_src_port: 1025 }],
      [
        { kind: "gre-inner-l4-src-port-mode", mode: "Increment" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_l4_src_port_mode: "Increment"
        }
      ],
      [{ count: 72, kind: "gre-inner-l4-src-port-count" }, { gre_inner_l4_src_port_count: 72 }],
      [{ kind: "gre-inner-l4-src-port-step", step: 16 }, { gre_inner_l4_src_port_step: 16 }],
      [{ kind: "gre-inner-l4-dst-port", port: 2048 }, { gre_inner_l4_dst_port: 2048 }],
      [
        { kind: "gre-inner-l4-dst-port-mode", mode: "Random" },
        {
          gre_checksum_override: false,
          gre_checksum_present: false,
          gre_inner_l4_dst_port_mode: "Random"
        }
      ],
      [{ count: 73, kind: "gre-inner-l4-dst-port-count" }, { gre_inner_l4_dst_port_count: 73 }],
      [{ kind: "gre-inner-l4-dst-port-step", step: 17 }, { gre_inner_l4_dst_port_step: 17 }]
    ];

    for (const [action, patch] of cases) {
      expect(selectedStreamPatch(action, null)).toEqual(patch);
    }
  });

  it("normalizes GRE checksum invalidating mode patches", () => {
    expect(greChecksumInvalidatingModePatch("gre_key_mode", "Increment", "gre_key_present")).toEqual({
      gre_checksum_override: false,
      gre_checksum_present: false,
      gre_key_mode: "Increment",
      gre_key_present: true
    });

    expect(greChecksumInvalidatingModePatch("gre_inner_l4_dst_port_mode", "Decrement")).toEqual({
      gre_checksum_override: false,
      gre_checksum_present: false,
      gre_inner_l4_dst_port_mode: "Decrement"
    });
  });

  it("resets inactive inner IP mode families when tunnel IP version changes", () => {
    expect(vxlanInnerIpVersionPatch("IPv6", stream({
      frame_length: 64,
      frame_length_max: 64
    }))).toMatchObject({
      vxlan_inner_ip_version: "IPv6",
      vxlan_inner_ipv4_dst_mode: "Fixed",
      vxlan_inner_ipv4_src_mode: "Fixed",
      vxlan_inner_ipv4_ttl_mode: "Fixed"
    });

    expect(gtpuInnerIpVersionPatch("IPv4", stream({
      frame_length: 120,
      frame_length_max: 120
    }))).toMatchObject({
      gtpu_inner_ip_version: "IPv4",
      gtpu_inner_ipv6_dst_mode: "Fixed",
      gtpu_inner_ipv6_hop_limit_mode: "Fixed",
      gtpu_inner_ipv6_src_mode: "Fixed"
    });

    expect(greInnerIpVersionPatch("IPv6", stream({
      frame_length: 64,
      gre_inner_ipv4_dst_mode: "Increment Host",
      gre_inner_ipv4_src_mode: "Increment Host",
      gre_inner_ipv4_ttl_mode: "Increment",
      gre_inner_ipv6_dst_mode: "Decrement Host",
      gre_inner_ipv6_hop_limit_mode: "Increment",
      gre_inner_ipv6_src_mode: "Increment Host"
    }))).toEqual({
      frame_length: 90,
      gre_inner_ip_version: "IPv6",
      gre_inner_ipv4_dst_mode: "Fixed",
      gre_inner_ipv4_src_mode: "Fixed",
      gre_inner_ipv4_ttl_mode: "Fixed",
      gre_inner_ipv6_dst_mode: "Decrement Host",
      gre_inner_ipv6_hop_limit_mode: "Increment",
      gre_inner_ipv6_src_mode: "Increment Host",
      gre_protocol_type: "86DD"
    });

    expect(greInnerIpVersionPatch("IPv4", stream({
      frame_length: 128,
      gre_inner_ipv4_dst_mode: "Decrement Host",
      gre_inner_ipv4_src_mode: "Increment Host",
      gre_inner_ipv4_ttl_mode: "Increment",
      gre_inner_ipv6_dst_mode: "Decrement Host",
      gre_inner_ipv6_hop_limit_mode: "Increment",
      gre_inner_ipv6_src_mode: "Increment Host"
    }))).toEqual({
      frame_length: 128,
      gre_inner_ip_version: "IPv4",
      gre_inner_ipv4_dst_mode: "Decrement Host",
      gre_inner_ipv4_src_mode: "Increment Host",
      gre_inner_ipv4_ttl_mode: "Increment",
      gre_inner_ipv6_dst_mode: "Fixed",
      gre_inner_ipv6_hop_limit_mode: "Fixed",
      gre_inner_ipv6_src_mode: "Fixed",
      gre_protocol_type: "0800"
    });
  });
});
