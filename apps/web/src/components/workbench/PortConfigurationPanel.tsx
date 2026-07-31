import { useState } from "react";

import type { SystemOverview, TrexPortRecord, TrexResult } from "../../api";
import { capturePortSummaryLabel, type CapturePortSummary } from "./capturePortSummary";
import { displayValue } from "./format";
import { portControlState } from "./portControlState";

export type PortConfigurationDraft = {
  mode: "L2" | "L3";
  l2_destination: string | null;
  l3_source: string | null;
  l3_destination: string | null;
  vlan: number[] | null;
};

type PortConfigurationPanelProps = {
  overview: SystemOverview | null;
  port: TrexPortRecord | null;
  captureSummary: CapturePortSummary | null;
  activeCommand: string | null;
  portTransmitting: boolean;
  onApplyConfiguration: (draft: PortConfigurationDraft) => Promise<TrexResult<Record<string, unknown>>>;
  onPing: (destination: string) => Promise<TrexResult<Record<string, unknown>>>;
  onResolveArp: (vlan: number[] | null) => Promise<TrexResult<Record<string, unknown>>>;
  onScanIpv6: () => Promise<TrexResult<Record<string, unknown>>>;
};

type PanelStatus = {
  placement: "layer" | "neighbor";
  tone: "error" | "info" | "warning";
  text: string;
};

function readPath(source: unknown, paths: string[]) {
  for (const path of paths) {
    let cursor = source;
    for (const key of path.split(".")) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") {
      return cursor;
    }
  }
  return null;
}

function value(source: unknown, paths: string[], fallback = "") {
  const found = readPath(source, paths);
  return found === null ? fallback : displayValue(found);
}

function readIpv6Hosts(source: unknown) {
  const hosts = readPath(source, ["ipv6_hosts", "ipv6Hosts", "neighbors.ipv6", "ipv6_neighbors"]);
  return Array.isArray(hosts) ? hosts : [];
}

function resultHosts(source: unknown) {
  const directHosts = readPath(source, ["hosts"]);
  if (Array.isArray(directHosts)) {
    return directHosts;
  }

  const neighbors = readPath(source, ["neighbors"]);
  if (!neighbors || typeof neighbors !== "object") {
    return [];
  }

  const hosts: unknown[] = [];
  for (const [portId, records] of Object.entries(neighbors as Record<string, unknown>)) {
    if (!Array.isArray(records)) {
      continue;
    }
    for (const record of records) {
      if (record && typeof record === "object") {
        hosts.push({ ...(record as Record<string, unknown>), port: portId });
      }
    }
  }
  return hosts;
}

function parseVlanText(text: string): { vlan: number[]; error: string | null } {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "-") {
    return { vlan: [], error: null };
  }
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  if (parts.length > 2) {
    return { vlan: [], error: "Maximum two nested VLAN tags are allowed." };
  }
  const vlan: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { vlan: [], error: "Malformed VLAN ID." };
    }
    const value = Number(part);
    if (value < 0 || value > 4095) {
      return { vlan: [], error: "VLAN ID must be between 0 and 4095." };
    }
    vlan.push(value);
  }
  return { vlan, error: null };
}

function cleanInitialValue(valueText: string) {
  return valueText === "-" ? "" : valueText;
}

