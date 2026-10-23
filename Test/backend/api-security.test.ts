import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../NBE/src/config";
import { schema } from "../../NBE/src/db";
import { readBoundedBody } from "../../NBE/src/lib/body";
import { hmacHex } from "../../NBE/src/lib/crypto";
import { MemoryBlobStore } from "../../NBE/src/modules/files/blob-store";
import { as, asJson, body, json, makeTestApp, ORIGIN, seedOrg, signIn, testEnv } from "./helpers";

const lead = { name: "Sara", email: "sara@example.com", message: "A real project enquiry to our team.", consent: true };

describe("request, caching and privacy boundaries", () => {
  it("bounds actual streamed bytes and cancels an oversized source with a forged length", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(16)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://app.test/upload", {
      method: "PUT", headers: { "content-length": "1" }, body: stream, duplex: "half",
    } as RequestInit);
    await expect(readBoundedBody(request, 32)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });

  it("rejects oversized JSON even with a false small Content-Length", async () => {
    const ctx = await makeTestApp();
    const response = await ctx.request("/api/v1/leads", json("POST", { ...lead, message: "x".repeat(300_000) }, { "content-length": "1" }));
    expect(response.status).toBe(413);
    expect(await ctx.deps.db.select().from(schema.leads)).toHaveLength(0);
  });

  it("keeps early failures and cookie-bearing public responses out of shared caches", async () => {
    const ctx = await makeTestApp();
    const responses = await Promise.all([
      ctx.request("/api/v1/me"),
      ctx.request("/api/v1/auth/verify", json("POST", { token: "x".repeat(30) }, { origin: "https://evil.test" })),
      ctx.request("/api/v1/leads", json("POST", { ...lead, message: "x".repeat(300_000) })),
      ctx.request("/api/v1/leads", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 403, 413, 400]);
    for (const response of responses) expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await ctx.request("/api/v1/content")).headers.get("cache-control")).toContain("public");
    const stale = await ctx.request("/api/v1/content", { headers: { cookie: "nv_session=expired-value" } });
    expect(stale.headers.has("set-cookie")).toBe(true);
    expect(stale.headers.get("cache-control")).toBe("no-store");
  });

  it("allows CORS credentials only for configured origins", async () => {
    const ctx = await makeTestApp();
    const allowed = await ctx.request("/api/v1/health", { headers: { origin: ORIGIN } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    const denied = await ctx.request("/api/v1/health", { headers: { origin: "https://evil.test" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await ctx.request("/api/v1/leads", { method: "OPTIONS", headers: {
      origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type",
    } });
    expect(preflight.status).toBe(204);
  });

  it("does not store raw client IPs or email addresses in rate counters", async () => {
    const ctx = await makeTestApp();
    await ctx.request("/api/v1/auth/magic-link", json("POST", { email: lead.email }, { "cf-connecting-ip": "203.0.113.5" }));
    await ctx.request("/api/v1/leads", json("POST", lead, { "cf-connecting-ip": "203.0.113.5" }));
    const keys = JSON.stringify(await ctx.deps.db.select().from(schema.rateLimits));
    expect(keys).not.toContain("203.0.113.5");
    expect(keys).not.toContain(lead.email);
    expect(await hmacHex("a".repeat(32), "audit", "203.0.113.5")).not.toBe(await hmacHex("b".repeat(32), "audit", "203.0.113.5"));
    expect(await hmacHex("a".repeat(32), "audit", "203.0.113.5")).not.toBe(await hmacHex("a".repeat(32), "rate", "203.0.113.5"));
  });

  it("does not let untrusted forwarding headers bypass public rate limits", async () => {
    const ctx = await makeTestApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await ctx.request("/api/v1/leads", json("POST", { ...lead, message: `${lead.message} ${i}` }, { "x-forwarded-for": `203.0.113.${i}` }))).status).toBe(202);
    }
    const limited = await ctx.request("/api/v1/leads", json("POST", lead, { "x-forwarded-for": "203.0.113.99" }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("deduplicates concurrent submissions and notifications at the database boundary", async () => {
    const ctx = await makeTestApp();
    const responses = await Promise.all([ctx.request("/api/v1/leads", json("POST", lead)), ctx.request("/api/v1/leads", json("POST", lead))]);
    expect(responses.map((r) => r.status)).toEqual([202, 202]);
    expect((await body(responses[0]!)).id).toBe((await body(responses[1]!)).id);
    expect(await ctx.deps.db.select().from(schema.leads)).toHaveLength(1);
    expect(ctx.mailer.sent).toHaveLength(2);
    ctx.deps.now = () => Date.now() + 24 * 3_600_000 + 1000;
    expect((await ctx.request("/api/v1/leads", json("POST", lead))).status).toBe(202);
    expect(await ctx.deps.db.select().from(schema.leads)).toHaveLength(2);
  });

  it("stores injection-like text as data and rejects inherited content keys", async () => {
    const ctx = await makeTestApp();
    const text = "'); DROP TABLE users; -- <script>alert(1)</script>";
    expect((await ctx.request("/api/v1/leads", json("POST", { ...lead, message: text }))).status).toBe(202);
    expect((await ctx.deps.db.select().from(schema.leads))[0]?.message).toBe(text);
    expect(await ctx.deps.db.select().from(schema.users)).toEqual([]);
    for (const segment of ["toString", "constructor", "__proto__"]) expect((await ctx.request(`/api/v1/content/${segment}`)).status).toBe(404);
  });

  it("does not disclose SQL, provider details or input in unhandled error logs", async () => {
    const events: unknown[] = [];
    const ctx = await makeTestApp({ log: { info: (...args) => events.push(args), warn: (...args) => events.push(args), error: (...args) => events.push(args) } });
    const original = ctx.deps.rateLimiter;
    ctx.deps.rateLimiter = { hit: async () => { throw new Error("private-provider-token-and-personal-data"); } };
    const response = await ctx.request("/api/v1/leads", json("POST", lead));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await body(response))).not.toContain("private-provider");
    expect(JSON.stringify(events)).not.toContain("private-provider");
    ctx.deps.rateLimiter = original;
  });
});

describe("deployment configuration", () => {
  it("fails closed on misspelled environment names, non-HTTPS deployments and wildcard origins", () => {
    expect(() => loadConfig({ ...testEnv, APP_ENV: "prodution" })).toThrow("APP_ENV");
    expect(() => loadConfig({ ...testEnv, ALLOWED_ORIGINS: "*" })).toThrow("origins");
    expect(() => loadConfig({ ...testEnv, APP_ENV: "production", APP_URL: "http://app.test" })).toThrow("HTTPS");
    expect(() => loadConfig({ ...testEnv, APP_ENV: "production" })).toThrow("PRIVACY_HASH_SECRET");
    const config = loadConfig({ ...testEnv, APP_ENV: "production", PRIVACY_HASH_SECRET: "test-only-key-with-at-least-32-characters", MFA_ENCRYPTION_KEY: "19".repeat(32) });
    expect(config.cookieSecure).toBe(true);
  });
});

describe("file quota concurrency", () => {
  it("stores at most 20 attachments and removes a losing upload from object storage", async () => {
    const ctx = await makeTestApp();
    const org = await seedOrg(ctx, "acme", { "owner@acme.dev": "owner", "member@acme.dev": "member" });
    const owner = await signIn(ctx, "owner@acme.dev");
    const member = await signIn(ctx, "member@acme.dev");
    const project = await body(await ctx.request(`/api/v1/orgs/${org}/projects`, asJson(owner, "POST", { name: "Quota test" })));
    const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(member, "POST", { type: "change", title: "Quota test", body: "Details" })));
    const upload = () => ctx.request(`/api/v1/requests/${request.id}/files?name=a.txt`, as(member, { method: "PUT", body: "x", headers: { "content-type": "text/plain" } }));
    for (let i = 0; i < 19; i += 1) expect((await upload()).status).toBe(201);
    expect((await Promise.all([upload(), upload()])).map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.deps.db.select().from(schema.files).where(eq(schema.files.requestId, request.id))).toHaveLength(20);
    expect((ctx.deps.blobs as MemoryBlobStore).objects.size).toBe(20);
  });
});
