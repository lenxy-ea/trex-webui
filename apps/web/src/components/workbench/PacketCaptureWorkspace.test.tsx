import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TrexCaptureFileDownloadResult,
  TrexCaptureFileOpenResult,
  TrexCaptureFiles,
  TrexCapturePacket,
  TrexCapturePacketResult,
  TrexCaptureRemoveResult,
  TrexCaptureStartResult,
  TrexCaptureStatus,
  TrexResult
} from "../../api";
import { PacketCaptureWorkspace } from "./PacketCaptureWorkspace";

function ok<T>(data: T): TrexResult<T> {
  return {
    ok: true,
    data,
    blocker: null,
    error: null
  };
}

const emptyFetchBudget = {
  requested_packet_count: 1,
  target_packet_count: 0,
  max_packet_count: 10_000,
  max_bytes: 16_000_000,
  fetched_bytes: 0,
  effective_snaplen: 9_216,
  truncated_by_byte_budget: false
};

function capturePacket(index: number): TrexCapturePacket {
  return {
    binary_base64: "",
    decoded_layers: [],
    destination: `10.0.0.${index + 10}`,
    hex_preview: "00112233445566778899aabb0800",
    index,
    info: `packet ${index}`,
    length: 64,
    mode: "RX",
    port: 0,
    source: `10.0.0.${index}`,
    time: index,
    type: "IPv4/UDP",
    wirelen: 64
  };
}

function buildWorkspaceProps(
  overrides: Partial<ComponentProps<typeof PacketCaptureWorkspace>> = {}
) {
  const props: ComponentProps<typeof PacketCaptureWorkspace> = {
    captureDroppedPacketCount: 0,
    captureFilesResult: ok<TrexCaptureFiles>({ root: "/tmp/captures", files: [] }),
    capturePackets: [],
    captureResult: null,
    captureStatusResult: ok<TrexCaptureStatus>({ captures: [] }),
    isCaptureBusy: false,
    isCaptureFilesLoading: false,
    isCaptureStatusLoading: false,
    portRecords: Array.from({ length: 6 }, (_, id) => ({ id, acquired: true, info: {} })),
    runtimeControlDisabledReason: null,
    onClearPackets: vi.fn(),
    onDownloadCaptureFile: vi.fn(() => Promise.resolve(ok<TrexCaptureFileDownloadResult>({
      accepted: true,
      file: {
        content_base64: "",
        download_available: true,
        download_error: null,
        modified_time: null,
        name: "capture.pcap",
        path: "/tmp/captures/capture.pcap",
        size_bytes: 0
      }
    }))),
    onFetchCapture: vi.fn(() => Promise.resolve(ok<TrexCapturePacketResult>({
      accepted: true,
      captures: [],
      fetch_budget: emptyFetchBudget,
      id: 9,
      packet_count: 0,
      packets: []
    }))),
    onOpenCaptureFile: vi.fn(() => Promise.resolve(ok<TrexCaptureFileOpenResult>({
      accepted: true,
      command: ["wireshark", "-r", "/tmp/captures/capture.pcap"],
      file: {
        download_available: true,
        download_error: null,
        modified_time: null,
        name: "capture.pcap",
        path: "/tmp/captures/capture.pcap",
        size_bytes: 0
      },
      pid: 1
    }))),
    onRefreshFiles: vi.fn(() => Promise.resolve(ok<TrexCaptureFiles>({ root: "/tmp/captures", files: [] }))),
    onRefreshStatus: vi.fn(() => Promise.resolve()),
    onRemoveAllCaptures: vi.fn(() => Promise.resolve(ok<TrexCaptureRemoveResult>({
      accepted: true,
      captures: [],
      removed_ids: []
    }))),
    onRemoveCapture: vi.fn(() => Promise.resolve(ok<TrexCaptureRemoveResult>({
      accepted: true,
      captures: [],
      removed_ids: [9]
    }))),
    onStartCapture: vi.fn(() => Promise.resolve(ok<TrexCaptureStartResult>({
      accepted: true,
      bpf_filter: "",
      captures: [{ id: 9, state: "ACTIVE", count: 0, bytes: 0, mode: "fixed", filter: { rx: 1, tx: 1, bpf: "" } }],
      id: 9,
      limit: 1000,
      mode: "fixed",
      rx_ports: [0],
      snaplen: 0,
      start_ts: 1,
      tx_ports: [0]
    }))),
    onStopCapture: vi.fn(() => Promise.resolve(ok<TrexCapturePacketResult>({
      accepted: true,
      captures: [],
      fetch_budget: emptyFetchBudget,
      id: 9,
      packet_count: 0,
      packets: []
    }))),
    ...overrides
  };
  return props;
}

