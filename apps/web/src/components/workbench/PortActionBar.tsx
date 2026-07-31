import { Cable, RotateCcw, Unlock } from "lucide-react";

type PortActionBarProps = {
  activeCommand: string | null;
  acquired: boolean;
  onAcquirePorts: () => void;
  onForceAcquirePorts: () => void;
  onReleasePorts: () => void;
  onResetPorts: () => void;
};

export function PortActionBar({
  activeCommand,
  acquired,
  onAcquirePorts,
  onForceAcquirePorts,
  onReleasePorts,
  onResetPorts
}: PortActionBarProps) {
  return (
    <div className="port-actions">
      <div className="port-action-main" aria-label="Port actions">
        <button
          className="command-button"
          disabled={activeCommand !== null}
          onClick={acquired ? onReleasePorts : onAcquirePorts}
          title={acquired ? "Release ports" : "Acquire ports"}
          type="button"
        >
          {acquired ? <Cable aria-hidden="true" size={16} /> : <Unlock aria-hidden="true" size={16} />}
          <span>{activeCommand === "acquire" || activeCommand === "release" ? "Applying" : acquired ? "Release" : "Acquire"}</span>
        </button>
        <button className="command-button" disabled={activeCommand !== null} onClick={onForceAcquirePorts} title="Force acquire ports" type="button">
          <Unlock aria-hidden="true" size={16} />
          <span>{activeCommand === "force-acquire" ? "Acquiring" : "Force Acquire"}</span>
        </button>
        <button className="command-button danger-command" disabled={activeCommand !== null} onClick={onResetPorts} title="Reset ports" type="button">
          <RotateCcw aria-hidden="true" size={16} />
          <span>{activeCommand === "reset" ? "Resetting" : "Reset"}</span>
        </button>
      </div>
    </div>
  );
}
