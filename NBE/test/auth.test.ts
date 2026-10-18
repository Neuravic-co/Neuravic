import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../src/db";
import { as, asJson, body, json, makeTestApp, ORIGIN, seedUser, signIn } from "./helpers";

describe("auth", () => {
  it("signs a known user in with a magic link and returns /me", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "client@test.dev", { name: "Client" });
    const cookie = await signIn(ctx, "client@test.dev");
    const me = await ctx.request("/api/v1/me", as(cookie));
    expect(me.status).toBe(200);
    expect((await body(me)).user.email).toBe("client@test.dev");
  });

  it("does not reveal whether an email has an account", async () => {
    const ctx = await makeTestApp();
    const res = await ctx.request("/api/v1/auth/magic-link", json("POST", { email: "ghost@test.dev" }));
    expect(res.status).toBe(202);
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it("login links are single use and expire", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "a@test.dev");
    await ctx.request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }));
    const token = decodeURIComponent(/token=([^\s&]+)/.exec(ctx.mailer.sent[0]!.text)![1]!);
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token }))).status).toBe(200);
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token }))).status).toBe(401);

    await ctx.request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }));
    const second = decodeURIComponent(/token=([^\s&]+)/.exec(ctx.mailer.sent[1]!.text)![1]!);
    ctx.deps.now = () => Date.now() + 16 * 60_000;
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token: second }))).status).toBe(401);
  });

  it("stores only hashes of tokens", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "a@test.dev");
    await ctx.request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }));
    const token = decodeURIComponent(/token=([^\s&]+)/.exec(ctx.mailer.sent[0]!.text)![1]!);
    const [row] = await ctx.deps.db.select().from(schema.authTokens);
    expect(row?.id).not.toBe(token);
    expect(row?.id).toHaveLength(64);
  });

  it("bootstraps the configured first staff admin", async () => {
    const ctx = await makeTestApp();
    ctx.deps.config.bootstrapAdminEmail = "founder@test.dev";
    const cookie = await signIn(ctx, "founder@test.dev");
    const me = await body(await ctx.request("/api/v1/me", as(cookie)));
    expect(me.user.staffRole).toBe("admin");
  });

  it("rejects disabled users and unauthenticated /me", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "off@test.dev", { status: "disabled" });
    await ctx.request("/api/v1/auth/magic-link", json("POST", { email: "off@test.dev" }));
    expect(ctx.mailer.sent).toHaveLength(0);
    expect((await ctx.request("/api/v1/me")).status).toBe(401);
  });

  it("logout invalidates the session", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "a@test.dev");
    const cookie = await signIn(ctx, "a@test.dev");
    expect((await ctx.request("/api/v1/auth/logout", as(cookie, { method: "POST" }))).status).toBe(204);
    expect((await ctx.request("/api/v1/me", as(cookie))).status).toBe(401);
  });

  it("blocks state-changing requests from untrusted origins", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "a@test.dev");
    const cookie = await signIn(ctx, "a@test.dev");
    const evil = await ctx.request("/api/v1/me", {
      ...json("PATCH", { name: "X" }),
      headers: { "content-type": "application/json", cookie, origin: "https://evil.test" },
    });
    expect(evil.status).toBe(403);
    const ok = await ctx.request("/api/v1/me", asJson(cookie, "PATCH", { name: "Sam" }));
    expect(ok.status).toBe(200);
    const [user] = await ctx.deps.db.select().from(schema.users).where(eq(schema.users.email, "a@test.dev"));
    expect(user?.name).toBe("Sam");
  });

  it("ends sessions after the absolute lifetime", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "staff@test.dev", { staffRole: "admin" });
    const cookie = await signIn(ctx, "staff@test.dev");
    ctx.deps.now = () => Date.now() + 13 * 3_600_000;
    expect((await ctx.request("/api/v1/me", as(cookie))).status).toBe(401);
  });

  it("sets an HttpOnly SameSite cookie", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "a@test.dev");
    await ctx.request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }));
    const token = decodeURIComponent(/token=([^\s&]+)/.exec(ctx.mailer.sent[0]!.text)![1]!);
    const res = await ctx.request("/api/v1/auth/verify", json("POST", { token }, { origin: ORIGIN }));
    const header = res.headers.get("set-cookie")!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
  });
});
