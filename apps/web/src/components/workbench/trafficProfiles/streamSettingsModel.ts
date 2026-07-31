import type { ProfileWorkbenchStream } from "../../../api";
import {
  cacheSizeTypes,
  frameLengthTypes,
  modeTypes,
  packetTypes,
  payloadTypes,
  rateTypes,
  supportsVariableFrameLength
} from "./model";
import {
  hasIpLayer,
  ipVersionName,
  protocolName,
  type L3Selection,
  type L4Selection
} from "./protocolSelectionModel";
import { numberValue } from "./scalarValueModel";
import { streamIpgDisplay } from "./streamSummaryModel";

export type StreamOption = {
  key: string;
  label: string;
  value: number;
};

export type AfterStreamViewModel = {
  disabled: boolean;
  gotoChecked: boolean;
  loopChecked: boolean;
  loopControlDisabled: boolean;
  loopInputDisabled: boolean;
  options: StreamOption[];
  selectDisabled: boolean;
  selectValue: number;
  stopChecked: boolean;
};

export type StreamModeOption = {
  checked: boolean;
  label: string;
  mode: ProfileWorkbenchStream["mode"];
};

export type StreamRateOption = {
  label: string;
  value: ProfileWorkbenchStream["rate_type"];
};

export type StreamTimingViewModel = {
  ibgDisabled: boolean;
  ibgValue: string;
  ipgValue: string;
  showIpg: boolean;
  isgValue: string;
};

export type StreamRxStatsViewModel = {
  disabled: boolean;
  flowStatsChecked: boolean;
  latencyChecked: boolean;
  pgIdValue: string;
};

export type StreamPacketTypeOption = {
  label: string;
  value: ProfileWorkbenchStream["packet_type"];
};

export type StreamPacketViewModel = {
  frameLengthDisabled: boolean;
  frameLengthValue: string;
  name: string;
  packetType: ProfileWorkbenchStream["packet_type"];
  packetTypeDisabled: boolean;
  packetTypeOptions: StreamPacketTypeOption[];
};

export type StreamFrameLengthTypeOption = {
  label: string;
  value: ProfileWorkbenchStream["frame_length_type"];
};

export type StreamFrameLengthViewModel = {
  frameLengthType: ProfileWorkbenchStream["frame_length_type"];
  lengthDisabled: boolean;
  lengthValue: string;
  maxDisabled: boolean;
  maxValue: string;
  minDisabled: boolean;
  minValue: string;
  typeDisabled: boolean;
  typeOptions: StreamFrameLengthTypeOption[];
};

export type StreamTunnelSelection = "none" | "vxlan" | "gtpu";

export type StreamSelectionOption<T extends boolean | string> = {
  checked: boolean;
  disabled: boolean;
  label: string;
  value: T;
};

export type ProtocolSelectionViewModel = {
  l3Options: Array<StreamSelectionOption<L3Selection>>;
  l4Options: Array<StreamSelectionOption<L4Selection>>;
  mplsOptions: Array<StreamSelectionOption<boolean>>;
  payloadOptions: Array<StreamSelectionOption<boolean>>;
  tunnelOptions: Array<StreamSelectionOption<StreamTunnelSelection>>;
  vlanOptions: Array<StreamSelectionOption<boolean>>;
};

export type PayloadSettingsViewModel = {
  enabled: boolean;
  patternDisabled: boolean;
  patternValue: string;
  type: ProfileWorkbenchStream["payload_type"];
  typeOptions: ProfileWorkbenchStream["payload_type"][];
};

export type AdvancedSettingsViewModel = {
  cacheSizeType: ProfileWorkbenchStream["advanced_cache_size_type"];
  cacheSizeTypeOptions: ProfileWorkbenchStream["advanced_cache_size_type"][];
  cacheValue: string;
  cacheValueDisabled: boolean;
};

export type AdvancedSettingsPanelViewModel = {
  cacheSize: {
    ariaLabel: string;
    label: string;
  };
  cacheValue: {
    ariaLabel: string;
    max: number;
    min: number;
    type: "number";
  };
  className: string;
};

const ADVANCED_SETTINGS_PANEL_VIEW_MODEL: AdvancedSettingsPanelViewModel = {
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
};

export function advancedSettingsPanelViewModel(): AdvancedSettingsPanelViewModel {
  return ADVANCED_SETTINGS_PANEL_VIEW_MODEL;
}

