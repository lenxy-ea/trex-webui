import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const requiredNodeMajor = 24;

const defaultPorts = [5176, 5175, 5174, 5173];
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 }
];

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function assertProjectNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (major !== requiredNodeMajor) {
    throw new Error(
      `TRex WebUI screenshots require Node.js ${requiredNodeMajor}.x. Current Node.js is ${process.version}. ` +
        "Run from the repo root with: npm run screenshot:web -- --url http://127.0.0.1:5176 --prefix workbench"
    );
  }
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    const body = await response.text();
    return response.ok && body.includes("id=\"root\"");
  } catch {
    return false;
  }
}

async function resolveTargetUrl() {
  const explicitUrl = readOption("--url") ?? process.env.WEBUI_URL ?? null;
  if (explicitUrl) {
    return explicitUrl;
  }

  const reachableUrls = [];
  for (const port of defaultPorts) {
    const url = `http://127.0.0.1:${port}`;
    if (await isReachable(url)) {
      reachableUrls.push(url);
    }
  }

  if (reachableUrls.length > 1) {
    console.warn(
      `Warning: multiple Vite WebUIs are reachable (${reachableUrls.join(", ")}). ` +
        `Using ${reachableUrls[0]}; pass --url to pin the screenshot target.`
    );
  }

  if (reachableUrls.length > 0) {
    return reachableUrls[0];
  }

  throw new Error(
    `No running Vite WebUI found. Start one with npm --prefix apps/web run dev, or pass --url http://127.0.0.1:<port>.`
  );
}

async function checkApiHealth(url) {
  const apiUrl = new URL("/api/health", url).toString();
  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      return null;
    }
    return `API health check through ${apiUrl} returned HTTP ${response.status}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `API health check through ${apiUrl} failed: ${message}`;
  }
}

async function checkApiEnvironmentContract(url) {
  const apiUrl = new URL("/api/system/environment", url).toString();
  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) {
      return `API environment contract check through ${apiUrl} returned HTTP ${response.status}`;
    }
    const payload = await response.json();
    const requiredKeys = [
      "host_valid",
      "scripts_dir_path_valid",
      "daemon_bin_path_valid",
      "config_path_valid",
      "daemon_log_path_valid",
      "configuration_errors"
    ];
    const missingKeys = requiredKeys.filter((key) => !(key in payload));
    if (missingKeys.length > 0) {
      return (
        `API environment contract through ${apiUrl} is missing ${missingKeys.join(", ")}. ` +
        "Restart the API server so screenshots use the current backend contract."
      );
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `API environment contract check through ${apiUrl} failed: ${message}`;
  }
}

async function captureViewport(browser, url, outputDir, prefix, viewport) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector(".workbench-shell", { timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(750);

    const outputPath = path.join(outputDir, `${prefix}-${viewport.name}.png`);
    await page.screenshot({ fullPage: true, path: outputPath });
    return outputPath;
  } finally {
    await page.close();
  }
}

async function main() {
  assertProjectNodeVersion();
  const { chromium } = await import("playwright");
  const url = await resolveTargetUrl();
  const apiHealthWarning = await checkApiHealth(url);
  if (apiHealthWarning) {
    console.warn(
      `Warning: ${apiHealthWarning}. Screenshots may show backend blockers or Vite proxy HTTP 502 instead of live TRex state.`
    );
  } else {
    const apiContractWarning = await checkApiEnvironmentContract(url);
    if (apiContractWarning) {
      console.warn(`Warning: ${apiContractWarning}`);
    }
  }
  const outputDir = path.resolve(readOption("--out-dir") ?? process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(rootDir, ".logs"));
  const prefix = readOption("--prefix") ?? process.env.PLAYWRIGHT_SCREENSHOT_PREFIX ?? "workbench";

  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const outputs = [];
    for (const viewport of viewports) {
      outputs.push(await captureViewport(browser, url, outputDir, prefix, viewport));
    }
    console.log(`Captured ${outputs.length} Playwright screenshots from ${url}`);
    for (const output of outputs) {
      console.log(output);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
