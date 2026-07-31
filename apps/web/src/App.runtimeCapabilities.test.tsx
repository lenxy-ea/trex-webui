import {
  App,
  captureFilesResponse,
  captureStatusResponse,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openCapture,
  openProfiles,
  overview,
  overviewWithTrexDisconnected,
  profileCatalog,
  render,
  screen,
  stubFetch,
  vi,
  waitFor
} from "./test/appTestHarness";
import { runtimeControlDisabledReason } from "./components/workbench/runtimeCapability";

const disconnectedReason = "Connect to TRex RPC to use runtime controls.";
const noPortsReason = "No TRex ports are available.";

function runtimeFetchMock(overviewValue: typeof overview | typeof overviewWithTrexDisconnected) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url === "/api/system/overview" || url === "/api/trex/overview") {
      return { ok: true, json: async () => overviewValue };
    }
    if (url === "/api/trex/profiles") {
      return { ok: true, json: async () => profileCatalog };
    }
    if (url === "/api/trex/capture/status") {
      return { ok: true, json: async () => captureStatusResponse };
    }
    if (url === "/api/trex/capture/files") {
      return { ok: true, json: async () => captureFilesResponse };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("App runtime capability gating", () => {
  installAppTestHooks();

  it("uses overview probe and port inventory as the only runtime authority", () => {
    expect(runtimeControlDisabledReason(null)).toBe(disconnectedReason);
    expect(runtimeControlDisabledReason(overviewWithTrexDisconnected)).toBe(disconnectedReason);
    expect(runtimeControlDisabledReason({
      trex_probe: overview.trex_probe,
      trex_ports: {
        data: null,
        ok: false
      }
    })).toBe("TRex port inventory is unavailable.");
    expect(runtimeControlDisabledReason({
      trex_probe: overview.trex_probe,
      trex_ports: {
        data: {
          ports: []
        },
        ok: true
      }
    })).toBe(noPortsReason);
    expect(runtimeControlDisabledReason(overview)).toBeNull();
  });

  it("blocks main, profile, and capture runtime commands while TRex is disconnected", async () => {
    const fetchMock = runtimeFetchMock(overviewWithTrexDisconnected);
    stubFetch(fetchMock);
    render(<App />);

    await screen.findByText("rpc down");
    for (const name of [
      "Start selected port",
      "Start all ports",
      "Stop selected port",
      "Stop all ports",
      "Pause selected port",
      "Resume selected port",
      "Clear all stats",
      "Update Rate",
      "Acquire selected port",
      "Release selected port"
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", disconnectedReason);
    }

    await openProfiles();
    for (const name of ["Start Transit", "Start All"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", disconnectedReason);
      fireEvent.click(button);
    }

    await openCapture();
    for (const name of ["Start Monitor", "Stop Monitor", "Add Recorder", "Apply"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", disconnectedReason);
      fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    for (const name of [
      "Fetch packets for capture 3",
      "Stop capture 3",
      "Remove capture 3",
      "Fetch All",
      "Stop All",
      "Remove All"
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", disconnectedReason);
      fireEvent.click(button);
    }

    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/traffic/start")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/capture/start")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/capture/fetch")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/capture/stop")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/capture/remove")).toBe(false);
  });

  it("keeps runtime commands disabled when the connected server exposes no ports", async () => {
    const overviewWithoutPorts = {
      ...overview,
      trex_ports: {
        ...overview.trex_ports,
        data: {
          ...overview.trex_ports.data,
          acquired_ports: [],
          port_ids: [],
          ports: []
        }
      }
    };
    const fetchMock = runtimeFetchMock(overviewWithoutPorts);
    stubFetch(fetchMock);
    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    const startSelected = screen.getByRole("button", { name: "Start selected port" });
    expect(startSelected).toBeDisabled();
    expect(startSelected).toHaveAttribute("title", noPortsReason);

    await openProfiles();
    const startAll = screen.getByRole("button", { name: "Start All" });
    expect(startAll).toBeDisabled();
    expect(startAll).toHaveAttribute("title", noPortsReason);
  });
});
