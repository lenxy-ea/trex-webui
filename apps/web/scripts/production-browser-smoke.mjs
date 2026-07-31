import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const requiredNodeMajor = 24;
const defaultTimeoutMs = 20_000;
const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const readonlyWorkspaceChecks = Object.freeze([
  { button: "Stats", dialog: "Dashboard", contentLabel: "Dashboard workspace" },
  { button: "Traffic Profiles", dialog: "Traffic Profiles", contentLabel: "Traffic Profiles workspace" },
  { button: "Capture", dialog: "Packet Capture", contentLabel: "Packet Capture workspace" },
  { button: "Run Reports", dialog: "Run Reports", contentLabel: "Run Reports workspace" }
]);

export function isReadOnlyMethod(method) {
  return readOnlyMethods.has(String(method).toUpperCase());
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

export function parseOptions(argv) {
  const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
  const options = {
    baseUrl: normalizeBaseUrl(process.env.WEBUI_URL ?? "http://127.0.0.1"),
    gateId: process.env.TREX_WEBUI_GATE_ID ?? `standalone-${timestamp}`,
    output: resolveOutputPath(process.env.PLAYWRIGHT_OUTPUT_PATH ?? path.join(rootDir, ".logs", `production-browser-smoke-${timestamp}.json`)),
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

export function smokeFailureMessages(result) {
  return [
    ...result.page_errors.map((message) => `pageerror: ${message}`),
    ...result.console_errors.map((message) => `console error: ${message}`),
    ...result.request_failures.map((failure) => `request failed: ${failure.method} ${failure.url} (${failure.error})`),
    ...result.http_failures.map((failure) => `HTTP ${failure.status}: ${failure.method} ${failure.url}`),
    ...result.unsafe_requests.map((request) => `blocked unsafe request: ${request.method} ${request.url}`)
  ];
}

function usage() {
  return `Usage: npm run smoke:web:production -- [options]

Load the production WebUI through Nginx in Chromium and exercise a read-only UI path.
All non-GET/HEAD/OPTIONS requests are blocked before they reach the server.

Options:
  --base-url URL     Nginx WebUI URL. Default: http://127.0.0.1
  --gate-id ID       Major-gate identity recorded in evidence
  --output PATH      JSON evidence path. Default: .logs/production-browser-smoke-<utc>.json
  --timeout-ms MS    Navigation/selector timeout. Default: ${defaultTimeoutMs}
  -h, --help         Show this help`;
}

function assertProjectNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (major !== requiredNodeMajor) {
    throw new Error(`Production browser smoke requires Node.js ${requiredNodeMajor}.x; current runtime is ${process.version}`);
  }
}

function compactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function browserApiContract(page) {
  return page.evaluate(async () => {
    const [healthResponse, environmentResponse] = await Promise.all([
      fetch("/api/health", { headers: { Accept: "application/json" } }),
      fetch("/api/system/environment", { headers: { Accept: "application/json" } })
    ]);
    const health = await healthResponse.json();
    const environment = await environmentResponse.json();
    return {
      health_status: healthResponse.status,
      health,
      environment_status: environmentResponse.status,
      environment
    };
  });
}

async function exerciseLazyWorkspace(page, result, check, timeoutMs) {
  const loadedJavascript = new Set(
    result.loaded_assets.filter((asset) => asset.url.endsWith(".js") && asset.status === 200).map((asset) => asset.url)
  );
  const chunkResponsePromise = page.waitForResponse(
    (response) => {
      const url = compactUrl(response.url());
      return (
        new URL(response.url()).pathname.startsWith("/assets/") &&
        new URL(response.url()).pathname.endsWith(".js") &&
        response.status() === 200 &&
        !loadedJavascript.has(url)
      );
    },
    { timeout: timeoutMs }
  );

  await page.getByRole("button", { name: check.button, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: check.dialog, exact: true });
  await dialog.waitFor({ state: "visible", timeout: timeoutMs });
  await dialog.locator(`[aria-label="${check.contentLabel}"]`).waitFor({ state: "visible", timeout: timeoutMs });
  const chunkResponse = await chunkResponsePromise;
  const chunkUrl = compactUrl(chunkResponse.url());
  result.lazy_workspace_assets.push({ workspace: check.dialog, url: chunkUrl, status: chunkResponse.status() });
  result.steps.push(`${check.dialog} lazy workspace loaded from ${chunkUrl}`);

  await page.getByTitle(`Close ${check.dialog}`, { exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: timeoutMs });
  result.steps.push(`${check.dialog} closed without a write request`);
}

function assertApiContract(contract) {
  if (contract.health_status !== 200 || contract.health?.status !== "ok") {
    throw new Error(`browser same-origin /api/health contract failed with HTTP ${contract.health_status}`);
  }
  const requiredEnvironmentKeys = [
    "host_valid",
    "scripts_dir_path_valid",
    "daemon_bin_path_valid",
    "config_path_valid",
    "daemon_log_path_valid",
    "configuration_errors"
  ];
  const missing = requiredEnvironmentKeys.filter((key) => !(key in (contract.environment ?? {})));
  if (contract.environment_status !== 200 || missing.length > 0) {
    throw new Error(
      `browser same-origin /api/system/environment contract failed with HTTP ${contract.environment_status}; missing ${missing.join(", ") || "none"}`
    );
  }
}

async function exerciseReadOnlyUi(page, result, timeoutMs) {
  const overviewResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/system/overview" && response.request().method() === "GET",
    { timeout: timeoutMs }
  );
  const profilesResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/trex/profiles" && response.request().method() === "GET",
    { timeout: timeoutMs }
  );
  const navigationResponse = await page.goto(result.base_url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (!navigationResponse || !navigationResponse.ok()) {
    throw new Error(`production document navigation failed with HTTP ${navigationResponse?.status() ?? "no response"}`);
  }
  result.steps.push("production document loaded");

  const [overviewResponse, profilesResponse] = await Promise.all([overviewResponsePromise, profilesResponsePromise]);
  if (!overviewResponse.ok() || !profilesResponse.ok()) {
    throw new Error(
      `initial read-only API load failed: overview=${overviewResponse.status()} profiles=${profilesResponse.status()}`
    );
  }
  result.steps.push("initial overview/profile GETs completed");

  await page.locator("#root > *").first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator(".workbench-shell").waitFor({ state: "visible", timeout: timeoutMs });
  await page.getByRole("navigation", { name: "Application menu" }).waitFor({ state: "visible", timeout: timeoutMs });
  result.react_mounted = true;
  result.steps.push("React workbench mounted");

  const moduleSources = await page.locator('script[type="module"][src]').evaluateAll((scripts) =>
    scripts.map((script) => script.getAttribute("src") ?? "")
  );
  if (!moduleSources.some((source) => source.startsWith("/assets/") && source.endsWith(".js"))) {
    throw new Error(`production JS asset was not loaded from /assets/: ${moduleSources.join(", ") || "none"}`);
  }
  if (moduleSources.some((source) => source.includes("/src/"))) {
    throw new Error(`Vite development source was loaded instead of a production asset: ${moduleSources.join(", ")}`);
  }
  result.production_module_sources = moduleSources;
  result.steps.push("production asset entry verified");

  const contract = await browserApiContract(page);
  assertApiContract(contract);
  result.api_contract = contract;
  result.steps.push("same-origin health/environment contracts verified");

  for (const check of readonlyWorkspaceChecks) {
    await exerciseLazyWorkspace(page, result, check, timeoutMs);
  }

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("dialog", { name: "TRex", exact: true }).waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator('[aria-label="About TRex"]').waitFor({ state: "visible", timeout: timeoutMs });
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("dialog", { name: "TRex", exact: true }).waitFor({ state: "detached", timeout: timeoutMs });
  result.steps.push("read-only Help dialog opened and closed");

  await page.waitForTimeout(250);
}

export async function runProductionBrowserSmoke(options) {
  assertProjectNodeVersion();
  await mkdir(path.dirname(options.output), { recursive: true });
  const generatedAt = new Date().toISOString();
  const result = {
    workflow: "production-browser-smoke",
    verdict: "fail",
    gate_id: options.gateId,
    generated_at: generatedAt,
    base_url: options.baseUrl,
    readonly_methods: [...readOnlyMethods],
    react_mounted: false,
    production_module_sources: [],
    loaded_assets: [],
    lazy_workspace_assets: [],
    observed_requests: [],
    unsafe_requests: [],
    request_failures: [],
    http_failures: [],
    page_errors: [],
    console_errors: [],
    smoke_errors: [],
    steps: []
  };
  let browser = null;
  let context = null;
  let page = null;
  let collecting = true;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => {
      Object.defineProperty(window, "EventSource", { configurable: true, value: undefined });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const record = requestRecord(request);
      if (collecting) {
        result.observed_requests.push(record);
      }
      if (!isReadOnlyMethod(record.method)) {
        if (collecting) {
          result.unsafe_requests.push(record);
        }
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
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
      if (!collecting) {
        return;
      }
      const request = response.request();
      const record = requestRecord(request);
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith("/assets/")) {
        result.loaded_assets.push({ ...record, status: response.status() });
      }
      if (response.status() >= 400) {
        result.http_failures.push({ ...record, status: response.status() });
      }
    });

    await exerciseReadOnlyUi(page, result, options.timeoutMs);
    const failures = smokeFailureMessages(result);
    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
    if (!result.loaded_assets.some((asset) => asset.url.endsWith(".js") && asset.status === 200)) {
      throw new Error("no successful production JavaScript asset response was observed");
    }
    result.verdict = "pass";
  } catch (error) {
    result.smoke_errors.push(errorMessage(error));
    if (page) {
      const screenshotPath = options.output.replace(/\.json$/i, "") + ".png";
      try {
        await page.screenshot({ fullPage: true, path: screenshotPath });
        result.failure_screenshot = screenshotPath;
      } catch (screenshotError) {
        result.smoke_errors.push(`unable to capture failure screenshot: ${errorMessage(screenshotError)}`);
      }
    }
  } finally {
    collecting = false;
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }

  await writeFile(options.output, JSON.stringify(result, null, 2) + "\n", "utf8");
  return result;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = await runProductionBrowserSmoke(options);
  if (result.verdict !== "pass") {
    console.error(`Production browser smoke failed; evidence: ${options.output}`);
    for (const message of result.smoke_errors) {
      console.error(message);
    }
    return 1;
  }
  console.log(`Production browser smoke passed: ${options.baseUrl}`);
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