function readNumber(source: unknown, paths: string[]) {
  const found = readPath(source, paths);
  if (typeof found === "number" && Number.isFinite(found)) {
    return found;
  }
  if (typeof found === "string" && found.trim() !== "") {
    const parsed = Number(found);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pingStatus(source: unknown): PanelStatus {
  const summary = value(source, ["summary"], "Ping command accepted.");
  const recordCount = readNumber(source, ["record_count", "count"]);
  const replyCount = readNumber(source, ["reply_count"]);
  const tone = recordCount && replyCount === 0 ? "warning" : "info";
  return { placement: "neighbor", tone, text: summary };
}

export function PortConfigurationPanel({
  activeCommand,
  captureSummary,
  onApplyConfiguration,
  onPing,
  onResolveArp,
  onScanIpv6,
  overview,
  portTransmitting,
  port
}: PortConfigurationPanelProps) {
  const info = port?.info ?? null;
  const initialL3Source = cleanInitialValue(value(info, ["layer_cfg.ipv4.src", "attr.layer_cfg.ipv4.src", "ipv4.src", "src_ipv4", "src_ip"]));
  const initialL3Destination = cleanInitialValue(value(info, ["layer_cfg.ipv4.dst", "attr.layer_cfg.ipv4.dst", "ipv4.dst", "dest", "dst_ip"]));
  const initialL2Source = cleanInitialValue(value(info, ["layer_cfg.ether.src", "attr.layer_cfg.ether.src", "ether.src", "src_mac", "hw_mac"]));
  const initialL2Destination = cleanInitialValue(value(info, ["layer_cfg.ether.dst", "attr.layer_cfg.ether.dst", "ether.dst", "dst_mac", "arp"]));
  const initialVlan = cleanInitialValue(value(info, ["vlan", "vlan_id"]));
  const arpStatus = value(info, ["layer_cfg.ipv4.state", "attr.layer_cfg.ipv4.state", "arp_status", "arp"]);
  const ipv6Destination = value(info, ["ipv6_destination", "ipv6.dst"]);
  const initialMode = initialL3Source || initialL3Destination ? "L3" : "L2";
  const [mode, setMode] = useState<"L2" | "L3">(initialMode);
  const [l2Destination, setL2Destination] = useState(initialL2Destination);
  const [l3Source, setL3Source] = useState(initialL3Source);
  const [l3Destination, setL3Destination] = useState(initialL3Destination);
  const [vlanText, setVlanText] = useState(initialVlan);
  const [pingDestination, setPingDestination] = useState("");
  const [ipv6Hosts, setIpv6Hosts] = useState<unknown[]>(() => readIpv6Hosts(info));
  const [panelStatus, setPanelStatus] = useState<PanelStatus | null>(null);
  const isApplying = activeCommand === "port-configuration";
  const isResolvingArp = activeCommand === "arp-resolve";
  const isPinging = activeCommand === "port-ping";
  const isScanning = activeCommand === "ipv6-scan";
  const captureWarning = captureSummary ? capturePortSummaryLabel(captureSummary) : null;
  const controlState = portControlState(port, overview, activeCommand);
  const configurationDisabledReason = portTransmitting
    ? "Port is in TX mode. Please stop traffic first."
    : controlState.disabledReason;
  const configurationDisabled = configurationDisabledReason !== null;

  const handleApply = async () => {
    if (configurationDisabled) {
      setPanelStatus({ placement: "layer", tone: "warning", text: configurationDisabledReason });
      return;
    }
    const parsedVlan = parseVlanText(vlanText);
    if (parsedVlan.error) {
      setPanelStatus({ placement: "layer", tone: "error", text: parsedVlan.error });
      return;
    }
    setPanelStatus(null);
    const result = await onApplyConfiguration({
      mode,
      l2_destination: mode === "L2" ? l2Destination.trim() || null : null,
      l3_source: mode === "L3" ? l3Source.trim() || null : null,
      l3_destination: mode === "L3" ? l3Destination.trim() || null : null,
      vlan: parsedVlan.vlan
    });
    if (!result.ok) {
      setPanelStatus({
        placement: "layer",
        tone: "error",
        text: result.error ?? result.blocker ?? "Unable to apply port configuration."
      });
      return;
    }
    setPanelStatus({ placement: "layer", tone: "info", text: "Port configuration applied." });
  };

  const handleResolveArp = async () => {
    if (configurationDisabled) {
      setPanelStatus({ placement: "layer", tone: "warning", text: configurationDisabledReason });
      return;
    }
    const parsedVlan = parseVlanText(vlanText);
    if (parsedVlan.error) {
      setPanelStatus({ placement: "layer", tone: "error", text: parsedVlan.error });
      return;
    }
    setPanelStatus(null);
    const result = await onResolveArp(parsedVlan.vlan.length > 0 ? parsedVlan.vlan : null);
    if (!result.ok) {
      setPanelStatus({ placement: "layer", tone: "error", text: result.error ?? result.blocker ?? "Unable to resolve ARP." });
      return;
    }
    setPanelStatus({ placement: "layer", tone: "info", text: "ARP resolution accepted." });
  };

  const handlePing = async () => {
    if (configurationDisabled) {
      setPanelStatus({ placement: "neighbor", tone: "warning", text: configurationDisabledReason });
      return;
    }
    const destination = pingDestination.trim();
    if (!destination) {
      setPanelStatus({ placement: "neighbor", tone: "error", text: "Empty ping destination address." });
      return;
    }
    setPanelStatus(null);
    const result = await onPing(destination);
    if (!result.ok) {
      setPanelStatus({ placement: "neighbor", tone: "error", text: result.error ?? result.blocker ?? "Unable to ping destination." });
      return;
    }
    setPanelStatus(pingStatus(result.data));
  };

  const handleScanIpv6 = async () => {
    if (configurationDisabled) {
      setPanelStatus({ placement: "neighbor", tone: "warning", text: configurationDisabledReason });
      return;
    }
    setPanelStatus(null);
    setIpv6Hosts([]);
    const result = await onScanIpv6();
    if (result.ok) {
      const hosts = resultHosts(result.data);
      setIpv6Hosts(hosts);
      setPanelStatus({ placement: "neighbor", tone: "info", text: `IPv6 scan complete: ${hosts.length} hosts.` });
      return;
    }
    setPanelStatus({ placement: "neighbor", tone: "error", text: result.error ?? result.blocker ?? "Unable to scan IPv6 hosts." });
  };

  const applyHostAsL2Destination = (host: unknown) => {
    const mac = value(host, ["mac", "mac_address", "macAddress"], "");
    if (mac) {
      setMode("L2");
      setL2Destination(mac);
    }
  };

  return (
    <section className="port-tab-content port-configuration-panel" aria-label="Port Configuration">
      <div className={`port-config-gate ${configurationDisabled ? "port-config-gate--locked" : "port-config-gate--editable"}`} role="status">
        <span>Configuration state</span>
        <strong>{configurationDisabled ? "Locked" : "Editable"}</strong>
        <em>{configurationDisabled ? configurationDisabledReason : "acquired"}</em>
      </div>
      {captureWarning ? (
        <div className="port-capture-warning" role="status">
          <strong>Active capture</strong>
          <span>{captureWarning}</span>
          <span>Service mode may remain enabled until the recorder stops.</span>
        </div>
      ) : null}
      <div className="port-layer-config">
        <div className="config-form-grid">
          <span className="config-label">Mode:</span>
          <label>
            <input checked={mode === "L2"} disabled={configurationDisabled} name="port-layer-mode" onChange={() => setMode("L2")} type="radio" />
            L2
          </label>
          <label>
            <input checked={mode === "L3"} disabled={configurationDisabled} name="port-layer-mode" onChange={() => setMode("L3")} type="radio" />
            L3
          </label>

          <span className="config-label">Source:</span>
          {mode === "L2" ? (
            <input aria-label="L2 source" disabled={configurationDisabled} readOnly value={initialL2Source} />
          ) : (
            <input aria-label="L3 source" disabled={configurationDisabled} onChange={(event) => setL3Source(event.target.value)} value={l3Source} />
          )}
          <span />

          <span className="config-label">Destination:</span>
          {mode === "L2" ? (
            <input aria-label="L2 destination" disabled={configurationDisabled} onChange={(event) => setL2Destination(event.target.value)} value={l2Destination} />
          ) : (
            <input aria-label="L3 destination" disabled={configurationDisabled} onChange={(event) => setL3Destination(event.target.value)} value={l3Destination} />
          )}
          <span />

          <span className="config-label">VLAN:</span>
          <input aria-label="VLAN" disabled={configurationDisabled} onChange={(event) => setVlanText(event.target.value)} value={vlanText} />
          <span />

          {mode === "L3" ? (
            <>
              <span className="config-label">ARP status:</span>
              <strong>{arpStatus || "-"}</strong>
              <span />
            </>
          ) : null}

          <span className="config-label">IPv6 destination:</span>
          <strong>{ipv6Destination || "-"}</strong>
          <span />

          <span />
          <button className="normal-button" disabled={configurationDisabled || isApplying} onClick={handleApply} type="button">
            {isApplying ? "Applying..." : "Apply"}
          </button>
          <button className="normal-button" disabled={configurationDisabled || isResolvingArp || mode !== "L3"} onClick={handleResolveArp} type="button">
            {isResolvingArp ? "Resolving..." : "Resolve ARP"}
          </button>
        </div>
        {panelStatus?.placement === "layer" ? (
          <div
            aria-live="polite"
            className={`port-config-status port-config-status--${panelStatus.tone}`}
            role="status"
          >
            {panelStatus.text}
          </div>
        ) : null}
      </div>

      <div className="port-neighbor-config">
        <div className="ping-row">
          <span>Ping host:</span>
          <input
            aria-label="Ping destination address"
            disabled={configurationDisabled}
            onChange={(event) => setPingDestination(event.target.value)}
            placeholder="Destination address"
            value={pingDestination}
          />
          <button className="normal-button" disabled={configurationDisabled || isPinging} onClick={handlePing} type="button">
            {isPinging ? "Pinging..." : "Ping"}
          </button>
        </div>
        {panelStatus?.placement === "neighbor" ? (
          <div
            aria-live="polite"
            className={`port-config-status port-config-status--${panelStatus.tone}`}
            role="status"
          >
            {panelStatus.text}
          </div>
        ) : null}
        <div className="ipv6-hosts-layout">
          <span>IPv6 hosts:</span>
          <div className="ipv6-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>MAC address</th>
                  <th>IP address</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {ipv6Hosts.length > 0 ? (
                  ipv6Hosts.map((host, index) => {
                    const mac = value(host, ["mac", "mac_address", "macAddress"], "");
                    const ip = value(host, ["ip", "ip_address", "ipAddress", "ipv6"], "");
                    return (
                      <tr key={index}>
                        <td>{mac || "-"}</td>
                        <td>{ip || "-"}</td>
                        <td>
                          <button
                            aria-label={`Use ${ip || mac || "IPv6 neighbor"} as L2 destination`}
                            className="normal-button"
                            disabled={configurationDisabled || !mac}
                            onClick={() => applyHostAsL2Destination(host)}
                            title={mac ? "Use neighbor MAC as the L2 destination" : "Neighbor has no MAC address"}
                            type="button"
                          >
                            Use as L2
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3}>{isScanning ? "Scanning in progress..." : "Click on Scan button to start scanning IPv6 neighbors."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="neighbor-buttons">
            <button className="normal-button" disabled={configurationDisabled || isScanning} onClick={handleScanIpv6} type="button">
              {isScanning ? "Scanning..." : "Scan"}
            </button>
            <button
              className="normal-button"
              disabled={configurationDisabled || ipv6Hosts.length === 0}
              onClick={() => {
                setIpv6Hosts([]);
                setPanelStatus({ placement: "neighbor", tone: "info", text: "IPv6 host table cleared." });
              }}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
