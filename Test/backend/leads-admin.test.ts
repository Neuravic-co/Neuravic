import { describe, expect, it } from "vitest";
import { as, asJson, body, json, makeTestApp, seedUser, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  await seedUser(ctx, "sales@test.dev", { staffRole: "sales" });
  await seedUser(ctx, "delivery@test.dev", { staffRole: "delivery" });
  await seedUser(ctx, "client@test.dev");
  for (let i = 0; i < 3; i += 1) {
    await ctx.request(
      "/api/v1/leads",
      json("POST", { name: `Lead ${i}`, email: `l${i}@x.dev`, message: `Message number ${i} for the team`, consent: true }, { "cf-connecting-ip": `10.0.0.${i}` }),
    );
    ctx.deps.now = ((t) => () => (t += 10))(Date.now());
  }
  return ctx;
}

describe("lead inbox", () => {
  it("is limited to admin and sales staff", async () => {
    const ctx = await setup();
    expect((await ctx.request("/api/v1/leads")).status).toBe(401);
    const client = await signIn(ctx, "client@test.dev");
    expect((await ctx.request("/api/v1/leads", as(client))).status).toBe(403);
    const delivery = await signIn(ctx, "delivery@test.dev");
    expect((await ctx.request("/api/v1/leads", as(delivery))).status).toBe(403);
    const sales = await signIn(ctx, "sales@test.dev");
    expect((await ctx.request("/api/v1/leads", as(sales))).status).toBe(200);
  });

  it("paginates newest first with a cursor and hides internal fields", async () => {
    const ctx = await setup();
    const sales = await signIn(ctx, "sales@test.dev");
    const first = await body(await ctx.request("/api/v1/leads?limit=2", as(sales)));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items[0]).not.toHaveProperty("ipHash");
    const second = await body(await ctx.request(`/api/v1/leads?limit=2&cursor=${first.nextCursor}`, as(sales)));
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((l: { id: string }) => l.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("updates status, adds notes and exports CSV", async () => {
    const ctx = await setup();
    const sales = await signIn(ctx, "sales@test.dev");
    const { items } = await body(await ctx.request("/api/v1/leads", as(sales)));
    const id = items[0].id;
    expect((await ctx.request(`/api/v1/leads/${id}`, asJson(sales, "PATCH", { status: "qualified" }))).status).toBe(200);
    expect((await ctx.request(`/api/v1/leads/${id}`, asJson(sales, "PATCH", { status: "bogus" }))).status).toBe(400);
    expect((await ctx.request(`/api/v1/leads/${id}/notes`, asJson(sales, "POST", { body: "Called them" }))).status).toBe(201);
    const detail = await body(await ctx.request(`/api/v1/leads/${id}`, as(sales)));
    expect(detail.status).toBe("qualified");
    expect(detail.notes).toHaveLength(1);

    expect((await ctx.request("/api/v1/leads/export.csv?from=abc", as(sales))).status).toBe(400);
    const csv = await ctx.request("/api/v1/leads/export.csv", as(sales));
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\n")).toHaveLength(4);
  });

  it("neutralises spreadsheet formulas in CSV exports", async () => {
    const ctx = await makeTestApp();
    await seedUser(ctx, "sales@test.dev", { staffRole: "sales" });
    await ctx.request("/api/v1/leads", json("POST", { name: "=HYPERLINK(\"x\")", email: "f@x.dev", message: "A normal long message", consent: true }));
    const sales = await signIn(ctx, "sales@test.dev");
    const text = await (await ctx.request("/api/v1/leads/export.csv", as(sales))).text();
    expect(text).toContain("\"'=HYPERLINK");
  });
});
