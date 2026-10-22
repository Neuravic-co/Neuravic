import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { schema } from "../../NBE/src/db";
import { as, asJson, body, json, makeTestApp, seedUser, signIn } from "./helpers";

type TestApp = Awaited<ReturnType<typeof makeTestApp>>;
const tokenIn = (text: string) => decodeURIComponent(/token=([^\s&]+)/.exec(text)![1]!);
async function link(ctx: TestApp, email: string) {
  const before = ctx.mailer.sent.length;
  expect((await ctx.request("/api/v1/auth/magic-link", json("POST", { email }))).status).toBe(202);
  return tokenIn(ctx.mailer.sent.slice(before).find((mail) => mail.to === email)!.text);
}

describe("credential changes and atomic login", () => {
  it("issues exactly one session when a link is verified concurrently", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "client@test.dev");
    const token = await link(ctx, "client@test.dev");
    const verify = () => ctx.request("/api/v1/auth/verify", json("POST", { token }));
    expect((await Promise.all([verify(), verify()])).map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await ctx.deps.db.select().from(schema.sessions)).toHaveLength(1);
    expect(await ctx.deps.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "auth.login"))).toHaveLength(1);
  });

  it("rolls token consumption back if session creation fails", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "client@test.dev");
    const token = await link(ctx, "client@test.dev");
    await ctx.deps.db.run(sql`CREATE TRIGGER test_session_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'test_failure'); END`);
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token }))).status).toBe(500);
    const [record] = await ctx.deps.db.select().from(schema.authTokens);
    expect(record?.usedAt).toBeNull();
    expect(record?.claimedSessionId).toBeNull();
    await ctx.deps.db.run(sql`DROP TRIGGER test_session_failure`);
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token }))).status).toBe(200);
  });

  it("cannot reactivate a user disabled between lookup and the login batch", async () => {
    const ctx = await makeTestApp();
    const id = await seedUser(ctx, "client@test.dev");
    const token = await link(ctx, "client@test.dev");
    const db = ctx.deps.db as typeof ctx.deps.db & { batch: (queries: unknown[]) => Promise<unknown[]> };
    const original = db.batch.bind(db);
    const hook = vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, id));
      return original(queries);
    });
    const response = await ctx.request("/api/v1/auth/verify", json("POST", { token }));
    hook.mockRestore();
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await db.select().from(schema.users))[0]?.status).toBe("disabled");
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
  });

  it("revokes a client's old session and pending links when promoted to staff", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
    await seedUser(ctx, "client@test.dev");
    const client = await signIn(ctx, "client@test.dev");
    const oldToken = await link(ctx, "client@test.dev");
    const boss = await signIn(ctx, "boss@test.dev");
    expect((await ctx.request("/api/v1/admin/staff", asJson(boss, "POST", {
      email: "client@test.dev", staffRole: "delivery",
    }))).status).toBe(201);
    expect((await ctx.request("/api/v1/me", as(client))).status).toBe(401);
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token: oldToken }))).status).toBe(401);
    const fresh = tokenIn(ctx.mailer.sent.filter((mail) => mail.to === "client@test.dev").at(-1)!.text);
    const loggedIn = await ctx.request("/api/v1/auth/verify", json("POST", { token: fresh }));
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.headers.get("set-cookie")).toContain("Max-Age=43200");
  });

  it("does not restore an old link when a disabled account is re-enabled", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
    const id = await seedUser(ctx, "client@test.dev");
    const token = await link(ctx, "client@test.dev");
    const boss = await signIn(ctx, "boss@test.dev");
    for (const status of ["disabled", "active"]) {
      expect((await ctx.request(`/api/v1/admin/users/${id}`, asJson(boss, "PATCH", { status }))).status).toBe(200);
    }
    expect((await ctx.request("/api/v1/auth/verify", json("POST", { token }))).status).toBe(401);
  });

  it("replaces the current browser session when another link signs it in", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "client@test.dev");
    const oldCookie = await signIn(ctx, "client@test.dev");
    const token = await link(ctx, "client@test.dev");
    const response = await ctx.request("/api/v1/auth/verify", asJson(oldCookie, "POST", { token }));
    expect(response.status).toBe(200);
    expect((await ctx.request("/api/v1/me", as(oldCookie))).status).toBe(401);
    expect(await ctx.deps.db.select().from(schema.sessions)).toHaveLength(1);
  });

  it("refreshes the client cookie with the sliding expiry and never extends a staff session", async () => {
    const ctx = await makeTestApp();
    const now = Date.now();
    ctx.deps.now = () => now;
    await seedUser(ctx, "client@test.dev");
    await seedUser(ctx, "staff@test.dev", { staffRole: "delivery" });
    const client = await signIn(ctx, "client@test.dev");
    const staff = await signIn(ctx, "staff@test.dev");
    ctx.deps.now = () => now + 2 * 3_600_000;
    const refreshed = await ctx.request("/api/v1/me", as(client));
    expect(refreshed.headers.get("set-cookie")).toContain("Max-Age=2592000");
    expect((await ctx.request("/api/v1/me", as(staff))).headers.get("set-cookie")).toBeNull();
    ctx.deps.now = () => now + 13 * 3_600_000;
    expect((await ctx.request("/api/v1/me", as(staff))).status).toBe(401);
  });

  it("keeps an active staff admin when concurrent cross-demotions race", async () => {
    const ctx = await makeTestApp();
    const a = await seedUser(ctx, "a@test.dev", { staffRole: "admin" });
    const b = await seedUser(ctx, "b@test.dev", { staffRole: "admin" });
    const ca = await signIn(ctx, "a@test.dev");
    const cb = await signIn(ctx, "b@test.dev");
    const results = await Promise.all([
      ctx.request(`/api/v1/admin/users/${b}`, asJson(ca, "PATCH", { status: "disabled" })),
      ctx.request(`/api/v1/admin/users/${a}`, asJson(cb, "PATCH", { status: "disabled" })),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const users = await ctx.deps.db.select().from(schema.users);
    expect(users.filter((u) => u.staffRole === "admin" && u.status === "active")).toHaveLength(1);
  });

  it("does not reflect arbitrary privilege fields from a profile update", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "client@test.dev");
    const cookie = await signIn(ctx, "client@test.dev");
    expect((await ctx.request("/api/v1/me", asJson(cookie, "PATCH", { name: "Client", staffRole: "admin", status: "active" }))).status).toBe(200);
    expect((await body(await ctx.request("/api/v1/me", as(cookie)))).user.staffRole).toBeNull();
  });
});
