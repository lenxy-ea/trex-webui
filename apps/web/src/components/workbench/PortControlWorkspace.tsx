import { useState } from "react";

import type {
  FlowControlMode,
  PortAttributeName,
  SystemOverview,
  TrexPortRecord,
  TrexPortXstatsSnapshot,
  TrexResult
} from "../../api";
import type { CapturePortSummary } from "./capturePortSummary";
import { PortActionBar } from "./PortActionBar";
import { PortAttributesPanel } from "./PortAttributesPanel";
import { PortConfigurationPanel, type PortConfigurationDraft } from "./PortConfigurationPanel";
import {
  PortDetailTabs,
  portDetailPanelId,
  portDetailTabId,
  type PortDetailTab
} from "./PortDetailTabs";
import { PortHardwareCountersPanel } from "./PortHardwareCountersPanel";
import { portIsLocallyAcquired } from "./portControlState";

type PortControlWorkspaceProps = {
  overview: SystemOverview | null;
  selectedPort: TrexPortRecord | null;
  captureSummary: CapturePortSummary | null;
  activeCommand: string | null;
  onAcquirePorts: () => void;
  onForceAcquirePorts: () => void;
  onReleasePorts: () => void;
  onResetPorts: () => void;
  onSetPortAttribute: (
    attribute: PortAttributeName,
    value: boolean | FlowControlMode
  ) => Promise<TrexResult<Record<string, unknown>> | null>;
  onSetServiceMode: (enabled: boolean) => Promise<TrexResult<Record<string, unknown>> | null>;
  selectedPortTransmitting: boolean;
  onApplyPortConfiguration: (draft: PortConfigurationDraft) => Promise<TrexResult<Record<string, unknown>>>;
  onPingFromPort: (destination: string) => Promise<TrexResult<Record<string, unknown>>>;
  onResolveArp: (vlan: number[] | null) => Promise<TrexResult<Record<string, unknown>>>;
  onScanIpv6: () => Promise<TrexResult<Record<string, unknown>>>;
  hardwareCounterResult: TrexResult<TrexPortXstatsSnapshot> | null;
  isHardwareCountersLoading: boolean;
  onRefreshHardwareCounters: () => Promise<TrexResult<TrexPortXstatsSnapshot>>;
  onResetHardwareCounters: () => Promise<TrexResult<Record<string, unknown>>>;
};

export function PortControlWorkspace({
  overview,
  selectedPort,
  captureSummary,
  activeCommand,
  onAcquirePorts,
  onForceAcquirePorts,
  onReleasePorts,
  onResetPorts,
  onSetPortAttribute,
  onSetServiceMode,
  selectedPortTransmitting,
  onApplyPortConfiguration,
  onPingFromPort,
  onResolveArp,
  onScanIpv6,
  hardwareCounterResult,
  isHardwareCountersLoading,
  onRefreshHardwareCounters,
  onResetHardwareCounters
}: PortControlWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PortDetailTab>("Control");
  const selectedPortAcquired = portIsLocallyAcquired(selectedPort, overview);

  return (
    <section className="work-panel port-control-panel">
      <PortDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div
        aria-labelledby={portDetailTabId("Control")}
        className={`port-control-tab-panel${activeTab === "Control" ? " port-control-tab-panel--control" : ""}`}
        hidden={activeTab !== "Control"}
        id={portDetailPanelId("Control")}
        role="tabpanel"
        tabIndex={activeTab === "Control" ? 0 : -1}
      >
        <PortAttributesPanel
          activeCommand={activeCommand}
          captureSummary={captureSummary}
          onSetPortAttribute={onSetPortAttribute}
          onSetServiceMode={onSetServiceMode}
          overview={overview}
          port={selectedPort}
        />
        <PortActionBar
          activeCommand={activeCommand}
          acquired={selectedPortAcquired}
          onAcquirePorts={onAcquirePorts}
          onForceAcquirePorts={onForceAcquirePorts}
          onReleasePorts={onReleasePorts}
          onResetPorts={onResetPorts}
        />
      </div>
      <div
        aria-labelledby={portDetailTabId("Configuration")}
        className="port-control-tab-panel"
        hidden={activeTab !== "Configuration"}
        id={portDetailPanelId("Configuration")}
        role="tabpanel"
        tabIndex={activeTab === "Configuration" ? 0 : -1}
      >
        <PortConfigurationPanel
          activeCommand={activeCommand}
          captureSummary={captureSummary}
          key={selectedPort?.id ?? "no-port"}
          onApplyConfiguration={onApplyPortConfiguration}
          onPing={onPingFromPort}
          onResolveArp={onResolveArp}
          onScanIpv6={onScanIpv6}
          overview={overview}
          port={selectedPort ?? null}
          portTransmitting={selectedPortTransmitting}
        />
      </div>
      <div
        aria-labelledby={portDetailTabId("Hardware counters")}
        className="port-control-tab-panel"
        hidden={activeTab !== "Hardware counters"}
        id={portDetailPanelId("Hardware counters")}
        role="tabpanel"
        tabIndex={activeTab === "Hardware counters" ? 0 : -1}
      >
        <PortHardwareCountersPanel
          countersResult={hardwareCounterResult}
          isLoading={isHardwareCountersLoading}
          key={selectedPort?.id ?? "no-port"}
          onRefresh={onRefreshHardwareCounters}
          onResetCounters={onResetHardwareCounters}
          port={activeTab === "Hardware counters" ? selectedPort : null}
        />
      </div>
    </section>
  );
}
