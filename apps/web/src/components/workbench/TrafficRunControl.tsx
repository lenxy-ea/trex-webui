import { RefreshCw } from "lucide-react";

import { trafficMultiplierUnitOptions, type TrafficMultiplierUnit } from "./trafficMultiplier";

const profileMultiplierUnitOptions = trafficMultiplierUnitOptions.filter((option) => option.value !== "raw");

type TrafficRunControlProps = {
  activeCommand: string | null;
  disabledReason?: string | null;
  ariaLabelPrefix?: string;
  className?: string;
  fieldLabel?: string;
  variant?: "compact" | "profile";
  trafficMultiplierUnit: TrafficMultiplierUnit;
  trafficMultiplierValue: string;
  trafficMultiplierError: string | null;
  trafficMultiplierPreview?: string | null;
  trafficDurationEnabled: boolean;
  trafficDurationValue: string;
  trafficDurationError: string | null;
  onTrafficMultiplierUnitChange: (unit: TrafficMultiplierUnit) => void;
  onTrafficMultiplierValueChange: (value: string) => void;
  onTrafficDurationEnabledChange: (enabled: boolean) => void;
  onTrafficDurationValueChange: (value: string) => void;
  onUpdateTraffic: () => void;
};

export function TrafficRunControl({
  activeCommand,
  disabledReason,
  ariaLabelPrefix = "Traffic",
  className,
  fieldLabel = "Rate",
  variant = "compact",
  trafficMultiplierUnit,
  trafficMultiplierValue,
  trafficMultiplierError,
  trafficMultiplierPreview,
  trafficDurationEnabled,
  trafficDurationValue,
  trafficDurationError,
  onTrafficMultiplierUnitChange,
  onTrafficMultiplierValueChange,
  onTrafficDurationEnabledChange,
  onTrafficDurationValueChange,
  onUpdateTraffic
}: TrafficRunControlProps) {
  const isProfileVariant = variant === "profile";
  const rootClassName = [
    "traffic-run-control",
    isProfileVariant ? "traffic-run-control--multiplier-panel" : "",
    className
  ].filter(Boolean).join(" ");
  const fieldAriaName = fieldLabel.toLowerCase();
  const updateRateLabel = ariaLabelPrefix === "Traffic" ? "Update Rate" : `${ariaLabelPrefix} update ${fieldAriaName}`;
  return (
    <div className={rootClassName} title={disabledReason ?? trafficMultiplierError ?? trafficDurationError ?? "Traffic run parameters"}>
      {isProfileVariant ? (
        <div className="traffic-multiplier-options" role="group" aria-label={`${ariaLabelPrefix} multiplier presets`}>
          {profileMultiplierUnitOptions.map((option) => {
            const selected = option.value === trafficMultiplierUnit;
            return (
              <button
                aria-pressed={selected}
                className={`traffic-multiplier-option ${selected ? "traffic-multiplier-option--active" : ""}`}
                key={option.value}
                onClick={() => onTrafficMultiplierUnitChange(option.value)}
                title={option.label}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <label className="traffic-rate-field">
        {fieldLabel}
        <input
          aria-invalid={trafficMultiplierError ? "true" : "false"}
          aria-label={`${ariaLabelPrefix} ${fieldAriaName} value`}
          inputMode="decimal"
          onChange={(event) => onTrafficMultiplierValueChange(event.target.value)}
          value={trafficMultiplierValue}
        />
      </label>
      <select
        aria-label={`${ariaLabelPrefix} ${fieldAriaName} unit`}
        onChange={(event) => onTrafficMultiplierUnitChange(event.target.value as TrafficMultiplierUnit)}
        value={trafficMultiplierUnit}
      >
        {trafficMultiplierUnitOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {isProfileVariant ? (
        <span className={`traffic-multiplier-preview ${trafficMultiplierError ? "traffic-multiplier-preview--error" : ""}`}>
          {trafficMultiplierError ? "Invalid mult" : `TRex mult ${trafficMultiplierPreview ?? "-"}`}
        </span>
      ) : null}
      <button
        aria-label={updateRateLabel}
        className="traffic-update-button"
        disabled={Boolean(disabledReason) || activeCommand !== null}
        onClick={onUpdateTraffic}
        title={disabledReason ?? (ariaLabelPrefix === "Traffic" ? "Update Rate" : `Update ${fieldLabel}`)}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={14} />
      </button>
      <label className="traffic-duration-field">
        <input
          aria-label={`Enable ${ariaLabelPrefix.toLowerCase()} duration`}
          checked={trafficDurationEnabled}
          onChange={(event) => onTrafficDurationEnabledChange(event.target.checked)}
          type="checkbox"
        />
        Duration
        <input
          aria-invalid={trafficDurationError ? "true" : "false"}
          aria-label={`${ariaLabelPrefix} duration seconds`}
          disabled={!trafficDurationEnabled}
          inputMode="decimal"
          onChange={(event) => onTrafficDurationValueChange(event.target.value)}
          value={trafficDurationValue}
        />
      </label>
    </div>
  );
}
