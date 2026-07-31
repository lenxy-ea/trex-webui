import type { ProfilePcapImportOptions } from "../../../api";

export const defaultPcapImportOptions: ProfilePcapImportOptions = {
  name_prefix: "",
  rewrite_src_enabled: false,
  src_address: "16.0.0.1",
  src_mode: "Fixed",
  src_count: 16,
  rewrite_dst_enabled: false,
  dst_address: "48.0.0.1",
  dst_mode: "Fixed",
  dst_count: 16,
  rate_mode: "speedup",
  speedup: 1,
  ipg: 1,
  loop_count: 0
};

export function parsePcapImportNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function pcapImportCountValue(value: string, fallback: number) {
  return Math.max(1, Math.floor(parsePcapImportNumber(value, fallback)));
}

export function pcapImportLoopCountValue(value: string, fallback: number) {
  return Math.max(0, Math.floor(parsePcapImportNumber(value, fallback)));
}

export function pcapImportSpeedupValue(value: string, fallback: number) {
  return Math.max(0.000001, parsePcapImportNumber(value, fallback));
}

export function pcapImportIpgValue(value: string, fallback: number) {
  return Math.max(0, parsePcapImportNumber(value, fallback));
}

export function pcapImportRateLabel(options: ProfilePcapImportOptions) {
  return options.rate_mode === "speedup" ? `Speedup ${options.speedup}` : `IPG ${options.ipg}`;
}

export function pcapImportRewriteLabel(options: ProfilePcapImportOptions) {
  if (options.rewrite_src_enabled && options.rewrite_dst_enabled) {
    return "Src + Dst rewrite";
  }
  if (options.rewrite_src_enabled) {
    return "Src rewrite";
  }
  if (options.rewrite_dst_enabled) {
    return "Dst rewrite";
  }
  return "No rewrite";
}

export function pcapImportPrefixLabel(options: ProfilePcapImportOptions) {
  const prefix = options.name_prefix.trim();
  return prefix ? `Prefix ${prefix}` : "No prefix";
}

export function pcapImportLoopLabel(options: ProfilePcapImportOptions) {
  return `Loop ${options.loop_count}`;
}

export type PcapImportSummaryItem = {
  key: "prefix" | "rewrite" | "rate" | "loop";
  label: string;
};

export type PcapImportPanelViewModel = {
  bodyClassName: string;
  detailsAriaLabel: string;
  detailsClassName: string;
  fileInput: {
    accept: string;
    ariaLabel: string;
    className: string;
  };
  ipv4Rewrite: {
    ariaLabel: string;
    checkClassName: string;
    className: string;
    destination: {
      addressAriaLabel: string;
      checkboxAriaLabel: string;
      countAriaLabel: string;
      label: string;
      modeAriaLabel: string;
    };
    source: {
      addressAriaLabel: string;
      checkboxAriaLabel: string;
      countAriaLabel: string;
      label: string;
      modeAriaLabel: string;
    };
    spacerClassName: string;
    title: string;
  };
  loop: {
    className: string;
    inputAriaLabel: string;
    label: string;
  };
  namePrefix: {
    inputAriaLabel: string;
    label: string;
  };
  rateMode: {
    ariaLabel: string;
    className: string;
    ipg: {
      inputAriaLabel: string;
      label: string;
      modeAriaLabel: string;
    };
    radioClassName: string;
    speedup: {
      inputAriaLabel: string;
      label: string;
      modeAriaLabel: string;
    };
  };
  summaryClassName: string;
  summaryTitle: string;
};

