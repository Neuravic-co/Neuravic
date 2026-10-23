import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../NBE/src/config";
import { schema } from "../../NBE/src/db";
import { totpCode } from "../../NBE/src/modules/auth/mfa";
import { as, asJson, body, makeTestApp, seedUser, signIn, testEnv } from "./helpers";

const key = "19".repeat(32); // isolated fixture, never a deployment key
async function staff() {
  let now = Date.now();
  const ctx = await makeTestApp({ now: () => now });
  ctx.deps.config.mfaEncryptionKey = key;
  ctx.deps.config.staffMfaRequired = true;
  const userId = await seedUser(ctx, "staff@test.dev", { staffRole: "admin" });
  const cookie = await signIn(ctx, "staff@test.dev");
  return { ctx, cookie, userId, now: () => now, advance: () => { now += 30_000; } };
}

describe("staff MFA", () => {
  it("matches independent RFC 6238 SHA-1 vectors", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    for (const [seconds, expected] of [[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [20000000000, "65353130"]] as const) {
      expect(await totpCode(secret, Math.floor(seconds / 30), 8)).toBe(expected);
    }
  });

  it("blocks every staff application surface until confirmation, encrypts secrets and supports later step-up", async () => {
    const { ctx, cookie, userId, now, advance } = await staff();
    for (const route of ["/me", "/orgs", "/admin/overview", "/content", "/token"]) {
      const response = await ctx.request(`/api/v1${route}`, as(cookie));
      expect(response.status).toBe(403);
      expect((await body(response)).code).toBe("mfa_required");
    }
    const setup = await body(await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {})));
    const repeated = await body(await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {})));
    expect(repeated.secret).toBe(setup.secret);
    const [stored] = await ctx.deps.db.select().from(schema.staffMfa);
    expect(stored!.encryptedSecret).not.toContain(setup.secret);
    const code = await totpCode(setup.secret, Math.floor(now() / 30_000));
    const confirm = await ctx.request("/api/v1/auth/mfa/confirm", asJson(cookie, "POST", { code }));
    expect(confirm.status).toBe(200);
    const result = await body(confirm);
    expect(result.recoveryCodes).toHaveLength(8);
    expect(confirm.headers.get("cache-control")).toBe("no-store");
    expect((await ctx.request("/api/v1/me", as(cookie))).status).toBe(200);
    expect((await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {}))).status).toBe(409);
    const [factor] = await ctx.deps.db.select().from(schema.staffMfa).where(eq(schema.staffMfa.userId, userId));
    expect(factor!.recoveryHashes).not.toContain(result.recoveryCodes[0]);
    const next = await signIn(ctx, "staff@test.dev");
    expect((await ctx.request("/api/v1/me", as(next))).status).toBe(403);
    expect((await ctx.request("/api/v1/auth/mfa/verify", asJson(next, "POST", { code }))).status).toBe(401);
    advance();
    const nextCode = await totpCode(setup.secret, Math.floor(now() / 30_000));
    expect((await ctx.request("/api/v1/auth/mfa/verify", asJson(next, "POST", { code: nextCode }))).status).toBe(200);
    expect((await ctx.request("/api/v1/admin/security-status", as(next))).status).toBe(200);
  });

  it("consumes recovery codes once under concurrent attempts and keeps enforcement when rollout is optional", async () => {
    const { ctx, cookie, now } = await staff();
    const { secret } = await body(await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {})));
    const result = await body(await ctx.request("/api/v1/auth/mfa/confirm", asJson(cookie, "POST", { code: await totpCode(secret, Math.floor(now() / 30_000)) })));
    ctx.deps.config.staffMfaRequired = false;
    const next = await signIn(ctx, "staff@test.dev");
    expect((await ctx.request("/api/v1/me", as(next))).status).toBe(403);
    const attempts = await Promise.all([1, 2].map(() => ctx.request("/api/v1/auth/mfa/verify", asJson(next, "POST", { code: result.recoveryCodes[0] }))));
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 401]);
    expect((await ctx.request("/api/v1/auth/mfa/verify", asJson(next, "POST", { code: result.recoveryCodes[0] }))).status).toBe(401);
  });

  it("rejects invalid codes, cross-origin requests, nonstaff setup and account-wide guessing", async () => {
    const { ctx, cookie } = await staff();
    await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {}));
    expect((await ctx.request("/api/v1/auth/mfa/confirm", as(cookie, { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: '{"code":"wrong!"}' }))).status).toBe(403);
    for (let i = 0; i < 9; i++) expect((await ctx.request("/api/v1/auth/mfa/confirm", asJson(cookie, "POST", { code: "wrong!" }))).status).toBe(401);
    const limited = await ctx.request("/api/v1/auth/mfa/confirm", asJson(cookie, "POST", { code: "wrong!" }));
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBeTruthy();
    await seedUser(ctx, "client@test.dev");
    const client = await signIn(ctx, "client@test.dev");
    expect((await ctx.request("/api/v1/auth/mfa/setup", asJson(client, "POST", {}))).status).toBe(403);
  });

  it("expires incomplete verification and requires safe deployed configuration", async () => {
    const { ctx, cookie, advance } = await staff();
    for (let i = 0; i < 21; i++) advance();
    expect((await ctx.request("/api/v1/auth/mfa", as(cookie))).status).toBe(401);
    expect(() => loadConfig({ ...testEnv, APP_ENV: "production", PRIVACY_HASH_SECRET: "p".repeat(40) })).toThrow("MFA_ENCRYPTION_KEY");
    expect(() => loadConfig({ ...testEnv, APP_ENV: "production", PRIVACY_HASH_SECRET: "p".repeat(40), MFA_ENCRYPTION_KEY: key })).not.toThrow();
    expect(() => loadConfig({ ...testEnv, PRIVACY_HASH_SECRET: "neuravic-development-identifiers-only" })).toThrow("independent");
    expect(() => loadConfig({ ...testEnv, PRIVACY_HASH_SECRET: "p".repeat(40), PROXY_SECRET: "p".repeat(40) })).toThrow("independent");
  });

  it("consumes a TOTP once across sessions and cannot transfer encrypted factors between users", async () => {
    const { ctx, cookie, userId, now, advance } = await staff();
    const { secret } = await body(await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {})));
    await ctx.request("/api/v1/auth/mfa/confirm", asJson(cookie, "POST", { code: await totpCode(secret, Math.floor(now() / 30_000)) }));
    const second = await signIn(ctx, "staff@test.dev");
    const third = await signIn(ctx, "staff@test.dev");
    advance();
    const code = await totpCode(secret, Math.floor(now() / 30_000));
    const responses = await Promise.all([second, third].map((session) => ctx.request("/api/v1/auth/mfa/verify", asJson(session, "POST", { code }))));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    const otherId = await seedUser(ctx, "other-staff@test.dev", { staffRole: "admin" });
    const [factor] = await ctx.deps.db.select().from(schema.staffMfa).where(eq(schema.staffMfa.userId, userId));
    await ctx.deps.db.insert(schema.staffMfa).values({ ...factor!, userId: otherId });
    const other = await signIn(ctx, "other-staff@test.dev");
    advance();
    const response = await ctx.request("/api/v1/auth/mfa/verify", asJson(other, "POST", { code: await totpCode(secret, Math.floor(now() / 30_000)) }));
    expect(response.status).toBe(401);
    expect(JSON.stringify(await body(response))).not.toContain(secret);
    expect((await ctx.request("/api/v1/me", as(other))).status).toBe(403);
  });

  it("binds a pending enrollment seed to its initiating session", async () => {
    const { ctx, cookie, now } = await staff();
    const { secret } = await body(await ctx.request("/api/v1/auth/mfa/setup", asJson(cookie, "POST", {})));
    const other = await signIn(ctx, "staff@test.dev");
    expect((await ctx.request("/api/v1/auth/mfa/setup", asJson(other, "POST", {}))).status).toBe(409);
    const code = await totpCode(secret, Math.floor(now() / 30_000));
    expect((await ctx.request("/api/v1/auth/mfa/confirm", asJson(other, "POST", { code }))).status).toBe(401);
    expect((await ctx.request("/api/v1/auth/mfa/confirm", asJson(cookie, "POST", { code }))).status).toBe(200);
  });
});
