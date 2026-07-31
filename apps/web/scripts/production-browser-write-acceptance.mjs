import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const requiredNodeMajor = 24;
const defaultTimeoutMs = 30_000;
const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const targetGroupId = "pair-0";
const targetPorts = Object.freeze([0, 1]);
const expectedConfiguredPortIds = Object.freeze([0, 1, 2, 3, 4, 5]);
const boundedMultiplier = "1kpps";
const unboundedTrafficDuration = -1;
export const hardStopLeaseSeconds = 60;
export const hardStopLeaseGraceMs = 5_000;
export const maxRcConnectTimeoutSeconds = 3;
export const browserWriteTimingGuarantee =
  "observed RC acceptance threshold; not a theoretical worst-case or hard-real-time guarantee";
const emergencyRequestTimeoutMs = 5_000;
const handledSignals = Object.freeze(["SIGTERM", "SIGINT"]);
const retryableHardStopReadBlockers = new Set([
  "traffic_hard_stop_window_insufficient",
  "traffic_hard_stop_priority"
]);

export const expectedBrowserWriteSequence = Object.freeze([
  "save-plan",
  "start-group",
  "pause:0",
  "pause:1",
  "resume:0",
  "resume:1",
  "stop-pair"
]);

export function createEmergencyCleanupCoordinator({
  recordSignal,
  closeBrowser,
  cleanup
}) {
  let signal = null;
  let operation = null;
  return {
    get signal() {
      return signal;
    },
    request(requestedSignal) {
      if (operation) {
        return operation;
      }
      signal = requestedSignal;
      recordSignal(requestedSignal);
      operation = (async () => {
        const errors = [];
        try {
          await closeBrowser();
        } catch (error) {
          errors.push(error);
        }
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
        if (errors.length > 0) {
          throw new AggregateError(errors, `emergency cleanup failed after ${requestedSignal}`);
        }
      })();
      return operation;
    }
  };
}

function createIdempotentAsyncAction(action) {
  let operation = null;
  return () => {
    operation ??= Promise.resolve().then(action);
    return operation;
  };
}

function optionValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function resolveOutputPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--base-url must use http:// or https://");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/api\/?$/, "/");
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url.toString();
}

