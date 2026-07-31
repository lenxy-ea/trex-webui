import { Cable, FileSliders, Network } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import type { SystemOverview, TrexPortRecord } from "../../api";
import { displayValue } from "./format";

export type TopologyPortSignal = "active" | "owned" | "idle" | "down";

export type TopologyPortState = {
  label: string;
  signal: TopologyPortSignal;
};

type TopologyPaneProps = {
  overview: SystemOverview | null;
  portRecords: TrexPortRecord[];
  portStates: Record<number, TopologyPortState>;
  profileLabel: string;
  selectedPortId: number | null;
  onSelectPort: (portId: number) => void;
};

function ownerLabel(port: TrexPortRecord) {
  const owner = port.info.owner;
  if (owner === null || owner === undefined || owner === "" || owner === "-") {
    return "";
  }
  return `(${displayValue(owner)})`;
}

export function TopologyPane({
  overview,
  portRecords,
  portStates,
  profileLabel,
  selectedPortId,
  onSelectPort
}: TopologyPaneProps) {
  const activePortId = selectedPortId ?? portRecords[0]?.id ?? null;
  const portRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const handlePortKeyDown = (event: KeyboardEvent<HTMLButtonElement>, portId: number) => {
    const currentIndex = portRecords.findIndex((port) => port.id === portId);
    let nextIndex: number;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(portRecords.length - 1, currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, currentIndex - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = portRecords.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextPort = portRecords[nextIndex];
    onSelectPort(nextPort.id);
    portRefs.current[nextPort.id]?.focus();
  };

  return (
    <aside className="topology-pane" aria-label="Topology tree">
      <div className="tree-list" role="tree">
        <div aria-expanded="true" aria-level={1} className="tree-row host-row" role="treeitem">
          <Network aria-hidden="true" size={15} />
          <strong>TRex-{overview?.environment?.host ?? "unconfigured"}</strong>
        </div>
        {portRecords.length > 0 ? (
          portRecords.map((port) => (
            <button
              aria-level={2}
              aria-selected={port.id === activePortId}
              className={`tree-branch ${port.id === activePortId ? "tree-branch--selected" : ""}`}
              key={port.id}
              onClick={() => onSelectPort(port.id)}
              onKeyDown={(event) => handlePortKeyDown(event, port.id)}
              ref={(element) => {
                portRefs.current[port.id] = element;
              }}
              role="treeitem"
              tabIndex={port.id === activePortId ? 0 : -1}
              type="button"
            >
              <Cable aria-hidden="true" size={15} />
              <span
                aria-hidden="true"
                className={`ownership-dot ownership-dot--${portStates[port.id]?.signal ?? (port.acquired ? "owned" : "idle")}`}
                title={portStates[port.id]?.label ?? (port.acquired ? "Acquired" : "Link up idle")}
              />
              <span>Port {port.id}</span>
              <small>{ownerLabel(port)}</small>
              <div className="tree-leaf">
                <FileSliders aria-hidden="true" size={13} />
                <span>{profileLabel}</span>
              </div>
            </button>
          ))
        ) : (
          <div aria-level={2} className="tree-branch tree-branch--blocked" role="treeitem">
            <Cable aria-hidden="true" size={15} />
            <span>{overview?.trex_ports?.blocker ?? "ports pending"}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
