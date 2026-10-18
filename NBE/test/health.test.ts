import { describe, expect, it } from "vitest";
import { body, makeTestApp } from "./helpers";

describe("health", () => {
  it("reports ok with a request id and security headers", async () => {
    const { request } = await makeTestApp();
    const res = await request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ status: "ok" });
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns problem+json for unknown routes", async () => {
    const { request } = await makeTestApp();
    const res = await request("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect((await body(res)).code).toBe("not_found");
  });

  it("only allows configured CORS origins", async () => {
    const { request } = await makeTestApp();
    const allowed = await request("/api/v1/health", { headers: { origin: "https://app.test" } });
    const denied = await request("/api/v1/health", { headers: { origin: "https://evil.test" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.test");
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