function renderWorkspace(
  overrides: Partial<ComponentProps<typeof PacketCaptureWorkspace>> = {}
) {
  const props = buildWorkspaceProps(overrides);
  render(<PacketCaptureWorkspace {...props} />);
  return props;
}

describe("PacketCaptureWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("auto-fetches monitor packets after starting a monitor capture", async () => {
    vi.useFakeTimers();
    const props = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Start Monitor" }));

    expect(props.onStartCapture).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(props.onFetchCapture).toHaveBeenCalledWith({
      capture_id: 9,
      pkt_count: 1000,
      fetch_limit: 50,
      snaplen: 0
    });
    expect(screen.getByRole("tab", { name: "Monitor" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps every tab panel target mounted and gives the workspace a distinct name", () => {
    renderWorkspace();

    expect(screen.getByRole("region", { name: "Packet Capture workspace" })).toBeInTheDocument();
    const monitorTab = screen.getByRole("tab", { name: "Monitor" });
    const recordersTab = screen.getByRole("tab", { name: "Recorders" });
    const filesTab = screen.getByRole("tab", { name: "Files" });

    expect(monitorTab).toHaveAttribute("aria-controls", "capture-panel-monitor");
    expect(recordersTab).toHaveAttribute("aria-controls", "capture-panel-recorders");
    expect(filesTab).toHaveAttribute("aria-controls", "capture-panel-files");
    expect(document.getElementById("capture-panel-monitor")).not.toHaveAttribute("hidden");
    expect(document.getElementById("capture-panel-recorders")).toHaveAttribute("hidden");
    expect(document.getElementById("capture-panel-files")).toHaveAttribute("hidden");

    monitorTab.focus();
    fireEvent.keyDown(monitorTab, { key: "ArrowRight" });

    expect(recordersTab).toHaveFocus();
    expect(recordersTab).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("capture-panel-monitor")).toHaveAttribute("hidden");
    expect(document.getElementById("capture-panel-recorders")).not.toHaveAttribute("hidden");
    expect(document.getElementById("capture-panel-files")).toHaveAttribute("hidden");
  });

  it("paginates saved capture files without mounting the full archive", () => {
    const files = Array.from({ length: 120 }, (_, index) => ({
      content_base64: null,
      download_available: true,
      download_error: null,
      modified_time: "2026-07-22T00:00:00+00:00",
      name: `capture-${String(index).padStart(3, "0")}.pcap`,
      path: `/tmp/captures/capture-${String(index).padStart(3, "0")}.pcap`,
      size_bytes: index + 1
    }));
    renderWorkspace({
      captureFilesResult: ok<TrexCaptureFiles>({ root: "/tmp/captures", files })
    });

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    const pagination = screen.getByLabelText("Capture file pages");
    expect(within(pagination).getByText("Showing 1–50 of 120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download capture file capture-000.pcap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download capture file capture-050.pcap" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("#capture-panel-files tbody tr")).toHaveLength(50);

    fireEvent.click(within(pagination).getByRole("button", { name: "Next" }));

    expect(within(pagination).getByText("Showing 51–100 of 120")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download capture file capture-000.pcap" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download capture file capture-050.pcap" })).toBeInTheDocument();
    expect(document.querySelectorAll("#capture-panel-files tbody tr")).toHaveLength(50);
  });

  it("searches 125 capture files by name or path before pagination and resets to the first page", () => {
    const files = Array.from({ length: 125 }, (_, index) => {
      const name = `capture-${String(index).padStart(3, "0")}.pcap`;
      return {
        content_base64: null,
        download_available: true,
        download_error: null,
        modified_time: "2026-07-22T00:00:00+00:00",
        name,
        path: index < 65 ? `/tmp/captures/nightly/${name}` : `/tmp/captures/manual/${name}`,
        size_bytes: index + 1
      };
    });
    renderWorkspace({
      captureFilesResult: ok<TrexCaptureFiles>({ root: "/tmp/captures", files })
    });
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    const search = screen.getByRole("searchbox", { name: "Search Capture Files" });
    const initialPagination = screen.getByLabelText("Capture file pages");
    expect(screen.getByText("125 visible of 125")).toBeInTheDocument();
    fireEvent.click(within(initialPagination).getByRole("button", { name: "Next" }));
    expect(within(initialPagination).getByText("Showing 51–100 of 125")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nightly" } });

    const filteredPagination = screen.getByLabelText("Capture file pages");
    expect(screen.getByText("65 visible of 125")).toBeInTheDocument();
    expect(within(filteredPagination).getByText("Showing 1–50 of 65 matches")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download capture file capture-000.pcap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download capture file capture-050.pcap" })).not.toBeInTheDocument();

    fireEvent.click(within(filteredPagination).getByRole("button", { name: "Next" }));

    expect(within(filteredPagination).getByText("Showing 51–65 of 65 matches")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download capture file capture-050.pcap" })).toBeInTheDocument();
    expect(document.querySelectorAll("#capture-panel-files tbody tr")).toHaveLength(15);

    fireEvent.change(search, { target: { value: "capture-124" } });

    expect(screen.getByText("1 visible of 125")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download capture file capture-124.pcap" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Capture file pages")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "does-not-exist" } });

    expect(screen.getByText("0 visible of 125")).toBeInTheDocument();
    expect(screen.getByText("No capture files match the current search")).toBeInTheDocument();
    expect(screen.queryByText("No saved capture files")).not.toBeInTheDocument();
  });

  it("distinguishes an empty capture directory from an unmatched search", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    expect(screen.getByText("0 visible of 0")).toBeInTheDocument();
    expect(screen.getByText("No saved capture files")).toBeInTheDocument();
    expect(screen.queryByText("No capture files match the current search")).not.toBeInTheDocument();
  });

  it("keeps capture files usable while recorder status loads and labels initial file loading", () => {
    const file = {
      content_base64: null,
      download_available: true,
      download_error: null,
      modified_time: "2026-07-22T00:00:00+00:00",
      name: "capture-ready.pcap",
      path: "/tmp/captures/capture-ready.pcap",
      size_bytes: 64
    };
    renderWorkspace({
      captureFilesResult: ok<TrexCaptureFiles>({ root: "/tmp/captures", files: [file] }),
      captureStatusResult: null,
      isCaptureStatusLoading: true
    });

    expect(screen.getByText("Loading capture recorders…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    expect(screen.getByRole("button", { name: "Download capture file capture-ready.pcap" })).toBeEnabled();
    expect(screen.queryByText("No saved capture files")).not.toBeInTheDocument();

    cleanup();
    renderWorkspace({
      captureFilesResult: null,
      isCaptureFilesLoading: true
    });
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    expect(screen.getAllByText("Loading capture files…").length).toBeGreaterThan(0);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("0 visible of 0")).not.toBeInTheDocument();
    expect(screen.queryByText("No saved capture files")).not.toBeInTheDocument();
  });

  it("uses roving focus and packet-selection keys in the monitor table", () => {
    renderWorkspace({ capturePackets: [capturePacket(1), capturePacket(2), capturePacket(3)] });

    const packetRows = Array.from(document.querySelectorAll<HTMLTableRowElement>(".capture-packet-row"));
    const [firstRow, secondRow, latestRow] = packetRows;
    expect(packetRows).toHaveLength(3);
    expect(packetRows.filter((row) => row.tabIndex === 0)).toEqual([latestRow]);
    expect(latestRow).toHaveAttribute("aria-selected", "true");

    latestRow.focus();
    fireEvent.keyDown(latestRow, { key: "ArrowUp" });
    expect(secondRow).toHaveFocus();
    expect(secondRow).toHaveAttribute("aria-selected", "true");
    expect(packetRows.filter((row) => row.tabIndex === 0)).toEqual([secondRow]);

    fireEvent.keyDown(secondRow, { key: "Home" });
    expect(firstRow).toHaveFocus();
    expect(firstRow).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(firstRow, { key: "ArrowDown" });
    expect(secondRow).toHaveFocus();
    expect(secondRow).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(secondRow, { key: "End" });
    expect(latestRow).toHaveFocus();
    expect(latestRow).toHaveAttribute("aria-selected", "true");

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: " " });
    expect(firstRow).toHaveAttribute("aria-selected", "true");
    secondRow.focus();
    fireEvent.keyDown(secondRow, { key: "Enter" });
    expect(secondRow).toHaveAttribute("aria-selected", "true");
    expect(packetRows.filter((row) => row.tabIndex === 0)).toEqual([secondRow]);
  });

  it("keeps the monitor deadline across unrelated rerenders and uses the latest fetch handler", async () => {
    vi.useFakeTimers();
    const initialFetch = vi.fn(() => Promise.resolve(ok<TrexCapturePacketResult>({
      accepted: true,
      captures: [],
      fetch_budget: emptyFetchBudget,
      id: 9,
      packet_count: 0,
      packets: []
    })));
    const latestFetch = vi.fn(initialFetch.getMockImplementation());
    const props = buildWorkspaceProps({ onFetchCapture: initialFetch });
    const view = render(<PacketCaptureWorkspace {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Monitor" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    view.rerender(
      <PacketCaptureWorkspace
        {...props}
        captureDroppedPacketCount={1}
        onFetchCapture={latestFetch}
      />
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(initialFetch).not.toHaveBeenCalled();
    expect(latestFetch).toHaveBeenCalledWith({
      capture_id: 9,
      pkt_count: 1000,
      fetch_limit: 50,
      snaplen: 0
    });
  });

  it("keeps Add Recorder on the recorder management tab", async () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Add Recorder" }));

    await waitFor(() => expect(props.onStartCapture).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Recorders" })).toHaveAttribute("aria-selected", "true")
    );
  });

  it("renders all 6 overview ports as Rx/Tx targets and sends exact All/None selections", async () => {
    const props = renderWorkspace();
    const rxGroup = screen.getByRole("group", { name: "Rx capture ports" });
    const txGroup = screen.getByRole("group", { name: "Tx capture ports" });

    expect(within(rxGroup).getAllByRole("checkbox")).toHaveLength(6);
    expect(within(txGroup).getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.getByRole("checkbox", { name: "Rx port 5" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Tx port 5" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all Rx ports" }));
    fireEvent.click(screen.getByRole("button", { name: "Select no Tx ports" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Monitor" }));

    await waitFor(() => expect(props.onStartCapture).toHaveBeenCalledWith({
      bpf_filter: "",
      limit: 1000,
      mode: "fixed",
      rx_ports: [0, 1, 2, 3, 4, 5],
      snaplen: 0,
      tx_ports: []
    }));
    expect(screen.getByText("Rx P0, P1, P2, P3, P4, P5 · Tx none")).toBeInTheDocument();
  });

  it("keeps port chips keyboard-focusable and preserves advanced adapter IDs in the request", async () => {
    const props = renderWorkspace();
    const rxPortFive = screen.getByRole("checkbox", { name: "Rx port 5" });

    rxPortFive.focus();
    expect(rxPortFive).toHaveFocus();
    expect(rxPortFive).toHaveAttribute("type", "checkbox");
    rxPortFive.click();
    expect(rxPortFive).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Advanced IDs" }));
    fireEvent.change(screen.getByLabelText("Rx IDs"), { target: { value: "5,3,1,3" } });
    fireEvent.change(screen.getByLabelText("Tx IDs"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Recorder" }));

    await waitFor(() => expect(props.onStartCapture).toHaveBeenCalledWith({
      bpf_filter: "",
      limit: 1000,
      mode: "fixed",
      rx_ports: [5, 3, 1],
      snaplen: 0,
      tx_ports: []
    }));
    expect(screen.getByText("Rx P5, P3, P1 · Tx none")).toBeInTheDocument();
  });

  it.each([
    ["an unsafe integer", "9007199254740993"],
    ["numeric overflow", "9".repeat(400)]
  ])("rejects %s in Advanced IDs without sending a rounded or null port", async (_case, value) => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Advanced IDs" }));
    fireEvent.change(screen.getByLabelText("Rx IDs"), { target: { value } });
    fireEvent.change(screen.getByLabelText("Tx IDs"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Recorder" }));

    expect(screen.getByText("port IDs must be safe non-negative integers")).toBeInTheDocument();
    expect(props.onStartCapture).not.toHaveBeenCalled();
  });

  it("maps Ring Buffer strategy to a cyclic capture recorder request", async () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Ring Buffer" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Recorder" }));

    await waitFor(() => expect(props.onStartCapture).toHaveBeenCalledWith({
      bpf_filter: "",
      limit: 10000,
      mode: "cyclic",
      rx_ports: [0],
      snaplen: 0,
      tx_ports: [0]
    }));
    expect(screen.getByText("Ring Buffer: cyclic recorder / overwrite oldest")).toBeInTheDocument();
  });

  it("maps Header Sample strategy to bounded snaplen and fetch settings", async () => {
    vi.useFakeTimers();
    const props = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Header Sample" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Monitor" }));

    expect(props.onStartCapture).toHaveBeenCalledWith({
      bpf_filter: "",
      limit: 5000,
      mode: "fixed",
      rx_ports: [0],
      snaplen: 128,
      tx_ports: [0]
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(props.onFetchCapture).toHaveBeenCalledWith({
      capture_id: 9,
      pkt_count: 500,
      fetch_limit: 50,
      snaplen: 128
    });
  });

  it("uses Full PCAP strategy for stop-and-save recorder requests", async () => {
    const props = renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 0, bytes: 0, mode: "fixed", filter: { tx: 1, rx: 1, bpf: "" } }
        ]
      })
    });

    fireEvent.click(screen.getByRole("button", { name: "Full PCAP" }));
    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop capture 9" }));

    await waitFor(() => expect(props.onStopCapture).toHaveBeenCalledWith({
      capture_id: 9,
      file_name: "capture.pcap",
      pkt_count: 10000,
      save_pcap: true,
      snaplen: 0
    }));
  });

  it("shows recorder capacity diagnostics and fetches all recorders", async () => {
    const props = renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 850, bytes: 64000, limit: 1000, mode: "fixed", filter: { tx: 1, rx: 1, bpf: "" } },
          { id: 10, state: "ACTIVE", pkt_count: 1000, bytes: 128000, limit: 1000, mode: "cyclic", filter: { tx: 2, rx: 2, bpf: "udp" } }
        ]
      })
    });

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));

    expect(screen.getByText("850 / 1,000 (85%)")).toBeInTheDocument();
    expect(screen.getByText("Near limit")).toBeInTheDocument();
    expect(screen.getByText("1,000 / 1,000 (100%)")).toBeInTheDocument();
    expect(screen.getByText("Ring full; newest packets overwrite oldest")).toBeInTheDocument();
    expect(screen.getByText("2 active recorders / 1 cyclic / 1 full / 1 near limit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fetch All" }));

    await waitFor(() => expect(props.onFetchCapture).toHaveBeenCalledTimes(2));
    expect(props.onFetchCapture).toHaveBeenNthCalledWith(1, {
      capture_id: 9,
      fetch_limit: 50,
      pkt_count: 1000,
      snaplen: 0
    });
    expect(props.onFetchCapture).toHaveBeenNthCalledWith(2, {
      capture_id: 10,
      fetch_limit: 50,
      pkt_count: 1000,
      snaplen: 0
    });
    expect(screen.getByRole("tab", { name: "Monitor" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects capture recorders through a native keyboard-focusable radio group", () => {
    renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 10, bytes: 640, limit: 1000, mode: "fixed", filter: { tx: 1, rx: 1, bpf: "" } },
          { id: 10, state: "ACTIVE", count: 20, bytes: 1280, limit: 1000, mode: "fixed", filter: { tx: 2, rx: 2, bpf: "" } }
        ]
      })
    });

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    const recorderTable = screen.getByRole("table", { name: "Capture recorders" });
    const recorderNine = within(recorderTable).getByRole("radio", { name: "Select recorder 9" });
    const recorderTen = within(recorderTable).getByRole("radio", { name: "Select recorder 10" });

    expect(recorderNine).toBeChecked();
    recorderTen.focus();
    expect(recorderTen).toHaveFocus();
    fireEvent.click(recorderTen);

    expect(recorderTen).toBeChecked();
    expect(recorderTen.closest("tr")).toHaveClass("capture-row--selected");
    expect(recorderNine.closest("tr")).not.toHaveClass("capture-row--selected");
  });

  it("requires explicit confirmation before removing one recorder", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const props = renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 10, bytes: 640, limit: 1000, mode: "fixed", filter: { tx: 1, rx: 1, bpf: "" } }
        ]
      })
    });

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    const removeButton = screen.getByRole("button", { name: "Remove capture 9" });
    fireEvent.click(removeButton);

    expect(confirm).toHaveBeenCalledWith("Remove packet capture recorder 9?");
    expect(props.onRemoveCapture).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(removeButton);

    await waitFor(() => expect(props.onRemoveCapture).toHaveBeenCalledWith({ capture_id: 9 }));
  });

  it("stops all recorders with unique PCAP file names", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 10, bytes: 640, limit: 1000, mode: "fixed", filter: { tx: 1, rx: 1, bpf: "" } },
          { id: 10, state: "ACTIVE", count: 20, bytes: 1280, limit: 1000, mode: "fixed", filter: { tx: 2, rx: 2, bpf: "" } }
        ]
      })
    });

    fireEvent.click(screen.getByRole("button", { name: "Full PCAP" }));
    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop All" }));

    await waitFor(() => expect(props.onStopCapture).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalledWith("Stop all capture recorders and save PCAP files?");
    expect(props.onStopCapture).toHaveBeenNthCalledWith(1, {
      capture_id: 9,
      file_name: "capture-9.pcap",
      pkt_count: 10000,
      save_pcap: true,
      snaplen: 0
    });
    expect(props.onStopCapture).toHaveBeenNthCalledWith(2, {
      capture_id: 10,
      file_name: "capture-10.pcap",
      pkt_count: 10000,
      save_pcap: true,
      snaplen: 0
    });
    expect(screen.getByRole("tab", { name: "Monitor" })).toHaveAttribute("aria-selected", "true");
  });

  it("marks recorder parameters as Custom after manual edits", async () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "256" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Recorder" }));

    await waitFor(() => expect(props.onStartCapture).toHaveBeenCalledWith({
      bpf_filter: "",
      limit: 256,
      mode: "fixed",
      rx_ports: [0],
      snaplen: 0,
      tx_ports: [0]
    }));
    expect(screen.getByText("Custom: manual capture parameters")).toBeInTheDocument();
  });

  it("shows backend-normalized capture port usage in the tab strip", () => {
    renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 0, bytes: 0, mode: "fixed", filter: { tx: 1, rx: 2, bpf: "" } }
        ],
        port_usage: [
          { port: 0, rx_recorder_ids: [], tx_recorder_ids: [9] },
          { port: 1, rx_recorder_ids: [9], tx_recorder_ids: [] }
        ]
      })
    });

    expect(screen.getByText("Port 0 Tx #9; Port 1 Rx #9")).toBeInTheDocument();
  });

  it("shows capture service-mode coordination in the tab strip", () => {
    renderWorkspace({
      captureStatusResult: ok<TrexCaptureStatus>({
        captures: [
          { id: 9, state: "ACTIVE", count: 0, bytes: 0, mode: "fixed", filter: { tx: 1, rx: 1, bpf: "" } }
        ],
        service_mode: {
          enabled_ports: [0],
          already_enabled_ports: [],
          restored_ports: [],
          managed_capture_ids: [9]
        }
      })
    });

    expect(screen.getByText("Service mode enabled on port 0")).toBeInTheDocument();
  });

  it("appends service-mode coordination to capture command results", () => {
    renderWorkspace({
      captureResult: ok<TrexCaptureStartResult>({
        accepted: true,
        bpf_filter: "",
        captures: [{ id: 9, state: "ACTIVE", count: 0, bytes: 0, mode: "fixed", filter: { rx: 1, tx: 1, bpf: "" } }],
        id: 9,
        limit: 1000,
        mode: "fixed",
        rx_ports: [0],
        service_mode: {
          enabled_ports: [0],
          already_enabled_ports: [],
          restored_ports: [],
          managed_capture_ids: [9]
        },
        snaplen: 0,
        start_ts: 1,
        tx_ports: [0]
      })
    });

    expect(screen.getByText("Capture recorder 9 started; Service mode enabled on port 0")).toBeInTheDocument();
  });

  it("renders backend decoded packet layers in the packet viewer", () => {
    renderWorkspace({
      capturePackets: [
        {
          binary_base64: "",
          decoded_layers: [
            {
              name: "Ethernet",
              fields: [
                { name: "Destination", value: "00:11:22:33:44:55" },
                { name: "Source", value: "66:77:88:99:aa:bb" }
              ]
            },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "10.0.0.1" },
                { name: "Destination", value: "10.0.0.2" }
              ]
            },
            {
              name: "UDP",
              fields: [
                { name: "Source Port", value: "1234" },
                { name: "Destination Port", value: "53" }
              ]
            }
          ],
          destination: "10.0.0.2",
          hex_preview: "00112233445566778899aabb0800",
          index: 1,
          info: "10.0.0.1:1234 -> 10.0.0.2:53",
          length: 42,
          mode: "RX",
          port: 0,
          source: "10.0.0.1",
          time: 1,
          type: "IPv4/UDP",
          wirelen: 64
        }
      ]
    });

    expect(screen.getAllByText("Ethernet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IPv4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("UDP").length).toBeGreaterThan(0);
    expect(screen.getByText("Destination Port")).toBeInTheDocument();
    expect(screen.getByText("53")).toBeInTheDocument();
  });

  it("summarizes decoded capture protocols conversations and signals", () => {
    renderWorkspace({
      capturePackets: [
        {
          binary_base64: "",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "10.0.0.1" },
                { name: "Destination", value: "10.0.0.2" }
              ]
            },
            {
              name: "UDP",
              fields: [
                { name: "Source Port", value: "1234" },
                { name: "Destination Port", value: "53" }
              ]
            },
            {
              name: "DNS",
              fields: [{ name: "Query Name", value: "example.com" }]
            }
          ],
          destination: "10.0.0.2",
          hex_preview: "00112233445566778899aabb0800",
          index: 1,
          info: "10.0.0.1:1234 -> 10.0.0.2:53",
          length: 42,
          mode: "RX",
          port: 0,
          source: "10.0.0.1",
          time: 1,
          type: "IPv4/UDP",
          wirelen: 64
        },
        {
          binary_base64: "",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "10.0.0.2" },
                { name: "Destination", value: "10.0.0.1" }
              ]
            },
            {
              name: "TCP",
              fields: [
                { name: "Source Port", value: "443" },
                { name: "Destination Port", value: "1234" },
                { name: "Flags", value: "RST, ACK" }
              ]
            }
          ],
          destination: "10.0.0.1",
          hex_preview: "00112233445566778899aabb0800",
          index: 2,
          info: "10.0.0.2:443 -> 10.0.0.1:1234",
          length: 64,
          mode: "RX",
          port: 1,
          source: "10.0.0.2",
          time: 2,
          type: "IPv4/TCP",
          wirelen: 64
        }
      ]
    });

    const protocolMix = within(screen.getByRole("table", { name: "Capture protocol mix" }));
    expect(protocolMix.getByRole("cell", { name: "Ethernet / IPv4 / UDP / DNS" })).toBeInTheDocument();
    expect(protocolMix.getByRole("cell", { name: "Ethernet / IPv4 / TCP" })).toBeInTheDocument();

    const conversations = within(screen.getByRole("table", { name: "Capture conversations" }));
    expect(conversations.getByRole("cell", { name: "10.0.0.1:1234 -> 10.0.0.2:53 (DNS)" })).toBeInTheDocument();
    expect(conversations.getByRole("cell", { name: "10.0.0.2:443 -> 10.0.0.1:1234 (TCP)" })).toBeInTheDocument();

    const signals = within(screen.getByRole("table", { name: "Capture decode signals" }));
    expect(signals.getByRole("cell", { name: "Service discovery" })).toBeInTheDocument();
    expect(signals.getByRole("cell", { name: "Snaplen truncation" })).toBeInTheDocument();
    expect(signals.getByRole("cell", { name: "TCP reset" })).toBeInTheDocument();
  });
});
