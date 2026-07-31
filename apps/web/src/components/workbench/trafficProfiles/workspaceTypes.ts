import type {
  ProfileCatalog,
  ProfileExportResult,
  ProfileFileOperationResult,
  ProfilePacketPreview,
  ProfilePcapExportResult,
  ProfilePcapImportOptions,
  ProfilePcapImportResult,
  ProfileRecord,
  ProfileWorkbenchSaveResult,
  ProfileWorkbenchStream,
  ProfileWorkbenchYamlExportResult,
  TrexPortRecord,
  TrexResult
} from "../../../api";
import type { ProfileTunablesDraft } from "../profileTunables";
import type { TrafficMultiplierUnit } from "../trafficMultiplier";

export type TrafficProfilesWorkspaceProps = {
  profileCatalog: TrexResult<ProfileCatalog> | null;
  profileOptions: ProfileRecord[];
  profileError: string | null;
  isProfilesLoading: boolean;
  portRecords: TrexPortRecord[];
  profilePath: string;
  selectedProfile: ProfileRecord | null;
  builderProfileName: string;
  streamBuilderEnabled: boolean;
  profileTunables: ProfileTunablesDraft;
  profileTunablesEnabled: boolean;
  profileTunablesError: string | null;
  activeCommand: string | null;
  isStarting: boolean;
  requireConfirmation: boolean;
  runtimeControlDisabledReason: string | null;
  trafficMultiplierUnit: TrafficMultiplierUnit;
  trafficMultiplierValue: string;
  trafficMultiplierError: string | null;
  trafficMultiplierPreview: string | null;
  trafficDurationEnabled: boolean;
  trafficDurationValue: string;
  trafficDurationError: string | null;
  streams: ProfileWorkbenchStream[];
  selectedStreamIndex: number;
  profilePacketPreviews: ProfilePacketPreview[];
  isProfileWorkbenchBusy: boolean;
  workbenchProfileValidationError: string | null;
  workbenchStreamValidationError: string | null;
  selectedStreamValidationError: string | null;
  profileWorkbenchResult: TrexResult<ProfileWorkbenchSaveResult> | null;
  profileCommandResult: TrexResult<
    ProfileFileOperationResult | ProfileExportResult | ProfileWorkbenchYamlExportResult | ProfilePcapExportResult | ProfilePcapImportResult
  > | null;
  onProfilePathChange: (value: string) => void;
  onBuilderProfileNameChange: (value: string) => void;
  onProfileTunablesChange: (value: ProfileTunablesDraft) => void;
  onTrafficMultiplierUnitChange: (unit: TrafficMultiplierUnit) => void;
  onTrafficMultiplierValueChange: (value: string) => void;
  onTrafficDurationEnabledChange: (enabled: boolean) => void;
  onTrafficDurationValueChange: (value: string) => void;
  onTrafficPlanDirtyChange?: (dirty: boolean) => void;
  onTrafficSessionAuthorityChange?: (sessionId: string) => void;
  onStartTraffic: () => void;
  onStartAllTraffic: () => void;
  onUpdateTraffic: () => void;
  onCreateProfile: () => void;
  onDuplicateProfile: () => void;
  onDeleteProfile: () => void;
  onExportProfileJson: () => void;
  onExportProfileYaml: () => void;
  onExportPcap: () => void;
  onImportPcap: (file: File, options: ProfilePcapImportOptions) => void;
  onLoadProfile: () => void;
  onBuildStream: () => void;
  onDuplicateStream: () => void;
  onDeleteStream: () => void;
  onRenderProfilePreview: () => Promise<void> | void;
  onSelectedStreamIndexChange: (index: number) => void;
  onStreamChange: (index: number, patch: Partial<ProfileWorkbenchStream>) => void;
};
