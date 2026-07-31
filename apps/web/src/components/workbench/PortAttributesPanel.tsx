import type { FlowControlMode, PortAttributeName, SystemOverview, TrexPortRecord, TrexResult } from "../../api";
import { capturePortSummaryLabel, type CapturePortSummary } from "./capturePortSummary";
import { displayValue } from "./format";
import { portControlState } from "./portControlState";

type PortAttributesPanelProps = {
  overview: SystemOverview | null;
  port: TrexPortRecord | null;
  captureSummary: CapturePortSummary | null;
  activeCommand: string | null;
  onSetPortAttribute: (
    attribute: PortAttributeName,
    value: boolean | FlowControlMode
  ) => Promise<TrexResult<Record<string, unknown>> | null>;
  onSetServiceMode: (enabled: boolean) => Promise<TrexResult<Record<string, unknown>> | null>;
};

const emptyPort: TrexPortRecord = {
  id: 0,
  acquired: false,
  info: {}
};

function firstKnownValue(info: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = info[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function booleanValue(info: Record<string, unknown>, keys: string[]) {
  const value = firstKnownValue(info, keys);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "up", "on", "true", "yes", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "down", "off", "false", "no", "disabled"].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === "object" && value !== null) {
    const nested = value as Record<string, unknown>;
    return booleanValue(nested, ["enabled", "up", "on", "state"]);
  }
  return null;
}

function supportValue(info: Record<string, unknown>, keys: string[]): boolean | null {
  const value = firstKnownValue(info, keys);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "yes", "true", "supported", "on", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "no", "false", "unsupported", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === "object" && value !== null) {
    const nested = value as Record<string, unknown>;
    return supportValue(nested, ["supported", "enabled"]);
  }
  return null;
}

function flowControlValue(info: Record<string, unknown>): FlowControlMode {
  const value = firstKnownValue(info, ["flow_control", "flow_ctrl", "fc", "mode"]);
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    if (["NONE", "TX", "RX", "FULL"].includes(normalized)) {
      return normalized as FlowControlMode;
    }
  }
  if (typeof value === "number") {
    return (["NONE", "TX", "RX", "FULL"][value] ?? "NONE") as FlowControlMode;
  }
  if (typeof value === "object" && value !== null) {
    const nested = value as Record<string, unknown>;
    return flowControlValue(nested);
  }
  return "NONE";
}

function field(info: Record<string, unknown>, keys: string[], fallback = "-") {
  const value = firstKnownValue(info, keys);
  return value === null ? fallback : displayValue(value);
}

function SwitchValue({
  disabled = false,
  disabledTitle,
  label,
  onChange,
  value
}: {
  disabled?: boolean;
  disabledTitle?: string;
  label: string;
  onChange?: (enabled: boolean) => void;
  value: boolean | null;
}) {
  const className = `trex-switch ${value === true ? "trex-switch--on" : ""} ${value === null ? "trex-switch--unknown" : ""} ${onChange ? "trex-switch--interactive" : ""}`;
  if (onChange) {
    return (
      <button
        aria-checked={value === true}
        aria-label={label}
        className={className}
        disabled={disabled}
        onClick={() => onChange(value !== true)}
        role="switch"
        title={disabled ? disabledTitle ?? `${label} requires an acquired port` : label}
        type="button"
      />
    );
  }
  return (
    <span
      aria-label={`${label}: ${value === null ? "unknown" : value ? "on" : "off"}`}
      className={className}
      role="img"
    />
  );
}