export type StreamPropertiesViewModel = {
  afterStream: AfterStreamViewModel;
  burstCountDisabled: boolean;
  burstCountValue: string;
  enabledChecked: boolean;
  modeOptions: StreamModeOption[];
  numbersDisabled: boolean;
  packet: StreamPacketViewModel;
  packetsPerBurstDisabled: boolean;
  packetsPerBurstValue: string;
  rateOptions: StreamRateOption[];
  rateType: ProfileWorkbenchStream["rate_type"];
  rateValue: string;
  rxStats: StreamRxStatsViewModel;
  selfStartChecked: boolean;
  timing: StreamTimingViewModel;
  totalPacketsDisabled: boolean;
  totalPacketsValue: string;
};

export type StreamEditorSettingsViewModel = {
  advancedSettings: AdvancedSettingsViewModel;
  frameLength: StreamFrameLengthViewModel;
  payloadSettings: PayloadSettingsViewModel;
  properties: StreamPropertiesViewModel;
  protocolSelection: ProtocolSelectionViewModel;
};

export function streamModeLabel(mode: ProfileWorkbenchStream["mode"]) {
  return mode === "multi_burst" ? "Multi-Burst" : mode[0].toUpperCase() + mode.slice(1);
}

export function streamOptions(streams: ProfileWorkbenchStream[]): StreamOption[] {
  return streams.map((stream, index) => ({
    key: `${stream.name}:${index}`,
    label: stream.name,
    value: index + 1
  }));
}

export function afterStreamViewModel(
  stream: ProfileWorkbenchStream,
  streams: ProfileWorkbenchStream[]
): AfterStreamViewModel {
  const hasNextStream = stream.next_stream_id !== null;
  const loopChecked = hasNextStream && stream.action_count > 0;
  return {
    disabled: stream.mode === "continuous",
    gotoChecked: hasNextStream,
    loopChecked,
    loopControlDisabled: !hasNextStream,
    loopInputDisabled: !hasNextStream || stream.action_count === 0,
    options: streamOptions(streams),
    selectDisabled: !hasNextStream,
    selectValue: stream.next_stream_id ?? 1,
    stopChecked: !hasNextStream
  };
}

export function streamPacketViewModel(stream: ProfileWorkbenchStream): StreamPacketViewModel {
  return {
    frameLengthDisabled: stream.frame_length_type !== "Fixed",
    frameLengthValue: numberValue(stream.frame_length),
    name: stream.name,
    packetType: stream.packet_type,
    packetTypeDisabled: stream.vxlan_enabled || stream.gtpu_enabled,
    packetTypeOptions: packetTypes.map((packetType) => ({
      label: packetType,
      value: packetType
    }))
  };
}

export function streamFrameLengthViewModel(stream: ProfileWorkbenchStream): StreamFrameLengthViewModel {
  const fixedLength = stream.frame_length_type === "Fixed";
  return {
    frameLengthType: stream.frame_length_type,
    lengthDisabled: !fixedLength,
    lengthValue: numberValue(stream.frame_length),
    maxDisabled: fixedLength,
    maxValue: numberValue(stream.frame_length_max),
    minDisabled: fixedLength,
    minValue: numberValue(stream.frame_length_min),
    typeDisabled: !supportsVariableFrameLength(stream),
    typeOptions: frameLengthTypes.map((frameLengthType) => ({
      label: frameLengthType,
      value: frameLengthType
    }))
  };
}

