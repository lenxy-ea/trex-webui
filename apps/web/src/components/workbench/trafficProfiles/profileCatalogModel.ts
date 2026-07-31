import type { ProfileRecord } from "../../../api";

export type ProfileDirectoryGroup = {
  directory: string;
  label: string;
  profiles: ProfileRecord[];
};

export type ProfileBrowserRow = {
  ariaLabel: string;
  className: string;
  iconSize: number;
  key: string;
  label: string;
  relativePath: string;
  role: "option";
  selected: boolean;
  title: string;
};

export type ProfileBrowserGroupHeading = {
  className: string;
  iconSize: number;
  label: string;
};

export type ProfileBrowserGroup = {
  ariaLabel: string | undefined;
  className: string;
  directory: string;
  heading: ProfileBrowserGroupHeading | null;
  key: string;
  label: string;
  profiles: ProfileBrowserRow[];
  role: "group" | "presentation";
};

export type ProfileBrowserViewModel = {
  ariaLabel: string;
  className: string;
  emptyClassName: string;
  emptyMessage: string | null;
  groups: ProfileBrowserGroup[];
  role: "listbox";
};

export type ProfileBrowserSelectionHandlers = {
  scrollToProfile: () => void;
  selectProfilePath: (relativePath: string) => void;
};

export type ProfileBrowserActionHandlers = {
  selectProfile: (row: ProfileBrowserRow) => void;
};

export type ProfileBrowserEmptyMessageInput = {
  catalogBlocker?: string | null;
  catalogError?: string | null;
  fallback?: string;
  profileError?: string | null;
};

export type ProfileCatalogFilters = {
  kind: string;
  query: string;
  source: string;
};

export type ProfileCatalogFilterOption = {
  count: number;
  label: string;
  value: string;
};

export type ProfileCatalogFilterViewModel = {
  countText: string;
  emptyMessage: string | null;
  effectiveFilters: ProfileCatalogFilters;
  filtersActive: boolean;
  kindOptions: ProfileCatalogFilterOption[];
  profiles: ProfileRecord[];
  sourceOptions: ProfileCatalogFilterOption[];
  totalCount: number;
  visibleCount: number;
};

export function profileDirectory(relativePath: string) {
  const separator = relativePath.lastIndexOf("/");
  return separator > 0 ? relativePath.slice(0, separator) : "";
}

export function profileFileName(relativePath: string) {
  const separator = relativePath.lastIndexOf("/");
  return separator >= 0 ? relativePath.slice(separator + 1) : relativePath;
}

export function profileModifiedTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

export function profileKindLabel(value: string | undefined) {
  if (!value) {
    return "-";
  }
  if (value.toLowerCase() === "python") {
    return "Python STL";
  }
  if (value.toLowerCase() === "yaml") {
    return "YAML Stream";
  }
  if (value.toLowerCase() === "pcap") {
    return "PCAP";
  }
  if (value.toLowerCase() === "json") {
    return "JSON";
  }
  return value;
}

function profileCountLabel(count: number) {
  return count === 1 ? "profile" : "profiles";
}