export function parseOptions(argv) {
  const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
  const options = {
    baseUrl: normalizeBaseUrl(process.env.WEBUI_URL ?? "http://127.0.0.1"),
    gateId: process.env.TREX_WEBUI_GATE_ID ?? `standalone-${timestamp}`,
    identityFile: process.env.TREX_WEBUI_GATE_IDENTITY
      ? resolveOutputPath(process.env.TREX_WEBUI_GATE_IDENTITY)
      : null,
    output: resolveOutputPath(
      process.env.PLAYWRIGHT_WRITE_OUTPUT_PATH
        ?? path.join(rootDir, ".logs", `production-browser-write-acceptance-${timestamp}.json`)
    ),
    timeoutMs: defaultTimeoutMs,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      options.baseUrl = normalizeBaseUrl(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--gate-id") {
      options.gateId = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--identity-file") {
      options.identityFile = resolveOutputPath(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--output") {
      options.output = resolveOutputPath(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--timeout-ms") {
      const value = optionValue(argv, index, argument);
      options.timeoutMs = Number.parseInt(value, 10);
      if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
        throw new Error("--timeout-ms requires a positive integer");
      }
      index += 1;
    } else if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: npm run acceptance:web:production-write -- [options]

Run an explicitly opt-in, real traffic write acceptance through the production
Nginx WebUI. The gate refuses to write unless pair-0 is exactly P0/P1, both
links are up, every traffic port is known idle and unowned, and captures are
fully clear. Its temporary traffic runs with duration=-1 so pause/resume remain
available, while the exact group start is rewritten with a persisted
${hardStopLeaseSeconds}-second hard-stop lease.

Options:
  --base-url URL       Nginx WebUI URL. Default: http://127.0.0.1
  --gate-id ID         Major-gate identity recorded in evidence
  --identity-file PATH Gate source/build identity JSON
  --output PATH        JSON evidence path
  --timeout-ms MS      Browser/API timeout. Default: ${defaultTimeoutMs}
  -h, --help           Show this help`;
}

function assertProjectNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (major !== requiredNodeMajor) {
    throw new Error(
      `Production browser write acceptance requires Node.js ${requiredNodeMajor}.x; current runtime is ${process.version}`
    );
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return String(value);
  }
}

function requestRecord(request) {
  return {
    method: request.method().toUpperCase(),
    resource_type: request.resourceType(),
    url: compactUrl(request.url())
  };
}

function parsedJson(value) {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

export function jsonValuesEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function isExactPorts(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((port, index) => port === expected[index]);
}

function isConfirmation(value, expected) {
  return value === null || value === expected;
}

function isSessionId(value) {
  return typeof value === "string" && value.trim() !== "";
}

function canonicalUtcInstant(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}|\d{6}))?Z$/.exec(
      value
    );
  if (!match || match[1].startsWith("0000-")) {
    return null;
  }
  if (match[2]?.length === 6 && match[2] === "000000") {
    return null;
  }
  const wholeSecondMilliseconds = Date.parse(`${match[1]}.000Z`);
  if (
    !Number.isFinite(wholeSecondMilliseconds)
    || new Date(wholeSecondMilliseconds).toISOString().slice(0, 19)
      !== match[1]
  ) {
    return null;
  }
  const fraction = match[2] ?? "";
  const fractionalMicroseconds = fraction === ""
    ? 0
    : fraction.length === 3
      ? Number.parseInt(fraction, 10) * 1_000
      : Number.parseInt(fraction, 10);
  return {
    milliseconds:
      wholeSecondMilliseconds + Math.floor(fractionalMicroseconds / 1_000),
    microseconds:
      BigInt(wholeSecondMilliseconds) * 1_000n
      + BigInt(fractionalMicroseconds),
    millisecondAligned: fractionalMicroseconds % 1_000 === 0
  };
}

function canonicalUtcTimestamp(value) {
  return canonicalUtcInstant(value)?.milliseconds ?? null;
}

function sameCanonicalUtcInstant(left, right) {
  const leftInstant = canonicalUtcInstant(left);
  const rightInstant = canonicalUtcInstant(right);
  return leftInstant !== null
    && rightInstant !== null
    && leftInstant.microseconds === rightInstant.microseconds;
}

function exactRouteHardStopLease(context) {
  const issuedAtInstant = canonicalUtcInstant(context?.hardStopIssuedAt);
  const hardStopAtInstant = canonicalUtcInstant(context?.hardStopAt);
  const issuedAt = issuedAtInstant?.milliseconds ?? null;
  const hardStopAt = hardStopAtInstant?.milliseconds ?? null;
  return {
    exact: issuedAtInstant !== null
      && hardStopAtInstant !== null
      && issuedAtInstant.millisecondAligned
      && hardStopAtInstant.millisecondAligned
      && hardStopAtInstant.microseconds - issuedAtInstant.microseconds
        === BigInt(hardStopLeaseSeconds) * 1_000_000n,
    issuedAt,
    hardStopAt,
    deadline: hardStopAt === null ? null : hardStopAt + hardStopLeaseGraceMs
  };
}

/**
 * The production UI binds mutations to its traffic-session authority. The
 * acceptance route independently verifies the ID learned from the exact start
 * response and narrows Stop all to the gate-owned P0/P1 pair before the
 * request is allowed to reach Nginx.
 */
export function hardenBrowserActionRequest(request, policy, nowMs = Date.now()) {
  const method = String(request.method).toUpperCase();
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return { allowed: false, reason: "request URL is invalid" };
  }
  if (
    method === "POST"
    && url.pathname === `/api/trex/traffic/group/${encodeURIComponent(policy.groupId)}/start`
  ) {
    const body = parsedJson(request.postData);
    if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body)) {
      return { allowed: false, reason: "write request body is not a JSON object" };
    }
    const rawKeys = Object.keys(body);
    if (
      rawKeys.some(
        (key) => !["plan_revision", "confirmation", "expected_session_id"].includes(key)
      )
    ) {
      return {
        allowed: false,
        reason: "UI group start must not pre-supply hard_stop_at or any other extra field"
      };
    }
    if (!Number.isFinite(nowMs)) {
      return { allowed: false, reason: "hard-stop lease issue time is invalid" };
    }
    const issuedAt = new Date(nowMs).toISOString();
    const hardStopAt = new Date(
      nowMs + hardStopLeaseSeconds * 1_000
    ).toISOString();
    body.hard_stop_at = hardStopAt;
    return {
      allowed: true,
      rewritten: true,
      request: { ...request, postData: JSON.stringify(body) },
      body,
      hardStopLease: {
        issued_at: issuedAt,
        hard_stop_at: hardStopAt,
        lease_seconds: hardStopLeaseSeconds
      }
    };
  }

  const actionMatch = /^\/api\/trex\/traffic\/(pause|resume|stop)$/.exec(url.pathname);
  if (method !== "POST" || !actionMatch) {
    return { allowed: true, request, rewritten: false };
  }
  if (!isSessionId(policy.sessionId)) {
    return {
      allowed: false,
      reason: "traffic action is blocked until start returns a verifiable session ID"
    };
  }
  const body = parsedJson(request.postData);
  if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body)) {
    return { allowed: false, reason: "write request body is not a JSON object" };
  }
  if (
    body.expected_session_id !== undefined
    && body.expected_session_id !== policy.sessionId
  ) {
    return { allowed: false, reason: "traffic action session fence differs from the started session" };
  }
  const action = actionMatch[1];
  if (action === "stop") {
    if (body.ports !== null && !isExactPorts(body.ports, targetPorts)) {
      return { allowed: false, reason: "traffic stop is not limited to P0/P1" };
    }
    body.ports = [...targetPorts];
  }
  body.expected_session_id = policy.sessionId;
  return {
    allowed: true,
    rewritten: true,
    request: { ...request, postData: JSON.stringify(body) },
    body
  };
}

/**
 * Classify one browser request without mutating the sequence cursor. All write
 * paths are deliberately enumerated; there is no prefix or wildcard write rule.
 */
export function classifyBrowserRequest(request, policy) {
  const method = String(request.method).toUpperCase();
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return { allowed: false, reason: "request URL is invalid" };
  }
  if (readOnlyMethods.has(method)) {
    return { allowed: true, action: "read" };
  }
  if (url.origin !== policy.baseOrigin) {
    return { allowed: false, reason: "write request is not same-origin" };
  }

  const body = parsedJson(request.postData);
  if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body)) {
    return { allowed: false, reason: "write request body is not a JSON object" };
  }

  if (method === "PUT" && url.pathname === "/api/trex/traffic/plan") {
    if (body.plan_revision !== policy.initialRevision) {
      return { allowed: false, reason: "traffic plan revision does not match preflight" };
    }
    if (!jsonValuesEqual(body.groups, policy.savedGroups)) {
      return { allowed: false, reason: "traffic plan write differs from the bounded acceptance plan" };
    }
    return { allowed: true, action: "save-plan", body };
  }

  if (
    method === "POST"
    && url.pathname === `/api/trex/traffic/group/${encodeURIComponent(policy.groupId)}/start`
  ) {
    if (!Number.isSafeInteger(policy.savedRevision) || body.plan_revision !== policy.savedRevision) {
      return { allowed: false, reason: "group start does not use the saved traffic plan revision" };
    }
    if (!isConfirmation(body.confirmation, "start-traffic")) {
      return { allowed: false, reason: "group start confirmation token is invalid" };
    }
    if (body.expected_session_id !== null) {
      return { allowed: false, reason: "group start must prove that no traffic session is active" };
    }
    const hardStopAtMs = canonicalUtcTimestamp(body.hard_stop_at);
    const expectedHardStopAtMs = canonicalUtcTimestamp(policy.hardStopAt);
    if (
      hardStopAtMs === null
      || expectedHardStopAtMs === null
      || !sameCanonicalUtcInstant(body.hard_stop_at, policy.hardStopAt)
    ) {
      return {
        allowed: false,
        reason: "group start hard_stop_at does not match the exact route-issued UTC lease"
      };
    }
    if (!exactRouteHardStopLease(policy).exact) {
      return {
        allowed: false,
        reason: "group start hard-stop lease window is not exactly bounded"
      };
    }
    if (
      Object.keys(body).some(
        (key) => ![
          "plan_revision",
          "confirmation",
          "expected_session_id",
          "hard_stop_at"
        ].includes(key)
      )
    ) {
      return { allowed: false, reason: "group start body contains unexpected fields" };
    }
    return {
      allowed: true,
      action: "start-group",
      body,
      hardStopLease: {
        issued_at: policy.hardStopIssuedAt,
        hard_stop_at: body.hard_stop_at,
        lease_seconds: hardStopLeaseSeconds
      }
    };
  }

  const actionMatch = /^\/api\/trex\/traffic\/(pause|resume|stop)$/.exec(url.pathname);
  if (method === "POST" && actionMatch) {
    const action = actionMatch[1];
    if (!isSessionId(policy.sessionId) || body.expected_session_id !== policy.sessionId) {
      return { allowed: false, reason: `${action} does not carry the started session fence` };
    }
    if (action === "stop") {
      if (!isExactPorts(body.ports, targetPorts) || !isConfirmation(body.confirmation, "stop")) {
        return { allowed: false, reason: "UI stop must be the confirmed P0/P1 operation" };
      }
      if (
        Object.keys(body).some(
          (key) => !["ports", "confirmation", "expected_session_id"].includes(key)
        )
      ) {
        return { allowed: false, reason: "traffic stop body contains unexpected fields" };
      }
      return { allowed: true, action: "stop-pair", body };
    }
    if (!Array.isArray(body.ports) || body.ports.length !== 1 || !targetPorts.includes(body.ports[0])) {
      return { allowed: false, reason: `${action} must target exactly one of P0/P1` };
    }
    if (body.confirmation !== null) {
      return { allowed: false, reason: `${action} must not carry a confirmation token` };
    }
    if (
      Object.keys(body).some(
        (key) => !["ports", "confirmation", "expected_session_id"].includes(key)
      )
    ) {
      return { allowed: false, reason: `traffic ${action} body contains unexpected fields` };
    }
    return { allowed: true, action: `${action}:${body.ports[0]}`, body };
  }

  return { allowed: false, reason: "write endpoint is not in the acceptance allowlist" };
}

export function consumeExpectedBrowserWrite(sequenceIndex, action) {
  const expected = expectedBrowserWriteSequence[sequenceIndex] ?? null;
  if (action !== expected) {
    return {
      allowed: false,
      nextIndex: sequenceIndex,
      reason: `expected ${expected ?? "no further writes"}, observed ${action}`
    };
  }
  return { allowed: true, nextIndex: sequenceIndex + 1, reason: null };
}

function linkIsUp(value) {
  if (value === true || value === 1) {
    return true;
  }
  return typeof value === "string"
    && new Set(["1", "ACTIVE", "ON", "TRUE", "UP", "YES"]).has(value.trim().toUpperCase());
}

function capturesAreClear(capture) {
  if (!capture || !Array.isArray(capture.captures) || capture.captures.length !== 0) {
    return false;
  }
  const managedIds = capture.service_mode?.managed_capture_ids;
  if (Array.isArray(managedIds) && managedIds.length > 0) {
    return false;
  }
  if (Array.isArray(capture.port_usage)) {
    return capture.port_usage.every(
      (row) =>
        Array.isArray(row?.rx_recorder_ids)
        && row.rx_recorder_ids.length === 0
        && Array.isArray(row?.tx_recorder_ids)
        && row.tx_recorder_ids.length === 0
    );
  }
  return true;
}

function groupForTarget(runtime, groupId = targetGroupId) {
  return Array.isArray(runtime?.groups)
    ? runtime.groups.find((group) => group?.id === groupId) ?? null
    : null;
}

function runtimePort(runtime, port) {
  return Array.isArray(runtime?.port_states)
    ? runtime.port_states.find((row) => row?.port === port) ?? null
    : null;
}

function configuredRuntimeInventory(runtime, expectedPortIds) {
  if (
    !Array.isArray(expectedPortIds)
    || expectedPortIds.length === 0
    || expectedPortIds.some(
      (port) => !Number.isSafeInteger(port) || port < 0
    )
    || new Set(expectedPortIds).size !== expectedPortIds.length
    || targetPorts.some((port) => !expectedPortIds.includes(port))
  ) {
    return {
      ok: false,
      reason: "preflight configured-port inventory is missing or invalid"
    };
  }
  if (
    !Array.isArray(runtime?.available_ports)
    || !isExactPorts(runtime.available_ports, expectedPortIds)
  ) {
    return {
      ok: false,
      reason: "runtime available-port inventory changed after preflight"
    };
  }
  if (!Array.isArray(runtime.port_states)) {
    return {
      ok: false,
      reason: "traffic runtime port states are missing"
    };
  }
  const unexpected = runtime.port_states.filter(
    (row) => !expectedPortIds.includes(row?.port)
  );
  const missingOrDuplicate = expectedPortIds.filter(
    (port) => runtime.port_states.filter((row) => row?.port === port).length !== 1
  );
  if (
    runtime.port_states.length !== expectedPortIds.length
    || unexpected.length > 0
    || missingOrDuplicate.length > 0
  ) {
    return {
      ok: false,
      reason: "traffic runtime does not contain exactly one state row for every configured port"
    };
  }
  return {
    ok: true,
    rows: expectedPortIds.map((port) => runtimePort(runtime, port)),
    outsideRows: expectedPortIds
      .filter((port) => !targetPorts.includes(port))
      .map((port) => runtimePort(runtime, port))
  };
}

function evaluateRuntimeInventoryAuthority(runtime, expectedPortIds) {
  if (runtime?.live_state_sampled !== true) {
    return {
      ok: false,
      reason: "traffic runtime snapshot does not contain freshly sampled live TRex port state"
    };
  }
  const inventory = configuredRuntimeInventory(runtime, expectedPortIds);
  if (!inventory.ok) {
    return inventory;
  }
  const concurrent = inventory.outsideRows.filter(
    (row) => row?.state !== "stopped" || row?.ownership !== "none"
  );
  if (concurrent.length > 0) {
    return {
      ok: false,
      reason: `concurrent traffic appeared outside P0/P1 on ${concurrent
        .map((row) => `P${row?.port}`)
        .join(", ")}`
    };
  }
  return inventory;
}

export function evaluateRcTimingEnvironment(environment) {
  const connectTimeoutSeconds = environment?.connect_timeout_seconds;
  if (
    typeof connectTimeoutSeconds !== "number"
    || !Number.isSafeInteger(connectTimeoutSeconds)
    || connectTimeoutSeconds < 1
    || connectTimeoutSeconds > maxRcConnectTimeoutSeconds
  ) {
    return {
      ok: false,
      connect_timeout_seconds: Number.isSafeInteger(connectTimeoutSeconds)
        ? connectTimeoutSeconds
        : null,
      reason:
        `RC browser write acceptance requires connect_timeout_seconds in 1..${maxRcConnectTimeoutSeconds}`
    };
  }
  return {
    ok: true,
    connect_timeout_seconds: connectTimeoutSeconds,
    reason: null
  };
}

export function evaluatePreflight(
  { ports, runtime, capture, environment },
  groupId = targetGroupId,
  expectedPortIds = expectedConfiguredPortIds
) {
  const blockers = [];
  const liveStateSampled = runtime?.live_state_sampled === true;
  const timingEnvironment = evaluateRcTimingEnvironment(environment);
  if (!timingEnvironment.ok) {
    blockers.push(timingEnvironment.reason);
  }
  const runtimeInventory = evaluateRuntimeInventoryAuthority(
    runtime,
    expectedPortIds
  );
  if (!runtimeInventory.ok) {
    blockers.push(runtimeInventory.reason);
  }
  if (!Number.isSafeInteger(runtime?.plan_revision) || runtime.plan_revision < 0) {
    blockers.push("traffic plan revision is missing or invalid");
  }
  const group = groupForTarget(runtime, groupId);
  if (!group || !isExactPorts(group.ports, targetPorts)) {
    blockers.push(`${groupId} must map exactly to P0/P1`);
  }

  for (const portId of targetPorts) {
    const port = Array.isArray(ports?.ports)
      ? ports.ports.find((candidate) => candidate?.id === portId)
      : null;
    if (!port) {
      blockers.push(`P${portId} is missing from the live port inventory`);
      continue;
    }
    if (!linkIsUp(port.info?.link ?? port.info?.link_status)) {
      blockers.push(`P${portId} link is not UP`);
    }
    if (port.acquired !== false) {
      blockers.push(`P${portId} is already acquired; acceptance requires a released port`);
    }
    if (liveStateSampled) {
      const portRuntime = runtimePort(runtime, portId);
      if (!portRuntime || portRuntime.state !== "stopped" || portRuntime.ownership !== "none") {
        blockers.push(`P${portId} must be stopped and unowned`);
      }
    }
  }

  if (!liveStateSampled) {
    // The authority check above records the blocker. Durable-only rows are
    // intentionally not interpreted as live traffic state.
  } else if (!Array.isArray(runtime?.port_states) || runtime.port_states.length === 0) {
    blockers.push("traffic runtime returned no port states");
  } else {
    const uncertain = runtime.port_states.filter(
      (row) => row?.state === "unknown" || row?.ownership === "external"
    );
    if (uncertain.length > 0) {
      blockers.push(
        `external or uncertain traffic exists on ${uncertain.map((row) => `P${row.port}`).join(", ")}`
      );
    }
    const active = runtime.port_states.filter((row) => row?.state !== "stopped");
    if (active.length > 0) {
      blockers.push(
        `acceptance requires all traffic idle; active: ${active.map((row) => `P${row.port}`).join(", ")}`
      );
    }
    const owned = runtime.port_states.filter((row) => row?.ownership !== "none");
    if (owned.length > 0) {
      blockers.push(
        `traffic ownership is not clear on ${owned.map((row) => `P${row.port}`).join(", ")}`
      );
    }
  }
  const livePorts = Array.isArray(ports?.ports) ? ports.ports : [];
  const unexpectedLivePorts = livePorts.filter(
    (port) => !expectedPortIds.includes(port?.id)
  );
  const missingOrDuplicateLivePorts = expectedPortIds.filter(
    (port) => livePorts.filter((candidate) => candidate?.id === port).length !== 1
  );
  if (
    livePorts.length !== expectedPortIds.length
    || unexpectedLivePorts.length > 0
    || missingOrDuplicateLivePorts.length > 0
  ) {
    blockers.push(
      "live port inventory does not contain exactly one row for every configured P0-P5 port"
    );
  }

  if (runtime?.session && runtime.session.state !== "stopped") {
    blockers.push(`persisted traffic session is ${runtime.session.state}, not stopped`);
  }
  const acquiredPorts = Array.isArray(ports?.ports)
    ? ports.ports.filter((port) => port?.acquired !== false)
    : [];
  if (acquiredPorts.length > 0) {
    blockers.push(
      `acceptance requires every port released; acquired: ${acquiredPorts.map((port) => `P${port.id}`).join(", ")}`
    );
  }
  if (!capturesAreClear(capture)) {
    blockers.push("capture recorders or capture leases are active");
  }
  return {
    ok: blockers.length === 0,
    blockers,
    group,
    connect_timeout_seconds: timingEnvironment.connect_timeout_seconds
  };
}

export function evaluateSessionAuthority(
  session,
  sessionId,
  groupId = targetGroupId,
  hardStopAt = undefined,
  expectedState = undefined
) {
  if (!isSessionId(sessionId)) {
    return { ok: false, reason: "expected session ID is missing or invalid" };
  }
  if (!session) {
    return { ok: false, reason: "persisted traffic session is missing" };
  }
  if (session.id !== sessionId) {
    return { ok: false, reason: "persisted traffic session ID changed" };
  }
  if (!Array.isArray(session.groups) || session.groups.length !== 1) {
    return { ok: false, reason: "persisted traffic session contains an extra or missing group" };
  }
  const [group] = session.groups;
  if (group?.group_id !== groupId || !isExactPorts(group?.ports, targetPorts)) {
    return { ok: false, reason: "persisted traffic session is not exactly pair-0 on P0/P1" };
  }
  if (hardStopAt !== undefined) {
    const expectedLease = expectedState === "stopped" ? null : hardStopAt;
    const leaseMatches = expectedLease === null
      ? group.hard_stop_at === null
      : sameCanonicalUtcInstant(group.hard_stop_at, expectedLease);
    if (!leaseMatches) {
      return {
        ok: false,
        reason: expectedState === "stopped"
          ? "stopped pair-0 session did not clear its hard-stop lease"
          : "active pair-0 session hard-stop lease changed"
      };
    }
  }
  return { ok: true, reason: null, group };
}

export function evaluateRuntimeAuthority(
  runtime,
  sessionId,
  groupId = targetGroupId,
  hardStopAt = undefined,
  expectedState = undefined,
  expectedPortIds = expectedConfiguredPortIds
) {
  const sessionAuthority = evaluateSessionAuthority(
    runtime?.session,
    sessionId,
    groupId,
    hardStopAt,
    expectedState
  );
  if (!sessionAuthority.ok) {
    return sessionAuthority;
  }
  const inventory = evaluateRuntimeInventoryAuthority(
    runtime,
    expectedPortIds
  );
  if (!inventory.ok) {
    return inventory;
  }
  const targetRows = targetPorts.map((port) => runtimePort(runtime, port));
  if (runtime.session.state === "stopped") {
    if (targetRows.some((row) => row.state !== "stopped" || row.ownership !== "none")) {
      return { ok: false, reason: "stopped pair-0 session does not leave P0/P1 stopped and unowned" };
    }
  } else if (
    targetRows.some(
      (row) =>
        !["running", "paused"].includes(row.state)
        || row.ownership !== "managed"
    )
  ) {
    return { ok: false, reason: "active pair-0 session does not exclusively own live P0/P1 traffic" };
  }
  return { ok: true, reason: null, group: sessionAuthority.group };
}

export function evaluateRuntimeStage(
  runtime,
  expectedState,
  sessionId,
  hardStopAt = undefined,
  expectedPortIds = expectedConfiguredPortIds
) {
  const authority = evaluateRuntimeAuthority(
    runtime,
    sessionId,
    targetGroupId,
    hardStopAt,
    expectedState,
    expectedPortIds
  );
  if (!authority.ok) {
    return { ...authority, ready: false, authority_changed: true };
  }
  if (runtime.session.state !== expectedState || authority.group.state !== expectedState) {
    return {
      ok: false,
      ready: false,
      authority_changed: false,
      reason: `session has not reached ${expectedState}`
    };
  }
  for (const port of targetPorts) {
    const state = runtimePort(runtime, port);
    if (state.state !== expectedState) {
      return {
        ok: false,
        ready: false,
        authority_changed: false,
        reason: `P${port} has not reached ${expectedState}`
      };
    }
    const expectedOwnership = expectedState === "stopped" ? "none" : "managed";
    if (state.ownership !== expectedOwnership) {
      return {
        ok: false,
        ready: false,
        authority_changed: true,
        reason: `P${port} ownership is ${state.ownership}, expected ${expectedOwnership}`
      };
    }
  }
  return { ok: true, ready: true, authority_changed: false, reason: null };
}

export function runtimeMatchesStage(
  runtime,
  expectedState,
  sessionId,
  hardStopAt = undefined,
  expectedPortIds = expectedConfiguredPortIds
) {
  return evaluateRuntimeStage(
    runtime,
    expectedState,
    sessionId,
    hardStopAt,
    expectedPortIds
  ).ready;
}

function assertRuntimeAuthority(
  runtime,
  sessionId,
  hardStopAt,
  expectedPortIds,
  stage
) {
  const evaluated = evaluateRuntimeAuthority(
    runtime,
    sessionId,
    targetGroupId,
    hardStopAt,
    runtime?.session?.state,
    expectedPortIds
  );
  if (!evaluated.ok) {
    throw new Error(`${stage} lost exact pair-0 session authority: ${evaluated.reason}`);
  }
  return evaluated;
}

async function requireCurrentRuntimeAuthority(
  result,
  options,
  sessionId,
  hardStopAt,
  expectedPortIds,
  stage
) {
  const runtime = (await apiJson(
    result,
    options,
    `${stage} authority`,
    "/api/trex/traffic/runtime"
  )).data;
  assertRuntimeAuthority(
    runtime,
    sessionId,
    hardStopAt,
    expectedPortIds,
    stage
  );
  return runtime;
}

export function cleanupOwnershipDecision(runtime, context) {
  const inventory = evaluateRuntimeInventoryAuthority(
    runtime,
    context.expectedPortIds ?? expectedConfiguredPortIds
  );
  if (!inventory.ok) {
    return { stop: false, safe: false, reason: inventory.reason };
  }
  if (runtime?.mutation_intent !== null) {
    return {
      stop: false,
      safe: false,
      reason: "a pending traffic mutation prevents safe cleanup ownership"
    };
  }
  if (
    context.startAttempted
    && !isSessionId(context.sessionId)
  ) {
    return {
      stop: false,
      safe: false,
      reason: "lost Start response requires persisted hard-stop lease recovery"
    };
  }
  const targetStateRows = targetPorts.map((port) => runtimePort(runtime, port));
  const activeTarget = targetStateRows.some(
    (row) => row?.state === "running" || row?.state === "paused" || row?.state === "unknown"
  );
  if (!activeTarget) {
    if (isSessionId(context.sessionId)) {
      const authority = evaluateRuntimeAuthority(
        runtime,
        context.sessionId,
        context.groupId,
        context.hardStopAt,
        "stopped",
        context.expectedPortIds ?? expectedConfiguredPortIds
      );
      if (!authority.ok) {
        return { stop: false, safe: false, reason: authority.reason };
      }
    }
    return { stop: false, safe: true, reason: "target ports already idle" };
  }
  if (!context.startAttempted || !isSessionId(context.sessionId)) {
    return {
      stop: false,
      safe: false,
      reason: "active target traffic cannot be stopped without the verified start response session ID"
    };
  }
  const authority = evaluateRuntimeAuthority(
    runtime,
    context.sessionId,
    context.groupId,
    context.hardStopAt,
    runtime?.session?.state,
    context.expectedPortIds ?? expectedConfiguredPortIds
  );
  if (!authority.ok) {
    return { stop: false, safe: false, reason: authority.reason };
  }
  if (targetStateRows.some((row) => !row || row.ownership !== "managed")) {
    return { stop: false, safe: false, reason: "target traffic is external or unowned" };
  }
  return { stop: true, safe: true, reason: "managed pair-0 session belongs to this gate" };
}

export function lostStartResponseLeaseDecision(runtime, context, nowMs = Date.now()) {
  const routeLease = exactRouteHardStopLease(context);
  if (
    !context.startAttempted
    || isSessionId(context.sessionId)
  ) {
    return {
      applicable: false,
      wait: false,
      safe: false,
      deadline: null,
      reason: "lost-start-response lease recovery does not apply"
    };
  }

  const deadline = routeLease.deadline;
  if (!routeLease.exact) {
    return {
      applicable: true,
      wait: false,
      safe: false,
      deadline,
      reason:
        "lost-start-response recovery requires the exact route-issued 60-second hard-stop lease"
    };
  }
  if (runtime?.live_state_sampled !== true) {
    const waitForFreshSample = runtime?.live_state_sampled === false
      && routeLease.exact
      && Number.isFinite(nowMs)
      && nowMs < deadline;
    return {
      applicable: true,
      wait: waitForFreshSample,
      safe: false,
      deadline,
      reason: waitForFreshSample
        ? "waiting for a fresh live TRex sample while the exact persisted hard-stop lease is under reaper priority"
        : runtime?.live_state_sampled === false
          ? "hard-stop lease recovery requires a fresh live TRex sample before cleanup can be safe"
          : "traffic runtime snapshot omitted the required live_state_sampled authority marker"
    };
  }
  const inventory = configuredRuntimeInventory(
    runtime,
    context.expectedPortIds
  );
  if (!inventory.ok) {
    return {
      applicable: true,
      wait: nowMs < deadline,
      safe: false,
      deadline,
      reason: `${inventory.reason} during lease-expiry recovery`
    };
  }
  const targetRows = targetPorts.map((port) => runtimePort(runtime, port));
  const concurrent = inventory.outsideRows.filter(
    (row) => row?.state !== "stopped" || row?.ownership !== "none"
  );
  if (concurrent.length > 0) {
    return {
      applicable: true,
      wait: false,
      safe: false,
      deadline,
      reason: `concurrent traffic exists outside P0/P1 during lease-expiry recovery on ${concurrent
        .map((row) => `P${row?.port}`)
        .join(", ")}`
    };
  }
  if (targetRows.some((row) => row.ownership === "external")) {
    return {
      applicable: true,
      wait: false,
      safe: false,
      deadline,
      reason: "P0/P1 traffic became externally owned during lease-expiry recovery"
    };
  }
  if (nowMs < deadline) {
    return {
      applicable: true,
      wait: true,
      safe: false,
      deadline,
      reason: "waiting for the persisted hard-stop lease deadline after the start response was lost"
    };
  }
  const targetIdle = targetRows.every(
    (row) => row.state === "stopped" && row.ownership === "none"
  );
  const targetGroup = Array.isArray(runtime?.session?.groups)
    ? runtime.session.groups.find(
        (group) => group?.group_id === context.groupId
          && isExactPorts(group?.ports, targetPorts)
      ) ?? null
    : null;
  const pendingStartGroup = runtime?.mutation_intent?.operation === "start"
    ? runtime.mutation_intent.start_group
    : null;
  const exactPendingStartLease = pendingStartGroup?.group_id === context.groupId
    && isExactPorts(pendingStartGroup?.ports, targetPorts)
    && sameCanonicalUtcInstant(
      pendingStartGroup?.hard_stop_at,
      context.hardStopAt
    );
  const mutationIntentCleared = runtime?.mutation_intent === null;
  const leaseCleared = targetGroup === null || targetGroup.hard_stop_at === null;
  if (targetIdle && mutationIntentCleared && leaseCleared) {
    return {
      applicable: true,
      wait: false,
      safe: true,
      deadline,
      reason: "persisted pair-0 hard-stop lease expired and left every traffic port idle"
    };
  }
  return {
    applicable: true,
    wait: false,
    safe: false,
    deadline,
    reason: !targetIdle
      ? "P0/P1 did not become stopped and unowned after the persisted hard-stop lease deadline"
      : !mutationIntentCleared
        ? exactPendingStartLease
          ? "the exact pair-0 Start WAL still holds the expired hard-stop lease"
          : "a concurrent pending traffic mutation remains after the hard-stop lease deadline"
        : "pair-0 remained bound to a hard-stop lease after its deadline"
  };
}

function apiBlocker(value) {
  const blocker = value?.blocker ?? value?.detail?.blocker;
  return typeof blocker === "string" && blocker !== "" ? blocker : null;
}

function apiRequestError(message, payload, status, httpFailure = null) {
  return Object.assign(new Error(message), {
    blocker: apiBlocker(payload),
    status,
    http_failure: httpFailure
  });
}

export function lostResponseRuntimeRetryDecision(
  error,
  context,
  nowMs = Date.now()
) {
  const routeLease = exactRouteHardStopLease(context);
  const blocker = typeof error === "string" ? error : apiBlocker(error);
  const deadline = routeLease.deadline;
  if (
    context?.startAttempted !== true
    || isSessionId(context?.sessionId)
    || !routeLease.exact
    || !retryableHardStopReadBlockers.has(blocker)
    || !Number.isFinite(nowMs)
    || nowMs >= deadline
  ) {
    return {
      retry: false,
      blocker,
      deadline,
      backoff_ms: 0
    };
  }
  return {
    retry: true,
    blocker,
    deadline,
    backoff_ms: Math.min(250, Math.max(1, deadline - nowMs))
  };
}

export function cleanupPlanRestorationAuthority(runtime, context) {
  const inventory = evaluateRuntimeInventoryAuthority(
    runtime,
    context.expectedPortIds ?? expectedConfiguredPortIds
  );
  if (!inventory.ok) {
    return { safe: false, reason: inventory.reason };
  }
  if (
    inventory.rows.some(
      (row) => row?.state !== "stopped" || row?.ownership !== "none"
    )
  ) {
    return {
      safe: false,
      reason: "fresh runtime does not leave every configured traffic port stopped and unowned"
    };
  }
  if (runtime?.mutation_intent !== null) {
    return {
      safe: false,
      reason: "a pending traffic mutation prevents traffic plan restoration"
    };
  }
  if (isSessionId(context.sessionId)) {
    const authority = evaluateRuntimeAuthority(
      runtime,
      context.sessionId,
      context.groupId ?? targetGroupId,
      context.hardStopAt,
      "stopped",
      context.expectedPortIds ?? expectedConfiguredPortIds
    );
    if (!authority.ok) {
      return { safe: false, reason: authority.reason };
    }
  } else {
    if (runtime?.session && runtime.session.state !== "stopped") {
      return {
        safe: false,
        reason: "persisted traffic session is not stopped"
      };
    }
    const targetGroup = Array.isArray(runtime?.session?.groups)
      ? runtime.session.groups.find(
          (group) => group?.group_id === (context.groupId ?? targetGroupId)
            && isExactPorts(group?.ports, targetPorts)
        ) ?? null
      : null;
    if (targetGroup !== null && targetGroup.hard_stop_at !== null) {
      return {
        safe: false,
        reason: "pair-0 remained bound to a hard-stop lease"
      };
    }
  }
  return {
    safe: true,
    reason: "fresh runtime proves every configured port idle with no pending mutation"
  };
}

export function planRestorationDecision(runtime, context) {
  const authority = cleanupPlanRestorationAuthority(runtime, context);
  if (!authority.safe) {
    return {
      safe: false,
      restore: false,
      reason: authority.reason,
      planRevision: runtime?.plan_revision ?? null
    };
  }
  if (jsonValuesEqual(runtime?.groups, context.originalGroups)) {
    return {
      safe: true,
      restore: false,
      reason: "backend plan already matches the preflight plan",
      planRevision: runtime?.plan_revision ?? null
    };
  }
  if (
    Number.isSafeInteger(context.savedRevision)
    && runtime?.plan_revision === context.savedRevision
    && jsonValuesEqual(runtime?.groups, context.savedGroups)
  ) {
    return {
      safe: true,
      restore: true,
      reason: "the exact gate-owned plan revision is still current",
      planRevision: context.savedRevision
    };
  }
  return {
    safe: false,
    restore: false,
    reason: "current traffic plan or revision differs from the exact gate write; refusing to overwrite",
    planRevision: runtime?.plan_revision ?? null
  };
}

export function acceptanceFailureMessages(result) {
  return [
    ...result.acceptance_errors.map((message) => `acceptance: ${message}`),
    ...result.page_errors.map((message) => `pageerror: ${message}`),
    ...result.console_errors.map((message) => `console error: ${message}`),
    ...result.request_failures.map(
      (failure) => `request failed: ${failure.method} ${failure.url} (${failure.error})`
    ),
    ...result.http_failures.map(
      (failure) => `HTTP ${failure.status}: ${failure.method} ${failure.url}`
    ),
    ...result.blocked_requests.map(
      (request) => `blocked write: ${request.method} ${request.url} (${request.reason})`
    ),
    ...result.unexpected_dialogs.map((message) => `unexpected dialog: ${message}`),
    ...result.cleanup.errors.map((message) => `cleanup: ${message}`)
  ];
}

function summarizeRuntime(runtime) {
  return {
    plan_revision: runtime?.plan_revision ?? null,
    session: runtime?.session ?? null,
    mutation_intent: runtime?.mutation_intent ?? null,
    live_state_sampled: runtime?.live_state_sampled ?? null,
    port_states: runtime?.port_states ?? [],
    reconciliation: runtime?.reconciliation ?? null
  };
}

async function loadGateContext(options) {
  if (!options.identityFile) {
    return {
      gate_id: options.gateId,
      identity_file: null,
      source: null,
      build: null
    };
  }
  const identity = JSON.parse(await readFile(options.identityFile, "utf8"));
  if (identity?.gate_id !== options.gateId) {
    throw new Error(
      `identity file gate_id ${JSON.stringify(identity?.gate_id)} does not match ${JSON.stringify(options.gateId)}`
    );
  }
  if (
    typeof identity?.source?.digest !== "string"
    || identity.source.digest === ""
    || typeof identity?.build?.digest !== "string"
    || identity.build.digest === ""
  ) {
    throw new Error("identity file does not contain source/build digests");
  }
  return {
    gate_id: options.gateId,
    identity_file: options.identityFile,
    source: identity.source ?? null,
    build: identity.build ?? null
  };
}

async function apiJson(
  result,
  options,
  stage,
  pathname,
  init = {},
  responseContract = "result-envelope"
) {
  const url = new URL(pathname, options.baseUrl).toString();
  const method = String(init.method ?? "GET").toUpperCase();
  const startedAt = new Date().toISOString();
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {})
      },
      signal: options.interruptSignal
        ? AbortSignal.any([
            AbortSignal.timeout(options.timeoutMs),
            options.interruptSignal
          ])
        : AbortSignal.timeout(options.timeoutMs)
    });
  } catch (error) {
    result.direct_requests.push({
      stage,
      method,
      url: compactUrl(url),
      started_at: startedAt,
      error: errorMessage(error)
    });
    throw error;
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  result.direct_requests.push({
    stage,
    method,
    url: compactUrl(url),
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: response.status,
    request_body: init.body ? parsedJson(init.body) : null,
    ok: response.ok,
    blocker: payload?.blocker ?? null,
    error: payload?.error ?? null
  });
  if (!response.ok) {
    const httpFailure = {
      method,
      url: compactUrl(url),
      status: response.status,
      source: "direct"
    };
    result.http_failures.push(httpFailure);
    throw apiRequestError(
      `${stage} failed with HTTP ${response.status}`,
      payload,
      response.status,
      httpFailure
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${stage} did not return a JSON object`);
  }
  if (
    responseContract === "result-envelope"
    && (payload.ok !== true || !payload.data)
  ) {
    throw apiRequestError(
      `${stage} backend result failed: ${payload?.blocker ?? "missing_data"} ${payload?.error ?? ""}`.trim(),
      payload,
      response.status
    );
  }
  if (
    responseContract !== "result-envelope"
    && responseContract !== "raw-object"
  ) {
    throw new Error(`${stage} used an unknown response contract`);
  }
  return payload;
}

