import { describe, expect, it } from "vitest";
import { schema } from "../../NBE/src/db";
import { as, asJson, body, makeTestApp, seedOrg, signIn } from "./helpers";

describe("bounded portal collections", () => {
  it("pages comments with tied timestamps without duplicates, bounds detail, and preserves tenant checks", async () => {
    const ctx = await makeTestApp();
    const org = await seedOrg(ctx, "acme", { "owner@acme.dev": "owner" });
    await seedOrg(ctx, "other", { "owner@other.dev": "owner" });
    const cookie = await signIn(ctx, "owner@acme.dev");
    const project = await body(await ctx.request(`/api/v1/orgs/${org}/projects`, asJson(cookie, "POST", { name: "Project" })));
    const request = await body(await ctx.request(`/api/v1/projects/${project.id}/requests`, asJson(cookie, "POST", { type: "support", title: "Test", body: "Details" })));
    await ctx.deps.db.insert(schema.comments).values(Array.from({ length: 103 }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}`, requestId: request.id, authorId: "user-owner@acme.dev", body: `Comment ${i}`, createdAt: 10 })));
    const detail = await body(await ctx.request(`/api/v1/requests/${request.id}`, as(cookie)));
    expect(detail.comments).toHaveLength(100); expect(detail.commentsNextCursor).toBeTruthy();
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: { id: string }[]; nextCursor: string | null } = await body(await ctx.request(`/api/v1/requests/${request.id}/comments?limit=25${cursor ? `&cursor=${cursor}` : ""}`, as(cookie)));
      expect(page.items.length).toBeLessThanOrEqual(25);
      ids.push(...page.items.map((row: { id: string }) => row.id)); cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(103); expect(ids).toHaveLength(103);
    const outsider = await signIn(ctx, "owner@other.dev");
    expect((await ctx.request(`/api/v1/requests/${request.id}/comments`, as(outsider))).status).toBe(404);
    expect((await ctx.request(`/api/v1/requests/${request.id}/comments?limit=101`, as(cookie))).status).toBe(400);
    expect((await ctx.request(`/api/v1/requests/${request.id}/comments?cursor=invalid`, as(cookie))).status).toBe(400);
  });

  it("pages all memberships and restricts the operational status endpoint to staff admins", async () => {
    const ctx = await makeTestApp();
    const org = await seedOrg(ctx, "acme", { "owner@acme.dev": "owner" });
    const cookie = await signIn(ctx, "owner@acme.dev");
    await ctx.deps.db.insert(schema.users).values(Array.from({ length: 30 }, (_, i) => ({ id: `member-${i}`, email: `m${i}@acme.dev`, status: "active" as const, createdAt: 1 })));
    await ctx.deps.db.insert(schema.memberships).values(Array.from({ length: 30 }, (_, i) => ({ userId: `member-${i}`, orgId: org, role: "member" as const, createdAt: 1 })));
    const first = await body(await ctx.request(`/api/v1/orgs/${org}/members`, as(cookie)));
    const second = await body(await ctx.request(`/api/v1/orgs/${org}/members?cursor=${first.nextCursor}`, as(cookie)));
    expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(6);
    expect(new Set([...first.items, ...second.items].map((row) => row.userId)).size).toBe(31);
    expect((await ctx.request(`/api/v1/orgs/${org}/members?limit=101`, as(cookie))).status).toBe(400);
    expect((await ctx.request("/api/v1/admin/security-status", as(cookie))).status).toBe(403);
    expect((await ctx.request("/api/v1/admin/security-status")).status).toBe(401);
  });
});
