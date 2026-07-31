import { ListStart, Play } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  arpProtocolViewModel,
  dhcpProtocolViewModel,
  dnsProtocolViewModel,
  ethernetProtocolViewModel,
  greProtocolViewModel,
  gtpuProtocolViewModel,
  hasDynamicSctpDataField,
  icmpProtocolViewModel,
  icmpv6NdProtocolViewModel,
  icmpv6RaProtocolViewModel,
  icmpv6RsProtocolViewModel,
  isSctpChecksumLocked,
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
import {
  PAYLOAD_PATTERN_MAX_HEX_CHARS,
  compactPayloadPattern,
  payloadPatternFileImportAction,
  payloadPatternFileImportResult,
  payloadPatternFileReadErrorAction,
  payloadPatternImportError,
  runPayloadPatternFileImportAction
} from "./payloadPatternModel";
import {
  defaultPcapImportOptions,
  pcapImportEditorViewModel,
  pcapImportFileAction,
  pcapImportCountValue,
  pcapImportIpgValue,
  pcapImportLoopCountValue,
  pcapImportOptionsPatch,
  pcapImportOptionsUpdater,
  pcapImportRateLabel,
  pcapImportRewriteLabel,
  pcapImportSpeedupValue,
  pcapImportSummaryItems,
  pcapImportSummaryLabels,
  runPcapImportFileAction
} from "./pcapImportModel";
import {
  profileDeclaredTunables,
  profileRuntimeBarViewModel,
  profileRuntimeCommandPanelViewModel,
  profileRuntimeCommandStatusViewModel,
  profileRuntimeFacts,
  profileRuntimePanels,
  profileRuntimeReadinessRows,
  profileRuntimeReadinessViewModel,
  profileRuntimeStartButtons,
  profileRuntimeTunablesViewModel,
  runProfileWorkbarNameChange,
  runProfileRuntimeStartAction,
  runProfileTunablesBarRowChange,
  profileTunablesBarRowDraftPatch,
  profileTunablesBarRows,
  profileTunablesCustomDraftPatch,
  profileTunablesCustomRows,
  profileTunablesDraftFieldPatch,
  profileTunablesExtraRow,
  profileTunablesShowsShortcut,
  profileTunablesShortcutRows,
  profileTunablesViewModel,
  profileWorkbarViewModel,
  profileWorkspaceModeViewModel,
  profileWorkspaceStatus,
  runtimeProfilePanelViewModel
} from "./profileRuntimeModel";
import { presentLabel } from "./streamSummaryModel";
import {
  advancedSettingsPanelViewModel,
  advancedSettingsViewModel,
  afterStreamViewModel,
  payloadSettingsViewModel,
  protocolSelectionViewModel,
  streamFrameLengthViewModel,
  streamPropertiesViewModel
} from "./streamSettingsModel";
import type { ProfileRecord, ProfileWorkbenchStream } from "../../../api";
import type { ProfileTunablesDraft } from "../profileTunables";

