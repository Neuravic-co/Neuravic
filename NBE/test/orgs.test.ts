import { describe, expect, it } from "vitest";
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
});
