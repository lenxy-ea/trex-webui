import { describe, expect, it, vi } from "vitest";

import {
  defaultPcapImportOptions,
  pcapImportFileAction,
  pcapImportPanelViewModel,
  runPcapImportDestinationAddressChange,
  runPcapImportDestinationCountChange,
  runPcapImportDestinationModeChange,
  runPcapImportDestinationRewriteChange,
  runPcapImportOptionUpdate,
  runPcapImportFileSelection,
  runPcapImportFileSelectionAction,
  runPcapImportIpgChange,
  runPcapImportLoopCountChange,
  runPcapImportNamePrefixChange,
  runPcapImportRateModeChange,
  runPcapImportSourceAddressChange,
  runPcapImportSourceCountChange,
  runPcapImportSourceModeChange,
  runPcapImportSourceRewriteChange,
  runPcapImportSpeedupChange
} from "./pcapImportModel";
import type { ProfilePcapImportOptions } from "../../../api";

describe("PCAP import panel model", () => {
  it("owns the static presentation contract consumed by the workspace panel", () => {
    expect(pcapImportPanelViewModel()).toEqual({
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
    });
  });
});

describe("PCAP import file selection model", () => {
  it("resets hidden file inputs when no PCAP file was selected", () => {
    const importPcap = vi.fn();
    const resetInput = vi.fn();

    expect(runPcapImportFileSelectionAction(
      pcapImportFileAction(null, defaultPcapImportOptions),
      { importPcap, resetInput }
    )).toBe(false);

    expect(importPcap).not.toHaveBeenCalled();
    expect(resetInput).toHaveBeenCalledTimes(1);
  });

  it("imports selected PCAP files and resets the reusable input", () => {
    const file = { name: "traffic.pcap" } as File;
    const importPcap = vi.fn();
    const resetInput = vi.fn();

    expect(runPcapImportFileSelectionAction(
      pcapImportFileAction(file, defaultPcapImportOptions),
      { importPcap, resetInput }
    )).toBe(true);

    expect(importPcap).toHaveBeenCalledWith(file, defaultPcapImportOptions);
    expect(resetInput).toHaveBeenCalledTimes(1);
  });

  it("runs selected PCAP file workflow from a nullable file input", () => {
    const file = { name: "selected.pcap" } as File;
    const importPcap = vi.fn();
    const resetInput = vi.fn();

    expect(runPcapImportFileSelection(file, defaultPcapImportOptions, {
      importPcap,
      resetInput
    })).toBe(true);

    expect(importPcap).toHaveBeenCalledWith(file, defaultPcapImportOptions);
    expect(resetInput).toHaveBeenCalledTimes(1);
  });
});

describe("PCAP import option update model", () => {
  it("dispatches option changes through the functional updater contract", () => {
    let options: ProfilePcapImportOptions = defaultPcapImportOptions;
    const changePcapImportOptions = vi.fn((
      updater: (current: ProfilePcapImportOptions) => ProfilePcapImportOptions
    ) => {
      options = updater(options);
    });

    runPcapImportOptionUpdate(
      { field: "src_count", value: "2.9" },
      { changePcapImportOptions }
    );

    expect(changePcapImportOptions).toHaveBeenCalledTimes(1);
    expect(options.src_count).toBe(2);
  });

  it("dispatches field-level PCAP import option changes through model helpers", () => {
    let options: ProfilePcapImportOptions = defaultPcapImportOptions;
    const handlers = {
      changePcapImportOptions: vi.fn((
        updater: (current: ProfilePcapImportOptions) => ProfilePcapImportOptions
      ) => {
        options = updater(options);
      })
    };

    runPcapImportNamePrefixChange("pcap-", handlers);
    runPcapImportSourceRewriteChange(true, handlers);
    runPcapImportSourceAddressChange("10.0.0.1", handlers);
    runPcapImportSourceModeChange("Increment Host", handlers);
    runPcapImportSourceCountChange("4.8", handlers);
    runPcapImportDestinationRewriteChange(true, handlers);
    runPcapImportDestinationAddressChange("20.0.0.1", handlers);
    runPcapImportDestinationModeChange("Increment Host", handlers);
    runPcapImportDestinationCountChange("6.2", handlers);
    runPcapImportRateModeChange("ipg", handlers);
    runPcapImportSpeedupChange("2.5", handlers);
    runPcapImportIpgChange("0.25", handlers);
    runPcapImportLoopCountChange("-3", handlers);

    expect(handlers.changePcapImportOptions).toHaveBeenCalledTimes(13);
    expect(options).toEqual({
      ...defaultPcapImportOptions,
      name_prefix: "pcap-",
      rewrite_src_enabled: true,
      src_address: "10.0.0.1",
      src_mode: "Increment Host",
      src_count: 4,
      rewrite_dst_enabled: true,
      dst_address: "20.0.0.1",
      dst_mode: "Increment Host",
      dst_count: 6,
      rate_mode: "ipg",
      speedup: 2.5,
      ipg: 0.25,
      loop_count: 0
    });
  });
});