describe("trafficProfiles model payload helpers", () => {
  it("compacts payload pattern text copied from hex editors", () => {
    expect(compactPayloadPattern("0xA1, b2:c3 | d4_ e5-f6")).toBe("A1b2c3d4e5f6");
  });

  it("locks SCTP checksum editing when dependent SCTP fields are dynamic", () => {
    const fixedSctp = {
      l4_dst_port_mode: "Fixed",
      l4_src_port_mode: "Fixed",
      sctp_data_flags_mode: "Fixed",
      sctp_payload_protocol_id_mode: "Fixed",
      sctp_stream_id_mode: "Fixed",
      sctp_stream_sequence_mode: "Fixed",
      sctp_tsn_mode: "Fixed",
      sctp_verification_tag_mode: "Fixed"
    } as ProfileWorkbenchStream;

    expect(hasDynamicSctpDataField(fixedSctp)).toBe(false);
    expect(isSctpChecksumLocked(fixedSctp)).toBe(false);
    expect(hasDynamicSctpDataField({ ...fixedSctp, sctp_tsn_mode: "Increment" })).toBe(true);
    expect(isSctpChecksumLocked({ ...fixedSctp, sctp_tsn_mode: "Increment" })).toBe(true);
    expect(isSctpChecksumLocked({ ...fixedSctp, l4_src_port_mode: "Random" })).toBe(true);
  });

  it("builds DNS query and answer control state", () => {
    const baseStream = {
      dhcp_enabled: false,
      dns_answer_enabled: true,
      dns_answer_ipv4: "192.0.2.10",
      dns_answer_ipv4_count: 6,
      dns_answer_ipv4_mode: "Fixed",
      dns_answer_ipv4_step: 2,
      dns_answer_ttl: 300,
      dns_answer_ttl_count: 5,
      dns_answer_ttl_mode: "Fixed",
      dns_answer_ttl_step: 1,
      dns_enabled: true,
      dns_flags: "0100",
      dns_flags_count: 7,
      dns_flags_mode: "Fixed",
      dns_flags_step: 4,
      dns_query_class: 1,
      dns_query_class_count: 8,
      dns_query_class_mode: "Fixed",
      dns_query_class_step: 5,
      dns_query_name: "example.com",
      dns_query_type: 1,
      dns_query_type_count: 9,
      dns_query_type_mode: "Fixed",
      dns_query_type_step: 6,
      dns_transaction_id: 4660,
      dns_transaction_id_count: 10,
      dns_transaction_id_mode: "Fixed",
      dns_transaction_id_step: 7,
      gtpu_enabled: false,
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(dnsProtocolViewModel(baseStream)).toEqual({
      answerEnabledChecked: true,
      answerEnabledDisabled: false,
      answerIpv4: {
        countDisabled: true,
        countValue: "6",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        stepDisabled: true,
        stepValue: "2",
        value: "192.0.2.10",
        valueDisabled: false
      },
      answerTtl: {
        countDisabled: true,
        countValue: "5",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "300",
        valueDisabled: false
      },
      flags: {
        countDisabled: true,
        countValue: "7",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "4",
        value: "0100",
        valueDisabled: false
      },
      queryClass: {
        countDisabled: true,
        countValue: "8",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "5",
        value: "1",
        valueDisabled: false
      },
      queryEnabledChecked: true,
      queryEnabledDisabled: false,
      queryNameDisabled: false,
      queryNameValue: "example.com",
      queryType: {
        countDisabled: true,
        countValue: "9",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "6",
        value: "1",
        valueDisabled: false
      },
      transactionId: {
        countDisabled: true,
        countValue: "10",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "7",
        value: "4660",
        valueDisabled: false
      }
    });

    expect(dnsProtocolViewModel({
      ...baseStream,
      dns_enabled: false,
      gtpu_enabled: true
    })).toMatchObject({
      answerEnabledDisabled: true,
      answerTtl: {
        modeDisabled: true,
        valueDisabled: true
      },
      queryEnabledChecked: false,
      queryEnabledDisabled: true,
      queryNameDisabled: true,
      transactionId: {
        modeDisabled: true,
        valueDisabled: true
      }
    });

    expect(dnsProtocolViewModel({
      ...baseStream,
      dns_answer_ipv4_mode: "Increment Host",
      dns_answer_ttl_mode: "Increment",
      dns_flags_mode: "Random",
      dns_query_class_mode: "Decrement",
      dns_query_type_mode: "Increment",
      dns_transaction_id_mode: "Random"
    })).toMatchObject({
      answerIpv4: {
        countDisabled: false,
        stepDisabled: false
      },
      answerTtl: {
        countDisabled: false,
        stepDisabled: false
      },
      flags: {
        countDisabled: false,
        stepDisabled: false
      },
      queryClass: {
        countDisabled: false,
        stepDisabled: false
      },
      queryType: {
        countDisabled: false,
        stepDisabled: false
      },
      transactionId: {
        countDisabled: false,
        stepDisabled: false
      }
    });
  });

  it("builds DHCP message control state", () => {
    const baseStream = {
      dhcp_client_ip: "0.0.0.0",
      dhcp_client_ip_count: 4,
      dhcp_client_ip_mode: "Fixed",
      dhcp_client_ip_step: 1,
      dhcp_client_mac: "00:11:22:33:44:55",
      dhcp_client_mac_count: 5,
      dhcp_client_mac_mode: "Fixed",
      dhcp_client_mac_step: 2,
      dhcp_enabled: true,
      dhcp_flags: "8000",
      dhcp_flags_count: 6,
      dhcp_flags_mode: "Fixed",
      dhcp_flags_step: 3,
      dhcp_hostname: "trex-client",
      dhcp_hops: 0,
      dhcp_hops_count: 7,
      dhcp_hops_mode: "Fixed",
      dhcp_hops_step: 4,
      dhcp_lease_time: 0,
      dhcp_lease_time_count: 8,
      dhcp_lease_time_mode: "Increment",
      dhcp_lease_time_step: 5,
      dhcp_message_type: 1,
      dhcp_message_type_count: 9,
      dhcp_message_type_mode: "Fixed",
      dhcp_message_type_step: 6,
      dhcp_operation: 1,
      dhcp_operation_count: 10,
      dhcp_operation_mode: "Fixed",
      dhcp_operation_step: 7,
      dhcp_parameter_request_list: "1,3,6",
      dhcp_rebinding_time: 7200,
      dhcp_rebinding_time_count: 11,
      dhcp_rebinding_time_mode: "Fixed",
      dhcp_rebinding_time_step: 8,
      dhcp_relay_ip: "0.0.0.0",
      dhcp_relay_ip_count: 12,
      dhcp_relay_ip_mode: "Fixed",
      dhcp_relay_ip_step: 9,
      dhcp_renewal_time: 3600,
      dhcp_renewal_time_count: 13,
      dhcp_renewal_time_mode: "Increment",
      dhcp_renewal_time_step: 10,
      dhcp_requested_ip: "192.0.2.50",
      dhcp_requested_ip_count: 14,
      dhcp_requested_ip_mode: "Fixed",
      dhcp_requested_ip_step: 11,
      dhcp_seconds: 2,
      dhcp_seconds_count: 15,
      dhcp_seconds_mode: "Fixed",
      dhcp_seconds_step: 12,
      dhcp_server_id: "192.0.2.1",
      dhcp_server_id_count: 16,
      dhcp_server_id_mode: "Fixed",
      dhcp_server_id_step: 13,
      dhcp_server_ip: "0.0.0.0",
      dhcp_server_ip_count: 17,
      dhcp_server_ip_mode: "Fixed",
      dhcp_server_ip_step: 14,
      dhcp_xid: 305419896,
      dhcp_xid_count: 18,
      dhcp_xid_mode: "Fixed",
      dhcp_xid_step: 15,
      dhcp_your_ip: "0.0.0.0",
      dhcp_your_ip_count: 19,
      dhcp_your_ip_mode: "Fixed",
      dhcp_your_ip_step: 16,
      dns_enabled: false,
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(dhcpProtocolViewModel(baseStream)).toMatchObject({
      hostnameDisabled: false,
      hostnameValue: "trex-client",
      leaseTime: {
        countDisabled: true,
        mode: "Increment",
        modeDisabled: true,
        stepDisabled: true,
        value: "0",
        valueDisabled: false
      },
      messageEnabledChecked: true,
      messageEnabledDisabled: false,
      operation: {
        countDisabled: true,
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        value: "1",
        valueDisabled: false
      },
      parameterRequestListDisabled: false,
      parameterRequestListValue: "1,3,6",
      renewalTime: {
        countDisabled: false,
        mode: "Increment",
        modeDisabled: false,
        stepDisabled: false,
        value: "3600"
      },
      requestedIp: {
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        value: "192.0.2.50"
      },
      serverId: {
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        value: "192.0.2.1"
      },
      xid: {
        value: "305419896"
      }
    });

    expect(dhcpProtocolViewModel({
      ...baseStream,
      dhcp_enabled: false,
      dns_enabled: true,
      packet_type: "Ethernet/IPv4/TCP"
    })).toMatchObject({
      hostnameDisabled: true,
      leaseTime: {
        modeDisabled: true,
        valueDisabled: true
      },
      messageEnabledChecked: false,
      messageEnabledDisabled: true,
      operation: {
        modeDisabled: true,
        valueDisabled: true
      }
    });
  });

  it("builds SCTP header field and checksum control state", () => {
    const baseStream = {
      l4_dst_port_mode: "Fixed",
      l4_src_port_mode: "Fixed",
      sctp_checksum: "BEEFCAFE",
      sctp_checksum_override: true,
      sctp_data_flags: 3,
      sctp_data_flags_count: 4,
      sctp_data_flags_mode: "Fixed",
      sctp_data_flags_step: 1,
      sctp_payload_protocol_id: 51,
      sctp_payload_protocol_id_count: 6,
      sctp_payload_protocol_id_mode: "Fixed",
      sctp_payload_protocol_id_step: 2,
      sctp_stream_id: 10,
      sctp_stream_id_count: 5,
      sctp_stream_id_mode: "Fixed",
      sctp_stream_id_step: 1,
      sctp_stream_sequence: 20,
      sctp_stream_sequence_count: 7,
      sctp_stream_sequence_mode: "Fixed",
      sctp_stream_sequence_step: 3,
      sctp_tsn: 100,
      sctp_tsn_count: 8,
      sctp_tsn_mode: "Fixed",
      sctp_tsn_step: 4,
      sctp_verification_tag: 123456,
      sctp_verification_tag_count: 9,
      sctp_verification_tag_mode: "Fixed",
      sctp_verification_tag_step: 5
    } as unknown as ProfileWorkbenchStream;

    expect(sctpProtocolViewModel(baseStream)).toEqual({
      checksumLocked: false,
      checksumOverrideChecked: true,
      checksumOverrideDisabled: false,
      checksumValue: "BEEFCAFE",
      checksumValueDisabled: false,
      dataFlags: {
        countDisabled: true,
        countValue: "4",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "3"
      },
      payloadProtocolId: {
        countDisabled: true,
        countValue: "6",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "2",
        value: "51"
      },
      streamId: {
        countDisabled: true,
        countValue: "5",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "10"
      },
      streamSequence: {
        countDisabled: true,
        countValue: "7",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "3",
        value: "20"
      },
      tsn: {
        countDisabled: true,
        countValue: "8",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "4",
        value: "100"
      },
      verificationTag: {
        countDisabled: true,
        countValue: "9",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "5",
        value: "123456"
      }
    });

    expect(sctpProtocolViewModel({
      ...baseStream,
      sctp_checksum_override: false
    })).toMatchObject({
      checksumLocked: false,
      checksumOverrideDisabled: false,
      checksumValueDisabled: true
    });

    expect(sctpProtocolViewModel({
      ...baseStream,
      sctp_data_flags_mode: "Increment",
      sctp_tsn_mode: "Random"
    })).toMatchObject({
      checksumLocked: true,
      checksumOverrideDisabled: true,
      checksumValueDisabled: true,
      dataFlags: {
        countDisabled: false,
        stepDisabled: false
      },
      tsn: {
        countDisabled: false,
        stepDisabled: false
      }
    });
  });

  it("builds L4 source and destination port control state", () => {
    const baseStream = {
      gtpu_enabled: false,
      l4_dst_port: 80,
      l4_dst_port_count: 11,
      l4_dst_port_mode: "Fixed",
      l4_dst_port_override: true,
      l4_dst_port_step: 7,
      l4_src_port: 1025,
      l4_src_port_count: 10,
      l4_src_port_mode: "Fixed",
      l4_src_port_override: true,
      l4_src_port_step: 6,
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(l4PortProtocolViewModel(baseStream)).toEqual({
      destination: {
        countDisabled: true,
        countValue: "11",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        overrideChecked: true,
        overrideDisabled: false,
        stepDisabled: true,
        stepValue: "7",
        value: "80",
        valueDisabled: false
      },
      source: {
        countDisabled: true,
        countValue: "10",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        overrideChecked: true,
        overrideDisabled: false,
        stepDisabled: true,
        stepValue: "6",
        value: "1025",
        valueDisabled: false
      }
    });

    expect(l4PortProtocolViewModel({
      ...baseStream,
      l4_dst_port_mode: "Random",
      l4_src_port_mode: "Increment"
    })).toMatchObject({
      destination: {
        countDisabled: false,
        stepDisabled: false
      },
      source: {
        countDisabled: false,
        stepDisabled: false
      }
    });

    expect(l4PortProtocolViewModel({ ...baseStream, vxlan_enabled: true })).toMatchObject({
      destination: {
        overrideDisabled: true,
        valueDisabled: true
      },
      source: {
        overrideDisabled: true,
        valueDisabled: true
      }
    });
  });

  it("builds TCP sequence acknowledge and window control state", () => {
    const baseStream = {
      tcp_ack_count: 7,
      tcp_ack_mode: "Fixed",
      tcp_ack_number: 456,
      tcp_ack_step: 4,
      tcp_sequence_count: 5,
      tcp_sequence_mode: "Fixed",
      tcp_sequence_number: 123,
      tcp_sequence_step: 2,
      tcp_window: 1024,
      tcp_window_count: 3,
      tcp_window_mode: "Fixed",
      tcp_window_step: 1
    } as unknown as ProfileWorkbenchStream;

    expect(tcpCoreProtocolViewModel(baseStream)).toEqual({
      acknowledge: {
        countDisabled: true,
        countValue: "7",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "4",
        value: "456"
      },
      sequence: {
        countDisabled: true,
        countValue: "5",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "2",
        value: "123"
      },
      window: {
        countDisabled: true,
        countValue: "3",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "1024"
      }
    });

    expect(tcpCoreProtocolViewModel({
      ...baseStream,
      tcp_ack_mode: "Random",
      tcp_sequence_mode: "Increment",
      tcp_window_mode: "Decrement"
    })).toMatchObject({
      acknowledge: {
        countDisabled: false,
        stepDisabled: false
      },
      sequence: {
        countDisabled: false,
        stepDisabled: false
      },
      window: {
        countDisabled: false,
        stepDisabled: false
      }
    });
  });

  it("builds TCP checksum control state", () => {
    const baseStream = {
      tcp_checksum: "B3E3",
      tcp_checksum_count: 8,
      tcp_checksum_mode: "Fixed",
      tcp_checksum_override: false,
      tcp_checksum_step: 2
    } as unknown as ProfileWorkbenchStream;

    expect(tcpChecksumProtocolViewModel(baseStream)).toEqual({
      countDisabled: true,
      countValue: "8",
      mode: "Fixed",
      modeDisabled: true,
      modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      overrideChecked: false,
      stepDisabled: true,
      stepValue: "2",
      value: "B3E3",
      valueDisabled: true
    });

    expect(tcpChecksumProtocolViewModel({
      ...baseStream,
      tcp_checksum_mode: "Fixed",
      tcp_checksum_override: true
    })).toMatchObject({
      countDisabled: true,
      modeDisabled: false,
      stepDisabled: true,
      valueDisabled: false
    });

    expect(tcpChecksumProtocolViewModel({
      ...baseStream,
      tcp_checksum_mode: "Increment",
      tcp_checksum_override: true
    })).toMatchObject({
      countDisabled: false,
      modeDisabled: false,
      stepDisabled: false,
      valueDisabled: false
    });
  });

  it("builds TCP MSS option control state", () => {
    const baseStream = {
      tcp_option_mss: 1460,
      tcp_option_mss_count: 8,
      tcp_option_mss_enabled: false,
      tcp_option_mss_mode: "Fixed",
      tcp_option_mss_step: 4
    } as unknown as ProfileWorkbenchStream;

    expect(tcpMssOptionViewModel(baseStream)).toEqual({
      countDisabled: true,
      countValue: "8",
      enabledChecked: false,
      mode: "Fixed",
      modeDisabled: true,
      modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      stepDisabled: true,
      stepValue: "4",
      value: "1460",
      valueDisabled: true
    });

    expect(tcpMssOptionViewModel({
      ...baseStream,
      tcp_option_mss_enabled: true,
      tcp_option_mss_mode: "Fixed"
    })).toMatchObject({
      countDisabled: true,
      modeDisabled: false,
      stepDisabled: true,
      valueDisabled: false
    });

    expect(tcpMssOptionViewModel({
      ...baseStream,
      tcp_option_mss_enabled: true,
      tcp_option_mss_mode: "Increment"
    })).toMatchObject({
      countDisabled: false,
      modeDisabled: false,
      stepDisabled: false,
      valueDisabled: false
    });
  });

  it("builds TCP Window Scale option control state", () => {
    const baseStream = {
      tcp_option_window_scale: 7,
      tcp_option_window_scale_count: 6,
      tcp_option_window_scale_enabled: false,
      tcp_option_window_scale_mode: "Fixed",
      tcp_option_window_scale_step: 2
    } as unknown as ProfileWorkbenchStream;

    expect(tcpWindowScaleOptionViewModel(baseStream)).toEqual({
      countDisabled: true,
      countValue: "6",
      enabledChecked: false,
      mode: "Fixed",
      modeDisabled: true,
      modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      stepDisabled: true,
      stepValue: "2",
      value: "7",
      valueDisabled: true
    });

    expect(tcpWindowScaleOptionViewModel({
      ...baseStream,
      tcp_option_window_scale_enabled: true,
      tcp_option_window_scale_mode: "Fixed"
    })).toMatchObject({
      countDisabled: true,
      modeDisabled: false,
      stepDisabled: true,
      valueDisabled: false
    });

    expect(tcpWindowScaleOptionViewModel({
      ...baseStream,
      tcp_option_window_scale_enabled: true,
      tcp_option_window_scale_mode: "Increment"
    })).toMatchObject({
      countDisabled: false,
      modeDisabled: false,
      stepDisabled: false,
      valueDisabled: false
    });
  });

  it("builds TCP SACK option control state", () => {
    const baseStream = {
      tcp_option_sack_blocks_enabled: false,
      tcp_option_sack_left_edge: 100,
      tcp_option_sack_left_edge_count: 4,
      tcp_option_sack_left_edge_mode: "Fixed",
      tcp_option_sack_left_edge_step: 2,
      tcp_option_sack_permitted_enabled: true,
      tcp_option_sack_right_edge: 200,
      tcp_option_sack_right_edge_count: 5,
      tcp_option_sack_right_edge_mode: "Increment",
      tcp_option_sack_right_edge_step: 3
    } as unknown as ProfileWorkbenchStream;

    expect(tcpSackOptionViewModel(baseStream)).toEqual({
      blocksChecked: false,
      left: {
        countDisabled: true,
        countValue: "4",
        mode: "Fixed",
        modeDisabled: true,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "2",
        value: "100",
        valueDisabled: true
      },
      permittedChecked: true,
      right: {
        countDisabled: true,
        countValue: "5",
        mode: "Increment",
        modeDisabled: true,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "3",
        value: "200",
        valueDisabled: true
      }
    });

    expect(tcpSackOptionViewModel({
      ...baseStream,
      tcp_option_sack_blocks_enabled: true,
      tcp_option_sack_left_edge_mode: "Fixed",
      tcp_option_sack_right_edge_mode: "Increment"
    })).toMatchObject({
      left: {
        countDisabled: true,
        modeDisabled: false,
        stepDisabled: true,
        valueDisabled: false
      },
      right: {
        countDisabled: false,
        modeDisabled: false,
        stepDisabled: false,
        valueDisabled: false
      }
    });
  });

  it("builds TCP Timestamp option control state", () => {
    const baseStream = {
      tcp_option_timestamp_echo: 20,
      tcp_option_timestamp_echo_count: 5,
      tcp_option_timestamp_echo_mode: "Increment",
      tcp_option_timestamp_echo_step: 3,
      tcp_option_timestamp_enabled: false,
      tcp_option_timestamp_value: 10,
      tcp_option_timestamp_value_count: 4,
      tcp_option_timestamp_value_mode: "Fixed",
      tcp_option_timestamp_value_step: 2
    } as unknown as ProfileWorkbenchStream;

    expect(tcpTimestampOptionViewModel(baseStream)).toEqual({
      echo: {
        countDisabled: true,
        countValue: "5",
        mode: "Increment",
        modeDisabled: true,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "3",
        value: "20",
        valueDisabled: true
      },
      enabledChecked: false,
      value: {
        countDisabled: true,
        countValue: "4",
        mode: "Fixed",
        modeDisabled: true,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "2",
        value: "10",
        valueDisabled: true
      }
    });

    expect(tcpTimestampOptionViewModel({
      ...baseStream,
      tcp_option_timestamp_echo_mode: "Increment",
      tcp_option_timestamp_enabled: true,
      tcp_option_timestamp_value_mode: "Fixed"
    })).toMatchObject({
      echo: {
        countDisabled: false,
        modeDisabled: false,
        stepDisabled: false,
        valueDisabled: false
      },
      enabledChecked: true,
      value: {
        countDisabled: true,
        modeDisabled: false,
        stepDisabled: true,
        valueDisabled: false
      }
    });
  });

  it("builds TCP urgent pointer and flags control state", () => {
    const baseStream = {
      tcp_flag_ack: true,
      tcp_flag_fin: false,
      tcp_flag_psh: true,
      tcp_flag_rst: false,
      tcp_flag_syn: true,
      tcp_flag_urg: false,
      tcp_flags_count: 4,
      tcp_flags_mode: "Fixed",
      tcp_flags_step: 2,
      tcp_urgent_pointer: 9,
      tcp_urgent_pointer_count: 6,
      tcp_urgent_pointer_mode: "Fixed",
      tcp_urgent_pointer_step: 3
    } as unknown as ProfileWorkbenchStream;

    expect(tcpUrgentFlagsProtocolViewModel(baseStream)).toEqual({
      flags: {
        countDisabled: true,
        countValue: "4",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        rows: [
          { checked: false, key: "tcp_flag_urg", label: "URG" },
          { checked: true, key: "tcp_flag_ack", label: "ACK" },
          { checked: true, key: "tcp_flag_psh", label: "PSH" },
          { checked: false, key: "tcp_flag_rst", label: "RST" },
          { checked: true, key: "tcp_flag_syn", label: "SYN" },
          { checked: false, key: "tcp_flag_fin", label: "FIN" }
        ],
        stepDisabled: true,
        stepValue: "2"
      },
      urgentPointer: {
        countDisabled: true,
        countValue: "6",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "3",
        value: "9"
      }
    });

    expect(tcpUrgentFlagsProtocolViewModel({
      ...baseStream,
      tcp_flags_mode: "Random",
      tcp_urgent_pointer_mode: "Increment"
    })).toMatchObject({
      flags: {
        countDisabled: false,
        stepDisabled: false
      },
      urgentPointer: {
        countDisabled: false,
        stepDisabled: false
      }
    });
  });

  it("builds UDP length and checksum control state", () => {
    const baseStream = {
      gtpu_enabled: false,
      udp_checksum: "BEEF",
      udp_checksum_count: 7,
      udp_checksum_mode: "Fixed",
      udp_checksum_override: true,
      udp_checksum_step: 4,
      udp_length: 64,
      udp_length_count: 5,
      udp_length_mode: "Fixed",
      udp_length_override: true,
      udp_length_step: 2,
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(udpProtocolViewModel(baseStream)).toEqual({
      checksumCountDisabled: true,
      checksumCountValue: "7",
      checksumMode: "Fixed",
      checksumModeDisabled: false,
      checksumModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      checksumOverrideChecked: true,
      checksumOverrideDisabled: false,
      checksumStepDisabled: true,
      checksumStepValue: "4",
      checksumValue: "BEEF",
      checksumValueDisabled: false,
      lengthCountDisabled: true,
      lengthCountValue: "5",
      lengthMode: "Fixed",
      lengthModeDisabled: false,
      lengthModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      lengthOverrideChecked: true,
      lengthOverrideDisabled: false,
      lengthStepDisabled: true,
      lengthStepValue: "2",
      lengthValue: "64",
      lengthValueDisabled: false
    });

    expect(udpProtocolViewModel({
      ...baseStream,
      udp_checksum_mode: "Random",
      udp_length_mode: "Increment"
    })).toMatchObject({
      checksumCountDisabled: false,
      checksumStepDisabled: false,
      lengthCountDisabled: false,
      lengthStepDisabled: false
    });

    expect(udpProtocolViewModel({ ...baseStream, vxlan_enabled: true })).toMatchObject({
      checksumCountDisabled: true,
      checksumOverrideDisabled: false,
      checksumValueDisabled: true,
      lengthOverrideDisabled: true,
      lengthValueDisabled: true
    });

    expect(udpProtocolViewModel({ ...baseStream, gtpu_enabled: true })).toMatchObject({
      checksumOverrideDisabled: true,
      lengthOverrideDisabled: true
    });
  });

  it("validates imported payload patterns", () => {
    expect(payloadPatternImportError("A1B2C3")).toBeNull();
    expect(payloadPatternImportError("A1Z2")).toBe("Payload pattern must contain only hex bytes.");
    expect(payloadPatternImportError("A1B")).toBe("Payload pattern must contain whole hex bytes.");
    expect(payloadPatternImportError("A".repeat(PAYLOAD_PATTERN_MAX_HEX_CHARS + 1))).toBe(
      `Payload pattern cannot exceed ${PAYLOAD_PATTERN_MAX_HEX_CHARS} hex characters.`
    );
  });

  it("builds payload pattern file import results", () => {
    expect(payloadPatternFileImportResult("0xA1, b2:c3", "payload.hex")).toEqual({
      ok: true,
      pattern: "A1b2c3",
      status: {
        kind: "ok",
        text: "Loaded payload.hex"
      }
    });
    expect(payloadPatternFileImportResult("A1Z2", "bad.hex")).toEqual({
      ok: false,
      status: {
        kind: "error",
        text: "Payload pattern must contain only hex bytes."
      }
    });
  });

  it("dispatches payload pattern file import actions", () => {
    const events: string[] = [];
    const handlers = {
      applyPattern: (pattern: string) => events.push(`pattern:${pattern}`),
      setStatus: (status: { kind: "ok" | "error"; text: string }) =>
        events.push(`status:${status.kind}:${status.text}`)
    };

    expect(runPayloadPatternFileImportAction(payloadPatternFileImportAction("A1Z2", "bad.hex"), handlers)).toBe(false);
    expect(events).toEqual(["status:error:Payload pattern must contain only hex bytes."]);

    expect(runPayloadPatternFileImportAction(payloadPatternFileImportAction("0xA1, b2:c3", "payload.hex"), handlers)).toBe(true);
    expect(events).toEqual([
      "status:error:Payload pattern must contain only hex bytes.",
      "pattern:A1b2c3",
      "status:ok:Loaded payload.hex"
    ]);

    expect(runPayloadPatternFileImportAction(payloadPatternFileReadErrorAction(), handlers)).toBe(false);
    expect(events[events.length - 1]).toBe("status:error:Payload pattern file could not be read.");
  });

  it("formats compact presence labels for advanced stream fields", () => {
    expect(presentLabel(null)).toBe("missing");
    expect(presentLabel("")).toBe("missing");
    expect(presentLabel({})).toBe("missing");
    expect(presentLabel("model")).toBe("present");
    expect(presentLabel({ protocol_selection: {} })).toBe("present");
  });

  it("summarizes PCAP import rate and rewrite options", () => {
    expect(pcapImportRateLabel(defaultPcapImportOptions)).toBe("Speedup 1");
    expect(pcapImportRateLabel({ ...defaultPcapImportOptions, rate_mode: "ipg", ipg: 12.5 })).toBe("IPG 12.5");
    expect(pcapImportRewriteLabel(defaultPcapImportOptions)).toBe("No rewrite");
    expect(pcapImportRewriteLabel({ ...defaultPcapImportOptions, rewrite_src_enabled: true })).toBe("Src rewrite");
    expect(pcapImportRewriteLabel({ ...defaultPcapImportOptions, rewrite_dst_enabled: true })).toBe("Dst rewrite");
    expect(pcapImportRewriteLabel({
      ...defaultPcapImportOptions,
      rewrite_dst_enabled: true,
      rewrite_src_enabled: true
    })).toBe("Src + Dst rewrite");
  });

  it("builds PCAP import summary labels for the workspace", () => {
    expect(pcapImportSummaryItems(defaultPcapImportOptions)).toEqual([
      { key: "prefix", label: "No prefix" },
      { key: "rewrite", label: "No rewrite" },
      { key: "rate", label: "Speedup 1" },
      { key: "loop", label: "Loop 0" }
    ]);
    expect(pcapImportSummaryLabels(defaultPcapImportOptions)).toEqual(["No prefix", "No rewrite", "Speedup 1", "Loop 0"]);
    expect(pcapImportSummaryLabels({
      ...defaultPcapImportOptions,
      ipg: 8,
      loop_count: 12,
      name_prefix: "  replay-  ",
      rate_mode: "ipg",
      rewrite_dst_enabled: true,
      rewrite_src_enabled: true
    })).toEqual(["Prefix replay-", "Src + Dst rewrite", "IPG 8", "Loop 12"]);
  });

  it("builds PCAP import editor field state", () => {
    expect(pcapImportEditorViewModel(defaultPcapImportOptions)).toEqual({
      destination: {
        address: "48.0.0.1",
        checked: false,
        controlsDisabled: true,
        countValue: "16",
        mode: "Fixed"
      },
      loopCountValue: "0",
      namePrefix: "",
      rate: {
        ipgChecked: false,
        ipgDisabled: true,
        ipgValue: "1",
        speedupChecked: true,
        speedupDisabled: false,
        speedupValue: "1"
      },
      source: {
        address: "16.0.0.1",
        checked: false,
        controlsDisabled: true,
        countValue: "16",
        mode: "Fixed"
      }
    });

    expect(pcapImportEditorViewModel({
      ...defaultPcapImportOptions,
      dst_address: "203.0.113.1",
      dst_count: 32,
      ipg: 7.5,
      loop_count: 4,
      name_prefix: "replay-",
      rate_mode: "ipg",
      rewrite_dst_enabled: true,
      rewrite_src_enabled: true,
      src_address: "198.51.100.1",
      src_count: 24
    })).toMatchObject({
      destination: {
        address: "203.0.113.1",
        checked: true,
        controlsDisabled: false,
        countValue: "32"
      },
      loopCountValue: "4",
      namePrefix: "replay-",
      rate: {
        ipgChecked: true,
        ipgDisabled: false,
        ipgValue: "7.5",
        speedupChecked: false,
        speedupDisabled: true
      },
      source: {
        address: "198.51.100.1",
        checked: true,
        controlsDisabled: false,
        countValue: "24"
      }
    });
  });

  it("normalizes PCAP import numeric inputs", () => {
    expect(pcapImportCountValue("12.9", 4)).toBe(12);
    expect(pcapImportCountValue("-8", 4)).toBe(1);
    expect(pcapImportCountValue("bad", 7)).toBe(7);
    expect(pcapImportLoopCountValue("12.9", 4)).toBe(12);
    expect(pcapImportLoopCountValue("-8", 4)).toBe(0);
    expect(pcapImportLoopCountValue("bad", 7)).toBe(7);
    expect(pcapImportSpeedupValue("0", 2)).toBe(0.000001);
    expect(pcapImportSpeedupValue("2.5", 1)).toBe(2.5);
    expect(pcapImportSpeedupValue("bad", 3)).toBe(3);
    expect(pcapImportIpgValue("-3", 2)).toBe(0);
    expect(pcapImportIpgValue("4.5", 1)).toBe(4.5);
    expect(pcapImportIpgValue("bad", 6)).toBe(6);
  });

  it("updates PCAP import options through a typed model patch", () => {
    const current = {
      ...defaultPcapImportOptions,
      dst_count: 9,
      ipg: 5,
      loop_count: 3,
      speedup: 2,
      src_count: 4
    };

    expect(pcapImportOptionsPatch(current, { field: "name_prefix", value: "replay-" })).toEqual({
      ...current,
      name_prefix: "replay-"
    });
    expect(pcapImportOptionsPatch(current, { field: "rewrite_src_enabled", value: true })).toEqual({
      ...current,
      rewrite_src_enabled: true
    });
    expect(pcapImportOptionsPatch(current, { field: "src_count", value: "12.8" })).toEqual({
      ...current,
      src_count: 12
    });
    expect(pcapImportOptionsPatch(current, { field: "dst_count", value: "bad" })).toEqual({
      ...current,
      dst_count: 9
    });
    expect(pcapImportOptionsPatch(current, { field: "rate_mode", value: "ipg" })).toEqual({
      ...current,
      rate_mode: "ipg"
    });
    expect(pcapImportOptionsPatch(current, { field: "speedup", value: "0" })).toEqual({
      ...current,
      speedup: 0.000001
    });
    expect(pcapImportOptionsPatch(current, { field: "ipg", value: "-3" })).toEqual({
      ...current,
      ipg: 0
    });
    expect(pcapImportOptionsPatch(current, { field: "loop_count", value: "-4" })).toEqual({
      ...current,
      loop_count: 0
    });
    expect(pcapImportOptionsUpdater({ field: "name_prefix", value: "pcap-" })(current)).toEqual({
      ...current,
      name_prefix: "pcap-"
    });
  });

  it("dispatches PCAP import file actions", () => {
    const calls: Array<{ fileName: string; loopCount: number; prefix: string }> = [];
    const handlers = {
      importPcap: (file: File, options: typeof defaultPcapImportOptions) =>
        calls.push({
          fileName: file.name,
          loopCount: options.loop_count,
          prefix: options.name_prefix
        })
    };
    const options = {
      ...defaultPcapImportOptions,
      loop_count: 3,
      name_prefix: "replay-"
    };
    const file = new File([new Uint8Array([0xd4, 0xc3, 0xb2, 0xa1])], "import.pcap");

    expect(runPcapImportFileAction(pcapImportFileAction(null, options), handlers)).toBe(false);
    expect(calls).toEqual([]);
    expect(runPcapImportFileAction(pcapImportFileAction(file, options), handlers)).toBe(true);
    expect(calls).toEqual([{ fileName: "import.pcap", loopCount: 3, prefix: "replay-" }]);
  });

  it("builds runtime profile facts from selected profile metadata", () => {
    const profile: ProfileRecord = {
      kind: "python",
      modified_time: "2026-06-20T10:15:00Z",
      name: "bench.py",
      path: "/opt/trex-core/scripts/stl/bench.py",
      previewable: true,
      relative_path: "bench.py",
      root: "/opt/trex-core/scripts/stl",
      size_bytes: 1536,
      suffix: ".py",
      tunables: [{ name: "size" }, { name: "vm" }]
    };

    expect(profileDeclaredTunables(profile)).toEqual([{ name: "size" }, { name: "vm" }]);
    expect(profileDeclaredTunables({ ...profile, tunables: [] })).toEqual([]);
    expect(profileDeclaredTunables(null)).toBeNull();

    const facts = Object.fromEntries(
      profileRuntimeFacts(profile, "fallback.yaml", profileDeclaredTunables(profile)).map((fact) => [fact.label, fact.value])
    );
    expect(profileRuntimeFacts(profile, "fallback.yaml", profileDeclaredTunables(profile)).map((fact) => fact.key)).toEqual([
      "type",
      "file",
      "path",
      "size",
      "modified",
      "tunables"
    ]);
    expect(facts).toMatchObject({
      File: "bench.py",
      Path: "bench.py",
      Size: "1.5 KiB",
      Tunables: "2",
      Type: "Python STL"
    });
    const emptyFacts = Object.fromEntries(profileRuntimeFacts(null, "", null).map((fact) => [fact.label, fact.value]));
    expect(emptyFacts).toMatchObject({
      File: "-",
      Path: "-",
      Size: "-",
      Tunables: "auto",
      Type: "-"
    });
  });

  it("builds runtime tunables panel text from profile metadata", () => {
    expect(profileRuntimeTunablesViewModel(null, " size=128 vm=cached ")).toEqual({
      code: "size=128 vm=cached",
      description: "No tunable schema was reported; use Extra for key=value parameters before starting traffic.",
      status: "manual extra"
    });
    expect(profileRuntimeTunablesViewModel(null, "")).toMatchObject({ code: "extra: -" });
    expect(profileRuntimeTunablesViewModel([{ name: "size" }, { name: "vm" }], "ignored")).toEqual({
      code: "declared: 2",
      description: "Declared script parameters are shown above.",
      status: "2 declared"
    });
    expect(profileRuntimeTunablesViewModel([], "blocked=1")).toEqual({
      code: "declared: 0",
      description: "This profile did not declare tunables; extra keys are blocked before start.",
      status: "none declared"
    });
  });

  it("builds runtime readiness and command-status panels from profile state", () => {
    const readyView = profileRuntimeReadinessViewModel({
      hasRunnableProfile: true,
      trafficDurationEnabled: true,
      trafficDurationValue: "30",
      trafficMultiplierUnit: "percentage",
      trafficMultiplierValue: "100"
    });
    expect(readyView).toEqual({
      duration: "30 s",
      multiplier: "100 percentage",
      startTarget: "Selected port or all ports",
      status: "Ready"
    });
    expect(profileRuntimeReadinessRows(readyView)).toEqual([
      { key: "multiplier", label: "Multiplier", value: "100 percentage" },
      { key: "duration", label: "Duration", value: "30 s" },
      { key: "start-target", label: "Start target", value: "Selected port or all ports" }
    ]);

    expect(profileRuntimeReadinessViewModel({
      hasRunnableProfile: false,
      trafficDurationEnabled: false,
      trafficDurationValue: "",
      trafficMultiplierUnit: "raw",
      trafficMultiplierValue: ""
    })).toMatchObject({
      duration: "continuous",
      multiplier: "- raw",
      status: "No Profile"
    });

    const blockedCommand = profileRuntimeCommandStatusViewModel({
      profileTunablesError: "bad tunable",
      statusIsError: true,
      statusText: "bad tunable"
    });
    expect(blockedCommand).toEqual({
      badge: "Attention",
      code: "validation blocked",
      message: "Resolve the profile status above before starting traffic."
    });
    expect(profileRuntimeCommandPanelViewModel(blockedCommand)).toMatchObject({
      className: "profile-runtime-panel profile-runtime-panel--error"
    });

    const idleCommand = profileRuntimeCommandStatusViewModel({
      profileTunablesError: null,
      statusIsError: false,
      statusText: ""
    });
    expect(idleCommand).toEqual({
      badge: "OK",
      code: null,
      message: "No command result yet."
    });
    expect(profileRuntimeCommandPanelViewModel(idleCommand)).toMatchObject({
      className: "profile-runtime-panel"
    });

    expect(profileRuntimePanels({
      commandPanelView: profileRuntimeCommandPanelViewModel(blockedCommand),
      readinessRows: profileRuntimeReadinessRows(readyView),
      readinessView: readyView,
      tunablesView: profileRuntimeTunablesViewModel([{ name: "size" }], "")
    })).toMatchObject([
      {
        badge: "Ready",
        className: "profile-runtime-panel",
        key: "readiness",
        rows: [
          { label: "Multiplier", value: "100 percentage" },
          { label: "Duration", value: "30 s" },
          { label: "Start target", value: "Selected port or all ports" }
        ],
        title: "Run Readiness"
      },
      {
        badge: "1 declared",
        className: "profile-runtime-panel",
        code: "declared: 1",
        description: "Declared script parameters are shown above.",
        key: "tunables",
        rows: [],
        title: "Tunable Input"
      },
      {
        badge: "Attention",
        className: "profile-runtime-panel profile-runtime-panel--error",
        code: "validation blocked",
        description: "Resolve the profile status above before starting traffic.",
        key: "command",
        rows: [],
        title: "Command Status"
      }
    ]);
  });

  it("builds runtime start button state", () => {
    const startButtons = profileRuntimeStartButtons(false);

    expect(startButtons.map((button) => ({
      action: button.action,
      className: button.className,
      disabled: button.disabled,
      iconName: button.iconName,
      iconSize: button.iconSize,
      label: button.label,
      title: button.title
    }))).toEqual([
      {
        action: "selected",
        className: "profile-runtime-button",
        disabled: false,
        iconName: "play",
        iconSize: 14,
        label: "Start Transit",
        title: "Start selected profile"
      },
      {
        action: "all",
        className: "profile-runtime-button",
        disabled: false,
        iconName: "list-start",
        iconSize: 14,
        label: "Start All",
        title: "Start selected profile on all ports"
      }
    ]);
    expect(startButtons.map((button) => button.icon)).toEqual([Play, ListStart]);
    expect(profileRuntimeStartButtons(true).map((button) => button.disabled)).toEqual([true, true]);
    expect(profileRuntimeBarViewModel({
      buttons: profileRuntimeStartButtons(false),
      show: true
    })).toMatchObject({
      ariaLabel: "Profile runtime",
      controlAriaLabelPrefix: "Profile traffic",
      controlClassName: "traffic-run-control--profile",
      controlFieldLabel: "Multiplier",
      controlVariant: "profile",
      show: true,
      title: "Runtime"
    });
  });

  it("dispatches runtime start actions", () => {
    const calls: string[] = [];
    const handlers = {
      startAll: () => calls.push("all"),
      startSelected: () => calls.push("selected")
    };

    runProfileRuntimeStartAction("selected", handlers);
    runProfileRuntimeStartAction("all", handlers);

    expect(calls).toEqual(["selected", "all"]);
  });

  it("builds profile workbar state for builder and runtime modes", () => {
    const builderWorkbar = profileWorkbarViewModel({
      builderProfileName: "builder.yaml",
      profilePath: "runtime.py",
      statusIsError: false,
      statusText: "Saved builder.yaml",
      streamBuilderEnabled: true
    });
    expect(builderWorkbar).toEqual({
      inputAriaLabel: "Profile name",
      inputReadOnly: false,
      inputValue: "builder.yaml",
      label: "Profile",
      statusClassName: "",
      statusIsError: false,
      statusText: "Saved builder.yaml"
    });

    const runtimeWorkbar = profileWorkbarViewModel({
      builderProfileName: "builder.yaml",
      profilePath: "runtime.py",
      statusIsError: true,
      statusText: "profile_root_missing",
      streamBuilderEnabled: false
    });
    expect(runtimeWorkbar).toEqual({
      inputAriaLabel: "Profile name",
      inputReadOnly: true,
      inputValue: "runtime.py",
      label: "Profile",
      statusClassName: "profile-workbar-error",
      statusIsError: true,
      statusText: "profile_root_missing"
    });
  });

  it("dispatches profile workbar name changes only while editable", () => {
    const calls: string[] = [];
    const handlers = {
      changeBuilderProfileName: (value: string) => calls.push(value)
    };

    runProfileWorkbarNameChange(
      profileWorkbarViewModel({
        builderProfileName: "builder.yaml",
        profilePath: "runtime.py",
        statusIsError: false,
        statusText: "ready",
        streamBuilderEnabled: true
      }),
      "next.yaml",
      handlers
    );
    runProfileWorkbarNameChange(
      profileWorkbarViewModel({
        builderProfileName: "builder.yaml",
        profilePath: "runtime.py",
        statusIsError: false,
        statusText: "ready",
        streamBuilderEnabled: false
      }),
      "ignored.py",
      handlers
    );

    expect(calls).toEqual(["next.yaml"]);
  });

  it("builds profile workspace mode state", () => {
    expect(profileWorkspaceModeViewModel(true)).toEqual({
      rightClassName: "traffic-profile-right",
      runtimeFactClassName: "profile-runtime-fact",
      runtimePanelsClassName: "profile-runtime-panels",
      runtimePanelTitleClassName: "profile-runtime-panel-title",
      runtimeSummaryGridClassName: "profile-runtime-summary-grid",
      runtimeWorkspaceAriaLabel: "Profile runtime workspace",
      runtimeWorkspaceClassName: "profile-runtime-workspace",
      showRuntimeWorkspace: false,
      showStreamBuilderWorkspace: true
    });
    expect(profileWorkspaceModeViewModel(false)).toEqual({
      rightClassName: "traffic-profile-right traffic-profile-right--runtime-only",
      runtimeFactClassName: "profile-runtime-fact",
      runtimePanelsClassName: "profile-runtime-panels",
      runtimePanelTitleClassName: "profile-runtime-panel-title",
      runtimeSummaryGridClassName: "profile-runtime-summary-grid",
      runtimeWorkspaceAriaLabel: "Profile runtime workspace",
      runtimeWorkspaceClassName: "profile-runtime-workspace",
      showRuntimeWorkspace: true,
      showStreamBuilderWorkspace: false
    });
  });

  it("derives tunables visibility when profile metadata is unknown", () => {
    const viewModel = profileTunablesViewModel(true, null);
    const draft = {
      custom: {},
      extra: "",
      flow: "fs",
      pgId: "12",
      size: "128",
      vm: "cached"
    };

    expect(viewModel.showBar).toBe(true);
    expect(viewModel.showExtra).toBe(true);
    expect(viewModel).toMatchObject({
      barAriaLabel: "Profile tunables",
      barClassName: "profile-tunables-bar",
      barTitle: "Tunables"
    });
    expect(viewModel.customTunables).toEqual([]);
    expect(profileTunablesShowsShortcut(viewModel, "size")).toBe(true);
    expect(profileTunablesShowsShortcut(viewModel, "pg_id")).toBe(true);
    expect(profileTunablesShortcutRows(viewModel, draft).map((row) => ({
      field: row.field,
      kind: row.kind,
      label: row.label,
      value: row.value
    }))).toEqual([
      { field: "size", kind: "input", label: "Size", value: "128" },
      { field: "vm", kind: "select", label: "VM", value: "cached" },
      { field: "flow", kind: "select", label: "Flow", value: "fs" },
      { field: "pgId", kind: "input", label: "PG ID", value: "12" }
    ]);
    expect(profileTunablesExtraRow(viewModel, { ...draft, extra: "size=128" })).toEqual({
      ariaLabel: "Extra tunables",
      field: "extra",
      label: "Extra",
      placeholder: "key=value",
      value: "size=128"
    });
    expect(profileTunablesBarRows({
      customRows: profileTunablesCustomRows(viewModel, draft),
      extraRow: profileTunablesExtraRow(viewModel, { ...draft, extra: "size=128" }),
      shortcutRows: profileTunablesShortcutRows(viewModel, draft)
    }).map((row) => [row.key, row.source, row.labelPresentation])).toEqual([
      ["shortcut-size", "shortcut", "text"],
      ["shortcut-vm", "shortcut", "text"],
      ["shortcut-flow", "shortcut", "text"],
      ["shortcut-pgId", "shortcut", "text"],
      ["extra-extra", "extra", "text"]
    ]);
  });

  it("derives tunables visibility from declared profile metadata", () => {
    const viewModel = profileTunablesViewModel(true, [
      { name: "size" },
      { name: "src", required: true, type: "int" },
      { name: "dst", choices: ["1.1.1.1", "2.2.2.2"] }
    ]);
    const draft = {
      custom: {
        dst: "2.2.2.2",
        src: "64"
      },
      extra: "",
      flow: "fs",
      pgId: "7",
      size: "64",
      vm: "cached"
    };

    expect(viewModel.showBar).toBe(true);
    expect(viewModel.showExtra).toBe(false);
    expect(viewModel).toMatchObject({
      barAriaLabel: "Profile tunables",
      barClassName: "profile-tunables-bar",
      barTitle: "Tunables"
    });
    expect(profileTunablesShowsShortcut(viewModel, "size")).toBe(true);
    expect(profileTunablesShowsShortcut(viewModel, "vm")).toBe(false);
    expect(viewModel.customTunables.map((tunable) => tunable.name)).toEqual(["src", "dst"]);
    expect(profileTunablesShortcutRows(viewModel, draft).map((row) => row.field)).toEqual(["size"]);
    expect(profileTunablesExtraRow(viewModel, draft)).toBeNull();
    expect(profileTunablesCustomRows(viewModel, draft)).toEqual([
      {
        ariaLabel: "Tunable src",
        inputMode: "numeric",
        kind: "input",
        label: "src *",
        name: "src",
        options: [],
        placeholder: "required",
        value: "64"
      },
      {
        ariaLabel: "Tunable dst",
        inputMode: undefined,
        kind: "select",
        label: "dst",
        name: "dst",
        options: [
          { key: "1.1.1.1", label: "1.1.1.1", value: "1.1.1.1" },
          { key: "2.2.2.2", label: "2.2.2.2", value: "2.2.2.2" }
        ],
        placeholder: "",
        value: "2.2.2.2"
      }
    ]);

    const barRows = profileTunablesBarRows({
      customRows: profileTunablesCustomRows(viewModel, draft),
      extraRow: profileTunablesExtraRow(viewModel, draft),
      shortcutRows: profileTunablesShortcutRows(viewModel, draft)
    });
    expect(barRows.map((row) => [row.key, row.source, row.label, row.labelPresentation, row.value])).toEqual([
      ["shortcut-size", "shortcut", "Size", "text", "64"],
      ["custom-src", "custom", "src *", "inline", "64"],
      ["custom-dst", "custom", "dst", "inline", "2.2.2.2"]
    ]);
    expect(barRows[2].options).toEqual([
      { key: "custom-empty", label: "-", value: "" },
      { key: "1.1.1.1", label: "1.1.1.1", value: "1.1.1.1" },
      { key: "2.2.2.2", label: "2.2.2.2", value: "2.2.2.2" }
    ]);
    expect(profileTunablesBarRowDraftPatch(draft, barRows[0], "128")).toMatchObject({ size: "128" });
    expect(profileTunablesBarRowDraftPatch(draft, barRows[1], "256").custom).toMatchObject({ src: "256" });

    const calls: ProfileTunablesDraft[] = [];
    runProfileTunablesBarRowChange(draft, barRows[1], "512", {
      changeProfileTunables: (nextDraft) => calls.push(nextDraft)
    });
    expect(calls).toEqual([
      {
        ...draft,
        custom: {
          ...draft.custom,
          src: "512"
        }
      }
    ]);
  });

  it("hides the tunables bar when runtime tunables are disabled", () => {
    const viewModel = profileTunablesViewModel(false, [{ name: "size" }]);

    expect(viewModel.showBar).toBe(false);
    expect(profileTunablesShowsShortcut(viewModel, "size")).toBe(true);
  });

  it("updates profile tunables drafts without losing sibling values", () => {
    const draft = {
      custom: { dst: "2.2.2.2", src: "1.1.1.1" },
      extra: "foo=bar",
      flow: "fs",
      pgId: "7",
      size: "64",
      vm: "cached"
    };

    expect(profileTunablesDraftFieldPatch(draft, "size", "128")).toEqual({
      ...draft,
      size: "128"
    });

    expect(profileTunablesCustomDraftPatch(draft, "src", "10.0.0.1")).toEqual({
      ...draft,
      custom: {
        dst: "2.2.2.2",
        src: "10.0.0.1"
      }
    });
  });

  it("derives workspace status for builder and runtime modes", () => {
    const savedProfile: ProfileRecord = {
      kind: "yaml",
      modified_time: "2026-06-20T10:15:00Z",
      name: "saved.yaml",
      path: "/opt/trex-webui/profiles/saved.yaml",
      previewable: true,
      relative_path: "saved.yaml",
      root: "/opt/trex-webui/profiles",
      size_bytes: 512,
      suffix: ".yaml"
    };

    expect(profileWorkspaceStatus({
      profileCommandResult: null,
      profilePath: "profile.yaml",
      profileTunablesError: null,
      profileWorkbenchResult: {
        blocker: null,
        data: { content: "[]", profile: savedProfile, streams: [] },
        error: null,
        ok: true
      },
      selectedProfile: null,
      selectedStreamValidationError: null,
      streamBuilderEnabled: true,
      workbenchProfileValidationError: null,
      workbenchStreamValidationError: null
    })).toEqual({
      statusIsError: false,
      statusText: "Saved saved.yaml"
    });

    expect(profileWorkspaceStatus({
      profileCommandResult: { blocker: "profile_root_missing", data: null, error: null, ok: false },
      profilePath: "profile.yaml",
      profileTunablesError: null,
      profileWorkbenchResult: null,
      selectedProfile: null,
      selectedStreamValidationError: null,
      streamBuilderEnabled: false,
      workbenchProfileValidationError: null,
      workbenchStreamValidationError: null
    })).toEqual({
      statusIsError: true,
      statusText: "profile_root_missing"
    });
  });

  it("builds the runtime profile panel view-model from one model boundary", () => {
    const selectedProfile: ProfileRecord = {
      kind: "python",
      modified_time: "2026-06-20T10:15:00Z",
      name: "bench.py",
      path: "/opt/trex-core/scripts/stl/bench.py",
      previewable: true,
      relative_path: "bench.py",
      root: "/opt/trex-core/scripts/stl",
      size_bytes: 1536,
      suffix: ".py",
      tunables: [{ name: "size" }, { name: "src" }]
    };

    const runtimePanelInput: Parameters<typeof runtimeProfilePanelViewModel>[0] = {
      builderProfileName: "builder.yaml",
      hasRunnableProfile: true,
      isStarting: false,
      pcapImportOptions: {
        ...defaultPcapImportOptions,
        name_prefix: "replay-",
        rewrite_dst_enabled: true
      },
      profileCommandResult: null,
      profilePath: "fallback.yaml",
      profileTunables: {
        custom: {},
        extra: "ignored=1",
        flow: "",
        pgId: "",
        size: "128",
        vm: ""
      },
      profileTunablesEnabled: true,
      profileTunablesError: null,
      profileWorkbenchResult: null,
      selectedProfile,
      selectedStreamValidationError: null,
      streamBuilderEnabled: false,
      trafficDurationEnabled: false,
      trafficDurationValue: "",
      trafficMultiplierUnit: "percentage",
      trafficMultiplierValue: "25",
      workbenchProfileValidationError: null,
      workbenchStreamValidationError: null
    };

    const viewModel = runtimeProfilePanelViewModel(runtimePanelInput);

    expect(viewModel.declaredProfileTunables).toEqual([{ name: "size" }, { name: "src" }]);
    expect(viewModel.profileTunablesView.customTunables).toEqual([{ name: "src" }]);
    expect(viewModel.profileTunablesBarRows.map((row) => [row.source, row.label])).toEqual([
      ["shortcut", "Size"],
      ["custom", "src"]
    ]);
    expect(viewModel.pcapImportSummary).toEqual([
      { key: "prefix", label: "Prefix replay-" },
      { key: "rewrite", label: "Dst rewrite" },
      { key: "rate", label: "Speedup 1" },
      { key: "loop", label: "Loop 0" }
    ]);
    expect(viewModel.profileWorkbarView).toMatchObject({
      inputAriaLabel: "Profile name",
      inputReadOnly: true,
      inputValue: "fallback.yaml",
      label: "Profile"
    });
    expect(viewModel.profileWorkspaceModeView).toMatchObject({
      showRuntimeWorkspace: true,
      showStreamBuilderWorkspace: false
    });
    expect(viewModel.runtimePanels.map((panel) => [panel.key, panel.title, panel.badge])).toEqual([
      ["readiness", "Run Readiness", "Ready"],
      ["tunables", "Tunable Input", "2 declared"],
      ["command", "Command Status", "OK"]
    ]);
    expect(viewModel.runtimePanels[0].rows).toEqual([
      { key: "multiplier", label: "Multiplier", value: "25 percentage" },
      { key: "duration", label: "Duration", value: "continuous" },
      { key: "start-target", label: "Start target", value: "Selected port or all ports" }
    ]);
    expect(viewModel.runtimePanels[1]).toMatchObject({
      code: "declared: 2",
      description: "Declared script parameters are shown above."
    });
    expect(viewModel.runtimePanels[2]).toMatchObject({
      className: "profile-runtime-panel",
      code: null,
      description: "No command result yet."
    });
    expect(viewModel.runtimeStartDisabled).toBe(false);
    expect(viewModel.runtimeBarView).toMatchObject({
      ariaLabel: "Profile runtime",
      controlAriaLabelPrefix: "Profile traffic",
      controlClassName: "traffic-run-control--profile",
      controlFieldLabel: "Multiplier",
      controlVariant: "profile",
      show: true,
      title: "Runtime"
    });
    expect(viewModel.runtimeBarView.buttons.map((button) => [
      button.action,
      button.className,
      button.iconName,
      button.iconSize
    ])).toEqual([
      ["selected", "profile-runtime-button", "play", 14],
      ["all", "profile-runtime-button", "list-start", 14]
    ]);
    expect(runtimeProfilePanelViewModel({
      ...runtimePanelInput,
      isStarting: true
    }).runtimeStartDisabled).toBe(true);
    expect(runtimeProfilePanelViewModel({
      ...runtimePanelInput,
      profileTunablesError: "invalid tunable"
    }).runtimeStartDisabled).toBe(true);
    expect(Object.fromEntries(viewModel.runtimeProfileFacts.map((fact) => [fact.label, fact.value]))).toMatchObject({
      File: "bench.py",
      Path: "bench.py",
      Tunables: "2"
    });
    expect(viewModel.statusIsError).toBe(false);
    expect(viewModel.statusText).toBe("");
  });

  it("builds stream properties control state", () => {
    const baseStream = {
      action_count: 0,
      count: 4,
      enabled: true,
      flow_stats_enabled: true,
      frame_length: 64,
      frame_length_type: "Fixed",
      gtpu_enabled: false,
      ibg: 0.5,
      isg: 0.25,
      latency_enabled: true,
      mode: "continuous",
      name: "stream-1",
      next_stream_id: null,
      pkts_per_burst: 8,
      pg_id: 7,
      packet_type: "Ethernet/IPv4/UDP",
      rate_type: "pps",
      rate_value: 1000,
      self_start: false,
      total_pkts: 16,
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;
    const streams = [
      baseStream,
      {
        ...baseStream,
        mode: "burst",
        name: "stream-2"
      }
    ] as ProfileWorkbenchStream[];

    expect(streamPropertiesViewModel(baseStream, streams)).toMatchObject({
      burstCountDisabled: true,
      burstCountValue: "4",
      enabledChecked: true,
      modeOptions: [
        { checked: true, label: "Continuous", mode: "continuous" },
        { checked: false, label: "Burst", mode: "burst" },
        { checked: false, label: "Multi-Burst", mode: "multi_burst" }
      ],
      numbersDisabled: true,
      packet: {
        frameLengthDisabled: false,
        frameLengthValue: "64",
        name: "stream-1",
        packetType: "Ethernet/IPv4/UDP",
        packetTypeDisabled: false,
        packetTypeOptions: expect.arrayContaining([
          { label: "Ethernet", value: "Ethernet" },
          { label: "Ethernet/IPv4/UDP", value: "Ethernet/IPv4/UDP" },
          { label: "Ethernet/IPv6/SCTP", value: "Ethernet/IPv6/SCTP" }
        ])
      },
      packetsPerBurstDisabled: true,
      packetsPerBurstValue: "8",
      rateOptions: [
        { label: "pps", value: "pps" },
        { label: "bps L1", value: "bps L1" },
        { label: "bps L2", value: "bps L2" },
        { label: "percentage", value: "percentage" }
      ],
      rateType: "pps",
      rateValue: "1000",
      rxStats: {
        disabled: false,
        flowStatsChecked: true,
        latencyChecked: true,
        pgIdValue: "7"
      },
      selfStartChecked: false,
      timing: {
        ibgDisabled: true,
        ibgValue: "0.5",
        ipgValue: "0.001",
        isgValue: "0.25",
        showIpg: true
      },
      totalPacketsDisabled: false,
      totalPacketsValue: "16"
    });

    expect(streamPropertiesViewModel({ ...baseStream, mode: "burst" }, streams)).toMatchObject({
      burstCountDisabled: true,
      numbersDisabled: false,
      packetsPerBurstDisabled: true,
      totalPacketsDisabled: false
    });

    expect(streamPropertiesViewModel({ ...baseStream, mode: "multi_burst", self_start: true }, streams)).toMatchObject({
      burstCountDisabled: false,
      numbersDisabled: false,
      packetsPerBurstDisabled: false,
      selfStartChecked: true,
      timing: {
        ibgDisabled: false
      },
      totalPacketsDisabled: true
    });

    expect(streamPropertiesViewModel({
      ...baseStream,
      frame_length_type: "Increment",
      flow_stats_enabled: true,
      latency_enabled: true,
      packet_type: "Ethernet",
      rate_type: "bps L1",
      vxlan_enabled: true
    }, streams)).toMatchObject({
      packet: {
        frameLengthDisabled: true,
        packetTypeDisabled: true
      },
      rxStats: {
        disabled: true,
        flowStatsChecked: false,
        latencyChecked: false,
        pgIdValue: "7"
      },
      timing: {
        ipgValue: "",
        showIpg: false
      }
    });
  });

  it("builds frame length row control state", () => {
    const fixedStream = {
      frame_length: 64,
      frame_length_max: 1518,
      frame_length_min: 64,
      frame_length_type: "Fixed",
      gtpu_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(streamFrameLengthViewModel(fixedStream)).toEqual({
      frameLengthType: "Fixed",
      lengthDisabled: false,
      lengthValue: "64",
      maxDisabled: true,
      maxValue: "1518",
      minDisabled: true,
      minValue: "64",
      typeDisabled: false,
      typeOptions: [
        { label: "Fixed", value: "Fixed" },
        { label: "Increment", value: "Increment" },
        { label: "Decrement", value: "Decrement" },
        { label: "Random", value: "Random" }
      ]
    });

    expect(streamFrameLengthViewModel({ ...fixedStream, frame_length_type: "Increment" })).toMatchObject({
      lengthDisabled: true,
      maxDisabled: false,
      minDisabled: false,
      typeDisabled: false
    });

    expect(streamFrameLengthViewModel({
      ...fixedStream,
      frame_length_type: "Increment",
      vxlan_enabled: true
    })).toMatchObject({
      lengthDisabled: true,
      maxDisabled: false,
      minDisabled: false,
      typeDisabled: true
    });
  });

  it("builds Ethernet address protocol control state", () => {
    const baseStream = {
      ether_dst: "00:00:00:00:00:00",
      ether_dst_count: 16,
      ether_dst_mode: "TRex Config",
      ether_dst_step: 2,
      ether_src: "10:20:30:40:50:60",
      ether_src_count: 4,
      ether_src_mode: "Increment",
      ether_src_step: 1
    } as unknown as ProfileWorkbenchStream;

    expect(ethernetProtocolViewModel(baseStream)).toEqual({
      destination: {
        countDisabled: true,
        countValue: "16",
        mode: "TRex Config",
        modeOptions: ["Fixed", "Increment", "Decrement", "TRex Config"],
        stepDisabled: true,
        stepValue: "2",
        value: "00:00:00:00:00:00"
      },
      source: {
        countDisabled: false,
        countValue: "4",
        mode: "Increment",
        modeOptions: ["Fixed", "Increment", "Decrement", "TRex Config"],
        stepDisabled: false,
        stepValue: "1",
        value: "10:20:30:40:50:60"
      }
    });

    expect(ethernetProtocolViewModel({ ...baseStream, ether_src_mode: "Fixed" })).toMatchObject({
      source: {
        countDisabled: true,
        stepDisabled: true
      }
    });
  });

  it("builds IPv4 address protocol control state", () => {
    const baseStream = {
      ipv4_dst: "48.0.0.1",
      ipv4_dst_count: "1.5 K",
      ipv4_dst_mode: "Increment Host",
      ipv4_dst_step: 2,
      ipv4_src: "16.0.0.1",
      ipv4_src_count: 16,
      ipv4_src_mode: "Fixed",
      ipv4_src_step: 1
    } as unknown as ProfileWorkbenchStream;

    expect(ipv4AddressProtocolViewModel(baseStream)).toEqual({
      destination: {
        countDisabled: false,
        countValue: "1.5 K",
        mode: "Increment Host",
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        stepDisabled: false,
        stepValue: "2",
        value: "48.0.0.1"
      },
      source: {
        countDisabled: true,
        countValue: "16",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        stepDisabled: true,
        stepValue: "1",
        value: "16.0.0.1"
      }
    });
  });

  it("builds IPv4 scalar protocol control state", () => {
    const baseStream = {
      ipv4_dscp: 16,
      ipv4_dscp_count: 4,
      ipv4_dscp_mode: "Increment",
      ipv4_dscp_step: 2,
      ipv4_ecn: 3,
      ipv4_ecn_count: 3,
      ipv4_ecn_mode: "Fixed",
      ipv4_ecn_step: 1,
      ipv4_fragment_offset: 32,
      ipv4_fragment_offset_count: 8,
      ipv4_fragment_offset_mode: "Random",
      ipv4_fragment_offset_step: 4,
      ipv4_id: 4096,
      ipv4_id_count: 16,
      ipv4_id_mode: "Decrement",
      ipv4_id_step: 3,
      ipv4_ttl: 64,
      ipv4_ttl_count: 6,
      ipv4_ttl_mode: "Fixed",
      ipv4_ttl_step: 1
    } as unknown as ProfileWorkbenchStream;

    expect(ipv4ScalarProtocolViewModel(baseStream)).toEqual({
      dscp: {
        countDisabled: false,
        countValue: "4",
        mode: "Increment",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "2",
        value: "16"
      },
      ecn: {
        countDisabled: true,
        countValue: "3",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "3"
      },
      fragmentOffset: {
        countDisabled: false,
        countValue: "8",
        mode: "Random",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "4",
        value: "32"
      },
      identification: {
        countDisabled: false,
        countValue: "16",
        mode: "Decrement",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "3",
        value: "4096"
      },
      ttl: {
        countDisabled: true,
        countValue: "6",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "64"
      }
    });
  });

  it("builds IPv4 flags and checksum protocol control state", () => {
    const baseStream = {
      ipv4_checksum: "BEEF",
      ipv4_checksum_override: false,
      ipv4_flag_df: true,
      ipv4_flag_mf: false
    } as unknown as ProfileWorkbenchStream;

    expect(ipv4FlagsChecksumProtocolViewModel(baseStream)).toEqual({
      checksumDisabled: true,
      checksumOverrideChecked: false,
      checksumValue: "BEEF",
      dontFragmentChecked: true,
      moreFragmentsChecked: false
    });

    expect(ipv4FlagsChecksumProtocolViewModel({ ...baseStream, ipv4_checksum_override: true })).toMatchObject({
      checksumDisabled: false,
      checksumOverrideChecked: true
    });
  });

  it("builds ICMP protocol control state", () => {
    const baseStream = {
      icmp_checksum: "CAFE",
      icmp_checksum_override: true,
      icmp_code: 0,
      icmp_code_count: 5,
      icmp_code_mode: "Fixed",
      icmp_code_step: 1,
      icmp_identifier: 123,
      icmp_identifier_count: 8,
      icmp_identifier_mode: "Fixed",
      icmp_identifier_step: 2,
      icmp_sequence: 9,
      icmp_sequence_count: 7,
      icmp_sequence_mode: "Increment",
      icmp_sequence_step: 3,
      icmp_type: 128,
      icmp_type_count: 16,
      icmp_type_mode: "Random",
      icmp_type_step: 4
    } as unknown as ProfileWorkbenchStream;

    expect(icmpProtocolViewModel(baseStream, { echoEnabled: false, v6EchoEnabled: true })).toEqual({
      checksumOverrideChecked: true,
      checksumOverrideDisabled: true,
      checksumValue: "CAFE",
      checksumValueDisabled: true,
      code: {
        countDisabled: true,
        countValue: "5",
        mode: "Fixed",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "0"
      },
      identifier: {
        countDisabled: true,
        countValue: "8",
        mode: "Fixed",
        modeDisabled: true,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "2",
        value: "123"
      },
      sequence: {
        countDisabled: true,
        countValue: "7",
        mode: "Increment",
        modeDisabled: true,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "3",
        value: "9"
      },
      type: {
        countDisabled: false,
        countValue: "16",
        mode: "Random",
        modeDisabled: false,
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "4",
        value: "128"
      }
    });

    expect(icmpProtocolViewModel({ ...baseStream, icmp_sequence_mode: "Fixed", icmp_type_mode: "Fixed" }, {
      echoEnabled: true,
      v6EchoEnabled: true
    })).toMatchObject({
      checksumOverrideDisabled: false,
      checksumValueDisabled: false,
      sequence: {
        modeDisabled: false
      }
    });
  });

  it("builds ICMPv6 router advertisement control state", () => {
    const baseStream = {
      icmpv6_ra_cur_hop_limit: 64,
      icmpv6_ra_include_prefix: true,
      icmpv6_ra_include_slla: false,
      icmpv6_ra_managed: true,
      icmpv6_ra_other: false,
      icmpv6_ra_prefix: "2001:db8:1::",
      icmpv6_ra_prefix_autonomous: false,
      icmpv6_ra_prefix_length: 64,
      icmpv6_ra_prefix_on_link: true,
      icmpv6_ra_prefix_preferred_lifetime: 1800,
      icmpv6_ra_prefix_valid_lifetime: 3600,
      icmpv6_ra_reachable_time: 10,
      icmpv6_ra_retrans_timer: 20,
      icmpv6_ra_router_lifetime: 900,
      icmpv6_ra_slla_mac: "00:11:22:33:44:55"
    } as unknown as ProfileWorkbenchStream;

    expect(icmpv6RaProtocolViewModel(baseStream)).toEqual({
      currentHopLimitValue: "64",
      includePrefixChecked: true,
      includeSllaChecked: false,
      managedChecked: true,
      otherChecked: false,
      prefixAutonomousChecked: false,
      prefixAutonomousDisabled: false,
      prefixDisabled: false,
      prefixLengthDisabled: false,
      prefixLengthValue: "64",
      prefixOnLinkChecked: true,
      prefixOnLinkDisabled: false,
      prefixPreferredLifetimeDisabled: false,
      prefixPreferredLifetimeValue: "1800",
      prefixValidLifetimeDisabled: false,
      prefixValidLifetimeValue: "3600",
      prefixValue: "2001:db8:1::",
      reachableTimeValue: "10",
      retransTimerValue: "20",
      routerLifetimeValue: "900",
      sllaMacDisabled: true,
      sllaMacValue: "00:11:22:33:44:55"
    });

    expect(icmpv6RaProtocolViewModel({
      ...baseStream,
      icmpv6_ra_include_prefix: false,
      icmpv6_ra_include_slla: true
    })).toMatchObject({
      includePrefixChecked: false,
      includeSllaChecked: true,
      prefixAutonomousDisabled: true,
      prefixDisabled: true,
      prefixLengthDisabled: true,
      prefixOnLinkDisabled: true,
      prefixPreferredLifetimeDisabled: true,
      prefixValidLifetimeDisabled: true,
      sllaMacDisabled: false
    });
  });

  it("builds ICMPv6 router solicitation and neighbor discovery control state", () => {
    expect(icmpv6RsProtocolViewModel({
      icmpv6_rs_include_slla: false,
      icmpv6_rs_slla_mac: "00:11:22:33:44:55"
    } as unknown as ProfileWorkbenchStream)).toEqual({
      includeSllaChecked: false,
      sllaMacDisabled: true,
      sllaMacValue: "00:11:22:33:44:55"
    });

    expect(icmpv6RsProtocolViewModel({
      icmpv6_rs_include_slla: true,
      icmpv6_rs_slla_mac: "00:11:22:33:44:55"
    } as unknown as ProfileWorkbenchStream)).toMatchObject({
      includeSllaChecked: true,
      sllaMacDisabled: false
    });

    const baseNdStream = {
      icmp_type: 135,
      icmpv6_nd_include_option: false,
      icmpv6_nd_na_override: true,
      icmpv6_nd_na_router: false,
      icmpv6_nd_na_solicited: true,
      icmpv6_nd_option_mac: "00:aa:bb:cc:dd:ee",
      icmpv6_nd_target: "2001:db8::1"
    } as unknown as ProfileWorkbenchStream;

    expect(icmpv6NdProtocolViewModel(baseNdStream)).toEqual({
      includeOptionChecked: false,
      naFlagsVisible: false,
      naOverrideChecked: true,
      naRouterChecked: false,
      naSolicitedChecked: true,
      optionMacDisabled: true,
      optionMacValue: "00:aa:bb:cc:dd:ee",
      targetValue: "2001:db8::1"
    });

    expect(icmpv6NdProtocolViewModel({
      ...baseNdStream,
      icmp_type: 136,
      icmpv6_nd_include_option: true
    })).toMatchObject({
      includeOptionChecked: true,
      naFlagsVisible: true,
      optionMacDisabled: false
    });
  });

  it("builds IPv6 address protocol control state", () => {
    const baseStream = {
      ipv6_dst: "2001:db8::2",
      ipv6_dst_count: 16,
      ipv6_dst_mode: "Increment Host",
      ipv6_dst_step: 2,
      ipv6_src: "2001:db8::1",
      ipv6_src_count: 4,
      ipv6_src_mode: "Fixed",
      ipv6_src_step: 1
    } as unknown as ProfileWorkbenchStream;

    expect(ipv6AddressProtocolViewModel(baseStream)).toEqual({
      destination: {
        countDisabled: false,
        countValue: "16",
        mode: "Increment Host",
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        stepDisabled: false,
        stepValue: "2",
        value: "2001:db8::2"
      },
      source: {
        countDisabled: true,
        countValue: "4",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        stepDisabled: true,
        stepValue: "1",
        value: "2001:db8::1"
      }
    });
  });

  it("builds IPv6 scalar protocol control state", () => {
    const baseStream = {
      ipv6_flow_label: 2000,
      ipv6_flow_label_count: 64,
      ipv6_flow_label_mode: "Random",
      ipv6_flow_label_step: 8,
      ipv6_hop_limit: 64,
      ipv6_hop_limit_count: 6,
      ipv6_hop_limit_mode: "Fixed",
      ipv6_hop_limit_step: 1,
      ipv6_traffic_class: 32,
      ipv6_traffic_class_count: 16,
      ipv6_traffic_class_mode: "Increment",
      ipv6_traffic_class_step: 4
    } as unknown as ProfileWorkbenchStream;

    expect(ipv6ScalarProtocolViewModel(baseStream)).toEqual({
      flowLabel: {
        countDisabled: false,
        countValue: "64",
        mode: "Random",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "8",
        value: "2000"
      },
      hopLimit: {
        countDisabled: true,
        countValue: "6",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "64"
      },
      trafficClass: {
        countDisabled: false,
        countValue: "16",
        mode: "Increment",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "4",
        value: "32"
      }
    });
  });

  it("builds ARP protocol control state", () => {
    const baseStream = {
      arp_hardware_size: 6,
      arp_hardware_type: 1,
      arp_operation: 1,
      arp_operation_count: 4,
      arp_operation_mode: "Fixed",
      arp_operation_step: 1,
      arp_protocol_size: 4,
      arp_protocol_type: "0800",
      arp_sender_ip: "10.0.0.1",
      arp_sender_ip_count: 16,
      arp_sender_ip_mode: "Fixed",
      arp_sender_ip_step: 1,
      arp_sender_mac: "00:11:22:33:44:55",
      arp_sender_mac_count: 8,
      arp_sender_mac_mode: "Fixed",
      arp_sender_mac_step: 1,
      arp_target_ip: "10.0.0.2",
      arp_target_ip_count: 32,
      arp_target_ip_mode: "Random Host",
      arp_target_ip_step: 1,
      arp_target_mac: "66:55:44:33:22:11",
      arp_target_mac_count: 64,
      arp_target_mac_mode: "Increment",
      arp_target_mac_step: 2
    } as unknown as ProfileWorkbenchStream;

    expect(arpProtocolViewModel(baseStream)).toMatchObject({
      hardwareSizeValue: "6",
      hardwareTypeValue: "1",
      operation: {
        countDisabled: true,
        countValue: "4",
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        stepValue: "1",
        value: "1"
      },
      protocolSizeValue: "4",
      protocolTypeValue: "0800",
      senderIp: {
        countDisabled: true,
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
        stepDisabled: true,
        value: "10.0.0.1"
      },
      senderMac: {
        countDisabled: true,
        mode: "Fixed",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: true,
        value: "00:11:22:33:44:55"
      },
      targetIp: {
        countDisabled: false,
        countValue: "32",
        mode: "Random Host",
        stepDisabled: false,
        stepValue: "1",
        value: "10.0.0.2"
      },
      targetMac: {
        countDisabled: false,
        countValue: "64",
        mode: "Increment",
        modeOptions: ["Fixed", "Increment", "Decrement", "Random"],
        stepDisabled: false,
        stepValue: "2",
        value: "66:55:44:33:22:11"
      }
    });
  });

  it("builds media access protocol control state", () => {
    const baseStream = {
      ether_type: "88B5",
      ether_type_override: false,
      mpls_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vlan_enabled: false,
      vlan_tpid: "9100",
      vlan_tpid_override: false
    } as unknown as ProfileWorkbenchStream;

    expect(mediaAccessProtocolViewModel(baseStream)).toEqual({
      etherTypeOverrideChecked: false,
      etherTypeValue: "0800",
      typeValueDisabled: true
    });
    expect(mediaAccessProtocolViewModel({ ...baseStream, ether_type_override: true })).toEqual({
      etherTypeOverrideChecked: true,
      etherTypeValue: "88B5",
      typeValueDisabled: false
    });
    expect(mediaAccessProtocolViewModel({ ...baseStream, packet_type: "Ethernet/ARP" })).toMatchObject({
      etherTypeValue: "0806"
    });
    expect(mediaAccessProtocolViewModel({ ...baseStream, packet_type: "Ethernet/IPv6/UDP" })).toMatchObject({
      etherTypeValue: "86DD"
    });
    expect(mediaAccessProtocolViewModel({ ...baseStream, vlan_enabled: true })).toMatchObject({
      etherTypeValue: "8100"
    });
    expect(mediaAccessProtocolViewModel({
      ...baseStream,
      vlan_enabled: true,
      vlan_tpid_override: true
    })).toMatchObject({
      etherTypeValue: "9100"
    });
    expect(mediaAccessProtocolViewModel({ ...baseStream, mpls_enabled: true })).toMatchObject({
      etherTypeValue: "8847"
    });
  });

  it("builds outer VLAN protocol control state", () => {
    const baseStream = {
      mpls_enabled: false,
      packet_type: "Ethernet/IPv4/UDP",
      vlan2_enabled: false,
      vlan2_tpid: "88A8",
      vlan2_tpid_override: false,
      vlan_cfi: 1,
      vlan_enabled: true,
      vlan_id: 100,
      vlan_id_count: 16,
      vlan_id_mode: "Fixed",
      vlan_id_step: 2,
      vlan_priority: 3,
      vlan_priority_count: 4,
      vlan_priority_mode: "Fixed",
      vlan_priority_step: 1,
      vlan_tpid: "9100",
      vlan_tpid_override: false
    } as unknown as ProfileWorkbenchStream;

    expect(vlanProtocolViewModel(baseStream)).toMatchObject({
      cfiOptions: [0, 1],
      cfiValue: "1",
      enabled: true,
      idCountDisabled: true,
      idCountValue: "16",
      idMode: "Fixed",
      idStepDisabled: true,
      idStepValue: "2",
      innerTagChecked: false,
      payloadTypeValue: "0800",
      priorityCountDisabled: true,
      priorityCountValue: "4",
      priorityMode: "Fixed",
      priorityOptions: [0, 1, 2, 3, 4, 5, 6, 7],
      priorityStepDisabled: true,
      priorityStepValue: "1",
      priorityValue: "3",
      tpidDisabled: true,
      tpidOverrideChecked: false,
      tpidValue: "9100",
      vlanIdValue: "100"
    });

    expect(vlanProtocolViewModel({
      ...baseStream,
      vlan2_enabled: true,
      vlan2_tpid_override: true,
      vlan_id_mode: "Random",
      vlan_priority_mode: "Increment",
      vlan_tpid_override: true
    })).toMatchObject({
      idCountDisabled: false,
      idStepDisabled: false,
      innerTagChecked: true,
      payloadTypeValue: "88A8",
      priorityCountDisabled: false,
      priorityStepDisabled: false,
      tpidDisabled: false,
      tpidOverrideChecked: true
    });

    expect(vlanProtocolViewModel({
      ...baseStream,
      mpls_enabled: true,
      vlan2_enabled: false
    })).toMatchObject({
      payloadTypeValue: "8847"
    });

    expect(vlanProtocolViewModel({
      ...baseStream,
      vlan_enabled: false
    })).toMatchObject({
      enabled: false
    });
  });

  it("builds VLAN inner tag protocol control state", () => {
    const baseStream = {
      mpls_enabled: false,
      packet_type: "Ethernet/IPv6/UDP",
      vlan2_cfi: 0,
      vlan2_enabled: true,
      vlan2_id: 200,
      vlan2_id_count: 32,
      vlan2_id_mode: "Fixed",
      vlan2_id_step: 3,
      vlan2_priority: 4,
      vlan2_priority_count: 5,
      vlan2_priority_mode: "Fixed",
      vlan2_priority_step: 2,
      vlan2_tpid: "88A8",
      vlan2_tpid_override: false
    } as unknown as ProfileWorkbenchStream;

    expect(vlanInnerTagProtocolViewModel(baseStream)).toMatchObject({
      cfiOptions: [0, 1],
      cfiValue: "0",
      enabled: true,
      idCountDisabled: true,
      idCountValue: "32",
      idMode: "Fixed",
      idStepDisabled: true,
      idStepValue: "3",
      payloadTypeValue: "86DD",
      priorityCountDisabled: true,
      priorityCountValue: "5",
      priorityMode: "Fixed",
      priorityOptions: [0, 1, 2, 3, 4, 5, 6, 7],
      priorityStepDisabled: true,
      priorityStepValue: "2",
      priorityValue: "4",
      tpidDisabled: true,
      tpidOverrideChecked: false,
      tpidValue: "88A8",
      vlanIdValue: "200"
    });

    expect(vlanInnerTagProtocolViewModel({
      ...baseStream,
      vlan2_id_mode: "Increment",
      vlan2_priority_mode: "Random",
      vlan2_tpid_override: true
    })).toMatchObject({
      idCountDisabled: false,
      idStepDisabled: false,
      priorityCountDisabled: false,
      priorityStepDisabled: false,
      tpidDisabled: false,
      tpidOverrideChecked: true
    });

    expect(vlanInnerTagProtocolViewModel({
      ...baseStream,
      mpls_enabled: true,
      packet_type: "Ethernet/IPv4"
    })).toMatchObject({
      payloadTypeValue: "8847"
    });

    expect(vlanInnerTagProtocolViewModel({
      ...baseStream,
      vlan2_enabled: false
    })).toMatchObject({
      enabled: false
    });
  });

  it("builds MPLS protocol control state", () => {
    const baseStream = {
      mpls_enabled: true,
      mpls_label: 16,
      mpls_label2_enabled: false,
      mpls_label3_enabled: false,
      mpls_label_count: 8,
      mpls_label_mode: "Fixed",
      mpls_label_step: 2,
      mpls_tc: 3,
      mpls_tc_count: 4,
      mpls_tc_mode: "Fixed",
      mpls_tc_step: 1,
      mpls_ttl: 64,
      mpls_ttl_count: 6,
      mpls_ttl_mode: "Fixed",
      mpls_ttl_step: 5
    } as unknown as ProfileWorkbenchStream;

    expect(mplsProtocolViewModel(baseStream)).toMatchObject({
      bottomOfStackValue: "1",
      enabled: true,
      labelCountDisabled: true,
      labelCountValue: "8",
      labelMode: "Fixed",
      labelModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      labelStepDisabled: true,
      labelStepValue: "2",
      labelValue: "16",
      secondLabelChecked: false,
      thirdLabelChecked: false,
      thirdLabelDisabled: true,
      trafficClassCountDisabled: true,
      trafficClassCountValue: "4",
      trafficClassMode: "Fixed",
      trafficClassOptions: [0, 1, 2, 3, 4, 5, 6, 7],
      trafficClassStepDisabled: true,
      trafficClassStepValue: "1",
      trafficClassValue: "3",
      ttlCountDisabled: true,
      ttlCountValue: "6",
      ttlMode: "Fixed",
      ttlModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      ttlStepDisabled: true,
      ttlStepValue: "5",
      ttlValue: "64"
    });

    expect(mplsProtocolViewModel({
      ...baseStream,
      mpls_label2_enabled: true,
      mpls_label3_enabled: true,
      mpls_label_mode: "Increment",
      mpls_tc_mode: "Random",
      mpls_ttl_mode: "Decrement"
    })).toMatchObject({
      bottomOfStackValue: "0",
      labelCountDisabled: false,
      labelStepDisabled: false,
      secondLabelChecked: true,
      thirdLabelChecked: true,
      thirdLabelDisabled: false,
      trafficClassCountDisabled: false,
      trafficClassStepDisabled: false,
      ttlCountDisabled: false,
      ttlStepDisabled: false
    });

    expect(mplsProtocolViewModel({
      ...baseStream,
      mpls_enabled: false
    })).toMatchObject({
      enabled: false
    });
  });

  it("builds second MPLS label protocol control state", () => {
    const baseStream = {
      mpls_label2: 32,
      mpls_label2_count: 9,
      mpls_label2_enabled: true,
      mpls_label2_mode: "Fixed",
      mpls_label2_step: 3,
      mpls_label2_tc: 5,
      mpls_label2_tc_count: 6,
      mpls_label2_tc_mode: "Fixed",
      mpls_label2_tc_step: 2,
      mpls_label2_ttl: 63,
      mpls_label2_ttl_count: 7,
      mpls_label2_ttl_mode: "Fixed",
      mpls_label2_ttl_step: 4,
      mpls_label3_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(mplsSecondLabelProtocolViewModel(baseStream)).toMatchObject({
      bottomOfStackValue: "1",
      enabled: true,
      labelCountDisabled: true,
      labelCountValue: "9",
      labelMode: "Fixed",
      labelModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      labelStepDisabled: true,
      labelStepValue: "3",
      labelValue: "32",
      trafficClassCountDisabled: true,
      trafficClassCountValue: "6",
      trafficClassMode: "Fixed",
      trafficClassOptions: [0, 1, 2, 3, 4, 5, 6, 7],
      trafficClassStepDisabled: true,
      trafficClassStepValue: "2",
      trafficClassValue: "5",
      ttlCountDisabled: true,
      ttlCountValue: "7",
      ttlMode: "Fixed",
      ttlModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      ttlStepDisabled: true,
      ttlStepValue: "4",
      ttlValue: "63"
    });

    expect(mplsSecondLabelProtocolViewModel({
      ...baseStream,
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true
    })).toMatchObject({
      bottomOfStackValue: "0",
      labelCountDisabled: false,
      labelStepDisabled: false,
      trafficClassCountDisabled: false,
      trafficClassStepDisabled: false,
      ttlCountDisabled: false,
      ttlStepDisabled: false
    });

    expect(mplsSecondLabelProtocolViewModel({
      ...baseStream,
      mpls_label2_enabled: false
    })).toMatchObject({
      enabled: false
    });
  });

  it("builds third MPLS label protocol control state", () => {
    const baseStream = {
      mpls_label2_enabled: true,
      mpls_label3: 48,
      mpls_label3_count: 10,
      mpls_label3_enabled: true,
      mpls_label3_mode: "Fixed",
      mpls_label3_step: 4,
      mpls_label3_tc: 6,
      mpls_label3_tc_count: 7,
      mpls_label3_tc_mode: "Fixed",
      mpls_label3_tc_step: 3,
      mpls_label3_ttl: 62,
      mpls_label3_ttl_count: 8,
      mpls_label3_ttl_mode: "Fixed",
      mpls_label3_ttl_step: 5
    } as unknown as ProfileWorkbenchStream;

    expect(mplsThirdLabelProtocolViewModel(baseStream)).toMatchObject({
      bottomOfStackValue: "1",
      enabled: true,
      labelCountDisabled: true,
      labelCountValue: "10",
      labelMode: "Fixed",
      labelModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      labelStepDisabled: true,
      labelStepValue: "4",
      labelValue: "48",
      trafficClassCountDisabled: true,
      trafficClassCountValue: "7",
      trafficClassMode: "Fixed",
      trafficClassOptions: [0, 1, 2, 3, 4, 5, 6, 7],
      trafficClassStepDisabled: true,
      trafficClassStepValue: "3",
      trafficClassValue: "6",
      ttlCountDisabled: true,
      ttlCountValue: "8",
      ttlMode: "Fixed",
      ttlModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      ttlStepDisabled: true,
      ttlStepValue: "5",
      ttlValue: "62"
    });

    expect(mplsThirdLabelProtocolViewModel({
      ...baseStream,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Random",
      mpls_label3_ttl_mode: "Decrement"
    })).toMatchObject({
      labelCountDisabled: false,
      labelStepDisabled: false,
      trafficClassCountDisabled: false,
      trafficClassStepDisabled: false,
      ttlCountDisabled: false,
      ttlStepDisabled: false
    });

    expect(mplsThirdLabelProtocolViewModel({
      ...baseStream,
      mpls_label2_enabled: false
    })).toMatchObject({
      enabled: false
    });

    expect(mplsThirdLabelProtocolViewModel({
      ...baseStream,
      mpls_label3_enabled: false
    })).toMatchObject({
      enabled: false
    });
  });

  it("builds VXLAN protocol control state", () => {
    const baseStream = {
      vxlan_enabled: true,
      vxlan_inner_ether_dst: "66:55:44:33:22:11",
      vxlan_inner_ether_src: "10:20:30:40:50:60",
      vxlan_inner_ip_version: "IPv4",
      vxlan_inner_ipv4_dst: "10.1.0.20",
      vxlan_inner_ipv4_dst_count: 5,
      vxlan_inner_ipv4_dst_mode: "Fixed",
      vxlan_inner_ipv4_dst_step: 2,
      vxlan_inner_ipv4_src: "10.1.0.10",
      vxlan_inner_ipv4_src_count: 4,
      vxlan_inner_ipv4_src_mode: "Fixed",
      vxlan_inner_ipv4_src_step: 1,
      vxlan_inner_ipv4_ttl: 64,
      vxlan_inner_ipv4_ttl_count: 6,
      vxlan_inner_ipv4_ttl_mode: "Fixed",
      vxlan_inner_ipv4_ttl_step: 2,
      vxlan_inner_ipv6_dst: "2001:db8:50::20",
      vxlan_inner_ipv6_dst_count: 9,
      vxlan_inner_ipv6_dst_mode: "Fixed",
      vxlan_inner_ipv6_dst_step: 5,
      vxlan_inner_ipv6_hop_limit: 63,
      vxlan_inner_ipv6_hop_limit_count: 7,
      vxlan_inner_ipv6_hop_limit_mode: "Fixed",
      vxlan_inner_ipv6_hop_limit_step: 3,
      vxlan_inner_ipv6_src: "2001:db8:50::10",
      vxlan_inner_ipv6_src_count: 8,
      vxlan_inner_ipv6_src_mode: "Fixed",
      vxlan_inner_ipv6_src_step: 4,
      vxlan_inner_l4_dst_port: 4789,
      vxlan_inner_l4_dst_port_count: 11,
      vxlan_inner_l4_dst_port_mode: "Fixed",
      vxlan_inner_l4_dst_port_step: 7,
      vxlan_inner_l4_src_port: 1025,
      vxlan_inner_l4_src_port_count: 10,
      vxlan_inner_l4_src_port_mode: "Fixed",
      vxlan_inner_l4_src_port_step: 6,
      vxlan_vni: 100,
      vxlan_vni_count: 8,
      vxlan_vni_mode: "Fixed",
      vxlan_vni_step: 4
    } as unknown as ProfileWorkbenchStream;

    expect(vxlanProtocolViewModel(baseStream)).toMatchObject({
      enabled: true,
      innerEtherDstValue: "66:55:44:33:22:11",
      innerEtherProtocolValue: "IPv4",
      innerEtherSrcValue: "10:20:30:40:50:60",
      innerEtherTypeValue: "0800",
      innerIpVersion: "IPv4",
      innerIpVersionOptions: ["IPv4", "IPv6"],
      innerIpv4AddressModeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
      innerIpv4DstCountDisabled: true,
      innerIpv4DstCountValue: "5",
      innerIpv4DstMode: "Fixed",
      innerIpv4DstStepDisabled: true,
      innerIpv4DstStepValue: "2",
      innerIpv4DstValue: "10.1.0.20",
      innerIpv4SrcCountDisabled: true,
      innerIpv4SrcCountValue: "4",
      innerIpv4SrcMode: "Fixed",
      innerIpv4SrcStepDisabled: true,
      innerIpv4SrcStepValue: "1",
      innerIpv4SrcValue: "10.1.0.10",
      innerIpv4TtlCountDisabled: true,
      innerIpv4TtlCountValue: "6",
      innerIpv4TtlMode: "Fixed",
      innerIpv4TtlModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerIpv4TtlStepDisabled: true,
      innerIpv4TtlStepValue: "2",
      innerIpv4TtlValue: "64",
      innerIpv6AddressModeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
      innerIpv6DstCountDisabled: true,
      innerIpv6DstCountValue: "9",
      innerIpv6DstMode: "Fixed",
      innerIpv6DstStepDisabled: true,
      innerIpv6DstStepValue: "5",
      innerIpv6DstValue: "2001:db8:50::20",
      innerIpv6HopLimitCountDisabled: true,
      innerIpv6HopLimitCountValue: "7",
      innerIpv6HopLimitMode: "Fixed",
      innerIpv6HopLimitModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerIpv6HopLimitStepDisabled: true,
      innerIpv6HopLimitStepValue: "3",
      innerIpv6HopLimitValue: "63",
      innerIpv6SrcCountDisabled: true,
      innerIpv6SrcCountValue: "8",
      innerIpv6SrcMode: "Fixed",
      innerIpv6SrcStepDisabled: true,
      innerIpv6SrcStepValue: "4",
      innerIpv6SrcValue: "2001:db8:50::10",
      innerL4DstPortCountDisabled: true,
      innerL4DstPortCountValue: "11",
      innerL4DstPortMode: "Fixed",
      innerL4DstPortStepDisabled: true,
      innerL4DstPortStepValue: "7",
      innerL4DstPortValue: "4789",
      innerL4PortModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerL4SrcPortCountDisabled: true,
      innerL4SrcPortCountValue: "10",
      innerL4SrcPortMode: "Fixed",
      innerL4SrcPortStepDisabled: true,
      innerL4SrcPortStepValue: "6",
      innerL4SrcPortValue: "1025",
      udpPortValue: "4789",
      usesIpv6: false,
      vniCountDisabled: true,
      vniCountValue: "8",
      vniMode: "Fixed",
      vniModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      vniStepDisabled: true,
      vniStepValue: "4",
      vniValue: "100"
    });

    expect(vxlanProtocolViewModel({
      ...baseStream,
      vxlan_inner_ip_version: "IPv6",
      vxlan_inner_ipv4_dst_mode: "Random Host",
      vxlan_inner_ipv4_src_mode: "Increment Host",
      vxlan_inner_ipv4_ttl_mode: "Decrement",
      vxlan_inner_ipv6_dst_mode: "Decrement Host",
      vxlan_inner_ipv6_hop_limit_mode: "Random",
      vxlan_inner_ipv6_src_mode: "Increment Host",
      vxlan_inner_l4_dst_port_mode: "Decrement",
      vxlan_inner_l4_src_port_mode: "Increment",
      vxlan_vni_mode: "Increment"
    })).toMatchObject({
      innerEtherProtocolValue: "IPv6",
      innerEtherTypeValue: "86dd",
      innerIpv4DstCountDisabled: false,
      innerIpv4DstStepDisabled: false,
      innerIpv4SrcCountDisabled: false,
      innerIpv4SrcStepDisabled: false,
      innerIpv4TtlCountDisabled: false,
      innerIpv4TtlStepDisabled: false,
      innerIpv6DstCountDisabled: false,
      innerIpv6DstStepDisabled: false,
      innerIpv6HopLimitCountDisabled: false,
      innerIpv6HopLimitStepDisabled: false,
      innerIpv6SrcCountDisabled: false,
      innerIpv6SrcStepDisabled: false,
      innerL4DstPortCountDisabled: false,
      innerL4DstPortStepDisabled: false,
      innerL4SrcPortCountDisabled: false,
      innerL4SrcPortStepDisabled: false,
      usesIpv6: true,
      vniCountDisabled: false,
      vniStepDisabled: false
    });

    expect(vxlanProtocolViewModel({
      ...baseStream,
      vxlan_enabled: false
    })).toMatchObject({
      enabled: false
    });
  });

  it("builds protocol selection radio groups", () => {
    const baseStream = {
      gtpu_enabled: false,
      mpls_enabled: true,
      packet_type: "Ethernet/IPv4/UDP",
      payload_enabled: true,
      vlan_enabled: true,
      vxlan_enabled: false
    } as unknown as ProfileWorkbenchStream;

    expect(protocolSelectionViewModel(baseStream)).toEqual({
      l3Options: [
        { checked: false, disabled: false, label: "None", value: "None" },
        { checked: false, disabled: false, label: "ARP", value: "ARP" },
        { checked: true, disabled: false, label: "IPv4", value: "IPv4" },
        { checked: false, disabled: false, label: "IPv6", value: "IPv6" }
      ],
      l4Options: [
        { checked: false, disabled: false, label: "None", value: "None" },
        { checked: false, disabled: false, label: "TCP", value: "TCP" },
        { checked: true, disabled: false, label: "UDP", value: "UDP" },
        { checked: false, disabled: false, label: "SCTP", value: "SCTP" },
        { checked: false, disabled: false, label: "ICMP", value: "ICMP" },
        { checked: false, disabled: false, label: "GRE", value: "GRE" }
      ],
      mplsOptions: [
        { checked: false, disabled: false, label: "No MPLS", value: false },
        { checked: true, disabled: false, label: "MPLS", value: true }
      ],
      payloadOptions: [
        { checked: false, disabled: false, label: "None", value: false },
        { checked: true, disabled: false, label: "Pattern", value: true }
      ],
      tunnelOptions: [
        { checked: true, disabled: false, label: "No Tunnel", value: "none" },
        { checked: false, disabled: false, label: "VXLAN", value: "vxlan" },
        { checked: false, disabled: false, label: "GTP-U", value: "gtpu" }
      ],
      vlanOptions: [
        { checked: false, disabled: false, label: "Untagged", value: false },
        { checked: true, disabled: false, label: "Tagged", value: true }
      ]
    });

    expect(protocolSelectionViewModel({ ...baseStream, vxlan_enabled: true })).toMatchObject({
      l3Options: [
        { disabled: true, value: "None" },
        { disabled: true, value: "ARP" },
        { disabled: false, value: "IPv4" },
        { disabled: true, value: "IPv6" }
      ],
      l4Options: [
        { disabled: true, value: "None" },
        { disabled: true, value: "TCP" },
        { checked: true, disabled: false, value: "UDP" },
        { disabled: true, value: "SCTP" },
        { disabled: true, value: "ICMP" },
        { disabled: true, value: "GRE" }
      ],
      tunnelOptions: [
        { checked: false, value: "none" },
        { checked: true, value: "vxlan" },
        { checked: false, value: "gtpu" }
      ]
    });

    expect(protocolSelectionViewModel({
      ...baseStream,
      mpls_enabled: false,
      packet_type: "Ethernet",
      payload_enabled: false,
      vlan_enabled: false
    })).toMatchObject({
      l3Options: [
        { checked: true, disabled: false, value: "None" },
        { checked: false, disabled: false, value: "ARP" },
        { checked: false, disabled: false, value: "IPv4" },
        { checked: false, disabled: false, value: "IPv6" }
      ],
      l4Options: [
        { disabled: true, value: "None" },
        { disabled: true, value: "TCP" },
        { disabled: true, value: "UDP" },
        { disabled: true, value: "SCTP" },
        { disabled: true, value: "ICMP" },
        { disabled: true, value: "GRE" }
      ],
      mplsOptions: [
        { checked: true, value: false },
        { checked: false, disabled: true, value: true }
      ],
      payloadOptions: [
        { checked: true, value: false },
        { checked: false, value: true }
      ],
      vlanOptions: [
        { checked: true, value: false },
        { checked: false, value: true }
      ]
    });
  });

  it("builds payload and advanced settings control state", () => {
    const baseStream = {
      advanced_cache_size_type: "Enable",
      advanced_cache_value: 4096,
      payload_enabled: true,
      payload_pattern: "AA BB CC DD",
      payload_type: "Fixed Word"
    } as unknown as ProfileWorkbenchStream;

    expect(payloadSettingsViewModel(baseStream)).toEqual({
      enabled: true,
      patternDisabled: false,
      patternValue: "AA BB CC DD",
      type: "Fixed Word",
      typeOptions: ["Fixed Word", "Increment Byte", "Decrement Byte", "Random"]
    });
    expect(advancedSettingsViewModel(baseStream)).toEqual({
      cacheSizeType: "Enable",
      cacheSizeTypeOptions: ["Auto", "Enable", "Disable"],
      cacheValue: "4096",
      cacheValueDisabled: false
    });
    expect(payloadSettingsViewModel({
      ...baseStream,
      payload_type: "Random"
    })).toMatchObject({
      patternDisabled: true,
      type: "Random"
    });
    expect(advancedSettingsViewModel({
      ...baseStream,
      advanced_cache_size_type: "Auto"
    })).toMatchObject({
      cacheSizeType: "Auto",
      cacheValueDisabled: true
    });
  });

  it("owns the Advanced Settings panel presentation contract", () => {
    expect(advancedSettingsPanelViewModel()).toEqual({
      cacheSize: {
        ariaLabel: "Cache size type",
        label: "Cache size"
      },
      cacheValue: {
        ariaLabel: "Cache size value",
        max: 999999,
        min: 0,
        type: "number"
      },
      className: "advanced-settings-pane"
    });
  });

  it("builds GTP-U protocol control state", () => {
    const baseStream = {
      gtpu_enabled: true,
      gtpu_extension_enabled: true,
      gtpu_extension_udp_port: 2152,
      gtpu_extension_udp_port_count: 7,
      gtpu_extension_udp_port_mode: "Fixed",
      gtpu_extension_udp_port_step: 4,
      gtpu_inner_ip_version: "IPv4",
      gtpu_inner_ipv4_ttl: 64,
      gtpu_inner_ipv4_ttl_count: 12,
      gtpu_inner_ipv4_ttl_mode: "Fixed",
      gtpu_inner_ipv4_ttl_step: 3,
      gtpu_inner_ipv4_dst: "172.16.0.20",
      gtpu_inner_ipv4_dst_count: 5,
      gtpu_inner_ipv4_dst_mode: "Fixed",
      gtpu_inner_ipv4_dst_step: 2,
      gtpu_inner_ipv4_src: "172.16.0.10",
      gtpu_inner_ipv4_src_count: 4,
      gtpu_inner_ipv4_src_mode: "Fixed",
      gtpu_inner_ipv4_src_step: 1,
      gtpu_inner_ipv6_dst: "2001:db8:60::20",
      gtpu_inner_ipv6_dst_count: 9,
      gtpu_inner_ipv6_dst_mode: "Fixed",
      gtpu_inner_ipv6_dst_step: 5,
      gtpu_inner_ipv6_hop_limit: 63,
      gtpu_inner_ipv6_hop_limit_count: 13,
      gtpu_inner_ipv6_hop_limit_mode: "Fixed",
      gtpu_inner_ipv6_hop_limit_step: 4,
      gtpu_inner_ipv6_src: "2001:db8:60::10",
      gtpu_inner_ipv6_src_count: 8,
      gtpu_inner_ipv6_src_mode: "Fixed",
      gtpu_inner_ipv6_src_step: 4,
      gtpu_inner_l4_dst_port: 2048,
      gtpu_inner_l4_dst_port_count: 11,
      gtpu_inner_l4_dst_port_mode: "Fixed",
      gtpu_inner_l4_dst_port_step: 7,
      gtpu_inner_l4_src_port: 1025,
      gtpu_inner_l4_src_port_count: 10,
      gtpu_inner_l4_src_port_mode: "Fixed",
      gtpu_inner_l4_src_port_step: 6,
      gtpu_message_type: 255,
      gtpu_npdu: 9,
      gtpu_npdu_count: 8,
      gtpu_npdu_enabled: false,
      gtpu_npdu_mode: "Fixed",
      gtpu_npdu_step: 5,
      gtpu_sequence: 42,
      gtpu_sequence_count: 4,
      gtpu_sequence_enabled: true,
      gtpu_sequence_mode: "Fixed",
      gtpu_sequence_step: 2,
      gtpu_teid: 0x12345678,
      gtpu_teid_count: 6,
      gtpu_teid_mode: "Fixed",
      gtpu_teid_step: 3
    } as unknown as ProfileWorkbenchStream;

    expect(gtpuProtocolViewModel(baseStream)).toEqual({
      enabled: true,
      extensionEnabled: true,
      extensionTypeValue: "UDP Port (0x40)",
      extensionUdpPortCountDisabled: true,
      extensionUdpPortCountValue: "7",
      extensionUdpPortDisabled: false,
      extensionUdpPortMode: "Fixed",
      extensionUdpPortModeDisabled: false,
      extensionUdpPortModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      extensionUdpPortStepDisabled: true,
      extensionUdpPortStepValue: "4",
      extensionUdpPortValue: "2152",
      innerIpv4AddressModeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
      innerIpv4DstCountDisabled: true,
      innerIpv4DstCountValue: "5",
      innerIpv4DstMode: "Fixed",
      innerIpv4DstStepDisabled: true,
      innerIpv4DstStepValue: "2",
      innerIpv4DstValue: "172.16.0.20",
      innerIpv4SrcCountDisabled: true,
      innerIpv4SrcCountValue: "4",
      innerIpv4SrcMode: "Fixed",
      innerIpv4SrcStepDisabled: true,
      innerIpv4SrcStepValue: "1",
      innerIpv4SrcValue: "172.16.0.10",
      innerIpv4TtlCountDisabled: true,
      innerIpv4TtlCountValue: "12",
      innerIpv4TtlMode: "Fixed",
      innerIpv4TtlModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerIpv4TtlStepDisabled: true,
      innerIpv4TtlStepValue: "3",
      innerIpv4TtlValue: "64",
      innerIpv6AddressModeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
      innerIpv6DstCountDisabled: true,
      innerIpv6DstCountValue: "9",
      innerIpv6DstMode: "Fixed",
      innerIpv6DstStepDisabled: true,
      innerIpv6DstStepValue: "5",
      innerIpv6DstValue: "2001:db8:60::20",
      innerIpv6HopLimitCountDisabled: true,
      innerIpv6HopLimitCountValue: "13",
      innerIpv6HopLimitMode: "Fixed",
      innerIpv6HopLimitModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerIpv6HopLimitStepDisabled: true,
      innerIpv6HopLimitStepValue: "4",
      innerIpv6HopLimitValue: "63",
      innerIpv6SrcCountDisabled: true,
      innerIpv6SrcCountValue: "8",
      innerIpv6SrcMode: "Fixed",
      innerIpv6SrcStepDisabled: true,
      innerIpv6SrcStepValue: "4",
      innerIpv6SrcValue: "2001:db8:60::10",
      innerIpVersion: "IPv4",
      innerIpVersionOptions: ["IPv4", "IPv6"],
      innerL4DstPortCountDisabled: true,
      innerL4DstPortCountValue: "11",
      innerL4DstPortMode: "Fixed",
      innerL4DstPortStepDisabled: true,
      innerL4DstPortStepValue: "7",
      innerL4DstPortValue: "2048",
      innerL4PortModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerL4SrcPortCountDisabled: true,
      innerL4SrcPortCountValue: "10",
      innerL4SrcPortMode: "Fixed",
      innerL4SrcPortStepDisabled: true,
      innerL4SrcPortStepValue: "6",
      innerL4SrcPortValue: "1025",
      messageTypeValue: "255",
      npduCountDisabled: true,
      npduCountValue: "8",
      npduEnabled: false,
      npduMode: "Fixed",
      npduModeDisabled: true,
      npduModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      npduStepDisabled: true,
      npduStepValue: "5",
      npduValue: "9",
      npduValueDisabled: true,
      sequenceCountDisabled: true,
      sequenceCountValue: "4",
      sequenceEnabled: true,
      sequenceMode: "Fixed",
      sequenceModeDisabled: false,
      sequenceModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      sequenceStepDisabled: true,
      sequenceStepValue: "2",
      sequenceValue: "42",
      sequenceValueDisabled: false,
      teidCountDisabled: true,
      teidCountValue: "6",
      teidMode: "Fixed",
      teidModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      teidStepDisabled: true,
      teidStepValue: "3",
      teidValue: String(0x12345678),
      udpPortValue: "2152",
      usesIpv6: false
    });

    expect(gtpuProtocolViewModel({
      ...baseStream,
      gtpu_extension_udp_port_mode: "Random",
      gtpu_inner_ip_version: "IPv6",
      gtpu_inner_ipv4_dst_mode: "Random Host",
      gtpu_inner_ipv4_src_mode: "Increment Host",
      gtpu_inner_ipv4_ttl_mode: "Increment",
      gtpu_inner_ipv6_dst_mode: "Decrement Host",
      gtpu_inner_ipv6_hop_limit_mode: "Random",
      gtpu_inner_ipv6_src_mode: "Increment Host",
      gtpu_inner_l4_dst_port_mode: "Random",
      gtpu_inner_l4_src_port_mode: "Increment",
      gtpu_npdu_enabled: true,
      gtpu_npdu_mode: "Decrement",
      gtpu_sequence_mode: "Increment",
      gtpu_teid_mode: "Increment"
    })).toMatchObject({
      extensionUdpPortCountDisabled: false,
      extensionUdpPortStepDisabled: false,
      innerIpv4DstCountDisabled: false,
      innerIpv4DstStepDisabled: false,
      innerIpv4SrcCountDisabled: false,
      innerIpv4SrcStepDisabled: false,
      innerIpv4TtlCountDisabled: false,
      innerIpv4TtlStepDisabled: false,
      innerIpVersion: "IPv6",
      innerIpv6DstCountDisabled: false,
      innerIpv6DstStepDisabled: false,
      innerIpv6HopLimitCountDisabled: false,
      innerIpv6HopLimitStepDisabled: false,
      innerIpv6SrcCountDisabled: false,
      innerIpv6SrcStepDisabled: false,
      innerL4DstPortCountDisabled: false,
      innerL4DstPortStepDisabled: false,
      innerL4SrcPortCountDisabled: false,
      innerL4SrcPortStepDisabled: false,
      npduCountDisabled: false,
      npduModeDisabled: false,
      npduStepDisabled: false,
      npduValueDisabled: false,
      sequenceCountDisabled: false,
      sequenceStepDisabled: false,
      teidCountDisabled: false,
      teidStepDisabled: false,
      usesIpv6: true
    });
  });

  it("builds GRE protocol control state", () => {
    const baseStream = {
      gre_checksum: "1a2b",
      gre_checksum_override: true,
      gre_checksum_present: true,
      gre_inner_ip_version: "IPv4",
      gre_inner_ipv4_dst: "10.30.0.20",
      gre_inner_ipv4_dst_count: 5,
      gre_inner_ipv4_dst_mode: "Fixed",
      gre_inner_ipv4_dst_step: 2,
      gre_inner_ipv4_src: "10.30.0.10",
      gre_inner_ipv4_src_count: 4,
      gre_inner_ipv4_src_mode: "Fixed",
      gre_inner_ipv4_src_step: 1,
      gre_inner_ipv4_ttl: 64,
      gre_inner_ipv4_ttl_count: 6,
      gre_inner_ipv4_ttl_mode: "Fixed",
      gre_inner_ipv4_ttl_step: 2,
      gre_inner_ipv6_dst: "2001:db8:70::20",
      gre_inner_ipv6_dst_count: 9,
      gre_inner_ipv6_dst_mode: "Fixed",
      gre_inner_ipv6_dst_step: 5,
      gre_inner_ipv6_hop_limit: 63,
      gre_inner_ipv6_hop_limit_count: 7,
      gre_inner_ipv6_hop_limit_mode: "Fixed",
      gre_inner_ipv6_hop_limit_step: 3,
      gre_inner_ipv6_src: "2001:db8:70::10",
      gre_inner_ipv6_src_count: 8,
      gre_inner_ipv6_src_mode: "Fixed",
      gre_inner_ipv6_src_step: 4,
      gre_inner_l4_dst_port: 2048,
      gre_inner_l4_dst_port_count: 11,
      gre_inner_l4_dst_port_mode: "Fixed",
      gre_inner_l4_dst_port_step: 7,
      gre_inner_l4_src_port: 1025,
      gre_inner_l4_src_port_count: 10,
      gre_inner_l4_src_port_mode: "Fixed",
      gre_inner_l4_src_port_step: 6,
      gre_key: 1234,
      gre_key_count: 5,
      gre_key_mode: "Fixed",
      gre_key_present: true,
      gre_key_step: 2,
      gre_protocol_type: "0800",
      gre_sequence: 77,
      gre_sequence_count: 9,
      gre_sequence_mode: "Fixed",
      gre_sequence_present: true,
      gre_sequence_step: 3
    } as unknown as ProfileWorkbenchStream;

    expect(greProtocolViewModel(baseStream)).toEqual({
      checksumOverride: true,
      checksumOverrideDisabled: false,
      checksumPresent: true,
      checksumPresentDisabled: false,
      checksumValue: "1a2b",
      checksumValueDisabled: false,
      innerIpVersion: "IPv4",
      innerIpVersionOptions: ["IPv4", "IPv6"],
      innerIpv4AddressModeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
      innerIpv4DstCountDisabled: true,
      innerIpv4DstCountValue: "5",
      innerIpv4DstMode: "Fixed",
      innerIpv4DstStepDisabled: true,
      innerIpv4DstStepValue: "2",
      innerIpv4DstValue: "10.30.0.20",
      innerIpv4SrcCountDisabled: true,
      innerIpv4SrcCountValue: "4",
      innerIpv4SrcMode: "Fixed",
      innerIpv4SrcStepDisabled: true,
      innerIpv4SrcStepValue: "1",
      innerIpv4SrcValue: "10.30.0.10",
      innerIpv4TtlCountDisabled: true,
      innerIpv4TtlCountValue: "6",
      innerIpv4TtlMode: "Fixed",
      innerIpv4TtlModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerIpv4TtlStepDisabled: true,
      innerIpv4TtlStepValue: "2",
      innerIpv4TtlValue: "64",
      innerIpv6AddressModeOptions: ["Fixed", "Increment Host", "Decrement Host", "Random Host"],
      innerIpv6DstCountDisabled: true,
      innerIpv6DstCountValue: "9",
      innerIpv6DstMode: "Fixed",
      innerIpv6DstStepDisabled: true,
      innerIpv6DstStepValue: "5",
      innerIpv6DstValue: "2001:db8:70::20",
      innerIpv6HopLimitCountDisabled: true,
      innerIpv6HopLimitCountValue: "7",
      innerIpv6HopLimitMode: "Fixed",
      innerIpv6HopLimitModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerIpv6HopLimitStepDisabled: true,
      innerIpv6HopLimitStepValue: "3",
      innerIpv6HopLimitValue: "63",
      innerIpv6SrcCountDisabled: true,
      innerIpv6SrcCountValue: "8",
      innerIpv6SrcMode: "Fixed",
      innerIpv6SrcStepDisabled: true,
      innerIpv6SrcStepValue: "4",
      innerIpv6SrcValue: "2001:db8:70::10",
      innerL4DstPortCountDisabled: true,
      innerL4DstPortCountValue: "11",
      innerL4DstPortMode: "Fixed",
      innerL4DstPortStepDisabled: true,
      innerL4DstPortStepValue: "7",
      innerL4DstPortValue: "2048",
      innerL4PortModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      innerL4SrcPortCountDisabled: true,
      innerL4SrcPortCountValue: "10",
      innerL4SrcPortMode: "Fixed",
      innerL4SrcPortStepDisabled: true,
      innerL4SrcPortStepValue: "6",
      innerL4SrcPortValue: "1025",
      keyCountDisabled: true,
      keyCountValue: "5",
      keyMode: "Fixed",
      keyModeDisabled: false,
      keyModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      keyPresent: true,
      keyStepDisabled: true,
      keyStepValue: "2",
      keyValue: "1234",
      keyValueDisabled: false,
      protocolTypeValue: "0800",
      sequenceCountDisabled: true,
      sequenceCountValue: "9",
      sequenceMode: "Fixed",
      sequenceModeDisabled: false,
      sequenceModeOptions: ["Fixed", "Increment", "Decrement", "Random"],
      sequencePresent: true,
      sequenceStepDisabled: true,
      sequenceStepValue: "3",
      sequenceValue: "77",
      sequenceValueDisabled: false,
      usesIpv6: false
    });

    expect(greProtocolViewModel({
      ...baseStream,
      gre_checksum_override: false,
      gre_checksum_present: false,
      gre_inner_ip_version: "IPv6",
      gre_inner_ipv4_dst_mode: "Random Host",
      gre_inner_ipv4_src_mode: "Increment Host",
      gre_inner_ipv4_ttl_mode: "Increment",
      gre_inner_ipv6_dst_mode: "Decrement Host",
      gre_inner_ipv6_hop_limit_mode: "Random",
      gre_inner_ipv6_src_mode: "Increment Host",
      gre_inner_l4_dst_port_mode: "Random",
      gre_inner_l4_src_port_mode: "Increment",
      gre_key_mode: "Increment",
      gre_key_present: false,
      gre_sequence_mode: "Random",
      gre_sequence_present: false
    })).toMatchObject({
      checksumOverrideDisabled: true,
      checksumPresentDisabled: true,
      checksumValueDisabled: true,
      innerIpv4DstCountDisabled: false,
      innerIpv4DstStepDisabled: false,
      innerIpv4SrcCountDisabled: false,
      innerIpv4SrcStepDisabled: false,
      innerIpv4TtlCountDisabled: false,
      innerIpv4TtlStepDisabled: false,
      innerIpv6DstCountDisabled: false,
      innerIpv6DstStepDisabled: false,
      innerIpv6HopLimitCountDisabled: false,
      innerIpv6HopLimitStepDisabled: false,
      innerIpv6SrcCountDisabled: false,
      innerIpv6SrcStepDisabled: false,
      innerL4DstPortCountDisabled: false,
      innerL4DstPortStepDisabled: false,
      innerL4SrcPortCountDisabled: false,
      innerL4SrcPortStepDisabled: false,
      keyCountDisabled: true,
      keyModeDisabled: true,
      keyStepDisabled: true,
      keyValueDisabled: true,
      sequenceCountDisabled: true,
      sequenceModeDisabled: true,
      sequenceStepDisabled: true,
      sequenceValueDisabled: true,
      usesIpv6: true
    });

    expect(greProtocolViewModel({
      ...baseStream,
      gre_key_mode: "Increment",
      gre_sequence_mode: "Decrement"
    })).toMatchObject({
      checksumPresentDisabled: true,
      keyCountDisabled: false,
      keyStepDisabled: false,
      sequenceCountDisabled: false,
      sequenceStepDisabled: false
    });
  });

  it("builds after-stream control state", () => {
    const streams = [
      {
        action_count: 0,
        mode: "continuous",
        name: "first",
        next_stream_id: null
      },
      {
        action_count: 3,
        mode: "multi_burst",
        name: "second",
        next_stream_id: 1
      }
    ] as unknown as ProfileWorkbenchStream[];

    expect(afterStreamViewModel(streams[0], streams)).toEqual({
      disabled: true,
      gotoChecked: false,
      loopChecked: false,
      loopControlDisabled: true,
      loopInputDisabled: true,
      options: [
        { key: "first:0", label: "first", value: 1 },
        { key: "second:1", label: "second", value: 2 }
      ],
      selectDisabled: true,
      selectValue: 1,
      stopChecked: true
    });

    expect(afterStreamViewModel(streams[1], streams)).toEqual({
      disabled: false,
      gotoChecked: true,
      loopChecked: true,
      loopControlDisabled: false,
      loopInputDisabled: false,
      options: [
        { key: "first:0", label: "first", value: 1 },
        { key: "second:1", label: "second", value: 2 }
      ],
      selectDisabled: false,
      selectValue: 1,
      stopChecked: false
    });
  });
});
