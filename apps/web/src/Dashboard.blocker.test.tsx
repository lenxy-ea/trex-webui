import {
  App,
  describe,
  expect,
  installAppTestHooks,
  it,
  openDashboard,
  overview,
  profileCatalog,
  render,
  screen,
  stubFetch,
  vi,
  waitFor,
  within
} from "./test/appTestHarness";

describe("Dashboard / Blockers", () => {
  installAppTestHooks();

  it("renders backend stats blocker without sample data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          data: null,
          blocker: "trex_connect_failed",
          error: "failed to connect"
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();

    await waitFor(() => expect(screen.getAllByText(/trex_connect_failed/).length).toBeGreaterThan(0));
    expect(within(screen.getByLabelText("Run health")).getByText("Blocked")).toBeInTheDocument();
    expect(screen.getAllByText(/failed to connect/).length).toBeGreaterThan(0);
  });
});
