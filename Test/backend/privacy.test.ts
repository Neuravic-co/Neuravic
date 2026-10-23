import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { schema } from "../../NBE/src/db";
import { as, asJson, body, makeTestApp, seedOrg, seedUser, signIn } from "./helpers";

async function setup() {
  const ctx = await makeTestApp();
  await seedOrg(ctx, "acme", { "owner@acme.dev": "owner", "other@acme.dev": "viewer" });
  await seedUser(ctx, "reviewer@test.dev", { staffRole: "admin" });
  const cookie = await signIn(ctx, "owner@acme.dev");
  return { ctx, cookie };
}
describe("privacy workflows", () => {
  it("does not invent a receipt when a conflicting request completes before the final lookup", async () => {
    const { ctx, cookie } = await setup();
    const db = ctx.deps.db as typeof ctx.deps.db & { batch: (queries: unknown[]) => Promise<unknown[]> };
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db.insert(schema.privacyRequests).values({ id: "winning-request", userId: "user-owner@acme.dev", kind: "export", createdAt: 1, updatedAt: 1 });
      const result = await original(queries);
      await db.update(schema.privacyRequests).set({ state: "fulfilled" }).where(eq(schema.privacyRequests.id, "winning-request"));
      return result;
    });
    const response = await ctx.request("/api/v1/me/privacy/requests", asJson(cookie, "POST", { kind: "export" }));
    expect(response.status).toBe(409);
    expect(await db.select().from(schema.privacyRequests)).toHaveLength(1);
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "privacy.requested"))).toHaveLength(0);
  });

  it("exports only the caller's account metadata, without credentials, other people or internal records", async () => {
    const { ctx, cookie } = await setup();
    const response = await ctx.request("/api/v1/me/privacy/export", as(cookie));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const data = await body(response), encoded = JSON.stringify(data);
    expect(data.profile.email).toBe("owner@acme.dev"); expect(data.memberships).toHaveLength(1);
    for (const value of ["other@acme.dev", "reviewer@test.dev", "encryptedSecret", "recoveryHashes", "sessionToken", "ipHash", "claimedSessionId"]) expect(encoded).not.toContain(value);
    expect(data.scope).toBe("account_profile_and_current_memberships");
    expect((await ctx.request("/api/v1/me/privacy/export")).status).toBe(401);
  });

  it("deduplicates concurrent requests, keeps a single audit, and never erases data on intake", async () => {
    const { ctx, cookie } = await setup();
    const responses = await Promise.all([1, 2].map(() => ctx.request("/api/v1/me/privacy/requests", asJson(cookie, "POST", { kind: "erasure" }))));
    const records = await Promise.all(responses.map((response) => body(response)));
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(records[0].id).toBe(records[1].id);
    expect(await ctx.deps.db.select().from(schema.privacyRequests)).toHaveLength(1);
    expect(await ctx.deps.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "privacy.requested"))).toHaveLength(1);
    expect(await ctx.deps.db.select().from(schema.users)).toHaveLength(3);
    const other = await signIn(ctx, "other@acme.dev");
    expect((await body(await ctx.request("/api/v1/me/privacy/requests", as(other)))).items).toHaveLength(0);
    expect((await ctx.request("/api/v1/admin/privacy-requests", as(other))).status).toBe(403);
  });

  it("requires fresh authentication, trusted origin and no caller-supplied subject", async () => {
    const { ctx, cookie } = await setup();
    expect((await ctx.request("/api/v1/me/privacy/requests", asJson(cookie, "POST", { kind: "export", userId: "another-person" }))).status).toBe(400);
    expect((await ctx.request("/api/v1/me/privacy/requests", as(cookie, { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: '{"kind":"erasure"}' }))).status).toBe(403);
    const now = Date.now(); ctx.deps.now = () => now + 16 * 60_000;
    expect((await ctx.request("/api/v1/me/privacy/export", as(cookie))).status).toBe(403);
    expect((await ctx.request("/api/v1/me/privacy/requests", asJson(cookie, "POST", { kind: "export" }))).status).toBe(403);
  });

  it("requires a separate admin, recorded review attestations and a valid state transition", async () => {
    const { ctx, cookie } = await setup();
    const { id } = await body(await ctx.request("/api/v1/me/privacy/requests", asJson(cookie, "POST", { kind: "export" })));
    const reviewer = await signIn(ctx, "reviewer@test.dev");
    const review = { state: "in_review", expectedState: "pending", reviewReference: "private-case-123", identityVerified: true, retentionReviewed: true };
    expect((await ctx.request(`/api/v1/admin/privacy-requests/${id}`, asJson(reviewer, "PATCH", { ...review, state: "fulfilled" }))).status).toBe(409);
    expect((await ctx.request(`/api/v1/admin/privacy-requests/${id}`, asJson(reviewer, "PATCH", { ...review, identityVerified: false }))).status).toBe(400);
    expect((await ctx.request(`/api/v1/admin/privacy-requests/${id}`, asJson(reviewer, "PATCH", review))).status).toBe(200);
    const decisions = await Promise.all(["fulfilled", "declined"].map((state) => ctx.request(`/api/v1/admin/privacy-requests/${id}`, asJson(reviewer, "PATCH", { ...review, expectedState: "in_review", state }))));
    expect(decisions.map((response) => response.status).sort()).toEqual([200, 409]);
    const own = await body(await ctx.request("/api/v1/me/privacy/requests", as(cookie)));
    expect(own.items[0]).not.toHaveProperty("reviewReference");
    const { id: ownId } = await body(await ctx.request("/api/v1/me/privacy/requests", asJson(reviewer, "POST", { kind: "erasure" })));
    expect((await ctx.request(`/api/v1/admin/privacy-requests/${ownId}`, asJson(reviewer, "PATCH", review))).status).toBe(403);
  });
});
