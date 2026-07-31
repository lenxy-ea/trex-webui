import { useRef, type KeyboardEvent } from "react";

export type PortDetailTab = "Control" | "Configuration" | "Hardware counters";

const tabs: PortDetailTab[] = ["Control", "Configuration", "Hardware counters"];

function tabSlug(tab: PortDetailTab) {
  return tab.toLowerCase().replace(/ /g, "-");
}

export function portDetailTabId(tab: PortDetailTab) {
  return `port-detail-tab-${tabSlug(tab)}`;
}

export function portDetailPanelId(tab: PortDetailTab) {
  return `port-detail-panel-${tabSlug(tab)}`;
}

type PortDetailTabsProps = {
  activeTab: PortDetailTab;
  onTabChange: (tab: PortDetailTab) => void;
};

export function PortDetailTabs({ activeTab, onTabChange }: PortDetailTabsProps) {
  const tabRefs = useRef<Partial<Record<PortDetailTab, HTMLButtonElement | null>>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: PortDetailTab) => {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="sub-tabs" role="tablist" aria-label="Port detail tabs">
      {tabs.map((tab) => (
        <button
          aria-controls={portDetailPanelId(tab)}
          aria-selected={activeTab === tab}
          className={`sub-tab ${activeTab === tab ? "sub-tab--active" : ""}`}
          id={portDetailTabId(tab)}
          key={tab}
          onClick={() => onTabChange(tab)}
          onKeyDown={(event) => handleKeyDown(event, tab)}
          ref={(element) => {
            tabRefs.current[tab] = element;
          }}
          role="tab"
          tabIndex={activeTab === tab ? 0 : -1}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