export function protocolSelectionViewModel(stream: ProfileWorkbenchStream): ProtocolSelectionViewModel {
  const hasIp = hasIpLayer(stream.packet_type);
  const tunnelEnabled = stream.vxlan_enabled || stream.gtpu_enabled;
  const l3Selection = ipVersionName(stream.packet_type);
  const l4Selection = protocolName(stream.packet_type);
  const tunnelL3Disabled = tunnelEnabled;
  const tunnelL4Disabled = tunnelEnabled || !hasIp;
  return {
    l3Options: [
      { checked: l3Selection === "None", disabled: tunnelL3Disabled, label: "None", value: "None" },
      { checked: l3Selection === "ARP", disabled: tunnelL3Disabled, label: "ARP", value: "ARP" },
      { checked: l3Selection === "IPv4", disabled: false, label: "IPv4", value: "IPv4" },
      { checked: l3Selection === "IPv6", disabled: tunnelL3Disabled, label: "IPv6", value: "IPv6" }
    ],
    l4Options: [
      { checked: l4Selection === "None", disabled: tunnelL4Disabled, label: "None", value: "None" },
      { checked: l4Selection === "TCP", disabled: tunnelL4Disabled, label: "TCP", value: "TCP" },
      { checked: l4Selection === "UDP", disabled: !hasIp, label: "UDP", value: "UDP" },
      { checked: l4Selection === "SCTP", disabled: tunnelL4Disabled, label: "SCTP", value: "SCTP" },
      { checked: l4Selection === "ICMP", disabled: tunnelL4Disabled, label: "ICMP", value: "ICMP" },
      { checked: l4Selection === "GRE", disabled: tunnelL4Disabled, label: "GRE", value: "GRE" }
    ],
    mplsOptions: [
      { checked: !stream.mpls_enabled, disabled: false, label: "No MPLS", value: false },
      { checked: stream.mpls_enabled, disabled: !hasIp, label: "MPLS", value: true }
    ],
    payloadOptions: [
      { checked: !stream.payload_enabled, disabled: false, label: "None", value: false },
      { checked: stream.payload_enabled, disabled: false, label: "Pattern", value: true }
    ],
    tunnelOptions: [
      { checked: !tunnelEnabled, disabled: false, label: "No Tunnel", value: "none" },
      { checked: stream.vxlan_enabled, disabled: false, label: "VXLAN", value: "vxlan" },
      { checked: stream.gtpu_enabled, disabled: false, label: "GTP-U", value: "gtpu" }
    ],
    vlanOptions: [
      { checked: !stream.vlan_enabled, disabled: false, label: "Untagged", value: false },
      { checked: stream.vlan_enabled, disabled: false, label: "Tagged", value: true }
    ]
  };
}

export function payloadSettingsViewModel(stream: ProfileWorkbenchStream): PayloadSettingsViewModel {
  const fixedWord = stream.payload_type === "Fixed Word";
  return {
    enabled: stream.payload_enabled,
    patternDisabled: !fixedWord,
    patternValue: stream.payload_pattern,
    type: stream.payload_type,
    typeOptions: payloadTypes
  };
}

export function advancedSettingsViewModel(stream: ProfileWorkbenchStream): AdvancedSettingsViewModel {
  return {
    cacheSizeType: stream.advanced_cache_size_type,
    cacheSizeTypeOptions: cacheSizeTypes,
    cacheValue: numberValue(stream.advanced_cache_value),
    cacheValueDisabled: stream.advanced_cache_size_type !== "Enable"
  };
}

export function streamPropertiesViewModel(
  stream: ProfileWorkbenchStream,
  streams: ProfileWorkbenchStream[]
): StreamPropertiesViewModel {
  const hasIp = hasIpLayer(stream.packet_type);
  return {
    afterStream: afterStreamViewModel(stream, streams),
    burstCountDisabled: stream.mode !== "multi_burst",
    burstCountValue: numberValue(stream.count),
    enabledChecked: stream.enabled,
    modeOptions: modeTypes.map((mode) => ({
      checked: stream.mode === mode,
      label: streamModeLabel(mode),
      mode
    })),
    numbersDisabled: stream.mode === "continuous",
    packet: streamPacketViewModel(stream),
    packetsPerBurstDisabled: stream.mode !== "multi_burst",
    packetsPerBurstValue: numberValue(stream.pkts_per_burst),
    rateOptions: rateTypes.map((rate) => ({ label: rate, value: rate })),
    rateType: stream.rate_type,
    rateValue: numberValue(stream.rate_value),
    rxStats: {
      disabled: !hasIp,
      flowStatsChecked: hasIp && stream.flow_stats_enabled,
      latencyChecked: hasIp && stream.latency_enabled,
      pgIdValue: numberValue(stream.pg_id)
    },
    selfStartChecked: stream.self_start,
    timing: {
      ibgDisabled: stream.mode !== "multi_burst",
      ibgValue: numberValue(stream.ibg),
      ipgValue: streamIpgDisplay(stream),
      isgValue: numberValue(stream.isg),
      showIpg: stream.rate_type === "pps"
    },
    totalPacketsDisabled: stream.mode === "multi_burst",
    totalPacketsValue: numberValue(stream.total_pkts)
  };
}

export function streamEditorSettingsViewModel(
  stream: ProfileWorkbenchStream,
  streams: ProfileWorkbenchStream[]
): StreamEditorSettingsViewModel {
  return {
    advancedSettings: advancedSettingsViewModel(stream),
    frameLength: streamFrameLengthViewModel(stream),
    payloadSettings: payloadSettingsViewModel(stream),
    properties: streamPropertiesViewModel(stream, streams),
    protocolSelection: protocolSelectionViewModel(stream)
  };
}
