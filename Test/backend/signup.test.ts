import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../../NBE/src/db";
import { as, body, json, makeTestApp, seedUser } from "./helpers";

const signup = (email: string, extra: Record<string, unknown> = {}) =>
  json("POST", { name: "New Person", email, consent: true, ...extra });

describe("sign-up", () => {
  it("creates a client account and signs it in with the emailed link", async () => {
    const ctx = await makeTestApp();
    const res = await ctx.request("/api/v1/auth/signup", signup("New@Test.dev"));
    expect(res.status).toBe(202);
    expect(await body(res)).toEqual({ status: "link_sent" });
    expect(ctx.mailer.sent).toHaveLength(1);

    const [user] = await ctx.deps.db.select().from(schema.users).where(eq(schema.users.email, "new@test.dev"));
    expect(user).toMatchObject({ name: "New Person", staffRole: null });

    const token = decodeURIComponent(/token=([^\s&]+)/.exec(ctx.mailer.sent[0]!.text)![1]!);
    const verified = await ctx.request("/api/v1/auth/verify", json("POST", { token }));
    expect(verified.status).toBe(200);
    const cookie = verified.headers.get("set-cookie")!.split(";")[0]!;
    const me = await body(await ctx.request("/api/v1/me", as(cookie)));
    expect(me.user.email).toBe("new@test.dev");
    expect(me.user.staffRole).toBeNull();
    expect(me.memberships).toEqual([]);
  });

  it("answers the same for an address that already has an account, and never changes it", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "staff@test.dev", { name: "Existing Staff", staffRole: "admin" });
    const res = await ctx.request("/api/v1/auth/signup", signup("staff@test.dev", { name: "Someone Else" }));
    expect(res.status).toBe(202);
    expect(await body(res)).toEqual({ status: "link_sent" });
    const [user] = await ctx.deps.db.select().from(schema.users).where(eq(schema.users.email, "staff@test.dev"));
    expect(user).toMatchObject({ name: "Existing Staff", staffRole: "admin" });
    expect(ctx.mailer.sent).toHaveLength(1);
  });

  it("never grants a staff role through sign-up", async () => {
    const ctx = await makeTestApp();
    await ctx.request("/api/v1/auth/signup", signup("sneaky@test.dev", { staffRole: "admin", role: "admin" }));
    const [user] = await ctx.deps.db.select().from(schema.users).where(eq(schema.users.email, "sneaky@test.dev"));
    expect(user!.staffRole).toBeNull();
  });

  it("needs a name, a valid email and consent", async () => {
    const ctx = await makeTestApp();
    for (const bad of [{ name: "" }, { name: "A" }, { email: "not-an-email" }, { consent: false }]) {
      const res = await ctx.request("/api/v1/auth/signup", json("POST", { name: "New Person", email: "x@test.dev", consent: true, ...bad }));
      expect(res.status).toBe(400);
    }
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it("limits repeated sign-ups for one address", async () => {
    const ctx = await makeTestApp();
    for (let i = 0; i < 8; i++) await ctx.request("/api/v1/auth/signup", signup("spam@test.dev"));
    expect(ctx.mailer.sent.length).toBeLessThanOrEqual(5);
  });

  it("rejects a failed bot check and requires one outside development", async () => {
    const failing = await makeTestApp();
    failing.deps.config.turnstileSecret = "secret";
    failing.deps.http = (async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch;
    expect((await failing.request("/api/v1/auth/signup", signup("bot@test.dev", { turnstileToken: "t" }))).status).toBe(422);
    expect(failing.mailer.sent).toHaveLength(0);

    const unconfigured = await makeTestApp();
    unconfigured.deps.config.environment = "production";
    unconfigured.deps.config.turnstileSecret = null;
    expect((await unconfigured.request("/api/v1/auth/signup", signup("bot@test.dev"))).status).toBe(503);
  });
});