export function PortAttributesPanel({
  activeCommand,
  captureSummary,
  onSetPortAttribute,
  onSetServiceMode,
  overview,
  port
}: PortAttributesPanelProps) {
  const activePort = port ?? emptyPort;
  const info = activePort.info;
  const controlState = portControlState(port, overview, activeCommand);
  const disabledReason = controlState.disabledReason;
  const portControlDisabled = disabledReason !== null;
  const multicastMode = booleanValue(info, ["multicast", "mult", "is_multicast"]);
  const promiscuousMode = booleanValue(info, ["promiscuous", "prom", "promiscuous_mode"]);
  const serviceMode = booleanValue(info, ["service", "service_mode"]);
  const linkMode = booleanValue(info, ["link", "link_status"]);
  const ledMode = booleanValue(info, ["led", "led_status", "led_on"]);
  const flowControl = flowControlValue(info);
  const linkSupported = supportValue(info, ["link_change_supported", "is_link_supported", "link_supported"]);
  const ledSupported = supportValue(info, ["led_change_supported", "is_led_supported", "led_supported"]);
  const flowControlSupported = supportValue(info, ["fc_supported", "is_fc_supported", "flow_control_supported"]);
  const capturing = captureSummary ? capturePortSummaryLabel(captureSummary) : field(info, ["capturing", "capture", "capture_status"], "None");

  return (
    <div className="port-attributes">
      {!overview?.trex_ports?.ok ? (
        <div className="port-blocker">
          <strong>{overview?.trex_ports?.blocker ?? "No port loaded"}</strong>
          <span>{overview?.trex_ports?.error ?? "Waiting for a real TRex port response."}</span>
        </div>
      ) : null}
      {overview?.trex_ports?.ok ? (
        <div className={`port-control-state ${controlState.editable ? "port-control-state--editable" : "port-control-state--locked"}`}>
          <span>Control state</span>
          <strong>{controlState.editable ? "Editable" : "Locked"}</strong>
          <em>{controlState.editable ? "acquired" : disabledReason}</em>
        </div>
      ) : null}
      <dl className="port-attribute-grid">
        <div>
          <dt>VLAN:</dt>
          <dd>{field(info, ["vlan", "vlan_id", "index"], String(activePort.id))}</dd>
        </div>
        <div>
          <dt>Driver:</dt>
          <dd>{field(info, ["driver", "driver_name"])}</dd>
        </div>
        <div>
          <dt>Rx filter mode:</dt>
          <dd>{field(info, ["rx_filter_mode", "rx_filter", "rx_filter_mode_hw"])}</dd>
        </div>
        <div>
          <dt>Multicast:</dt>
          <dd>
            <SwitchValue
              disabled={portControlDisabled}
              disabledTitle={disabledReason ?? undefined}
              label="Multicast"
              onChange={(enabled) => {
                void onSetPortAttribute("multicast", enabled);
              }}
              value={multicastMode}
            />
          </dd>
        </div>
        <div>
          <dt>Promiscuous:</dt>
          <dd>
            <SwitchValue
              disabled={portControlDisabled}
              disabledTitle={disabledReason ?? undefined}
              label="Promiscuous"
              onChange={(enabled) => {
                void onSetPortAttribute("promiscuous", enabled);
              }}
              value={promiscuousMode}
            />
          </dd>
        </div>
        <div>
          <dt>Service:</dt>
          <dd>
            <SwitchValue
              disabled={portControlDisabled}
              disabledTitle={disabledReason ?? undefined}
              label="Service mode"
              onChange={(enabled) => {
                void onSetServiceMode(enabled);
              }}
              value={serviceMode}
            />
          </dd>
        </div>

        <div>
          <dt>Owner:</dt>
          <dd>{field(info, ["owner"], activePort.acquired ? "acquired" : "-")}</dd>
        </div>
        <div>
          <dt>Speed:</dt>
          <dd>{field(info, ["speed", "speed_gbps", "link_speed"])}</dd>
        </div>
        <div>
          <dt>Status:</dt>
          <dd>{field(info, ["status", "state"])}</dd>
        </div>
        <div>
          <dt>Capturing:</dt>
          <dd>{capturing}</dd>
        </div>
        <div>
          <dt>Link:</dt>
          <dd>
            <SwitchValue
              disabled={portControlDisabled || linkSupported === false}
              disabledTitle={linkSupported === false ? "Link control is not supported by this port" : disabledReason ?? undefined}
              label="Link"
              onChange={(enabled) => {
                void onSetPortAttribute("link", enabled);
              }}
              value={linkMode}
            />
          </dd>
        </div>
        <div>
          <dt>LED:</dt>
          <dd>
            <SwitchValue
              disabled={portControlDisabled || ledSupported === false}
              disabledTitle={ledSupported === false ? "LED is not supported by this port" : disabledReason ?? undefined}
              label="LED"
              onChange={(enabled) => {
                void onSetPortAttribute("led", enabled);
              }}
              value={ledMode}
            />
          </dd>
        </div>

        <div>
          <dt>NUMA node:</dt>
          <dd>{field(info, ["numa_node", "numa"], "-1")}</dd>
        </div>
        <div>
          <dt>PCI address:</dt>
          <dd>{field(info, ["pci_addr", "pci_address"])}</dd>
        </div>
        <div>
          <dt>RX Queueing:</dt>
          <dd>{field(info, ["rx_queueing", "rx_queue"])}</dd>
        </div>
        <div>
          <dt>Grat ARP:</dt>
          <dd>{field(info, ["grat_arp", "gratuitous_arp"])}</dd>
        </div>
        <div>
          <dt>Flow control:</dt>
          <dd>
            <select
              aria-label="Flow control"
              disabled={portControlDisabled || flowControlSupported === false}
              onChange={(event) => {
                void onSetPortAttribute("flow_control", event.currentTarget.value as FlowControlMode);
              }}
              title={flowControlSupported === false ? "Flow control is not supported by this port" : disabledReason ?? "Flow control"}
              value={flowControl}
            >
              <option value="NONE">NONE</option>
              <option value="TX">TX</option>
              <option value="RX">RX</option>
              <option value="FULL">FULL</option>
            </select>
          </dd>
        </div>
      </dl>
    </div>
  );
}
