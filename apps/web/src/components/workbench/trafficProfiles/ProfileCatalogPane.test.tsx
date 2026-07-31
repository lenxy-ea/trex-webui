import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProfileRecord } from "../../../api";
import { FloatingWindow } from "../FloatingWindow";
import { ProfileCatalogPane } from "./ProfileCatalogPane";

function profile(
  relativePath: string,
  {
    kind = "yaml",
    root = "/opt/trex-core/scripts/stl"
  }: { kind?: string; root?: string } = {}
): ProfileRecord {
  const pathSegments = relativePath.split("/");
  const name = pathSegments[pathSegments.length - 1] ?? relativePath;
  const nameSegments = name.split(".");
  return {
    kind,
    modified_time: "2026-07-30T09:00:00Z",
    name,
    path: `${root}/${relativePath}`,
    previewable: true,
    relative_path: relativePath,
    root,
    size_bytes: 64,
    suffix: `.${nameSegments[nameSegments.length - 1] ?? ""}`,
    tunables: []
  };
}

const localRoot = "/opt/trex-webui/profiles";
const profiles = [
  profile("udp_1pkt_simple.py", { kind: "python" }),
  profile("bench/http_latency.yaml"),
  profile("captures/dns.pcap", { kind: "pcap", root: localRoot }),
  profile("draft.json", { kind: "json", root: localRoot })
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfileCatalogPane", () => {
  it("searches and facets a large catalog without losing result context", () => {
    render(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={vi.fn()}
        profilePath="udp_1pkt_simple.py"
        profiles={profiles}
        selectedProfile={profiles[0]}
      />
    );

    const catalog = screen.getByRole("region", { name: "Profile catalog" });
    expect(within(catalog).getByText("4 profiles")).toBeInTheDocument();

    fireEvent.change(within(catalog).getByRole("searchbox", { name: "Search profiles" }), {
      target: { value: "HTTP latency" }
    });
    expect(within(catalog).getByRole("option", { name: "bench/http_latency.yaml" })).toBeInTheDocument();
    expect(within(catalog).queryByRole("option", { name: "udp_1pkt_simple.py" })).not.toBeInTheDocument();
    expect(within(catalog).getByText("1 of 4 profiles")).toBeInTheDocument();

    fireEvent.click(within(catalog).getByRole("button", { name: "Clear profile filters" }));
    fireEvent.change(within(catalog).getByLabelText("Filter profiles by kind"), {
      target: { value: "pcap" }
    });
    fireEvent.change(within(catalog).getByLabelText("Filter profiles by source"), {
      target: { value: localRoot }
    });

    expect(within(catalog).getByRole("option", { name: "captures/dns.pcap" })).toBeInTheDocument();
    expect(within(catalog).queryByRole("option", { name: "draft.json" })).not.toBeInTheDocument();
    expect(within(catalog).getByText("1 of 4 profiles")).toBeInTheDocument();
  });

  it("shows a useful no-match state and restores the full catalog", () => {
    render(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={vi.fn()}
        profilePath=""
        profiles={profiles}
        selectedProfile={null}
      />
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search profiles" }), {
      target: { value: "not-a-real-profile" }
    });
    expect(screen.getByText("No profiles match these filters.")).toBeInTheDocument();
    expect(screen.getByText("0 of 4 profiles")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search profiles" }), {
      key: "Escape"
    });
    expect(screen.getByText("4 profiles")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Profiles" })).getAllByRole("option"))
      .toHaveLength(4);
  });

  it("clears an active search on Escape without closing its floating window", () => {
    const onClose = vi.fn();
    render(
      <FloatingWindow onClose={onClose} title="Traffic Profiles">
        <ProfileCatalogPane
          emptyMessage="No profiles loaded"
          isLoading={false}
          onSelectProfile={vi.fn()}
          profilePath=""
          profiles={profiles}
          selectedProfile={null}
        />
      </FloatingWindow>
    );
    const search = screen.getByRole("searchbox", { name: "Search profiles" });

    fireEvent.change(search, { target: { value: "missing" } });
    fireEvent.keyDown(search, { key: "Escape" });

    expect(search).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Traffic Profiles" })).toBeInTheDocument();
  });

  it("clears kind and source filters when refreshed facets disappear", () => {
    const onSelectProfile = vi.fn();
    const { rerender } = render(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={onSelectProfile}
        profilePath=""
        profiles={profiles}
        selectedProfile={null}
      />
    );
    const kindFilter = screen.getByLabelText("Filter profiles by kind");
    const sourceFilter = screen.getByLabelText("Filter profiles by source");
    fireEvent.change(kindFilter, { target: { value: "pcap" } });
    fireEvent.change(sourceFilter, { target: { value: localRoot } });

    const refreshedProfiles = profiles.slice(0, 2);
    rerender(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={onSelectProfile}
        profilePath=""
        profiles={refreshedProfiles}
        selectedProfile={null}
      />
    );

    expect(kindFilter).toHaveValue("");
    expect(sourceFilter).toHaveValue("");
    expect(screen.getByText("2 profiles")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Profiles" })).getAllByRole("option"))
      .toHaveLength(2);

    rerender(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={onSelectProfile}
        profilePath=""
        profiles={profiles}
        selectedProfile={null}
      />
    );
    expect(kindFilter).toHaveValue("");
    expect(sourceFilter).toHaveValue("");
    expect(screen.getByText("4 profiles")).toBeInTheDocument();
  });

  it("keeps the selected row reachable after catalog load and profile switches", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const onSelectProfile = vi.fn();
    const { rerender } = render(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading
        onSelectProfile={onSelectProfile}
        profilePath="captures/dns.pcap"
        profiles={[]}
        selectedProfile={null}
      />
    );

    expect(screen.getByText("Loading profiles…")).toBeInTheDocument();

    rerender(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={onSelectProfile}
        profilePath="captures/dns.pcap"
        profiles={profiles}
        selectedProfile={profiles[2]}
      />
    );

    const selectedPcap = screen.getByRole("option", { name: "captures/dns.pcap" });
    await waitFor(() => {
      expect(selectedPcap).toHaveAttribute("aria-selected", "true");
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    });

    fireEvent.click(screen.getByRole("option", { name: "draft.json" }));
    expect(onSelectProfile).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "draft.json" })
    );

    rerender(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={onSelectProfile}
        profilePath="draft.json"
        profiles={profiles}
        selectedProfile={profiles[3]}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "draft.json" }))
        .toHaveAttribute("aria-selected", "true")
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("supports arrow, Home, and End navigation inside the profile list", () => {
    render(
      <ProfileCatalogPane
        emptyMessage="No profiles loaded"
        isLoading={false}
        onSelectProfile={vi.fn()}
        profilePath="udp_1pkt_simple.py"
        profiles={profiles}
        selectedProfile={profiles[0]}
      />
    );

    const first = screen.getByRole("option", { name: "udp_1pkt_simple.py" });
    const last = screen.getByRole("option", { name: "captures/dns.pcap" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "draft.json" })).toHaveFocus();
  });
});
