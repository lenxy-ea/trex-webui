export type ProfileTunablesDraft = {
  size: string;
  vm: string;
  flow: string;
  pgId: string;
  extra: string;
  custom: Record<string, string>;
};

export type ProfileTunableDefinition = {
  name: string;
  required?: boolean;
  type?: string;
};

export const defaultProfileTunablesDraft: ProfileTunablesDraft = {
  size: "",
  vm: "",
  flow: "",
  pgId: "",
  extra: "",
  custom: {}
};

const tunableKeyPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function parseExtraTunables(value: string, allowedTunables?: Set<string> | null) {
  const tunables: Record<string, string> = {};
  const entries = value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      return { ok: false, error: `Invalid tunable ${entry}`, value: null } as const;
    }
    const key = entry.slice(0, separator).trim();
    const tunableValue = entry.slice(separator + 1).trim();
    if (!tunableKeyPattern.test(key) || !tunableValue) {
      return { ok: false, error: `Invalid tunable ${entry}`, value: null } as const;
    }
    if (allowedTunables && !allowedTunables.has(key)) {
      return { ok: false, error: `Tunable ${key} is not declared by the selected profile`, value: null } as const;
    }
    tunables[key] = tunableValue;
  }
  return { ok: true, error: null, value: tunables } as const;
}

function shouldIncludeTunable(name: string, allowedTunables: Set<string> | null) {
  return allowedTunables === null || allowedTunables.has(name);
}

const shortcutTunables = new Set(["size", "vm", "flow", "pg_id"]);

function customTunableValue(draft: ProfileTunablesDraft, name: string) {
  return (draft.custom[name] ?? "").trim();
}

function hasTunableValue(tunables: Record<string, string | number>, name: string) {
  const value = tunables[name];
  return value !== undefined && String(value).trim().length > 0;
}

export function buildProfileTunables(
  enabled: boolean,
  draft: ProfileTunablesDraft,
  declaredTunables?: ProfileTunableDefinition[] | null
) {
  if (!enabled) {
    return { ok: true, error: null, value: {} } as const;
  }

  const allowedTunables = Array.isArray(declaredTunables)
    ? new Set(declaredTunables.map((tunable) => tunable.name))
    : null;
  const extra = parseExtraTunables(draft.extra, allowedTunables);
  if (!extra.ok) {
    return extra;
  }

  const tunables: Record<string, string | number> = { ...extra.value };
  if (draft.size.trim() && shouldIncludeTunable("size", allowedTunables)) {
    tunables.size = draft.size.trim();
  }
  if (draft.vm && shouldIncludeTunable("vm", allowedTunables)) {
    tunables.vm = draft.vm;
  }
  if (draft.flow && shouldIncludeTunable("flow", allowedTunables)) {
    tunables.flow = draft.flow;
  }
  if (draft.pgId.trim() && shouldIncludeTunable("pg_id", allowedTunables)) {
    const pgId = Number(draft.pgId.trim());
    if (!Number.isInteger(pgId) || pgId < 0) {
      return { ok: false, error: "PG ID tunable must be a non-negative integer", value: null } as const;
    }
    tunables.pg_id = pgId;
  }
  if (Array.isArray(declaredTunables)) {
    for (const tunable of declaredTunables) {
      if (shortcutTunables.has(tunable.name)) {
        continue;
      }
      const value = customTunableValue(draft, tunable.name);
      if (value) {
        tunables[tunable.name] = value;
      }
    }
    for (const tunable of declaredTunables) {
      if (tunable.required && !hasTunableValue(tunables, tunable.name)) {
        return { ok: false, error: `Tunable ${tunable.name} is required`, value: null } as const;
      }
    }
  }

  return { ok: true, error: null, value: tunables } as const;
}
