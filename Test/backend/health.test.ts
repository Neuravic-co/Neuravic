import { describe, expect, it } from "vitest";
import { body, makeTestApp } from "./helpers";

describe("health", () => {
  it("contains the API during an approved maintenance cutover without trusting caller flags", async () => {
    const ctx = await makeTestApp();
    ctx.deps.config.maintenanceMode = true;
    for (const path of ["/me", "/auth/magic-link", "/auth/mfa/verify", "/me/privacy/export", "/admin/privacy-requests"]) {
      const response = await ctx.request(`/api/v1${path}`, { headers: { "x-maintenance-mode": "false" } });
      expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("retry-after")).toBe("300");
    }
    expect(await body(await ctx.request("/api/v1/health"))).toEqual({ status: "maintenance" });
    ctx.deps.config.maintenanceMode = false;
    expect((await ctx.request("/api/v1/me")).status).toBe(401);
  });
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

describe("caching", () => {
  it("never caches API responses unless a route opts in", async () => {
    const { request } = await makeTestApp();
    expect((await request("/api/v1/me")).headers.get("cache-control")).toBe("no-store");
    expect((await request("/api/v1/health")).headers.get("cache-control")).toBe("no-store");
    expect((await request("/api/v1/content")).headers.get("cache-control")).toContain("s-maxage");
  });
});