const PCAP_IMPORT_PANEL_VIEW_MODEL: PcapImportPanelViewModel = {
  bodyClassName: "pcap-import-body",
  detailsAriaLabel: "Pcap import properties",
  detailsClassName: "pcap-import-properties",
  fileInput: {
    accept: ".pcap,.cap,application/vnd.tcpdump.pcap",
    ariaLabel: "Import Pcap file",
    className: "visually-hidden"
  },
  ipv4Rewrite: {
    ariaLabel: "Pcap import IPv4 rewrite",
    checkClassName: "pcap-import-check",
    className: "pcap-import-ipv4",
    destination: {
      addressAriaLabel: "Pcap import destination address",
      checkboxAriaLabel: "Enable Pcap import destination rewrite",
      countAriaLabel: "Pcap import destination count",
      label: "Destination",
      modeAriaLabel: "Pcap import destination mode"
    },
    source: {
      addressAriaLabel: "Pcap import source address",
      checkboxAriaLabel: "Enable Pcap import source rewrite",
      countAriaLabel: "Pcap import source count",
      label: "Source",
      modeAriaLabel: "Pcap import source mode"
    },
    spacerClassName: "pcap-import-ipv4-spacer",
    title: "IPv4"
  },
  loop: {
    className: "pcap-import-loop",
    inputAriaLabel: "Pcap import loop count",
    label: "Loop count"
  },
  namePrefix: {
    inputAriaLabel: "Pcap import name prefix",
    label: "Name prefix"
  },
  rateMode: {
    ariaLabel: "Pcap import rate mode",
    className: "pcap-import-rate-mode",
    ipg: {
      inputAriaLabel: "Pcap import inter-packet gap",
      label: "IPG",
      modeAriaLabel: "Pcap import inter-packet gap mode"
    },
    radioClassName: "pcap-import-radio",
    speedup: {
      inputAriaLabel: "Pcap import speedup",
      label: "Speedup",
      modeAriaLabel: "Pcap import speedup mode"
    }
  },
  summaryClassName: "pcap-import-summary",
  summaryTitle: "Pcap import"
};

export function pcapImportPanelViewModel(): PcapImportPanelViewModel {
  return PCAP_IMPORT_PANEL_VIEW_MODEL;
}

export function pcapImportSummaryItems(options: ProfilePcapImportOptions): PcapImportSummaryItem[] {
  return [
    { key: "prefix", label: pcapImportPrefixLabel(options) },
    { key: "rewrite", label: pcapImportRewriteLabel(options) },
    { key: "rate", label: pcapImportRateLabel(options) },
    { key: "loop", label: pcapImportLoopLabel(options) }
  ];
}

export function pcapImportSummaryLabels(options: ProfilePcapImportOptions) {
  return pcapImportSummaryItems(options).map((item) => item.label);
}

export type PcapImportRewriteViewModel = {
  address: string;
  checked: boolean;
  controlsDisabled: boolean;
  countValue: string;
  mode: ProfilePcapImportOptions["src_mode"];
};

export type PcapImportRateViewModel = {
  ipgChecked: boolean;
  ipgDisabled: boolean;
  ipgValue: string;
  speedupChecked: boolean;
  speedupDisabled: boolean;
  speedupValue: string;
};

export type PcapImportEditorViewModel = {
  destination: PcapImportRewriteViewModel;
  loopCountValue: string;
  namePrefix: string;
  rate: PcapImportRateViewModel;
  source: PcapImportRewriteViewModel;
};

export function pcapImportEditorViewModel(options: ProfilePcapImportOptions): PcapImportEditorViewModel {
  const speedupSelected = options.rate_mode === "speedup";
  return {
    destination: {
      address: options.dst_address,
      checked: options.rewrite_dst_enabled,
      controlsDisabled: !options.rewrite_dst_enabled,
      countValue: String(options.dst_count),
      mode: options.dst_mode
    },
    loopCountValue: String(options.loop_count),
    namePrefix: options.name_prefix,
    rate: {
      ipgChecked: !speedupSelected,
      ipgDisabled: speedupSelected,
      ipgValue: String(options.ipg),
      speedupChecked: speedupSelected,
      speedupDisabled: !speedupSelected,
      speedupValue: String(options.speedup)
    },
    source: {
      address: options.src_address,
      checked: options.rewrite_src_enabled,
      controlsDisabled: !options.rewrite_src_enabled,
      countValue: String(options.src_count),
      mode: options.src_mode
    }
  };
}

export type PcapImportFileAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "import";
      file: File;
      options: ProfilePcapImportOptions;
    };
export type PcapImportFileActionHandlers = {
  importPcap: (file: File, options: ProfilePcapImportOptions) => void;
};
export type PcapImportFileSelectionHandlers = PcapImportFileActionHandlers & {
  resetInput: () => void;
};

export function pcapImportFileAction(
  file: File | null,
  options: ProfilePcapImportOptions
): PcapImportFileAction {
  if (!file) {
    return { kind: "ignored" };
  }
  return {
    file,
    kind: "import",
    options
  };
}

export function runPcapImportFileAction(
  action: PcapImportFileAction,
  handlers: PcapImportFileActionHandlers
) {
  if (action.kind === "ignored") {
    return false;
  }
  handlers.importPcap(action.file, action.options);
  return true;
}

export function runPcapImportFileSelectionAction(
  action: PcapImportFileAction,
  handlers: PcapImportFileSelectionHandlers
) {
  const imported = runPcapImportFileAction(action, handlers);
  handlers.resetInput();
  return imported;
}

