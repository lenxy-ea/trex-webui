import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { overview, statsResponse } from "../../test/appTestHarness";
import { DashboardWorkspace } from "./DashboardWorkspace";

function renderDashboard(
  overrides: Partial<ComponentProps<typeof DashboardWorkspace>> = {}
) {
  const props: ComponentProps<typeof DashboardWorkspace> = {
    isStatsLoading: false,
    onClearStats: vi.fn(),
    portRecords: overview.trex_ports.data.ports,
    startResult: null,
    statsHistory: [],
    statsResult: statsResponse,
    ...overrides
  };
  render(<DashboardWorkspace {...props} />);
  return props;
}

describe("DashboardWorkspace", () => {
  afterEach(() => cleanup());

  it("prioritizes run health and groups the existing metrics by operator intent", () => {
    renderDashboard();

    const dashboard = screen.getByLabelText("Dashboard workspace");
    expect(dashboard.firstElementChild).toBe(screen.getByLabelText("Run health"));

    const trafficGroup = screen.getByRole("region", { name: "Traffic" });
    expect(trafficGroup.querySelectorAll(".global-stat-panel")).toHaveLength(6);
    expect(within(trafficGroup).getByText("Total Tx L2")).toBeInTheDocument();
    expect(within(trafficGroup).getByText("Total Rx L2")).toBeInTheDocument();
    expect(within(trafficGroup).getByText("Active Ports")).toBeInTheDocument();

    const healthGroup = screen.getByRole("region", { name: "Health & Latency" });
    expect(healthGroup.querySelectorAll(".global-stat-panel")).toHaveLength(4);
    expect(within(healthGroup).getByText("Drop Rate")).toBeInTheDocument();
    expect(within(healthGroup).getByText("Queue Full")).toBeInTheDocument();
    expect(within(healthGroup).getByText("15 latency errors")).toBeInTheDocument();
  });

  it("supports roving focus and automatic activation across Dashboard tabs", () => {
    renderDashboard();

    const portsTab = screen.getByRole("tab", { name: "Ports" });
    expect(portsTab).toHaveAttribute("aria-controls", "dashboard-panel-ports");
    expect(portsTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "dashboard-tab-ports");

    portsTab.focus();
    fireEvent.keyDown(portsTab, { key: "ArrowRight" });
    const streamsTab = screen.getByRole("tab", { name: "Streams" });
    expect(streamsTab).toHaveFocus();
    expect(streamsTab).toHaveAttribute("aria-selected", "true");
    expect(portsTab).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "dashboard-panel-streams");

    fireEvent.keyDown(streamsTab, { key: "End" });
    const utilizationTab = screen.getByRole("tab", { name: "Utilization" });
    expect(utilizationTab).toHaveFocus();
    expect(utilizationTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(utilizationTab, { key: "Home" });
    expect(portsTab).toHaveFocus();
    expect(portsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(portsTab, { key: "ArrowLeft" });
    expect(utilizationTab).toHaveFocus();
    expect(utilizationTab).toHaveAttribute("aria-selected", "true");
  });

  it("supports roving keyboard control for latency views", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("tab", { name: "Latency" }));

    const windowButton = screen.getByRole("button", { name: "Window" });
    expect(windowButton).toHaveAttribute("aria-controls", "dashboard-latency-view");
    expect(windowButton).toHaveAttribute("tabindex", "0");

    windowButton.focus();
    fireEvent.keyDown(windowButton, { key: "ArrowRight" });
    const histogramButton = screen.getByRole("button", { name: "Histogram" });
    expect(histogramButton).toHaveFocus();
    expect(histogramButton).toHaveAttribute("aria-pressed", "true");
    expect(histogramButton).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", { name: "Histogram" })).toHaveAttribute("id", "dashboard-latency-view");

    fireEvent.keyDown(histogramButton, { key: "Home" });
    expect(windowButton).toHaveFocus();
    expect(windowButton).toHaveAttribute("aria-pressed", "true");
  });

  it("groups six run trends above two equal port charts and maps both L2 series", () => {
    const portRecords = Array.from({ length: 6 }, (_, id) => ({
      ...overview.trex_ports.data.ports[0],
      id,
      info: {
        ...overview.trex_ports.data.ports[0].info,
        pci_address: `0000:0${id + 1}:00.0`
      }
    }));
    const portStats = Object.fromEntries(
      portRecords.map(({ id }) => [
        String(id),
        {
          ierrors: 0,
          ipackets: 900 + id,
          oerrors: 0,
          opackets: 1_000 + id,
          rx_bps: 80_000 + id * 1_000,
          rx_pps: 80 + id,
          rx_util: 8 + id,
          tx_bps: 100_000 + id * 1_000,
          tx_pps: 100 + id,
          tx_util: 10 + id
        }
      ])
    );
    renderDashboard({
      portRecords,
      statsHistory: [
        {
          timestamp: 1_000,
          txPps: 100,
          rxPps: 75,
          txBps: 1_000,
          rxBps: 500,
          dropBps: 0,
          queueFull: 0,
          latencyAvg: 4
        },
        {
          timestamp: 2_000,
          txPps: 200,
          rxPps: 150,
          txBps: 2_000,
          rxBps: 1_000,
          dropBps: 8,
          queueFull: 2,
          latencyAvg: 6
        }
      ],
      statsResult: {
        ...statsResponse,
        data: {
          ...statsResponse.data,
          ...portStats
        }
      }
    });
    fireEvent.click(screen.getByRole("tab", { name: "Charts" }));

    const trends = screen.getByRole("group", { name: "Run trends" });
    const ports = screen.getByRole("group", { name: "Port rate comparison" });
    expect(trends).toHaveClass("dashboard-chart-group--trends");
    expect(ports).toHaveClass("dashboard-chart-group--ports");
    expect(trends.children).toHaveLength(6);
    expect(ports.children).toHaveLength(2);
    for (const portChart of ports.children) {
      expect(portChart.querySelectorAll(".dashboard-bar-row")).toHaveLength(6);
    }
    expect(screen.getByText("2 Kb/s / 1 Kb/s")).toBeInTheDocument();

    const l2Trend = within(trends).getByRole("img", {
      name: "Tx / Rx L2 trend; Tx latest 2 Kb/s; Rx latest 1 Kb/s"
    });
    const series = l2Trend.querySelectorAll("polyline");
    expect(series).toHaveLength(2);
    expect(series[0]).toHaveClass("dashboard-chart-line--tx");
    expect(series[1]).toHaveClass("dashboard-chart-line--rx");
    expect(series[0]).not.toHaveAttribute("points", series[1].getAttribute("points"));
  });

  it("uses one actionable empty state when no stats sample exists", () => {
    renderDashboard({ portRecords: [], statsResult: null });

    expect(screen.getByText("No stats sample")).toBeInTheDocument();
    expect(screen.getByLabelText("Dashboard workspace").querySelectorAll(".dashboard-empty-state")).toHaveLength(1);
    expect(screen.queryByText("No port samples loaded")).not.toBeInTheDocument();
  });
});
