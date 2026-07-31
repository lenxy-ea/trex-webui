import {
  App,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openProfilesForBuilder,
  overview,
  profileCatalog,
  render,
  returnAdvancedStreamToStructured,
  screen,
  stubFetch,
  switchPacketPreviewToFieldEngine,
  vi,
  waitFor
} from "./test/appTestHarness";

describe("Traffic Profiles / Tunnels / Template Offsets", () => {
  installAppTestHooks();

  it("adjusts tunnel advanced VM template offsets for outer VLAN streams", async () => {
    const previewResponse = {
      ok: true,
      data: {
        content: "---\n[]\n",
        streams: [],
        packet_previews: [
          {
            index: 1,
            name: "stream-1",
            packet_type: "Ethernet/IPv4/UDP",
            frame_length: 128,
            wire_length: 128,
            binary_base64: "AAAA",
            hex: "000000",
            hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
            layers: []
          }
        ]
      },
      blocker: null,
      error: null
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview" || url === "/api/trex/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/profiles/workbench/render") {
        return { ok: true, json: async () => previewResponse };
      }
      return { ok: true, json: async () => ({ ok: true, data: null, blocker: null, error: null }) };
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("Tagged"));
    fireEvent.click(screen.getByLabelText("VXLAN"));
    await waitFor(() => expect(screen.getByLabelText("VXLAN")).toBeChecked());
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "vxlan-inner-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("vxlan-inner-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const vxlanInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 83');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 87');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 88');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 90');
    expect(vxlanInnerVmJson).toContain('"l2_len": 68');

    await returnAdvancedStreamToStructured();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("GTP-U"));
    await waitFor(() => expect(screen.getByLabelText("GTP-U")).toBeChecked());
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gtpu-inner-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("gtpu-inner-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const gtpuInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 69');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 73');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 74');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 76');
    expect(gtpuInnerVmJson).toContain('"l2_len": 54');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gtpu-teid-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("gtpu-teid-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const gtpuTeidVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(gtpuTeidVmJson).toContain('"pkt_offset": 50');
    expect(gtpuTeidVmJson).toContain('"l2_len": 18');
    expect(gtpuTeidVmJson).toContain('"l4_type": 17');

  }, 20_000);

  it("adjusts tunnel advanced VM template offsets for MPLS stacks", async () => {
    const previewResponse = {
      ok: true,
      data: {
        content: "---\n[]\n",
        streams: [],
        packet_previews: [
          {
            index: 1,
            name: "stream-1",
            packet_type: "Ethernet/IPv4/UDP",
            frame_length: 140,
            wire_length: 140,
            binary_base64: "AAAA",
            hex: "000000",
            hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
            layers: []
          }
        ]
      },
      blocker: null,
      error: null
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview" || url === "/api/trex/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/profiles/workbench/render") {
        return { ok: true, json: async () => previewResponse };
      }
      return { ok: true, json: async () => ({ ok: true, data: null, blocker: null, error: null }) };
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("MPLS"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Second MPLS label enabled"));
    fireEvent.click(screen.getByLabelText("Third MPLS label enabled"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("VXLAN"));
    await waitFor(() => expect(screen.getByLabelText("VXLAN")).toBeChecked());
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "vxlan-inner-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("vxlan-inner-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const vxlanInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 91');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 95');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 96');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 98');
    expect(vxlanInnerVmJson).toContain('"l2_len": 76');

    await returnAdvancedStreamToStructured();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("GTP-U"));
    await waitFor(() => expect(screen.getByLabelText("GTP-U")).toBeChecked());
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gtpu-inner-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("gtpu-inner-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const gtpuInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 77');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 81');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 82');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 84');
    expect(gtpuInnerVmJson).toContain('"l2_len": 62');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gtpu-teid-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("gtpu-teid-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const gtpuTeidVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(gtpuTeidVmJson).toContain('"pkt_offset": 58');
    expect(gtpuTeidVmJson).toContain('"l2_len": 26');
    expect(gtpuTeidVmJson).toContain('"l4_type": 17');

  }, 30_000);
});
