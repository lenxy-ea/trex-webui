import { describe, expect, it } from "vitest";

import {
  isReadOnlyMethod,
  normalizeBaseUrl,
  parseOptions,
  readonlyWorkspaceChecks,
  smokeFailureMessages
} from "./production-browser-smoke.mjs";

describe("production browser smoke safeguards", () => {
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
      { button: "Stats", dialog: "Dashboard", contentLabel: "Dashboard workspace" },
      { button: "Traffic Profiles", dialog: "Traffic Profiles", contentLabel: "Traffic Profiles workspace" },
      { button: "Capture", dialog: "Packet Capture", contentLabel: "Packet Capture workspace" },
      { button: "Run Reports", dialog: "Run Reports", contentLabel: "Run Reports workspace" }
    ]);
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