async function preflight(result, options) {
  const [portsResult, runtimeResult, captureResult, environmentResult] = await Promise.all([
    apiJson(result, options, "preflight ports", "/api/trex/ports"),
    apiJson(result, options, "preflight traffic runtime", "/api/trex/traffic/runtime"),
    apiJson(result, options, "preflight capture status", "/api/trex/capture/status"),
    apiJson(
      result,
      options,
      "preflight system environment",
      "/api/system/environment",
      {},
      "raw-object"
    )
  ]);
  const evaluated = evaluatePreflight({
    ports: portsResult.data,
    runtime: runtimeResult.data,
    capture: captureResult.data,
    environment: environmentResult
  }, targetGroupId, expectedConfiguredPortIds);
  const livePorts = Array.isArray(portsResult.data.ports) ? portsResult.data.ports : [];
  const captures = Array.isArray(captureResult.data.captures) ? captureResult.data.captures : [];
  result.preflight = {
    ok: evaluated.ok,
    blockers: evaluated.blockers,
    target_group: evaluated.group,
    ports: targetPorts.map((port) => {
      const record = livePorts.find((candidate) => candidate.id === port);
      return {
        id: port,
        acquired: record?.acquired ?? null,
        link: record?.info?.link ?? record?.info?.link_status ?? null
      };
    }),
    traffic: summarizeRuntime(runtimeResult.data),
    connect_timeout_seconds: evaluated.connect_timeout_seconds,
    lost_response_grace_seconds: hardStopLeaseGraceMs / 1_000,
    timing_guarantee: browserWriteTimingGuarantee,
    capture_count: captures.length,
    managed_capture_ids: captureResult.data.service_mode?.managed_capture_ids ?? []
  };
  result.stages.push({
    name: "preflight",
    at: new Date().toISOString(),
    ok: evaluated.ok,
    blockers: evaluated.blockers,
    target_group: evaluated.group,
    connect_timeout_seconds: evaluated.connect_timeout_seconds,
    capture_count: captures.length
  });
  result.timing_contract = {
    connect_timeout_seconds: evaluated.connect_timeout_seconds,
    maximum_connect_timeout_seconds: maxRcConnectTimeoutSeconds,
    lost_response_grace_seconds: hardStopLeaseGraceMs / 1_000,
    hard_stop_lease_seconds: hardStopLeaseSeconds,
    hard_realtime_guarantee: false
  };
  if (!evaluated.ok) {
    throw new Error(`write acceptance preflight blocked: ${evaluated.blockers.join("; ")}`);
  }
  return {
    ports: portsResult.data,
    runtime: runtimeResult.data,
    capture: captureResult.data,
    environment: environmentResult,
    connectTimeoutSeconds: evaluated.connect_timeout_seconds,
    expectedPortIds: [...expectedConfiguredPortIds],
    group: structuredClone(evaluated.group)
  };
}

