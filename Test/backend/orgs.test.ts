import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { schema } from "../../NBE/src/db";
import { as, asJson, body, makeTestApp, seedOrg, seedUser, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
  const orgId = await seedOrg(ctx, "acme", {
    "owner@acme.dev": "owner",
    "admin@acme.dev": "admin",
    "member@acme.dev": "member",
    "viewer@acme.dev": "viewer",
  });
  await seedOrg(ctx, "other", { "owner@other.dev": "owner" });
  return { ctx, orgId };
}

describe("organisations", () => {
  it("preserves implicit staff-admin authority without an explicit membership", async () => {
    const { ctx, orgId } = await setup();
    const boss = await signIn(ctx, "boss@test.dev");
    const path = `/api/v1/orgs/${orgId}/members/user-member@acme.dev`;
    expect((await ctx.request(path, asJson(boss, "PATCH", { role: "owner" }))).status).toBe(200);
    expect((await ctx.request(path, as(boss, { method: "DELETE" }))).status).toBe(204);
  });

  it.each(["PATCH", "DELETE"])("rejects %s if the initiating session is revoked before the write", async (method) => {
    const { ctx, orgId } = await setup();
    const admin = await signIn(ctx, "admin@acme.dev");
    const db = ctx.deps.db as typeof ctx.deps.db & { batch: (queries: unknown[]) => Promise<unknown[]> };
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, "user-admin@acme.dev"));
      return original(queries);
    });
    const userId = "user-member@acme.dev";
    const response = await ctx.request(`/api/v1/orgs/${orgId}/members/${userId}`, method === "PATCH" ? asJson(admin, method, { role: "admin" }) : as(admin, { method }));
    expect(response.status).toBe(409);
    expect((await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId))))[0]!.role).toBe("member");
  });

  it.each(["PATCH", "DELETE"])("rejects %s when a target is promoted after authorization", async (method) => {
    const { ctx, orgId } = await setup();
    const admin = await signIn(ctx, "admin@acme.dev");
    const userId = "user-member@acme.dev";
    const db = ctx.deps.db as typeof ctx.deps.db & { batch: (queries: unknown[]) => Promise<unknown[]> };
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db.update(schema.memberships).set({ role: "owner" }).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)));
      return original(queries);
    });
    const response = await ctx.request(`/api/v1/orgs/${orgId}/members/${userId}`, method === "PATCH" ? asJson(admin, method, { role: "viewer" }) : as(admin, { method }));
    expect(response.status).toBe(409);
    expect((await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId))))[0]!.role).toBe("owner");
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, userId))).toHaveLength(0);
  });

  it.each(["PATCH", "DELETE"])("rejects %s when the caller loses admin authority before the write", async (method) => {
    const { ctx, orgId } = await setup();
    const admin = await signIn(ctx, "admin@acme.dev");
    const db = ctx.deps.db as typeof ctx.deps.db & { batch: (queries: unknown[]) => Promise<unknown[]> };
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db.update(schema.memberships).set({ role: "viewer" }).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, "user-admin@acme.dev")));
      return original(queries);
    });
    const userId = "user-member@acme.dev";
    const response = await ctx.request(`/api/v1/orgs/${orgId}/members/${userId}`, method === "PATCH" ? asJson(admin, method, { role: "admin" }) : as(admin, { method }));
    expect(response.status).toBe(409);
    expect((await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId))))[0]!.role).toBe("member");
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, userId))).toHaveLength(0);
  });

  it("staff admin creates an org and invites its owner by email", async () => {
    const { ctx } = await setup();
    const boss = await signIn(ctx, "boss@test.dev");
    const res = await ctx.request("/api/v1/orgs", asJson(boss, "POST", { name: "Globex Corp", ownerEmail: "new@globex.dev" }));
    expect(res.status).toBe(201);
    expect((await body(res)).slug).toBe("globex-corp");
    expect(ctx.mailer.sent.at(-1)?.to).toBe("new@globex.dev");
    expect(ctx.mailer.sent.at(-1)?.subject).toContain("Globex Corp");
    // The invited owner can sign in and sees the org.
    const owner = await signIn(ctx, "new@globex.dev");
    const me = await body(await ctx.request("/api/v1/me", as(owner)));
    expect(me.memberships[0].role).toBe("owner");
  });

  it("rejects duplicate slugs and non-staff creation", async () => {
    const { ctx } = await setup();
    const boss = await signIn(ctx, "boss@test.dev");
    expect((await ctx.request("/api/v1/orgs", asJson(boss, "POST", { name: "Acme", slug: "acme" }))).status).toBe(409);
    const owner = await signIn(ctx, "owner@acme.dev");
    expect((await ctx.request("/api/v1/orgs", asJson(owner, "POST", { name: "Nope" }))).status).toBe(403);
  });

  it("hides organisations from non-members (404) and limits viewers", async () => {
    const { ctx, orgId } = await setup();
    const outsider = await signIn(ctx, "owner@other.dev");
    expect((await ctx.request(`/api/v1/orgs/${orgId}`, as(outsider))).status).toBe(404);
    const viewer = await signIn(ctx, "viewer@acme.dev");
    expect((await ctx.request(`/api/v1/orgs/${orgId}`, as(viewer))).status).toBe(200);
    expect((await ctx.request(`/api/v1/orgs/${orgId}/members`, as(viewer))).status).toBe(200);
    expect((await ctx.request(`/api/v1/orgs/${orgId}/members`, asJson(viewer, "POST", { email: "x@y.dev" }))).status).toBe(403);
  });

  it("org admins invite members but cannot grant owner", async () => {
    const { ctx, orgId } = await setup();
    const admin = await signIn(ctx, "admin@acme.dev");
    const ok = await ctx.request(`/api/v1/orgs/${orgId}/members`, asJson(admin, "POST", { email: "fresh@acme.dev", role: "member" }));
    expect(ok.status).toBe(201);
    const denied = await ctx.request(`/api/v1/orgs/${orgId}/members`, asJson(admin, "POST", { email: "x@acme.dev", role: "owner" }));
    expect(denied.status).toBe(403);
    const dup = await ctx.request(`/api/v1/orgs/${orgId}/members`, asJson(admin, "POST", { email: "fresh@acme.dev" }));
    expect(dup.status).toBe(409);
  });

  it("keeps at least one owner", async () => {
    const { ctx, orgId } = await setup();
    const owner = await signIn(ctx, "owner@acme.dev");
    const ownerId = "user-owner@acme.dev";
    expect((await ctx.request(`/api/v1/orgs/${orgId}/members/${ownerId}`, asJson(owner, "PATCH", { role: "admin" }))).status).toBe(409);
    expect((await ctx.request(`/api/v1/orgs/${orgId}/members/${ownerId}`, as(owner, { method: "DELETE" }))).status).toBe(409);
  });

  it("allows members to leave and admins to change roles", async () => {
    const { ctx, orgId } = await setup();
    const admin = await signIn(ctx, "admin@acme.dev");
    expect((await ctx.request(`/api/v1/orgs/${orgId}/members/user-member@acme.dev`, asJson(admin, "PATCH", { role: "admin" }))).status).toBe(200);
    const viewer = await signIn(ctx, "viewer@acme.dev");
    expect((await ctx.request(`/api/v1/orgs/${orgId}/members/user-viewer@acme.dev`, as(viewer, { method: "DELETE" }))).status).toBe(204);
    expect((await ctx.request(`/api/v1/orgs/${orgId}`, as(viewer))).status).toBe(404);
  });

  it("lists all orgs for staff only", async () => {
    const { ctx } = await setup();
    const boss = await signIn(ctx, "boss@test.dev");
    expect((await body(await ctx.request("/api/v1/orgs", as(boss)))).items).toHaveLength(2);
    const owner = await signIn(ctx, "owner@acme.dev");
    expect((await ctx.request("/api/v1/orgs", as(owner))).status).toBe(403);
  });

  it("never leaves an organisation without an owner when two owners leave at once", async () => {
    const ctx = await makeTestApp();
    const orgId = await seedOrg(ctx, "duo", { "a@duo.dev": "owner", "b@duo.dev": "owner" });
    const [a, b] = await Promise.all([signIn(ctx, "a@duo.dev"), signIn(ctx, "b@duo.dev")]);
    const leave = (who: typeof a, email: string) =>
      ctx.request(`/api/v1/orgs/${orgId}/members/user-${email}`, as(who, { method: "DELETE" }));
    const statuses = (await Promise.all([leave(a, "a@duo.dev"), leave(b, "b@duo.dev")])).map((r) => r.status).sort();
    expect(statuses).toEqual([204, 409]);
  });
});
