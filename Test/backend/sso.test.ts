import { describe, expect, it } from "vitest";
import { verifyJwt } from "../src/modules/sso/jwt";
import { as, asJson, body, enableSso, makeTestApp, seedOrg, seedUser, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  await enableSso(ctx);
  await seedOrg(ctx, "acme", { "member@acme.dev": "member" });
  await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
  return ctx;
}

const expected = (ctx: Awaited<ReturnType<typeof setup>>, audience: string) => ({
  issuer: ctx.deps.config.appUrl,
  audience,
  now: Date.now(),
});

describe("product SSO", () => {
  it("issues a short-lived token that verifies against the published JWKS", async () => {
    const ctx = await setup();
    const cookie = await signIn(ctx, "member@acme.dev");
    const res = await ctx.request("/api/v1/token/exchange", asJson(cookie, "POST", { audience: "darkagent", orgId: "org-acme" }));
    expect(res.status).toBe(200);
    const { token, expiresIn } = await body(res);
    expect(expiresIn).toBe(300);

    const jwks = await body(await ctx.request("/.well-known/jwks.json"));
    expect(jwks.keys[0]).not.toHaveProperty("d"); // never leak the private part
    const { claims } = await verifyJwt(token, jwks, expected(ctx, "darkagent"));
    expect(claims).toMatchObject({ sub: "user-member@acme.dev", org: "org-acme", role: "member", aud: "darkagent" });
    expect((claims.exp as number) - (claims.iat as number)).toBe(300);
  });

  it("tokens fail for another audience, after expiry, or when tampered with", async () => {
    const ctx = await setup();
    const cookie = await signIn(ctx, "member@acme.dev");
    const { token } = await body(await ctx.request("/api/v1/token/exchange", asJson(cookie, "POST", { audience: "darkagent" })));
    const jwks = await body(await ctx.request("/.well-known/jwks.json"));
    await expect(verifyJwt(token, jwks, expected(ctx, "coolaccess_dxb"))).rejects.toThrow("wrong audience");
    await expect(verifyJwt(token, jwks, { ...expected(ctx, "darkagent"), now: Date.now() + 6 * 60_000 })).rejects.toThrow("expired");
    const [h, , s] = token.split(".");
    const forged = `${h}.${btoa(JSON.stringify({ sub: "admin", aud: "darkagent", iss: ctx.deps.config.appUrl, exp: 9e9 })).replace(/=/g, "")}.${s}`;
    await expect(verifyJwt(forged, jwks, expected(ctx, "darkagent"))).rejects.toThrow("bad signature");
  });

  it("enforces membership, audience allow-list and sign-in", async () => {
    const ctx = await setup();
    await seedOrg(ctx, "other", { "owner@other.dev": "owner" });
    const cookie = await signIn(ctx, "member@acme.dev");
    expect((await ctx.request("/api/v1/token/exchange", asJson(cookie, "POST", { audience: "darkagent", orgId: "org-other" }))).status).toBe(404);
    expect((await ctx.request("/api/v1/token/exchange", asJson(cookie, "POST", { audience: "evil-app" }))).status).toBe(400);
    expect((await ctx.request("/api/v1/token/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience: "darkagent" }) })).status).toBe(401);
  });

  it("marks staff in the claims and answers 503 when SSO is not configured", async () => {
    const ctx = await setup();
    const boss = await signIn(ctx, "boss@test.dev");
    const { token } = await body(await ctx.request("/api/v1/token/exchange", asJson(boss, "POST", { audience: "darkagent" })));
    const jwks = await body(await ctx.request("/.well-known/jwks.json"));
    expect((await verifyJwt(token, jwks, expected(ctx, "darkagent"))).claims.staff).toBe("admin");

    ctx.deps.sso = null;
    expect((await ctx.request("/api/v1/token/exchange", asJson(boss, "POST", { audience: "darkagent" }))).status).toBe(503);
    expect((await ctx.request("/.well-known/jwks.json", as(boss))).status).toBe(503);
  });
});
