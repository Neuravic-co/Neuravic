import { describe, expect, it } from "vitest";
import { as, asJson, body, makeTestApp, seedUser, signIn } from "./helpers";

describe("public content", () => {
  it("serves the site content that is hard-coded in the frontend today", async () => {
    const { request } = await makeTestApp();
    const res = await request("/api/v1/content");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage");
    const content = await body(res);
    expect(content.services.map((s: { title: string }) => s.title)).toEqual([
      "AI Systems & Automation",
      "Software Platforms",
      "Product Experience",
      "Deployment & Operations",
    ]);
    expect(content.projects.map((p: { name: string }) => p.name)).toEqual(["DARKAGENT", "COOLACCESS_DXB"]);
    expect(content.process).toHaveLength(4);
    expect(content.team).toHaveLength(3);
    expect(content.company[0].locations.map((l: { city: string }) => l.city)).toEqual(["Dubai", "Cairo"]);
  });

  it("serves one kind and rejects unknown kinds", async () => {
    const { request } = await makeTestApp();
    expect((await body(await request("/api/v1/content/team"))).items).toHaveLength(3);
    expect((await request("/api/v1/content/unknown")).status).toBe(404);
  });
});

describe("content admin", () => {
  it("lets a staff admin edit and unpublish items", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
    const boss = await signIn(ctx, "boss@test.dev");
    const edit = await ctx.request(
      "/api/v1/admin/content/team/member-1",
      asJson(boss, "PUT", { position: 0, data: { number: "01", city: "Cairo", name: "Alex Doe", role: "Engineer" } }),
    );
    expect(edit.status).toBe(200);
    const team = (await body(await ctx.request("/api/v1/content/team"))).items;
    expect(team[0].name).toBe("Alex Doe");

    await ctx.request(
      "/api/v1/admin/content/team/member-2",
      asJson(boss, "PUT", { position: 1, published: false, data: { number: "02", city: "Cairo", name: null, role: null } }),
    );
    expect((await body(await ctx.request("/api/v1/content/team"))).items).toHaveLength(2);
    expect((await body(await ctx.request("/api/v1/admin/content/team", as(boss)))).items).toHaveLength(3);
  });

  it("validates data per kind and requires the admin role", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
    await seedUser(ctx, "sales@test.dev", { staffRole: "sales" });
    const boss = await signIn(ctx, "boss@test.dev");
    const bad = await ctx.request("/api/v1/admin/content/projects/x", asJson(boss, "PUT", { data: { name: "X", surprise: 1 } }));
    expect(bad.status).toBe(400);
    const sales = await signIn(ctx, "sales@test.dev");
    const denied = await ctx.request("/api/v1/admin/content/team/member-1", asJson(sales, "PUT", { data: {} }));
    expect(denied.status).toBe(403);
    expect((await ctx.request("/api/v1/admin/content/team/member-1", { method: "DELETE" })).status).toBe(401);
  });

  it("deletes items", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "boss@test.dev", { staffRole: "admin" });
    const boss = await signIn(ctx, "boss@test.dev");
    await ctx.request("/api/v1/content");
    expect((await ctx.request("/api/v1/admin/content/team/member-3", as(boss, { method: "DELETE" }))).status).toBe(204);
    expect((await ctx.request("/api/v1/admin/content/team/member-3", as(boss, { method: "DELETE" }))).status).toBe(404);
    expect((await body(await ctx.request("/api/v1/content/team"))).items).toHaveLength(2);
  });
});
