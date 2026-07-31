import { act } from "@testing-library/react";

import {
  App,
  captureFetchResponse,
  captureFilesResponse,
  captureStartResponse,
  captureStatusResponse,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openCapture,
  overview,
  profileCatalog,
  render,
  screen,
  statsResponse,
  stubFetch,
  vi,
  waitFor
} from "./test/appTestHarness";

function deferredJsonResponse<T>() {
  type MockResponse = { json: () => Promise<T>; ok: boolean };
  let resolveResponse!: (response: MockResponse) => void;
  const promise = new Promise<MockResponse>((resolve) => {
    resolveResponse = resolve;
  });
  return {
    promise,
    resolve(data: T) {
      resolveResponse({ ok: true, json: async () => data });
    }
  };
}

describe("Packet Capture", () => {
  installAppTestHooks();

  it("opens the original Packet Capture workflow and starts a monitor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStartResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));
    expect(screen.getByRole("dialog", { name: "Packet Capture" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Monitor" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Recorders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Monitor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Recorder" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start Monitor" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/trex/capture/start",
        expect.objectContaining({
          body: JSON.stringify({
            tx_ports: [0],
            rx_ports: [0],
            limit: 1000,
            mode: "fixed",
            bpf_filter: "",
            snaplen: 0
          }),
          method: "POST"
        })
      )
    );
    expect(screen.getAllByText(/Service mode enabled on port 0/).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Monitor" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows capture files as soon as they arrive while recorder status is still pending", async () => {
    let resolveStatus!: (response: {
      json: () => Promise<typeof captureStatusResponse>;
      ok: boolean;
    }) => void;
    const pendingStatus = new Promise<{
      json: () => Promise<typeof captureStatusResponse>;
      ok: boolean;
    }>((resolve) => {
      resolveStatus = resolve;
    });
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/system/overview") {
        return Promise.resolve({ ok: true, json: async () => overview });
      }
      if (url === "/api/trex/profiles") {
        return Promise.resolve({ ok: true, json: async () => profileCatalog });
      }
      if (url === "/api/trex/capture/status") {
        return pendingStatus;
      }
      if (url === "/api/trex/capture/files") {
        return Promise.resolve({ ok: true, json: async () => captureFilesResponse });
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/files"));

    expect(screen.getByText("Loading capture recorders…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    expect(await screen.findByRole("button", { name: "Download capture file capture.pcap" })).toBeEnabled();
    expect(screen.queryByText("No saved capture files")).not.toBeInTheDocument();

    resolveStatus({ ok: true, json: async () => captureStatusResponse });
  });

  it("keeps capture state and loading owned by the latest dialog request generation", async () => {
    const staleStatus = deferredJsonResponse<typeof captureStatusResponse>();
    const latestStatus = deferredJsonResponse<typeof captureStatusResponse>();
    const staleFiles = deferredJsonResponse<typeof captureFilesResponse>();
    const latestFiles = deferredJsonResponse<typeof captureFilesResponse>();
    const latestStatusResponse = {
      ...captureStatusResponse,
      data: {
        ...captureStatusResponse.data,
        captures: captureStatusResponse.data.captures.map((capture) => ({ ...capture, id: 42 })),
        port_usage: [{ port: 0, rx_recorder_ids: [42], tx_recorder_ids: [42] }],
        service_mode: {
          ...captureStatusResponse.data.service_mode,
          managed_capture_ids: [42]
        }
      }
    };
    const latestFilesResponse = {
      ...captureFilesResponse,
      data: {
        ...captureFilesResponse.data,
        files: captureFilesResponse.data.files.map((file) => ({
          ...file,
          name: "latest.pcap",
          path: "/var/log/trex/captures/latest.pcap"
        }))
      }
    };
    let statusRequestCount = 0;
    let filesRequestCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/system/overview") {
        return Promise.resolve({ ok: true, json: async () => overview });
      }
      if (url === "/api/trex/profiles") {
        return Promise.resolve({ ok: true, json: async () => profileCatalog });
      }
      if (url === "/api/trex/capture/status") {
        statusRequestCount += 1;
        return statusRequestCount === 1 ? staleStatus.promise : latestStatus.promise;
      }
      if (url === "/api/trex/capture/files") {
        filesRequestCount += 1;
        return filesRequestCount === 1 ? staleFiles.promise : latestFiles.promise;
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => {
      expect(statusRequestCount).toBe(1);
      expect(filesRequestCount).toBe(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Close Packet Capture" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Packet Capture" })).not.toBeInTheDocument()
    );
    await openCapture();
    await waitFor(() => {
      expect(statusRequestCount).toBe(2);
      expect(filesRequestCount).toBe(2);
    });

    await act(async () => {
      staleFiles.resolve(captureFilesResponse);
      await staleFiles.promise;
    });
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    expect((await screen.findAllByText("Loading capture files…")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Download capture file capture.pcap" })).not.toBeInTheDocument();

    await act(async () => {
      latestStatus.resolve(latestStatusResponse);
      await latestStatus.promise;
    });
    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    expect(await screen.findByRole("button", { name: "Fetch packets for capture 42" })).toBeEnabled();

    await act(async () => {
      staleStatus.resolve(captureStatusResponse);
      await staleStatus.promise;
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Fetch packets for capture 42" })).toBeEnabled()
    );
    expect(screen.queryByRole("button", { name: "Fetch packets for capture 3" })).not.toBeInTheDocument();

    await act(async () => {
      latestFiles.resolve(latestFilesResponse);
      await latestFiles.promise;
    });
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    expect(await screen.findByRole("button", { name: "Download capture file latest.pcap" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Download capture file capture.pcap" })).not.toBeInTheDocument();
  });

  it.each(["Start selected port", "Start all ports"])(
    "clears monitor evidence after a successful %s command",
    async (startButtonName) => {
      const fetchMock = vi.fn((url: string) => {
        if (url === "/api/system/overview") {
          return Promise.resolve({ ok: true, json: async () => overview });
        }
        if (url === "/api/trex/profiles") {
          return Promise.resolve({ ok: true, json: async () => profileCatalog });
        }
        if (url === "/api/trex/capture/status") {
          return Promise.resolve({ ok: true, json: async () => captureStatusResponse });
        }
        if (url === "/api/trex/capture/files") {
          return Promise.resolve({ ok: true, json: async () => captureFilesResponse });
        }
        if (url === "/api/trex/capture/fetch") {
          return Promise.resolve({ ok: true, json: async () => captureFetchResponse });
        }
        if (url === "/api/trex/traffic/start") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
              blocker: null,
              error: null
            })
          });
        }
        if (url === "/api/trex/stats") {
          return Promise.resolve({ ok: true, json: async () => statsResponse });
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });
      stubFetch(fetchMock);

      render(<App />);
      await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
      await openCapture();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));
      fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
      fireEvent.click(screen.getByRole("button", { name: "Fetch packets for capture 3" }));
      expect(await screen.findByText("10.10.10.1:12345 -> 10.10.10.2:443")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clear Monitor Table" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Close Packet Capture" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Packet Capture" })).not.toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: startButtonName }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/traffic/start", expect.any(Object)));

      await openCapture();
      expect(screen.getByRole("button", { name: "Clear Monitor Table" })).toBeDisabled();
      expect(screen.queryByText("10.10.10.1:12345 -> 10.10.10.2:443")).not.toBeInTheDocument();
    }
  );

  it("applies Packet Capture trigger presets as BPF filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStartResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));

    fireEvent.change(screen.getByLabelText("Trigger preset"), { target: { value: "gtpu" } });
    expect(screen.getByLabelText("Filter BPF")).toHaveValue("udp port 2152");
    expect(screen.getAllByText(/GTP-U: GTP-U UDP\/2152/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Start Monitor" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/trex/capture/start",
        expect.objectContaining({
          body: JSON.stringify({
            tx_ports: [0],
            rx_ports: [0],
            limit: 1000,
            mode: "fixed",
            bpf_filter: "udp port 2152",
            snaplen: 0
          }),
          method: "POST"
        })
      )
    );

    fireEvent.change(screen.getByLabelText("Filter BPF"), { target: { value: "udp port 9999" } });
    expect(screen.getByLabelText("Trigger preset")).toHaveValue("custom");
    expect(screen.getAllByText(/Custom: manual BPF filter/).length).toBeGreaterThan(0);
  });

  it("validates Packet Capture inputs before sending hardware commands", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));
    expect(screen.getByRole("button", { name: "Clear Monitor Table" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Recorder" }));
    expect(await screen.findByText("Limit must be an integer between 1 and 10000")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/capture/start")).toBe(false);

    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Packets"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch packets for capture 3" }));
    expect(await screen.findByText("Packets must be an integer between 1 and 10000")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/capture/fetch")).toBe(false);
  });

  it("renders the captured packet viewer from backend packet bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFetchResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.click(screen.getByRole("button", { name: "Fetch packets for capture 3" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/capture/fetch",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            capture_id: 3,
            pkt_count: 1000,
            fetch_limit: 50,
            snaplen: 0
          })
        })
      )
    );
    expect(screen.getByRole("tab", { name: "Monitor" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Packet viewer" })).toBeInTheDocument();
    expect(screen.getByText("10.10.10.1:12345 -> 10.10.10.2:443")).toBeInTheDocument();
    expect(screen.getByText("66 55 44 33 22 11 10 20 30 40 50 60 08 00 45 00")).toBeInTheDocument();
    expect(screen.getByText("fUD3\".. 0@P`..E.")).toBeInTheDocument();
    expect(screen.queryByText("ZlVEMyIREA==")).not.toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();
  });

  it("removes a single packet capture recorder from the Recorders table", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, removed_ids: [3], captures: [] },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));

    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove capture 3" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/capture/remove",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ capture_id: 3 })
        })
      )
    );
    await waitFor(() => expect(screen.getAllByText("No active recorders").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Capture remove accepted 1 recorders").length).toBeGreaterThan(0);
  });

  it("does not remove all packet capture recorders when confirmation is canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));
    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole("button", { name: "Remove All" }));

    expect(window.confirm).toHaveBeenCalledWith("Remove all 1 packet capture recorders?");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("downloads the saved PCAP when stopping a packet capture", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:capture-pcap")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            id: 3,
            packets: [],
            packet_count: 0,
            saved_file: {
              path: "/var/log/trex/captures/capture.pcap",
              name: "capture.pcap",
              size_bytes: 24,
              download_available: true,
              content_base64: "1MOyoQ==",
              download_error: null
            },
            captures: []
          },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));

    fireEvent.click(screen.getByRole("button", { name: "Stop Monitor" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/capture/stop",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            capture_id: 3,
            pkt_count: 1000,
            save_pcap: true,
            file_name: "capture.pcap",
            snaplen: 0
          })
        })
      )
    );
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
    expect(await screen.findByText("Capture saved capture.pcap")).toBeInTheDocument();
    expect(screen.getByText("Capture saved capture.pcap (24 bytes)")).toBeInTheDocument();
    expect(screen.queryByText(/content_base64/)).not.toBeInTheDocument();
  });

  it("reconciles packets and recorder state from a structured stop failure", async () => {
    const packet = captureFetchResponse.data.packets[0];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          data: {
            accepted: false,
            id: 3,
            packets: [packet],
            packet_count: 1,
            saved_file: null,
            fetch_budget: {
              requested_packet_count: 1000,
              target_packet_count: 1,
              max_packet_count: 10000,
              max_bytes: 16000000,
              fetched_bytes: 64,
              effective_snaplen: 2048,
              truncated_by_byte_budget: false,
              available_packet_count: 1,
              omitted_packet_count: 0
            },
            capture_stopped: true,
            capture_removed: true,
            available_packet_count: 1,
            primary_error: { stage: "pcap_write", error: "disk full" },
            cleanup_errors: [],
            captures: [],
            port_usage: [],
            service_mode: {
              enabled_ports: [],
              already_enabled_ports: [],
              restored_ports: [0],
              managed_capture_ids: []
            }
          },
          blocker: "trex_command_failed",
          error: "pcap_write: disk full"
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));
    fireEvent.click(screen.getByRole("button", { name: "Stop Monitor" }));

    expect(await screen.findByText("10.10.10.1:12345 -> 10.10.10.2:443")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Monitor" })).toBeInTheDocument();
    expect(screen.getAllByText(/pcap_write: disk full/).length).toBeGreaterThan(0);
  });

  it("downloads a saved Packet Capture file from the Files tab", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:capture-file")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            file: {
              ...captureFilesResponse.data.files[0],
              content_base64: "1MOyoQ=="
            }
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/files"));
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    expect(screen.getByText("/var/log/trex/captures")).toBeInTheDocument();
    expect(screen.getByText("capture.pcap")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download capture file capture.pcap" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/capture/files/download",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ file_name: "capture.pcap" })
        })
      )
    );
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
    expect(screen.getAllByText("Capture file downloaded capture.pcap").length).toBeGreaterThan(0);
    expect(screen.queryByText(/content_base64/)).not.toBeInTheDocument();
  });

  it("opens a saved Packet Capture file through the configured analyzer route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            file: {
              ...captureFilesResponse.data.files[0],
              content_base64: null
            },
            command: ["wireshark", "-r", "/var/log/trex/captures/capture.pcap"],
            pid: 4321
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/files"));
    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    fireEvent.click(screen.getByRole("button", { name: "Open capture file capture.pcap" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/capture/files/open",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ file_name: "capture.pcap" })
        })
      )
    );
    expect(screen.getAllByText("Capture file opened capture.pcap").length).toBeGreaterThan(0);
    expect(screen.queryByText(/content_base64/)).not.toBeInTheDocument();
  });
});
