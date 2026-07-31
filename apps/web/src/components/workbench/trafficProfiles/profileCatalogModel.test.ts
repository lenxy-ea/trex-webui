import { describe, expect, it } from "vitest";

import type { ProfileRecord } from "../../../api";
import {
  profileBrowserActionHandlers,
  profileBrowserEmptyMessage,
  profileBrowserViewModel,
  profileCatalogFilterViewModel,
  profileDirectoryGroups,
  profileFileName,
  runProfileBrowserSelection
} from "./profileCatalogModel";

function profile(relativePath: string, root = "/opt/trex-core/scripts/stl"): ProfileRecord {
  return {
    kind: "yaml",
    modified_time: "2026-06-20T10:15:00Z",
    name: profileFileName(relativePath),
    path: `${root}/${relativePath}`,
    previewable: true,
    relative_path: relativePath,
    root,
    size_bytes: 64,
    suffix: ".yaml",
    tunables: []
  };
}

describe("profileCatalogModel", () => {
  it("groups root profiles before directory profiles", () => {
    expect(profileDirectoryGroups([
      profile("hlt/hlt_4vlans.py"),
      profile("profile.yaml"),
      profile("bench.py")
    ])).toEqual([
      {
        directory: "",
        label: "",
        profiles: [profile("profile.yaml"), profile("bench.py")]
      },
      {
        directory: "hlt",
        label: "hlt",
        profiles: [profile("hlt/hlt_4vlans.py")]
      }
    ]);
  });

  it("builds profile browser rows with stable labels and selected state", () => {
    const view = profileBrowserViewModel({
      emptyMessage: "No profiles loaded",
      isLoading: false,
      profilePath: "profile.yaml",
      profiles: [
        profile("profile.yaml"),
        profile("hlt/hlt_4vlans.py"),
        profile("hlt/hlt_david1.py")
      ],
      selectedProfile: profile("hlt/hlt_david1.py")
    });

    expect(view.emptyMessage).toBeNull();
    expect(view).toMatchObject({
      ariaLabel: "Profiles",
      className: "profile-list",
      emptyClassName: "profile-list-empty",
      role: "listbox"
    });
    expect(view.groups.map((group) => ({
      ariaLabel: group.ariaLabel,
      className: group.className,
      heading: group.heading,
      key: group.key,
      labels: group.profiles.map((row) => row.label),
      role: group.role,
      rowClasses: group.profiles.map((row) => row.className),
      rowIconSizes: group.profiles.map((row) => row.iconSize),
      rowRoles: group.profiles.map((row) => row.role),
      selected: group.profiles.map((row) => row.selected)
    }))).toEqual([
      {
        ariaLabel: undefined,
        className: "profile-list-group",
        heading: null,
        key: "__root",
        labels: ["profile.yaml"],
        role: "presentation",
        rowClasses: ["profile-list-row"],
        rowIconSizes: [14],
        rowRoles: ["option"],
        selected: [false]
      },
      {
        ariaLabel: "hlt",
        className: "profile-list-group",
        heading: {
          className: "profile-list-group-heading",
          iconSize: 13,
          label: "hlt"
        },
        key: "hlt",
        labels: ["hlt_4vlans.py", "hlt_david1.py"],
        role: "group",
        rowClasses: ["profile-list-row", "profile-list-row profile-list-row--selected"],
        rowIconSizes: [14, 14],
        rowRoles: ["option", "option"],
        selected: [false, true]
      }
    ]);
  });

  it("falls back to the typed profile path and owns empty-state text", () => {
    expect(profileBrowserViewModel({
      emptyMessage: "No profiles loaded",
      isLoading: true,
      profilePath: "profile.yaml",
      profiles: [],
      selectedProfile: null
    }).emptyMessage).toBe("Loading profiles…");

    expect(profileBrowserViewModel({
      emptyMessage: "Backend refused profile list",
      isLoading: false,
      profilePath: "profile.yaml",
      profiles: [],
      selectedProfile: null
    }).emptyMessage).toBe("Backend refused profile list");

    expect(profileBrowserViewModel({
      emptyMessage: "No profiles loaded",
      isLoading: false,
      profilePath: "profile.yaml",
      profiles: [profile("profile.yaml")],
      selectedProfile: null
    }).groups[0].profiles[0].selected).toBe(true);
  });

  it("keeps profile browser empty-message precedence in the catalog model", () => {
    expect(profileBrowserEmptyMessage({
      catalogBlocker: "catalog blocker",
      catalogError: "catalog error",
      profileError: "profile error"
    })).toBe("profile error");

    expect(profileBrowserEmptyMessage({
      catalogBlocker: "catalog blocker",
      catalogError: "catalog error"
    })).toBe("catalog error");

    expect(profileBrowserEmptyMessage({
      catalogBlocker: "catalog blocker"
    })).toBe("catalog blocker");

    expect(profileBrowserEmptyMessage({})).toBe("No profiles loaded");
  });

  it("dispatches profile browser selection", () => {
    const row = profileBrowserViewModel({
      emptyMessage: "No profiles loaded",
      isLoading: false,
      profilePath: "profile.yaml",
      profiles: [profile("bench.py")],
      selectedProfile: null
    }).groups[0].profiles[0];
    const calls: string[] = [];

    runProfileBrowserSelection(row, {
      scrollToProfile: () => calls.push("scroll"),
      selectProfilePath: (relativePath) => calls.push(`select:${relativePath}`)
    });

    expect(calls).toEqual(["select:bench.py", "scroll"]);
  });

  it("binds profile browser selection handlers for the workspace", () => {
    const row = profileBrowserViewModel({
      emptyMessage: "No profiles loaded",
      isLoading: false,
      profilePath: "profile.yaml",
      profiles: [profile("bench.py")],
      selectedProfile: null
    }).groups[0].profiles[0];
    const calls: string[] = [];
    const handlers = profileBrowserActionHandlers({
      scrollToProfile: () => calls.push("scroll"),
      selectProfilePath: (relativePath) => calls.push(`select:${relativePath}`)
    });

    handlers.selectProfile(row);

    expect(calls).toEqual(["select:bench.py", "scroll"]);
  });

  it("filters profile names and paths immediately with case-insensitive tokens", () => {
    const profiles = [
      profile("udp_1pkt_simple.py"),
      profile("bench/http_latency.yaml"),
      profile("hlt/hlt_4vlans.py")
    ];

    expect(profileCatalogFilterViewModel({
      filters: { kind: "", query: "HLT vlan", source: "" },
      profiles
    }).profiles.map((item) => item.relative_path)).toEqual(["hlt/hlt_4vlans.py"]);

    expect(profileCatalogFilterViewModel({
      filters: { kind: "", query: "HTTP YAML", source: "" },
      profiles
    }).profiles.map((item) => item.relative_path)).toEqual(["bench/http_latency.yaml"]);
  });

  it("derives honest kind and source filters from catalog records", () => {
    const coreRoot = "/opt/trex-core/scripts/stl";
    const localRoot = "/opt/trex-webui/profiles";
    const profiles = [
      profile("udp.py", coreRoot),
      profile("http.yaml", coreRoot),
      {
        ...profile("captures/dns.pcap", localRoot),
        kind: "pcap"
      },
      {
        ...profile("draft.json", localRoot),
        kind: "json"
      }
    ];
    const view = profileCatalogFilterViewModel({
      filters: { kind: "pcap", query: "", source: localRoot },
      profiles
    });

    expect(view.kindOptions).toEqual([
      { count: 1, label: "JSON", value: "json" },
      { count: 1, label: "PCAP", value: "pcap" },
      { count: 2, label: "YAML Stream", value: "yaml" }
    ]);
    expect(view.sourceOptions).toEqual([
      { count: 2, label: coreRoot, value: coreRoot },
      { count: 2, label: localRoot, value: localRoot }
    ]);
    expect(view.profiles.map((item) => item.relative_path)).toEqual(["captures/dns.pcap"]);
    expect(view.countText).toBe("1 of 4 profiles");
    expect(view.filtersActive).toBe(true);
  });

  it("defensively ignores kind and source facets that no longer exist", () => {
    const profiles = [profile("udp.py", "/current/root")];
    const view = profileCatalogFilterViewModel({
      filters: {
        kind: "pcap",
        query: "",
        source: "/removed/root"
      },
      profiles
    });

    expect(view.effectiveFilters).toEqual({
      kind: "",
      query: "",
      source: ""
    });
    expect(view.profiles).toEqual(profiles);
    expect(view.countText).toBe("1 profile");
    expect(view.filtersActive).toBe(false);
  });

  it("owns loading, empty catalog, and no-match result copy", () => {
    expect(profileCatalogFilterViewModel({
      emptyMessage: "No profiles loaded",
      filters: { kind: "", query: "", source: "" },
      isLoading: true,
      profiles: []
    }).emptyMessage).toBe("Loading profiles…");

    expect(profileCatalogFilterViewModel({
      emptyMessage: "Profile root is unavailable",
      filters: { kind: "", query: "", source: "" },
      isLoading: false,
      profiles: []
    }).emptyMessage).toBe("Profile root is unavailable");

    expect(profileCatalogFilterViewModel({
      filters: { kind: "", query: "missing", source: "" },
      profiles: [profile("udp.py")]
    })).toMatchObject({
      countText: "0 of 1 profile",
      emptyMessage: "No profiles match these filters.",
      filtersActive: true,
      profiles: []
    });
  });
});
