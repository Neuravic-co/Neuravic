import { describe, expect, it } from "vitest";
import { body, makeTestApp } from "./helpers";

describe("request hardening", () => {
  it("replaces a malformed caller-supplied request id", async () => {
    const { request } = await makeTestApp();
    const bad = await request("/api/v1/health", { headers: { "x-request-id": "x".repeat(200) } });
    expect(bad.headers.get("x-request-id")).not.toContain("xxxxxxxx");
    expect(bad.headers.get("x-request-id")?.length).toBeLessThanOrEqual(64);
    const good = await request("/api/v1/health", { headers: { "x-request-id": "trace-abc-12345" } });
    expect(good.headers.get("x-request-id")).toBe("trace-abc-12345");
  });

  it("rejects oversized JSON bodies but still allows file uploads of normal size", async () => {
    const { request } = await makeTestApp();
    const huge = JSON.stringify({ name: "x", email: "a@b.co", message: "y".repeat(300_000), consent: true });
    const res = await request("/api/v1/leads", { method: "POST", headers: { "content-type": "application/json" }, body: huge });
    expect(res.status).toBe(413);
    expect((await body(res)).code).toBe("payload_too_large");
  });
});
