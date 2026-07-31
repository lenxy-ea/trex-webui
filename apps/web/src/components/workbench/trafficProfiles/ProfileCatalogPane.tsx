import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { FileText, Folder, Search } from "lucide-react";

import type { ProfileRecord } from "../../../api";
import {
  normalizeProfileCatalogFilters,
  profileBrowserViewModel,
  profileCatalogFilterViewModel,
  type ProfileBrowserRow,
  type ProfileCatalogFilters
} from "./profileCatalogModel";

const emptyFilters: ProfileCatalogFilters = {
  kind: "",
  query: "",
  source: ""
};

export type ProfileCatalogPaneProps = {
  emptyMessage: string;
  isLoading: boolean;
  onSelectProfile: (profile: ProfileBrowserRow) => void;
  profilePath: string;
  profiles: ProfileRecord[];
  selectedProfile: ProfileRecord | null;
};

function moveProfileListFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  destination: "end" | "first" | "next" | "previous"
) {
  const list = event.currentTarget.closest('[role="listbox"]');
  const options = Array.from(
    list?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  );
  const currentIndex = options.indexOf(event.currentTarget);
  if (currentIndex < 0 || options.length === 0) {
    return;
  }
  let nextIndex: number;
  if (destination === "first") {
    nextIndex = 0;
  } else if (destination === "end") {
    nextIndex = options.length - 1;
  } else if (destination === "next") {
    nextIndex = Math.min(currentIndex + 1, options.length - 1);
  } else {
    nextIndex = Math.max(currentIndex - 1, 0);
  }
  event.preventDefault();
  options[nextIndex]?.focus();
}

export function ProfileCatalogPane({
  emptyMessage,
  isLoading,
  onSelectProfile,
  profilePath,
  profiles,
  selectedProfile
}: ProfileCatalogPaneProps) {
  const [filters, setFilters] = useState<ProfileCatalogFilters>(emptyFilters);
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  const filterView = useMemo(
    () => profileCatalogFilterViewModel({
      emptyMessage,
      filters,
      isLoading,
      profiles
    }),
    [emptyMessage, filters, isLoading, profiles]
  );
  const browser = useMemo(
    () => profileBrowserViewModel({
      emptyMessage: filterView.emptyMessage ?? emptyMessage,
      isLoading: false,
      profilePath,
      profiles: filterView.profiles,
      selectedProfile
    }),
    [
      emptyMessage,
      filterView.emptyMessage,
      filterView.profiles,
      profilePath,
      selectedProfile
    ]
  );
  const facetRevision = JSON.stringify({
    kinds: filterView.kindOptions.map((option) => option.value),
    sources: filterView.sourceOptions.map((option) => option.value)
  });
  const [previousFacetRevision, setPreviousFacetRevision] = useState(facetRevision);
  const selectedRelativePath = selectedProfile?.relative_path ?? profilePath;
  const firstRowKey = browser.groups[0]?.profiles[0]?.key ?? null;
  const hasSelectedRow = browser.groups.some((group) =>
    group.profiles.some((profile) => profile.selected)
  );

  useEffect(() => {
    const selectedRow = selectedRowRef.current;
    if (!selectedRelativePath || typeof selectedRow?.scrollIntoView !== "function") {
      return;
    }
    selectedRow.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [browser.groups, selectedRelativePath]);

  if (!isLoading && previousFacetRevision !== facetRevision) {
    setPreviousFacetRevision(facetRevision);
    setFilters((current) => normalizeProfileCatalogFilters(profiles, current));
  }

  const updateFilter = (key: keyof ProfileCatalogFilters, value: string) => {
    setFilters((current) => ({
      ...normalizeProfileCatalogFilters(profiles, current, isLoading),
      [key]: value
    }));
  };
  const clearFilters = () => setFilters(emptyFilters);

  return (
    <section className="profile-catalog" aria-label="Profile catalog">
      <div className="profile-catalog-tools">
        <label className="profile-catalog-search">
          <span>Search</span>
          <div className="profile-catalog-search-field">
            <Search aria-hidden="true" size={14} />
            <input
              aria-label="Search profiles"
              autoComplete="off"
              name="profile-catalog-search"
              onChange={(event) => updateFilter("query", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && filterView.effectiveFilters.query) {
                  event.preventDefault();
                  event.stopPropagation();
                  updateFilter("query", "");
                }
              }}
              placeholder="Search name or path…"
              spellCheck={false}
              type="search"
              value={filterView.effectiveFilters.query}
            />
          </div>
        </label>
        <div className="profile-catalog-filters">
          <label>
            <span>Kind</span>
            <select
              aria-label="Filter profiles by kind"
              name="profile-catalog-kind"
              onChange={(event) => updateFilter("kind", event.target.value)}
              value={filterView.effectiveFilters.kind}
            >
              <option value="">All kinds</option>
              {filterView.kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Source</span>
            <select
              aria-label="Filter profiles by source"
              name="profile-catalog-source"
              onChange={(event) => updateFilter("source", event.target.value)}
              title={filterView.effectiveFilters.source || "All profile roots"}
              value={filterView.effectiveFilters.source}
            >
              <option value="">All sources</option>
              {filterView.sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="profile-catalog-status">
          <span aria-live="polite" role="status">
            {filterView.countText}
            {isLoading && filterView.totalCount > 0 ? " · Refreshing…" : ""}
          </span>
          {filterView.filtersActive ? (
            <button
              aria-label="Clear profile filters"
              className="profile-catalog-clear"
              onClick={clearFilters}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div
        aria-busy={isLoading}
        aria-label={browser.ariaLabel}
        className={browser.className}
        role={browser.role}
      >
        {browser.groups.map((group) => (
          <div
            aria-label={group.ariaLabel}
            className={group.className}
            key={group.key}
            role={group.role}
          >
            {group.heading ? (
              <div className={group.heading.className}>
                <Folder aria-hidden="true" size={group.heading.iconSize} />
                <span>{group.heading.label}</span>
              </div>
            ) : null}
            {group.profiles.map((profile) => (
              <button
                aria-label={profile.ariaLabel}
                aria-selected={profile.selected}
                className={profile.className}
                key={profile.key}
                onClick={() => onSelectProfile(profile)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    moveProfileListFocus(event, "next");
                  } else if (event.key === "ArrowUp") {
                    moveProfileListFocus(event, "previous");
                  } else if (event.key === "Home") {
                    moveProfileListFocus(event, "first");
                  } else if (event.key === "End") {
                    moveProfileListFocus(event, "end");
                  }
                }}
                ref={profile.selected ? selectedRowRef : undefined}
                role={profile.role}
                tabIndex={profile.selected || (!hasSelectedRow && profile.key === firstRowKey) ? 0 : -1}
                title={profile.title}
                type="button"
              >
                <FileText aria-hidden="true" size={profile.iconSize} />
                <span>{profile.label}</span>
              </button>
            ))}
          </div>
        ))}
        {browser.emptyMessage ? (
          <div
            aria-live="polite"
            className={browser.emptyClassName}
            role="status"
          >
            {browser.emptyMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
