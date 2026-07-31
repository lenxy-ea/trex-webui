import type { ProfilePcapImportOptions } from "../../../api";
import {
  runPcapImportDestinationAddressChange,
  runPcapImportDestinationCountChange,
  runPcapImportDestinationModeChange,
  runPcapImportDestinationRewriteChange,
  runPcapImportIpgChange,
  runPcapImportLoopCountChange,
  runPcapImportNamePrefixChange,
  runPcapImportRateModeChange,
  runPcapImportSourceAddressChange,
  runPcapImportSourceCountChange,
  runPcapImportSourceModeChange,
  runPcapImportSourceRewriteChange,
  runPcapImportSpeedupChange,
  type PcapImportOptionUpdateHandlers
} from "./pcapImportModel";

export type WorkspacePcapImportHandlers = {
  changeDestinationAddress: (value: string) => void;
  changeDestinationCount: (value: string) => void;
  changeDestinationMode: (value: ProfilePcapImportOptions["dst_mode"]) => void;
  changeDestinationRewrite: (value: boolean) => void;
  changeIpg: (value: string) => void;
  changeLoopCount: (value: string) => void;
  changeNamePrefix: (value: string) => void;
  changeRateMode: (value: ProfilePcapImportOptions["rate_mode"]) => void;
  changeSourceAddress: (value: string) => void;
  changeSourceCount: (value: string) => void;
  changeSourceMode: (value: ProfilePcapImportOptions["src_mode"]) => void;
  changeSourceRewrite: (value: boolean) => void;
  changeSpeedup: (value: string) => void;
};

export function workspacePcapImportHandlers(
  optionHandlers: PcapImportOptionUpdateHandlers
): WorkspacePcapImportHandlers {
  return {
    changeDestinationAddress: (value) => runPcapImportDestinationAddressChange(value, optionHandlers),
    changeDestinationCount: (value) => runPcapImportDestinationCountChange(value, optionHandlers),
    changeDestinationMode: (value) => runPcapImportDestinationModeChange(value, optionHandlers),
    changeDestinationRewrite: (value) => runPcapImportDestinationRewriteChange(value, optionHandlers),
    changeIpg: (value) => runPcapImportIpgChange(value, optionHandlers),
    changeLoopCount: (value) => runPcapImportLoopCountChange(value, optionHandlers),
    changeNamePrefix: (value) => runPcapImportNamePrefixChange(value, optionHandlers),
    changeRateMode: (value) => runPcapImportRateModeChange(value, optionHandlers),
    changeSourceAddress: (value) => runPcapImportSourceAddressChange(value, optionHandlers),
    changeSourceCount: (value) => runPcapImportSourceCountChange(value, optionHandlers),
    changeSourceMode: (value) => runPcapImportSourceModeChange(value, optionHandlers),
    changeSourceRewrite: (value) => runPcapImportSourceRewriteChange(value, optionHandlers),
    changeSpeedup: (value) => runPcapImportSpeedupChange(value, optionHandlers)
  };
}