function profileCatalogFilterOptions(
  profiles: ProfileRecord[],
  valueForProfile: (profile: ProfileRecord) => string,
  labelForValue: (value: string) => string
) {
  const counts = new Map<string, number>();
  for (const profile of profiles) {
    const value = valueForProfile(profile);
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map<ProfileCatalogFilterOption>(([value, count]) => ({
      count,
      label: labelForValue(value),
      value
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, {
        numeric: true,
        sensitivity: "base"
      })
    );
}

function normalizedProfileSearchText(profile: ProfileRecord) {
  return [
    profile.name,
    profile.relative_path,
    profile.root,
    profile.kind,
    profile.suffix
  ].join(" ").toLowerCase();
}

export function normalizeProfileCatalogFilters(
  profiles: ProfileRecord[],
  filters: ProfileCatalogFilters,
  preserveMissingFacets = false
): ProfileCatalogFilters {
  const normalizedKind = filters.kind.trim().toLowerCase();
  const availableKinds = new Set(profiles.map((profile) => profile.kind.toLowerCase()));
  const availableSources = new Set(profiles.map((profile) => profile.root));

  return {
    kind: preserveMissingFacets || !normalizedKind || availableKinds.has(normalizedKind)
      ? normalizedKind
      : "",
    query: filters.query,
    source: preserveMissingFacets || !filters.source || availableSources.has(filters.source)
      ? filters.source
      : ""
  };
}

export function profileCatalogFilterViewModel({
  emptyMessage = "No profiles loaded",
  filters,
  isLoading = false,
  profiles
}: {
  emptyMessage?: string;
  filters: ProfileCatalogFilters;
  isLoading?: boolean;
  profiles: ProfileRecord[];
}): ProfileCatalogFilterViewModel {
  const effectiveFilters = normalizeProfileCatalogFilters(profiles, filters, isLoading);
  const queryTokens = effectiveFilters.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const filteredProfiles = profiles.filter((profile) => {
    if (effectiveFilters.kind && profile.kind.toLowerCase() !== effectiveFilters.kind) {
      return false;
    }
    if (effectiveFilters.source && profile.root !== effectiveFilters.source) {
      return false;
    }
    if (queryTokens.length === 0) {
      return true;
    }
    const searchText = normalizedProfileSearchText(profile);
    return queryTokens.every((token) => searchText.includes(token));
  });
  const totalCount = profiles.length;
  const visibleCount = filteredProfiles.length;
  const filtersActive = Boolean(
    effectiveFilters.kind
    || effectiveFilters.query.trim()
    || effectiveFilters.source
  );
  const countText = visibleCount === totalCount
    ? `${totalCount} ${profileCountLabel(totalCount)}`
    : `${visibleCount} of ${totalCount} ${profileCountLabel(totalCount)}`;
  let resultEmptyMessage: string | null = null;
  if (totalCount === 0) {
    resultEmptyMessage = isLoading ? "Loading profiles…" : emptyMessage;
  } else if (visibleCount === 0) {
    resultEmptyMessage = "No profiles match these filters.";
  }

  return {
    countText,
    emptyMessage: resultEmptyMessage,
    effectiveFilters,
    filtersActive,
    kindOptions: profileCatalogFilterOptions(
      profiles,
      (profile) => profile.kind.toLowerCase(),
      profileKindLabel
    ),
    profiles: filteredProfiles,
    sourceOptions: profileCatalogFilterOptions(
      profiles,
      (profile) => profile.root,
      (root) => root
    ),
    totalCount,
    visibleCount
  };
}

export function profileDirectoryGroups(profiles: ProfileRecord[]) {
  const groups = new Map<string, ProfileRecord[]>();
  for (const profile of profiles) {
    const directory = profileDirectory(profile.relative_path);
    groups.set(directory, [...(groups.get(directory) ?? []), profile]);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === right) {
        return 0;
      }
      if (left === "") {
        return -1;
      }
      if (right === "") {
        return 1;
      }
      return left.localeCompare(right);
    })
    .map<ProfileDirectoryGroup>(([directory, groupProfiles]) => ({
      directory,
      label: directory || "",
      profiles: groupProfiles
    }));
}

export function profileBrowserEmptyMessage({
  catalogBlocker,
  catalogError,
  fallback = "No profiles loaded",
  profileError
}: ProfileBrowserEmptyMessageInput) {
  return profileError ?? catalogError ?? catalogBlocker ?? fallback;
}

export function runProfileBrowserSelection(
  row: ProfileBrowserRow,
  handlers: ProfileBrowserSelectionHandlers
) {
  handlers.selectProfilePath(row.relativePath);
  handlers.scrollToProfile();
}

export function profileBrowserActionHandlers(
  handlers: ProfileBrowserSelectionHandlers
): ProfileBrowserActionHandlers {
  return {
    selectProfile: (row) => runProfileBrowserSelection(row, handlers)
  };
}

export function profileBrowserViewModel({
  emptyMessage,
  isLoading,
  profiles,
  profilePath,
  selectedProfile
}: {
  emptyMessage: string;
  isLoading: boolean;
  profiles: ProfileRecord[];
  profilePath: string;
  selectedProfile?: ProfileRecord | null;
}): ProfileBrowserViewModel {
  const selectedRelativePath = selectedProfile?.relative_path ?? profilePath;
  return {
    ariaLabel: "Profiles",
    className: "profile-list",
    emptyClassName: "profile-list-empty",
    emptyMessage: profiles.length === 0 ? (isLoading ? "Loading profiles…" : emptyMessage) : null,
    groups: profileDirectoryGroups(profiles).map<ProfileBrowserGroup>((group) => ({
      ariaLabel: group.directory || undefined,
      className: "profile-list-group",
      directory: group.directory,
      heading: group.directory
        ? {
            className: "profile-list-group-heading",
            iconSize: 13,
            label: group.label
          }
        : null,
      key: group.directory || "__root",
      label: group.label,
      profiles: group.profiles.map<ProfileBrowserRow>((profile) => {
        const selected = profile.relative_path === selectedRelativePath;
        return {
          ariaLabel: profile.relative_path,
          className: `profile-list-row${selected ? " profile-list-row--selected" : ""}`,
          iconSize: 14,
          key: `${profile.root}:${profile.relative_path}`,
          label: profileFileName(profile.relative_path),
          relativePath: profile.relative_path,
          role: "option",
          selected,
          title: profile.relative_path
        };
      }),
      role: group.directory ? "group" : "presentation"
    })),
    role: "listbox"
  };
}