async function pollRuntime(result, options, stage, predicate) {
  const deadline = Date.now() + options.timeoutMs;
  let latest = null;
  while (Date.now() <= deadline) {
    const response = await apiJson(result, options, stage, "/api/trex/traffic/runtime");
    latest = response.data;
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${stage} timed out; latest runtime: ${JSON.stringify(summarizeRuntime(latest))}`);
}

function exactStageIsReady(
  runtime,
  expectedState,
  sessionId,
  hardStopAt,
  expectedPortIds,
  stage
) {
  const evaluated = evaluateRuntimeStage(
    runtime,
    expectedState,
    sessionId,
    hardStopAt,
    expectedPortIds
  );
  if (evaluated.authority_changed) {
    throw new Error(`${stage} lost exact pair-0 session authority: ${evaluated.reason}`);
  }
  return evaluated.ready;
}

export function assertPersistedStartResponse(
  payload,
  hardStopIssuedAt,
  hardStopAt,
  label = "group start"
) {
  if (!exactRouteHardStopLease({ hardStopIssuedAt, hardStopAt }).exact) {
    throw new Error(`${label} did not use the exact route-issued canonical UTC lease`);
  }
  if (
    payload?.ok !== true
    || payload.data?.accepted !== true
    || payload.data?.state_persisted !== true
    || !isExactPorts(payload.data?.ports, targetPorts)
    || !isSessionId(payload.data?.session?.id)
    || payload.data.session.state !== "running"
  ) {
    throw new Error(`${label} response did not prove a persisted running P0/P1 session`);
  }
  const sessionAuthority = evaluateSessionAuthority(
    payload.data.session,
    payload.data.session.id,
    targetGroupId,
    hardStopAt,
    "running"
  );
  if (!sessionAuthority.ok) {
    throw new Error(
      `${label} response did not prove exact pair-0 session authority: ${sessionAuthority.reason}`
    );
  }
  return payload.data.session.id;
}

async function requireCurrentStartAuthority(result, options, state) {
  const runtime = (await apiJson(
    result,
    options,
    "before start P0/P1 authority",
    "/api/trex/traffic/runtime"
  )).data;
  const inventory = evaluateRuntimeInventoryAuthority(
    runtime,
    state.expectedPortIds
  );
  if (!inventory.ok) {
    throw new Error(
      `before start P0/P1 lost exact configured-port authority: ${inventory.reason}`
    );
  }
  const nonIdle = inventory.rows.filter(
    (row) => row?.state !== "stopped" || row?.ownership !== "none"
  );
  if (nonIdle.length > 0) {
    throw new Error(
      `before start P0/P1 requires every configured port stopped and unowned: ${nonIdle
        .map((row) => `P${row?.port}`)
        .join(", ")}`
    );
  }
  if (
    runtime.plan_revision !== state.savedRevision
    || !jsonValuesEqual(runtime.groups, state.savedGroups)
  ) {
    throw new Error(
      "before start P0/P1 traffic plan or revision differs from the exact gate write"
    );
  }
  if (runtime.session && runtime.session.state !== "stopped") {
    throw new Error(
      `before start P0/P1 found persisted session state ${runtime.session.state}`
    );
  }
  return runtime;
}

export function assertPersistedAction(
  payload,
  action,
  sessionId,
  expectedPorts,
  hardStopAt = undefined,
  label = action
) {
  if (
    payload?.ok !== true
    || payload.data?.accepted !== true
    || payload.data?.action !== action
    || payload.data?.state_persisted !== true
    || !payload.data?.session?.id
    || payload.data.session.id !== sessionId
  ) {
    throw new Error(`${label} response did not prove persisted session authority`);
  }
  if (expectedPorts && !isExactPorts(payload.data.ports, expectedPorts)) {
    throw new Error(`${label} response ports do not match ${JSON.stringify(expectedPorts)}`);
  }
  const sessionAuthority = evaluateSessionAuthority(
    payload.data.session,
    sessionId,
    targetGroupId,
    hardStopAt,
    action === "stop" ? "stopped" : payload.data.session.state
  );
  if (!sessionAuthority.ok) {
    throw new Error(
      `${label} response lost exact pair-0 session authority: ${sessionAuthority.reason}`
    );
  }
}

async function responseJson(response, label) {
  if (!response.ok()) {
    throw new Error(`${label} failed with HTTP ${response.status()}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${errorMessage(error)}`);
  }
  if (payload?.ok !== true || !payload.data) {
    throw new Error(
      `${label} backend result failed: ${payload?.blocker ?? "missing_data"} ${payload?.error ?? ""}`.trim()
    );
  }
  return payload;
}

function responseMatches(response, method, pathname) {
  return response.request().method() === method
    && new URL(response.url()).pathname === pathname;
}

export async function clickForResponse(page, locator, method, pathname, timeoutMs) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => responseMatches(candidate, method, pathname),
      { timeout: timeoutMs }
    ),
    locator.click()
  ]);
  return response;
}

async function exerciseUi(page, result, options, state) {
  const navigation = await page.goto(options.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs
  });
  if (!navigation?.ok()) {
    throw new Error(`production document navigation failed with HTTP ${navigation?.status() ?? "no response"}`);
  }
  await page.locator(".workbench-shell").waitFor({ state: "visible", timeout: options.timeoutMs });
  result.stages.push({ name: "production-ui-loaded", at: new Date().toISOString() });

  await page.getByRole("button", { name: "Traffic Profiles", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Traffic Profiles", exact: true });
  await dialog.waitFor({ state: "visible", timeout: options.timeoutMs });
  const region = dialog.getByRole("region", { name: "Port pair traffic plan", exact: true });
  await region.waitFor({ state: "visible", timeout: options.timeoutMs });
  const rowName = `${state.group.name} ports P0 and P1`;
  const row = region.getByRole("row", { name: rowName, exact: true });
  await row.waitFor({ state: "visible", timeout: options.timeoutMs });

  const rateInput = row.getByRole("textbox", {
    name: `Multiplier or rate for ${state.group.name}`,
    exact: true
  });
  const originalRate = await rateInput.inputValue();
  if (originalRate !== state.group.multiplier) {
    throw new Error(
      `UI multiplier ${JSON.stringify(originalRate)} does not match backend plan ${JSON.stringify(state.group.multiplier)}`
    );
  }
  const temporaryRate = originalRate === boundedMultiplier ? "2kpps" : boundedMultiplier;
  await rateInput.fill(temporaryRate);
  await rateInput.fill(boundedMultiplier);
  const durationInput = row.getByRole("spinbutton", {
    name: `Duration for ${state.group.name}`,
    exact: true
  });
  await durationInput.fill(String(unboundedTrafficDuration));

  const saveButton = region.getByRole("button", { name: "Save traffic plan", exact: true });
  await saveButton.waitFor({ state: "visible", timeout: options.timeoutMs });
  const saveResponse = await clickForResponse(
    page,
    saveButton,
    "PUT",
    "/api/trex/traffic/plan",
    options.timeoutMs
  );
  const savePayload = await responseJson(saveResponse, "Save traffic plan");
  if (
    !Number.isSafeInteger(savePayload.data.plan_revision)
    || savePayload.data.plan_revision <= state.initialRevision
    || !jsonValuesEqual(savePayload.data.groups, state.savedGroups)
  ) {
    throw new Error("Save traffic plan did not persist the bounded low-rate plan or advance its revision");
  }
  state.savedRevision = savePayload.data.plan_revision;
  state.routePolicy.savedRevision = state.savedRevision;
  const savedRuntime = await pollRuntime(
    result,
    options,
    "saved plan runtime",
    (runtime) =>
      runtime.plan_revision === state.savedRevision
      && jsonValuesEqual(runtime.groups, state.savedGroups)
  );
  result.stages.push({
    name: "plan-saved",
    at: new Date().toISOString(),
    state_persisted: true,
    plan_revision: state.savedRevision,
    bounded_multiplier: boundedMultiplier,
    traffic_duration: unboundedTrafficDuration,
    safety_authority: "persisted group hard-stop lease",
    runtime: summarizeRuntime(savedRuntime)
  });

  const startPath = `/api/trex/traffic/group/${encodeURIComponent(targetGroupId)}/start`;
  const startButton = row.getByRole("button", { name: `Start ${state.group.name}`, exact: true });
  await requireCurrentStartAuthority(result, options, state);
  state.startAttempted = true;
  state.startAttemptedAt = Date.now();
  const startResponse = await clickForResponse(
    page,
    startButton,
    "POST",
    startPath,
    options.timeoutMs
  );
  const startPayload = await responseJson(startResponse, `Start ${state.group.name}`);
  state.sessionId = assertPersistedStartResponse(
    startPayload,
    state.hardStopIssuedAt,
    state.hardStopAt,
    `Start ${state.group.name}`
  );
  state.routePolicy.sessionId = state.sessionId;
  const runningRuntime = await pollRuntime(
    result,
    options,
    "running runtime",
    (runtime) => exactStageIsReady(
      runtime,
      "running",
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      "running runtime"
    )
  );
  result.stages.push({
    name: "running",
    at: new Date().toISOString(),
    state_persisted: startPayload.data.state_persisted,
    session_id: state.sessionId,
    hard_stop_at: state.hardStopAt,
    runtime: summarizeRuntime(runningRuntime)
  });

  await page.getByTitle("Close Traffic Profiles", { exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: options.timeoutMs });

  for (const port of targetPorts) {
    await requireCurrentRuntimeAuthority(
      result,
      options,
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      `before pause P${port}`
    );
    await page.getByRole("treeitem", { name: new RegExp(`^Port ${port}(?:\\s|$)`) }).click();
    const response = await clickForResponse(
      page,
      page.getByRole("button", { name: "Pause selected port", exact: true }),
      "POST",
      "/api/trex/traffic/pause",
      options.timeoutMs
    );
    const payload = await responseJson(response, `Pause P${port}`);
    assertPersistedAction(
      payload,
      "pause",
      state.sessionId,
      [port],
      state.hardStopAt
    );
    const actionRuntime = (await apiJson(
      result,
      options,
      `pause P${port} authority`,
      "/api/trex/traffic/runtime"
    )).data;
    assertRuntimeAuthority(
      actionRuntime,
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      `pause P${port}`
    );
    result.stages.push({
      name: `pause-P${port}-accepted`,
      at: new Date().toISOString(),
      state_persisted: payload.data.state_persisted,
      session_state: payload.data.session.state,
      runtime: summarizeRuntime(actionRuntime)
    });
  }
  const pausedRuntime = await pollRuntime(
    result,
    options,
    "paused runtime",
    (runtime) => exactStageIsReady(
      runtime,
      "paused",
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      "paused runtime"
    )
  );
  result.stages.push({
    name: "paused",
    at: new Date().toISOString(),
    state_persisted: true,
    session_id: state.sessionId,
    runtime: summarizeRuntime(pausedRuntime)
  });

  for (const port of targetPorts) {
    await requireCurrentRuntimeAuthority(
      result,
      options,
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      `before resume P${port}`
    );
    await page.getByRole("treeitem", { name: new RegExp(`^Port ${port}(?:\\s|$)`) }).click();
    const response = await clickForResponse(
      page,
      page.getByRole("button", { name: "Resume selected port", exact: true }),
      "POST",
      "/api/trex/traffic/resume",
      options.timeoutMs
    );
    const payload = await responseJson(response, `Resume P${port}`);
    assertPersistedAction(
      payload,
      "resume",
      state.sessionId,
      [port],
      state.hardStopAt
    );
    const actionRuntime = (await apiJson(
      result,
      options,
      `resume P${port} authority`,
      "/api/trex/traffic/runtime"
    )).data;
    assertRuntimeAuthority(
      actionRuntime,
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      `resume P${port}`
    );
    result.stages.push({
      name: `resume-P${port}-accepted`,
      at: new Date().toISOString(),
      state_persisted: payload.data.state_persisted,
      session_state: payload.data.session.state,
      runtime: summarizeRuntime(actionRuntime)
    });
  }
  const resumedRuntime = await pollRuntime(
    result,
    options,
    "resumed runtime",
    (runtime) => exactStageIsReady(
      runtime,
      "running",
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      "resumed runtime"
    )
  );
  result.stages.push({
    name: "resumed",
    at: new Date().toISOString(),
    state_persisted: true,
    session_id: state.sessionId,
    runtime: summarizeRuntime(resumedRuntime)
  });

  await requireCurrentRuntimeAuthority(
    result,
    options,
    state.sessionId,
    state.hardStopAt,
    state.expectedPortIds,
    "before stop P0/P1"
  );
  const stopResponse = await clickForResponse(
    page,
    page.getByRole("button", { name: "Stop all ports", exact: true }),
    "POST",
    "/api/trex/traffic/stop",
    options.timeoutMs
  );
  const stopPayload = await responseJson(stopResponse, "Stop all ports");
  assertPersistedAction(
    stopPayload,
    "stop",
    state.sessionId,
    targetPorts,
    state.hardStopAt
  );
  const stoppedRuntime = await pollRuntime(
    result,
    options,
    "stopped runtime",
    (runtime) => exactStageIsReady(
      runtime,
      "stopped",
      state.sessionId,
      state.hardStopAt,
      state.expectedPortIds,
      "stopped runtime"
    )
  );
  result.stages.push({
    name: "stopped",
    at: new Date().toISOString(),
    state_persisted: stopPayload.data.state_persisted,
    session_id: state.sessionId,
    hard_stop_lease_cleared: true,
    runtime: summarizeRuntime(stoppedRuntime)
  });
}

export async function cleanupProductionBrowserWriteAcceptance(
  result,
  options,
  state
) {
  result.cleanup.attempted = true;
  let runtime = null;
  let planRestoreSafe = false;
  try {
    runtime = (await apiJson(
      result,
      options,
      "cleanup traffic runtime",
      "/api/trex/traffic/runtime"
    )).data;
    let decision = cleanupOwnershipDecision(runtime, {
      groupId: targetGroupId,
      sessionId: state.sessionId,
      startAttempted: state.startAttempted,
      hardStopAt: state.hardStopAt,
      expectedPortIds: state.expectedPortIds
    });
    let lostResponseRecovery = lostStartResponseLeaseDecision(runtime, {
      ...state,
      groupId: targetGroupId
    });
    if (!decision.safe && lostResponseRecovery.applicable) {
      const startedAt = new Date().toISOString();
      while (lostResponseRecovery.wait) {
        const remainingMs = Math.max(0, lostResponseRecovery.deadline - Date.now());
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, remainingMs)));
        try {
          runtime = (await apiJson(
            result,
            options,
            "cleanup hard-stop lease runtime",
            "/api/trex/traffic/runtime"
          )).data;
        } catch (error) {
          const retry = lostResponseRuntimeRetryDecision(
            error,
            state,
            Date.now()
          );
          if (!retry.retry) {
            throw error;
          }
          if (error?.http_failure) {
            const failureIndex = result.http_failures.indexOf(
              error.http_failure
            );
            if (failureIndex >= 0) {
              result.http_failures.splice(failureIndex, 1);
            }
          }
          result.cleanup.lease_expiry_retries.push({
            at: new Date().toISOString(),
            blocker: retry.blocker,
            retry_after_ms: retry.backoff_ms,
            deadline: new Date(retry.deadline).toISOString(),
            session_adopted: false
          });
          await new Promise((resolve) =>
            setTimeout(resolve, retry.backoff_ms)
          );
          continue;
        }
        lostResponseRecovery = lostStartResponseLeaseDecision(runtime, {
          ...state,
          groupId: targetGroupId
        });
      }
      result.cleanup.lease_expiry_recovery = {
        attempted: true,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        deadline: lostResponseRecovery.deadline === null
          ? null
          : new Date(lostResponseRecovery.deadline).toISOString(),
        safe: lostResponseRecovery.safe,
        reason: lostResponseRecovery.reason
      };
      decision = lostResponseRecovery.safe
        ? {
            stop: false,
            safe: true,
            reason: lostResponseRecovery.reason
          }
        : {
            stop: false,
            safe: false,
            reason: lostResponseRecovery.reason
          };
    }
    result.cleanup.ownership_decision = decision;
    if (!decision.safe) {
      result.cleanup.errors.push(decision.reason);
    } else if (decision.stop) {
      const stopResult = await apiJson(
        result,
        options,
        "cleanup stop pair-0",
        "/api/trex/traffic/stop",
        {
          method: "POST",
          body: JSON.stringify({
            ports: targetPorts,
            confirmation: "stop",
            expected_session_id: state.sessionId
          })
        }
      );
      assertPersistedAction(
        stopResult,
        "stop",
        state.sessionId,
        targetPorts,
        state.hardStopAt,
        "cleanup stop"
      );
      result.cleanup.stop_request = {
        ports: targetPorts,
        expected_session_id: state.sessionId,
        ok: stopResult.ok,
        state_persisted: stopResult.data?.state_persisted ?? false,
        session_id: stopResult.data?.session?.id ?? null,
        hard_stop_lease_cleared: true
      };
      if (stopResult.data?.state_persisted !== true) {
        result.cleanup.errors.push("cleanup stop did not persist the session state");
      }
      const stoppedRuntime = (await apiJson(
        result,
        options,
        "cleanup stopped runtime authority",
        "/api/trex/traffic/runtime"
      )).data;
      const stoppedAuthority = cleanupPlanRestorationAuthority(
        stoppedRuntime,
        {
          ...state,
          groupId: targetGroupId
        }
      );
      result.cleanup.stop_verification = {
        safe: stoppedAuthority.safe,
        reason: stoppedAuthority.reason,
        runtime: summarizeRuntime(stoppedRuntime)
      };
      runtime = stoppedRuntime;
      if (!stoppedAuthority.safe) {
        result.cleanup.errors.push(stoppedAuthority.reason);
      } else {
        planRestoreSafe = true;
      }
    } else {
      const idleAuthority = cleanupPlanRestorationAuthority(runtime, {
        ...state,
        groupId: targetGroupId
      });
      if (!idleAuthority.safe) {
        result.cleanup.errors.push(idleAuthority.reason);
      } else {
        planRestoreSafe = true;
      }
    }
  } catch (error) {
    result.cleanup.errors.push(errorMessage(error));
  }

  if (state.planWriteAttempted && planRestoreSafe) {
    try {
      const planRuntime = (await apiJson(
        result,
        options,
        "cleanup plan runtime",
        "/api/trex/traffic/runtime"
      )).data;
      const restoration = planRestorationDecision(planRuntime, state);
      if (!restoration.restore && restoration.safe) {
        result.cleanup.plan_restoration = {
          attempted: false,
          restored: true,
          reason: restoration.reason,
          plan_revision: planRuntime.plan_revision
        };
      } else if (restoration.restore) {
        const restoreResult = await apiJson(
          result,
          options,
          "cleanup restore traffic plan",
          "/api/trex/traffic/plan",
          {
            method: "PUT",
            body: JSON.stringify({
              plan_revision: restoration.planRevision,
              groups: state.originalGroups
            })
          }
        );
        const restored = jsonValuesEqual(restoreResult.data.groups, state.originalGroups);
        result.cleanup.plan_restoration = {
          attempted: true,
          restored,
          reason: restored ? "preflight plan restored" : "restore response did not match preflight plan",
          plan_revision: restoreResult.data.plan_revision
        };
        if (!restored) {
          result.cleanup.errors.push("traffic plan restore response does not match the preflight plan");
        }
      } else {
        result.cleanup.plan_restoration = {
          attempted: false,
          restored: false,
          reason: restoration.reason,
          plan_revision: planRuntime.plan_revision
        };
        result.cleanup.errors.push(result.cleanup.plan_restoration.reason);
      }
    } catch (error) {
      result.cleanup.errors.push(`traffic plan restoration failed: ${errorMessage(error)}`);
    }
  } else if (state.planWriteAttempted) {
    result.cleanup.plan_restoration = {
      attempted: false,
      restored: false,
      reason: "traffic session authority is unsafe; refusing to restore the traffic plan",
      plan_revision: runtime?.plan_revision ?? null
    };
    result.cleanup.errors.push(result.cleanup.plan_restoration.reason);
  }

  try {
    const [runtimeResult, portsResult, captureResult] = await Promise.all([
      apiJson(result, options, "cleanup final traffic runtime", "/api/trex/traffic/runtime"),
      apiJson(result, options, "cleanup final ports", "/api/trex/ports"),
      apiJson(result, options, "cleanup final capture status", "/api/trex/capture/status")
    ]);
    runtime = runtimeResult.data;
    const liveStateSampled = runtime?.live_state_sampled === true;
    const finalPortStates = targetPorts.map((port) => runtimePort(runtime, port));
    const targetIdle = liveStateSampled && finalPortStates.every(
      (row) => row?.state === "stopped" && row?.ownership === "none"
    );
    const targetReleased = targetPorts.every(
      (port) => portsResult.data.ports.find((candidate) => candidate.id === port)?.acquired === false
    );
    const finalInventory = liveStateSampled
      ? configuredRuntimeInventory(runtime, state.expectedPortIds)
      : {
          ok: false,
          reason: "cleanup final runtime did not contain freshly sampled live TRex port state"
        };
    const outsideTargetIdle = finalInventory.ok
      && finalInventory.outsideRows.every(
        (row) => row?.state === "stopped" && row?.ownership === "none"
      );
    const captureClear = capturesAreClear(captureResult.data);
    const planRestored = !state.planWriteAttempted
      || jsonValuesEqual(runtime.groups, state.originalGroups);
    const persistedTargetGroup = Array.isArray(runtime?.session?.groups)
      ? runtime.session.groups.find(
          (group) => group?.group_id === targetGroupId
            && isExactPorts(group?.ports, targetPorts)
        ) ?? null
      : null;
    const mutationIntentCleared = runtime?.mutation_intent === null;
    const hardStopLeaseCleared = state.hardStopAt === null
      || (mutationIntentCleared && (
        persistedTargetGroup === null
        || persistedTargetGroup.hard_stop_at === null
      ));
    result.cleanup.final = {
      live_state_sampled: liveStateSampled,
      target_idle: targetIdle,
      outside_target_idle: outsideTargetIdle,
      configured_port_inventory_complete: finalInventory.ok,
      target_released: targetReleased,
      captures_zero: captureClear,
      plan_restored: planRestored,
      hard_stop_at: state.hardStopAt,
      hard_stop_lease_cleared: hardStopLeaseCleared,
      mutation_intent_cleared: mutationIntentCleared,
      connect_timeout_seconds: result.timing_contract.connect_timeout_seconds,
      maximum_connect_timeout_seconds:
        result.timing_contract.maximum_connect_timeout_seconds,
      lost_response_grace_seconds:
        result.timing_contract.lost_response_grace_seconds,
      hard_realtime_guarantee: false,
      runtime: summarizeRuntime(runtime),
      ports: targetPorts.map((port) => {
        const row = portsResult.data.ports.find((candidate) => candidate.id === port);
        return { id: port, acquired: row?.acquired ?? null };
      }),
      capture_count: captureResult.data.captures.length,
      managed_capture_ids: captureResult.data.service_mode?.managed_capture_ids ?? []
    };
    if (!targetIdle) {
      result.cleanup.errors.push("P0/P1 are not stopped and unowned after cleanup");
    }
    if (!outsideTargetIdle) {
      result.cleanup.errors.push(
        finalInventory.ok
          ? "concurrent traffic remains outside P0/P1 after cleanup"
          : `configured traffic inventory is incomplete after cleanup: ${finalInventory.reason}`
      );
    }
    if (!targetReleased) {
      result.cleanup.errors.push("P0/P1 are not released after cleanup");
    }
    if (!captureClear) {
      result.cleanup.errors.push("capture recorders or leases remain after cleanup");
    }
    if (!planRestored) {
      result.cleanup.errors.push("traffic plan does not match the preflight plan after cleanup");
    }
    if (!hardStopLeaseCleared) {
      result.cleanup.errors.push("pair-0 hard-stop lease remains after cleanup");
    }
    if (!mutationIntentCleared) {
      result.cleanup.errors.push("a pending traffic mutation remains after cleanup");
    }
  } catch (error) {
    result.cleanup.errors.push(errorMessage(error));
  }
}

export async function runProductionBrowserWriteAcceptance(options) {
  assertProjectNodeVersion();
  await mkdir(path.dirname(options.output), { recursive: true });
  const generatedAt = new Date().toISOString();
  const result = {
    workflow: "production-browser-write-acceptance",
    verdict: "fail",
    generated_at: generatedAt,
    completed_at: null,
    interrupted_by_signal: null,
    base_url: options.baseUrl,
    runtime: { node: process.version, browser: null },
    gate_context: null,
    target: { group_id: targetGroupId, ports: targetPorts },
    hard_stop_lease: null,
    timing_contract: {
      connect_timeout_seconds: null,
      maximum_connect_timeout_seconds: maxRcConnectTimeoutSeconds,
      lost_response_grace_seconds: hardStopLeaseGraceMs / 1_000,
      hard_stop_lease_seconds: hardStopLeaseSeconds,
      hard_realtime_guarantee: false
    },
    expected_browser_write_sequence: expectedBrowserWriteSequence,
    preflight: null,
    observed_requests: [],
    allowed_write_requests: [],
    blocked_requests: [],
    direct_requests: [],
    stages: [],
    dialogs: [],
    unexpected_dialogs: [],
    request_failures: [],
    http_failures: [],
    page_errors: [],
    console_errors: [],
    acceptance_errors: [],
    cleanup: {
      attempted: false,
      ownership_decision: null,
      stop_request: null,
      stop_verification: null,
      lease_expiry_recovery: null,
      lease_expiry_retries: [],
      plan_restoration: null,
      final: null,
      errors: []
    }
  };
  const state = {
    initialRevision: null,
    savedRevision: null,
    originalGroups: [],
    savedGroups: [],
    group: null,
    sessionId: null,
    startAttempted: false,
    startAttemptedAt: null,
    hardStopAt: null,
    hardStopIssuedAt: null,
    expectedPortIds: [],
    planWriteAttempted: false,
    sequenceIndex: 0,
    routePolicy: null,
    interruptedSignal: null
  };
  let browser = null;
  let context = null;
  let page = null;
  let collecting = true;
  let emergencyCleanupPromise = null;
  const interruptController = new AbortController();
  const executionOptions = {
    ...options,
    interruptSignal: interruptController.signal
  };
  const closeBrowserResources = async () => {
    collecting = false;
    const closingContext = context;
    const closingBrowser = browser;
    context = null;
    browser = null;
    page = null;
    const failures = [];
    if (closingContext) {
      try {
        await closingContext.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (closingBrowser) {
      try {
        await closingBrowser.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "unable to close the production browser");
    }
  };
  const cleanupOnce = createIdempotentAsyncAction(() =>
    cleanupProductionBrowserWriteAcceptance(
      result,
      state.interruptedSignal
        ? {
            ...options,
            timeoutMs: Math.min(options.timeoutMs, emergencyRequestTimeoutMs)
          }
        : options,
      state
    )
  );
  const emergencyCleanup = createEmergencyCleanupCoordinator({
    recordSignal(signal) {
      state.interruptedSignal = signal;
      result.interrupted_by_signal = signal;
      result.acceptance_errors.push(
        `${signal} interrupted production browser write acceptance`
      );
      interruptController.abort(new Error(`${signal} interrupted browser acceptance`));
    },
    closeBrowser: closeBrowserResources,
    cleanup: cleanupOnce
  });
  const signalHandlers = new Map(
    handledSignals.map((signal) => [
      signal,
      () => {
        emergencyCleanupPromise = emergencyCleanup.request(signal).catch((error) => {
          result.cleanup.errors.push(
            `${signal} emergency cleanup failed: ${errorMessage(error)}`
          );
        });
      }
    ])
  );
  for (const [signal, handler] of signalHandlers) {
    process.on(signal, handler);
  }
  const assertNotInterrupted = (stage) => {
    if (state.interruptedSignal) {
      throw new Error(`${stage} aborted by ${state.interruptedSignal}`);
    }
  };

  try {
    result.gate_context = await loadGateContext(options);
    const preflightState = await preflight(result, executionOptions);
    assertNotInterrupted("preflight");
    state.initialRevision = preflightState.runtime.plan_revision;
    state.expectedPortIds = structuredClone(preflightState.expectedPortIds);
    state.originalGroups = structuredClone(preflightState.runtime.groups);
    state.savedGroups = structuredClone(preflightState.runtime.groups).map((group) =>
      group.id === targetGroupId
        ? {
            ...group,
            multiplier: boundedMultiplier,
            duration: unboundedTrafficDuration
          }
        : group
    );
    state.group = structuredClone(preflightState.group);
    state.routePolicy = {
      baseOrigin: new URL(options.baseUrl).origin,
      groupId: targetGroupId,
      initialRevision: state.initialRevision,
      savedRevision: null,
      sessionId: null,
      hardStopAt: null,
      hardStopIssuedAt: null,
      savedGroups: state.savedGroups
    };

    const { chromium } = await import("playwright");
    assertNotInterrupted("browser launch");
    browser = await chromium.launch({ headless: true });
    assertNotInterrupted("browser launch");
    result.runtime.browser = { engine: "chromium", version: browser.version() };
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    assertNotInterrupted("browser context creation");
    await context.addInitScript(() => {
      Object.defineProperty(window, "EventSource", { configurable: true, value: undefined });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const record = requestRecord(request);
      const postData = request.postData();
      if (collecting) {
        result.observed_requests.push(record);
      }
      const hardened = hardenBrowserActionRequest(
        { method: record.method, url: request.url(), postData },
        state.routePolicy
      );
      if (!hardened.allowed) {
        if (collecting) {
          result.blocked_requests.push({ ...record, reason: hardened.reason });
        }
        await route.abort("blockedbyclient");
        return;
      }
      const classificationPolicy = hardened.hardStopLease
        ? {
            ...state.routePolicy,
            hardStopAt: hardened.hardStopLease.hard_stop_at,
            hardStopIssuedAt: hardened.hardStopLease.issued_at
          }
        : state.routePolicy;
      const classification = classifyBrowserRequest(
        hardened.request,
        classificationPolicy
      );
      if (!classification.allowed) {
        if (collecting) {
          result.blocked_requests.push({ ...record, reason: classification.reason });
        }
        await route.abort("blockedbyclient");
        return;
      }
      if (classification.action !== "read") {
        const sequence = consumeExpectedBrowserWrite(state.sequenceIndex, classification.action);
        if (!sequence.allowed) {
          if (collecting) {
            result.blocked_requests.push({ ...record, reason: sequence.reason });
          }
          await route.abort("blockedbyclient");
          return;
        }
        state.sequenceIndex = sequence.nextIndex;
        if (classification.action === "save-plan") {
          state.planWriteAttempted = true;
        }
        if (classification.action === "start-group") {
          state.hardStopAt = classification.hardStopLease.hard_stop_at;
          state.hardStopIssuedAt = classification.hardStopLease.issued_at;
          state.routePolicy.hardStopAt = state.hardStopAt;
          state.routePolicy.hardStopIssuedAt = state.hardStopIssuedAt;
          result.hard_stop_lease = {
            ...classification.hardStopLease,
            source: "browser route rewrite",
            session_binding: "exact start response only"
          };
        }
        if (collecting) {
          result.allowed_write_requests.push({
            ...record,
            action: classification.action,
            body: classification.body,
            hard_stop_lease: classification.hardStopLease ?? null
          });
        }
      }
      await route.continue(
        hardened.rewritten ? { postData: hardened.request.postData } : undefined
      );
    });
    page = await context.newPage();
    page.on("pageerror", (error) => {
      if (collecting) {
        result.page_errors.push(errorMessage(error));
      }
    });
    page.on("console", (message) => {
      if (collecting && message.type() === "error") {
        result.console_errors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      if (collecting) {
        result.request_failures.push({
          ...requestRecord(request),
          error: request.failure()?.errorText ?? "unknown network failure"
        });
      }
    });
    page.on("response", (response) => {
      if (collecting && response.status() >= 400) {
        result.http_failures.push({
          ...requestRecord(response.request()),
          status: response.status(),
          source: "browser"
        });
      }
    });
    page.on("dialog", async (dialog) => {
      const message = dialog.message();
      const accepted = dialog.type() === "confirm"
        && (
          message.startsWith(`Start ${state.group.name} on P0 ↔ P1`)
          || message === "Stop traffic on all ports?"
        );
      result.dialogs.push({ type: dialog.type(), message, accepted });
      if (!accepted) {
        result.unexpected_dialogs.push(`${dialog.type()}: ${message}`);
        await dialog.dismiss();
        return;
      }
      await dialog.accept();
    });

    await exerciseUi(page, result, executionOptions, state);
    assertNotInterrupted("browser write sequence");
    if (state.sequenceIndex !== expectedBrowserWriteSequence.length) {
      throw new Error(
        `browser write sequence incomplete: ${state.sequenceIndex}/${expectedBrowserWriteSequence.length}`
      );
    }
  } catch (error) {
    result.acceptance_errors.push(errorMessage(error));
  } finally {
    try {
      if (emergencyCleanupPromise) {
        await emergencyCleanupPromise;
      }
      try {
        await cleanupOnce();
      } catch (error) {
        result.cleanup.errors.push(`final cleanup failed: ${errorMessage(error)}`);
      }
      const failures = acceptanceFailureMessages(result);
      if (failures.length > 0 && !page && !state.interruptedSignal) {
        try {
          const { chromium } = await import("playwright");
          browser ??= await chromium.launch({ headless: true });
          result.runtime.browser ??= { engine: "chromium", version: browser.version() };
          context ??= await browser.newContext({ viewport: { width: 1440, height: 900 } });
          page = await context.newPage();
          await page.setContent(
            `<main style="font:16px/1.5 monospace;padding:32px"><h1>TRex WebUI write acceptance blocked</h1><pre>${escapeHtml(failures.join("\n"))}</pre></main>`
          );
        } catch (error) {
          result.acceptance_errors.push(
            `unable to prepare failure screenshot: ${errorMessage(error)}`
          );
        }
      }
      if (failures.length > 0 && page && !state.interruptedSignal) {
        const screenshotPath = options.output.replace(/\.json$/i, "") + ".png";
        try {
          await page.screenshot({ fullPage: true, path: screenshotPath });
          result.failure_screenshot = screenshotPath;
        } catch (error) {
          result.acceptance_errors.push(`unable to capture failure screenshot: ${errorMessage(error)}`);
        }
      }
      try {
        await closeBrowserResources();
      } catch (error) {
        result.cleanup.errors.push(`browser close failed: ${errorMessage(error)}`);
      }
      result.completed_at = new Date().toISOString();
      if (acceptanceFailureMessages(result).length === 0) {
        result.verdict = "pass";
      }
      await writeFile(options.output, JSON.stringify(result, null, 2) + "\n", "utf8");
    } finally {
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
    }
  }
  return result;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = await runProductionBrowserWriteAcceptance(options);
  if (result.interrupted_by_signal === "SIGINT") {
    console.error(`Production browser write acceptance interrupted; evidence: ${options.output}`);
    return 130;
  }
  if (result.interrupted_by_signal === "SIGTERM") {
    console.error(`Production browser write acceptance interrupted; evidence: ${options.output}`);
    return 143;
  }
  if (result.verdict !== "pass") {
    console.error(`Production browser write acceptance failed; evidence: ${options.output}`);
    for (const message of acceptanceFailureMessages(result)) {
      console.error(message);
    }
    return 1;
  }
  console.log(`Production browser write acceptance passed: ${options.baseUrl}`);
  console.log(`Evidence: ${options.output}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error(errorMessage(error));
      process.exitCode = 1;
    });
}
