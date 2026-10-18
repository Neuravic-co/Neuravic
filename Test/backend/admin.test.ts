import { describe, expect, it } from "vitest";
import { as, asJson, body, json, makeTestApp, seedOrg, seedUser, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
  await seedUser(ctx, "sales@test.dev", { staffRole: "sales" });
  await seedOrg(ctx, "acme", { "owner@acme.dev": "owner" });
  return { ctx, boss: await signIn(ctx, "boss@test.dev") };
}

describe("admin", () => {
  it("is staff-admin only", async () => {
    const { ctx } = await setup();
    expect((await ctx.request("/api/v1/admin/overview")).status).toBe(401);
    const sales = await signIn(ctx, "sales@test.dev");
    for (const path of ["/admin/overview", "/admin/users", "/admin/audit"]) {
      expect((await ctx.request(`/api/v1${path}`, as(sales))).status).toBe(403);
    }
  });

  it("reports an overview", async () => {
    const { ctx, boss } = await setup();
    await ctx.request("/api/v1/leads", json("POST", { name: "A", email: "a@x.dev", message: "A real enquiry here", consent: true }));
    const overview = await body(await ctx.request("/api/v1/admin/overview", as(boss)));
    expect(overview.leads.new).toBe(1);
    expect(overview.orgs).toBe(1);
    expect(overview.users).toBe(3);
  });

  it("invites staff, who can then sign in with their role", async () => {
    const { ctx, boss } = await setup();
    const res = await ctx.request("/api/v1/admin/staff", asJson(boss, "POST", { email: "new@test.dev", staffRole: "delivery" }));
    expect(res.status).toBe(201);
    expect((await ctx.request("/api/v1/admin/staff", asJson(boss, "POST", { email: "new@test.dev", staffRole: "sales" }))).status).toBe(409);
    const newbie = await signIn(ctx, "new@test.dev");
    expect((await body(await ctx.request("/api/v1/me", as(newbie)))).user.staffRole).toBe("delivery");
  });

  it("disabling a user ends their sessions; the last admin is protected", async () => {
    const { ctx, boss } = await setup();
    const sales = await signIn(ctx, "sales@test.dev");
    const salesId = "user-sales@test.dev";
    expect((await ctx.request(`/api/v1/admin/users/${salesId}`, asJson(boss, "PATCH", { status: "disabled" }))).status).toBe(200);
    expect((await ctx.request("/api/v1/me", as(sales))).status).toBe(401);

    const bossId = "user-boss@test.dev";
    expect((await ctx.request(`/api/v1/admin/users/${bossId}`, asJson(boss, "PATCH", { status: "disabled" }))).status).toBe(409);
    expect((await ctx.request(`/api/v1/admin/users/${bossId}`, asJson(boss, "PATCH", { staffRole: "sales" }))).status).toBe(409);
  });

  it("lists users and filters audit entries", async () => {
    const { ctx, boss } = await setup();
    const staff = await body(await ctx.request("/api/v1/admin/users?staff=true", as(boss)));
    expect(staff.items.map((u: { email: string }) => u.email).sort()).toEqual(["boss@test.dev", "sales@test.dev"]);
    const audit = await body(await ctx.request("/api/v1/admin/audit?action=auth.login", as(boss)));
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items.every((e: { action: string }) => e.action === "auth.login")).toBe(true);
  });
});
