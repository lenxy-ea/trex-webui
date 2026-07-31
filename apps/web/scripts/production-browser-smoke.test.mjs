import { describe, expect, it, vi } from "vitest";

import {
  captureEvidenceScreenshot,
  configurePageTimeouts,
  evidenceScreenshotPath,
  isSafeWorkspaceCloseConfirmation,
  isReadOnlyMethod,
  normalizeBaseUrl,
  parseOptions,
  readonlyWorkspaceChecks,
  smokeFailureMessages,
  workspaceAssetEvidence
} from "./production-browser-smoke.mjs";

describe("production browser smoke safeguards", () => {
  it("derives a stable screenshot path from the JSON evidence path", () => {
    expect(evidenceScreenshotPath("/tmp/production-smoke.json")).toBe("/tmp/production-smoke.png");
    expect(evidenceScreenshotPath("/tmp/production-smoke.JSON")).toBe("/tmp/production-smoke.png");
    expect(evidenceScreenshotPath("/tmp/production-smoke")).toBe("/tmp/production-smoke.png");
  });

  it("captures full-page browser evidence at the derived path", async () => {
    const screenshot = vi.fn().mockResolvedValue(undefined);

    await expect(captureEvidenceScreenshot({ screenshot }, "/tmp/production-smoke.json")).resolves.toBe(
      "/tmp/production-smoke.png"
    );
    expect(screenshot).toHaveBeenCalledOnce();
    expect(screenshot).toHaveBeenCalledWith({ fullPage: true, path: "/tmp/production-smoke.png" });
  });

  it("propagates screenshot failures so missing evidence cannot pass silently", async () => {
    const screenshot = vi.fn().mockRejectedValue(new Error("disk full"));

    await expect(captureEvidenceScreenshot({ screenshot }, "/tmp/production-smoke.json")).rejects.toThrow("disk full");
  });

  it("applies the requested timeout to locator actions and navigation", () => {
    const page = {
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn()
    };

    configurePageTimeouts(page, 4321);

    expect(page.setDefaultTimeout).toHaveBeenCalledWith(4321);
    expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(4321);
  });

  it("normalizes an API base URL to the production WebUI root", () => {
    expect(normalizeBaseUrl("http://127.0.0.1/api")).toBe("http://127.0.0.1/");
    expect(normalizeBaseUrl("https://trex.example/lab")).toBe("https://trex.example/lab/");
    expect(() => normalizeBaseUrl("file:///tmp/index.html")).toThrow(/http/);
  });

  it("allows only read-only HTTP methods", () => {
    expect(isReadOnlyMethod("GET")).toBe(true);
    expect(isReadOnlyMethod("head")).toBe(true);
    expect(isReadOnlyMethod("OPTIONS")).toBe(true);
    expect(isReadOnlyMethod("POST")).toBe(false);
    expect(isReadOnlyMethod("DELETE")).toBe(false);
  });

  it("covers every production lazy workspace through a read-only open/close path", () => {
    expect(readonlyWorkspaceChecks).toEqual([
      { button: "Stats", dialog: "Dashboard", contentLabel: "Dashboard workspace", assetStem: "DashboardWorkspace" },
      { button: "Traffic Profiles", dialog: "Traffic Profiles", contentLabel: "Traffic Profiles workspace", assetStem: "TrafficProfilesWorkspace" },
      { button: "Capture", dialog: "Packet Capture", contentLabel: "Packet Capture workspace", assetStem: "PacketCaptureWorkspace" },
      {
        button: "Tests",
        dialog: "Quick Validation",
        contentLabel: "Quick Validation workspace",
        assetStem: "QuickValidationWorkspace",
        responsePath: "/api/trex/quick-validation",
        safeCloseConfirmation: "Leaving this workspace will not cancel traffic"
      },
      { button: "Run Reports", dialog: "Run Reports", contentLabel: "Run Reports workspace", assetStem: "RunReportsWorkspace" },
      {
        button: "TRex Daemon",
        dialog: "TRex Daemon",
        contentLabel: "TRex Daemon workspace",
        assetStem: "TrexDaemonDialog",
        responsePath: "/api/system/daemon"
      }
    ]);
  });

  it("records the workspace entry chunk instead of an earlier shared chunk", () => {
    const check = { dialog: "Traffic Profiles", assetStem: "TrafficProfilesWorkspace" };
    const evidence = workspaceAssetEvidence(check, [
      { url: "http://trex/assets/save-shared.js", status: 200 },
      { url: "http://trex/assets/TrafficProfilesWorkspace-entry.js", status: 200 }
    ], new Set());

    expect(evidence).toEqual({
      workspace: "Traffic Profiles",
      url: "http://trex/assets/TrafficProfilesWorkspace-entry.js",
      status: 200,
      source: "network"
    });
  });

  it("accepts an already-loaded workspace module without waiting for a duplicate response", () => {
    const check = { dialog: "Dashboard", assetStem: "DashboardWorkspace" };
    const url = "http://trex/assets/DashboardWorkspace-entry.js";

    expect(workspaceAssetEvidence(check, [{ url, status: 200 }], new Set([url]))).toEqual({
      workspace: "Dashboard",
      url,
      status: 200,
      source: "module-cache"
    });
  });

  it("rejects a shared chunk when the named workspace entry chunk is missing", () => {
    const check = { dialog: "Dashboard", assetStem: "DashboardWorkspace" };

    expect(() => workspaceAssetEvidence(
      check,
      [{ url: "http://trex/assets/save-shared.js", status: 200 }],
      new Set()
    )).toThrow("Dashboard rendered without its expected DashboardWorkspace production chunk");
  });

  it("only accepts the explicit leave-running confirmation while closing a workspace", () => {
    const quickValidation = readonlyWorkspaceChecks.find((check) => check.dialog === "Quick Validation");

    expect(isSafeWorkspaceCloseConfirmation(
      quickValidation,
      "confirm",
      "Quick Validation is still active. Leaving this workspace will not cancel traffic; the backend safety lease remains in force. Continue?"
    )).toBe(true);
    expect(isSafeWorkspaceCloseConfirmation(quickValidation, "confirm", "Stop traffic now?")).toBe(false);
    expect(isSafeWorkspaceCloseConfirmation(quickValidation, "alert", "Leaving this workspace will not cancel traffic")).toBe(false);
  });

  it("parses explicit gate evidence options", () => {
    const options = parseOptions([
      "--base-url",
      "http://trex.lab/api",
      "--gate-id",
      "gate-123",
      "--output",
      "/tmp/production-smoke.json",
      "--timeout-ms",
      "5000"
    ]);

    expect(options.baseUrl).toBe("http://trex.lab/");
    expect(options.gateId).toBe("gate-123");
    expect(options.output).toBe("/tmp/production-smoke.json");
    expect(options.timeoutMs).toBe(5000);
  });

  it("turns every browser/runtime failure channel into a gate failure", () => {
    const messages = smokeFailureMessages({
      page_errors: ["render failed"],
      console_errors: ["console failed"],
      request_failures: [{ method: "GET", url: "http://trex/assets/app.js", error: "reset" }],
      http_failures: [{ method: "GET", url: "http://trex/api/health", status: 502 }],
      unsafe_requests: [{ method: "POST", url: "http://trex/api/trex/traffic/start" }]
    });

    expect(messages).toHaveLength(5);
    expect(messages.join("\n")).toContain("blocked unsafe request: POST");
    expect(messages.join("\n")).toContain("HTTP 502");
  });
});
