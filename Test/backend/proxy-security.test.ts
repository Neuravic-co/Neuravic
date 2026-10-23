import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyToApi } from "../../NFE/lib/api-proxy";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("frontend proxy security contract", () => {
  it("replaces spoofed proxy identity, preserves origin, and keeps decoded cookie responses private", async () => {
    vi.stubEnv("API_ORIGIN", "https://backend.test");
    vi.stubEnv("API_PROXY_SECRET", "test-proxy-secret-for-the-backend");
    vi.stubEnv("VERCEL", "1");
    const fetch = vi.fn(async () => new Response("{}", { headers: {
      "set-cookie": "session=test; HttpOnly", "cache-control": "public, max-age=60",
      "content-encoding": "gzip", "content-length": "100",
    } }));
    vi.stubGlobal("fetch", fetch);
    const response = await proxyToApi(new Request("https://site.test/api/v1/me?x=1", { headers: {
      origin: "https://site.test", cookie: "session=old", connection: "origin, x-removable",
      "x-removable": "hop-only", "x-client-ip": "198.51.100.9", "x-proxy-secret": "forged",
      "x-forwarded-for": "198.51.100.99", "x-vercel-forwarded-for": "203.0.113.10", "cf-connecting-ip": "forged",
    } }));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("https://backend.test/api/v1/me?x=1");
    expect(headers.get("origin")).toBe("https://site.test");
    expect(headers.get("x-client-ip")).toBe("203.0.113.10");
    expect(headers.get("x-proxy-secret")).toBe("test-proxy-secret-for-the-backend");
    for (const name of ["x-forwarded-for", "cf-connecting-ip", "x-removable"]) expect(headers.has(name)).toBe(false);
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(true);
    expect(response.headers.has("content-encoding")).toBe(false);
  });

  it("does not sign arbitrary caller IPs on portable servers", async () => {
    vi.stubEnv("API_ORIGIN", "https://backend.test");
    vi.stubEnv("VERCEL", "");
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await proxyToApi(new Request("https://site.test/api/v1/leads", { headers: {
      "x-vercel-forwarded-for": "203.0.113.5", "x-forwarded-for": "203.0.113.5", "x-real-ip": "203.0.113.5",
    } }));
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).has("x-client-ip")).toBe(false);
  });

  it("fails closed on invalid upstream configuration and returns sanitized, uncacheable network errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_ORIGIN", "http://backend.test");
    const fetch = vi.fn(async () => { throw new Error("secret-provider-connection-details"); });
    vi.stubGlobal("fetch", fetch);
    expect((await proxyToApi(new Request("https://site.test/api/v1/me"))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("API_ORIGIN", "https://backend.test");
    const failed = await proxyToApi(new Request("https://site.test/api/v1/me"));
    expect(failed.status).toBe(502);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    expect(await failed.text()).not.toContain("secret-provider");
  });
});
