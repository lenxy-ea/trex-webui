import {
  Cable,
  CirclePlay,
  ClipboardList,
  Eraser,
  FlaskConical,
  Gauge,
  ListStart,
  ListX,
  LockKeyhole,
  Pause,
  Play,
  type LucideIcon,
  Square,
  UnlockKeyhole
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { TrafficRunControl } from "./TrafficRunControl";
import type { TrafficMultiplierUnit } from "./trafficMultiplier";

type WorkbenchChromeProps = {
  isStarting: boolean;
  activeCommand: string | null;
  runtimeControlDisabledReason: string | null;
  trafficMultiplierUnit: TrafficMultiplierUnit;
  trafficMultiplierValue: string;
  trafficMultiplierError: string | null;
  trafficDurationEnabled: boolean;
  trafficDurationValue: string;
  trafficDurationError: string | null;
  onTrafficMultiplierUnitChange: (unit: TrafficMultiplierUnit) => void;
  onTrafficMultiplierValueChange: (value: string) => void;
  onTrafficDurationEnabledChange: (enabled: boolean) => void;
  onTrafficDurationValueChange: (value: string) => void;
  onStartTraffic: () => void;
  onStartAllTraffic: () => void;
  onUpdateTraffic: () => void;
  onPauseTraffic: () => void;
  onResumeTraffic: () => void;
  onStopTraffic: () => void;
  onStopAllTraffic: () => void;
  onClearStats: () => void;
  onAcquirePorts: () => void;
  onReleasePorts: () => void;
  isConnected: boolean;
  onDisconnect: () => Promise<void> | void;
  onOpenConnect: () => void;
  onOpenProfiles: () => void;
  onOpenDashboard: () => void;
  onOpenQuickValidation: () => void;
  onOpenReports: () => void;
  onOpenCapture: () => void;
  onOpenDaemon: () => void;
  onOpenPreferences: () => void;
  onOpenAbout: () => void;
};

type IconCommandButtonProps = {
  className?: string;
  disabled?: boolean;
  disabledReason?: string | null;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
};

function IconCommandButton({
  className,
  disabled,
  disabledReason,
  icon: Icon,
  label,
  onClick
}: IconCommandButtonProps) {
  return (
    <button
      aria-label={label}
      className={["round-command", className].filter(Boolean).join(" ")}
      data-tooltip={disabledReason ?? label}
      disabled={disabled}
      onClick={onClick}
      title={disabledReason ?? label}
      type="button"
    >
      <Icon aria-hidden="true" size={17} strokeWidth={2.35} />
    </button>
  );
}

export function WorkbenchChrome({
  isStarting,
  activeCommand,
  runtimeControlDisabledReason,
  trafficMultiplierUnit,
  trafficMultiplierValue,
  trafficMultiplierError,
  trafficDurationEnabled,
  trafficDurationValue,
  trafficDurationError,
  onTrafficMultiplierUnitChange,
  onTrafficMultiplierValueChange,
  onTrafficDurationEnabledChange,
  onTrafficDurationValueChange,
  onStartTraffic,
  onStartAllTraffic,
  onUpdateTraffic,
  onPauseTraffic,
  onResumeTraffic,
  onStopTraffic,
  onStopAllTraffic,
  onClearStats,
  onAcquirePorts,
  onReleasePorts,
  isConnected,
  onDisconnect,
  onOpenConnect,
  onOpenProfiles,
  onOpenDashboard,
  onOpenQuickValidation,
  onOpenReports,
  onOpenCapture,
  onOpenDaemon,
  onOpenPreferences,
  onOpenAbout
}: WorkbenchChromeProps) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const fileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!fileMenuOpen) {
      return undefined;
    }

    fileMenuItemRefs.current[0]?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && fileMenuRef.current?.contains(event.target)) {
        return;
      }
      setFileMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setFileMenuOpen(false);
        fileMenuButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [fileMenuOpen]);

  const handleFileConnect = () => {
    setFileMenuOpen(false);
    if (isConnected) {
      void onDisconnect();
      return;
    }
    onOpenConnect();
  };

  const handleFilePreferences = () => {
    setFileMenuOpen(false);
    onOpenPreferences();
  };

  const handleFileMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = fileMenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null && !item.disabled
    );
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    let nextIndex: number;

    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setFileMenuOpen(false);
      fileMenuButtonRef.current?.focus();
      return;
    } else {
      return;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };
  const runtimeControlsDisabled = runtimeControlDisabledReason !== null;

  return (
    <header className="workbench-chrome">
      <div className="title-strip">
        <span className="brand-mark">T</span>
        <h1 className="workbench-title">TRex WebUI</h1>
      </div>
      <nav className="menu-bar" aria-label="Application menu">
        <div className="menu-group" ref={fileMenuRef}>
          <button
            aria-expanded={fileMenuOpen}
            aria-haspopup="menu"
            onClick={() => setFileMenuOpen((open) => !open)}
            ref={fileMenuButtonRef}
            type="button"
          >
            File
          </button>
          {fileMenuOpen ? (
            <div className="menu-dropdown" onKeyDown={handleFileMenuKeyDown} role="menu" aria-label="File">
              <button
                onClick={handleFileConnect}
                ref={(element) => {
                  fileMenuItemRefs.current[0] = element;
                }}
                role="menuitem"
                tabIndex={-1}
                type="button"
              >
                {isConnected ? "Disconnect" : "Connect"}
              </button>
              <button
                onClick={handleFilePreferences}
                ref={(element) => {
                  fileMenuItemRefs.current[1] = element;
                }}
                role="menuitem"
                tabIndex={-1}
                type="button"
              >
                Preferences
              </button>
            </div>
          ) : null}
        </div>
        <button onClick={onOpenProfiles} type="button">Traffic Profiles</button>
        <button onClick={onOpenDashboard} type="button">Stats</button>
        <button onClick={onOpenQuickValidation} type="button">Tests</button>
        <button onClick={onOpenReports} type="button">Run Reports</button>
        <button onClick={onOpenCapture} type="button">Capture</button>
        <button onClick={onOpenDaemon} type="button">TRex Daemon</button>
        <button onClick={onOpenAbout} type="button">Help</button>
      </nav>
      <div className="command-bar" aria-label="Global command bar">
        <IconCommandButton className="start-command" disabled={runtimeControlsDisabled || isStarting} disabledReason={runtimeControlDisabledReason} icon={Play} label="Start selected port" onClick={onStartTraffic} />
        <IconCommandButton className="start-command" disabled={runtimeControlsDisabled || isStarting} disabledReason={runtimeControlDisabledReason} icon={ListStart} label="Start all ports" onClick={onStartAllTraffic} />
        <IconCommandButton className="stop-command" disabled={runtimeControlsDisabled || activeCommand !== null} disabledReason={runtimeControlDisabledReason} icon={Square} label="Stop selected port" onClick={onStopTraffic} />
        <IconCommandButton className="stop-command" disabled={runtimeControlsDisabled || activeCommand !== null} disabledReason={runtimeControlDisabledReason} icon={ListX} label="Stop all ports" onClick={onStopAllTraffic} />
        <IconCommandButton disabled={runtimeControlsDisabled || activeCommand !== null} disabledReason={runtimeControlDisabledReason} icon={Pause} label="Pause selected port" onClick={onPauseTraffic} />
        <IconCommandButton disabled={runtimeControlsDisabled || activeCommand !== null} disabledReason={runtimeControlDisabledReason} icon={CirclePlay} label="Resume selected port" onClick={onResumeTraffic} />
        <IconCommandButton disabled={runtimeControlsDisabled} disabledReason={runtimeControlDisabledReason} icon={Eraser} label="Clear all stats" onClick={onClearStats} />
        <TrafficRunControl
          activeCommand={activeCommand}
          disabledReason={runtimeControlDisabledReason}
          onTrafficDurationEnabledChange={onTrafficDurationEnabledChange}
          onTrafficDurationValueChange={onTrafficDurationValueChange}
          onTrafficMultiplierUnitChange={onTrafficMultiplierUnitChange}
          onTrafficMultiplierValueChange={onTrafficMultiplierValueChange}
          onUpdateTraffic={onUpdateTraffic}
          trafficDurationEnabled={trafficDurationEnabled}
          trafficDurationError={trafficDurationError}
          trafficDurationValue={trafficDurationValue}
          trafficMultiplierError={trafficMultiplierError}
          trafficMultiplierUnit={trafficMultiplierUnit}
          trafficMultiplierValue={trafficMultiplierValue}
        />
        <IconCommandButton disabled={runtimeControlsDisabled || activeCommand !== null} disabledReason={runtimeControlDisabledReason} icon={LockKeyhole} label="Acquire selected port" onClick={onAcquirePorts} />
        <IconCommandButton disabled={runtimeControlsDisabled || activeCommand !== null} disabledReason={runtimeControlDisabledReason} icon={UnlockKeyhole} label="Release selected port" onClick={onReleasePorts} />
        <IconCommandButton
          icon={Cable}
          label={isConnected ? "Disconnect from TRex server" : "Connect to TRex server"}
          onClick={isConnected ? () => void onDisconnect() : onOpenConnect}
        />
        <span className="command-spacer" />
        <IconCommandButton icon={Gauge} label="Open dashboard" onClick={onOpenDashboard} />
        <IconCommandButton icon={FlaskConical} label="Open Quick Validation" onClick={onOpenQuickValidation} />
        <IconCommandButton icon={ClipboardList} label="Open run reports" onClick={onOpenReports} />
      </div>
    </header>
  );
}