export function runPcapImportFileSelection(
  file: File | null,
  options: ProfilePcapImportOptions,
  handlers: PcapImportFileSelectionHandlers
) {
  return runPcapImportFileSelectionAction(pcapImportFileAction(file, options), handlers);
}

export type PcapImportOptionUpdate =
  | { field: "name_prefix"; value: string }
  | { field: "rewrite_src_enabled"; value: boolean }
  | { field: "src_address"; value: string }
  | { field: "src_mode"; value: ProfilePcapImportOptions["src_mode"] }
  | { field: "src_count"; value: string }
  | { field: "rewrite_dst_enabled"; value: boolean }
  | { field: "dst_address"; value: string }
  | { field: "dst_mode"; value: ProfilePcapImportOptions["dst_mode"] }
  | { field: "dst_count"; value: string }
  | { field: "rate_mode"; value: ProfilePcapImportOptions["rate_mode"] }
  | { field: "speedup"; value: string }
  | { field: "ipg"; value: string }
  | { field: "loop_count"; value: string };

export function pcapImportOptionsPatch(
  current: ProfilePcapImportOptions,
  update: PcapImportOptionUpdate
): ProfilePcapImportOptions {
  switch (update.field) {
    case "name_prefix":
      return { ...current, name_prefix: update.value };
    case "rewrite_src_enabled":
      return { ...current, rewrite_src_enabled: update.value };
    case "src_address":
      return { ...current, src_address: update.value };
    case "src_mode":
      return { ...current, src_mode: update.value };
    case "src_count":
      return { ...current, src_count: pcapImportCountValue(update.value, current.src_count) };
    case "rewrite_dst_enabled":
      return { ...current, rewrite_dst_enabled: update.value };
    case "dst_address":
      return { ...current, dst_address: update.value };
    case "dst_mode":
      return { ...current, dst_mode: update.value };
    case "dst_count":
      return { ...current, dst_count: pcapImportCountValue(update.value, current.dst_count) };
    case "rate_mode":
      return { ...current, rate_mode: update.value };
    case "speedup":
      return { ...current, speedup: pcapImportSpeedupValue(update.value, current.speedup) };
    case "ipg":
      return { ...current, ipg: pcapImportIpgValue(update.value, current.ipg) };
    case "loop_count":
      return { ...current, loop_count: pcapImportLoopCountValue(update.value, current.loop_count) };
  }
  const exhaustive: never = update;
  return exhaustive;
}

export function pcapImportOptionsUpdater(update: PcapImportOptionUpdate) {
  return (current: ProfilePcapImportOptions) => pcapImportOptionsPatch(current, update);
}

export type PcapImportOptionUpdateHandlers = {
  changePcapImportOptions: (
    updater: (current: ProfilePcapImportOptions) => ProfilePcapImportOptions
  ) => void;
};

export function runPcapImportOptionUpdate(
  update: PcapImportOptionUpdate,
  handlers: PcapImportOptionUpdateHandlers
) {
  handlers.changePcapImportOptions(pcapImportOptionsUpdater(update));
}

export function runPcapImportNamePrefixChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "name_prefix", value }, handlers);
}

export function runPcapImportSourceRewriteChange(
  value: boolean,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "rewrite_src_enabled", value }, handlers);
}

export function runPcapImportSourceAddressChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "src_address", value }, handlers);
}

export function runPcapImportSourceModeChange(
  value: ProfilePcapImportOptions["src_mode"],
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "src_mode", value }, handlers);
}

export function runPcapImportSourceCountChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "src_count", value }, handlers);
}

export function runPcapImportDestinationRewriteChange(
  value: boolean,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "rewrite_dst_enabled", value }, handlers);
}

export function runPcapImportDestinationAddressChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "dst_address", value }, handlers);
}

export function runPcapImportDestinationModeChange(
  value: ProfilePcapImportOptions["dst_mode"],
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "dst_mode", value }, handlers);
}

export function runPcapImportDestinationCountChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "dst_count", value }, handlers);
}

export function runPcapImportRateModeChange(
  value: ProfilePcapImportOptions["rate_mode"],
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "rate_mode", value }, handlers);
}

export function runPcapImportSpeedupChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "speedup", value }, handlers);
}

export function runPcapImportIpgChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "ipg", value }, handlers);
}

export function runPcapImportLoopCountChange(
  value: string,
  handlers: PcapImportOptionUpdateHandlers
) {
  runPcapImportOptionUpdate({ field: "loop_count", value }, handlers);
}
