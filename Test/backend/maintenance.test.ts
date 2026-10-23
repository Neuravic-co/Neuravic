import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { schema } from "../../NBE/src/db";
import { emailJob } from "../../NBE/src/modules/notifications/outbox";
import { CLEANUP_BATCH_LIMIT, RETENTION, runMaintenance } from "../../NBE/src/modules/maintenance/service";
import { makeTestApp } from "./helpers";

const DAY = 24 * 3_600_000;

describe("maintenance", () => {
  it("bounds cleanup work per run and catches up on the next scheduled run", async () => {
    const { deps } = await makeTestApp();
    const now = 1000;
    deps.now = () => now;
    await deps.db.insert(schema.rateLimits).values(Array.from({ length: CLEANUP_BATCH_LIMIT + 10 }, (_, n) => ({ key: `old-${n}`, count: 1, expiresAt: 0 })));
    expect((await runMaintenance(deps)).rateLimitsRemoved).toBe(CLEANUP_BATCH_LIMIT);
    expect((await runMaintenance(deps)).rateLimitsRemoved).toBe(10);
  });

  it("keeps a lead and its notes when staff recover it before the retention batch", async () => {
    const { deps } = await makeTestApp();
    deps.now = () => 1000 * DAY;
    await deps.db.insert(schema.users).values({ id: "author", email: "a@test.dev", status: "active", createdAt: 0 });
    await deps.db.insert(schema.leads).values({ id: "recover", name: "A", email: "a@test.dev", message: "An enquiry", messageHash: "hash", serviceInterest: [], consentAt: 0, status: "spam", createdAt: 0, updatedAt: 0 });
    await deps.db.insert(schema.leadNotes).values({ id: "note", leadId: "recover", authorId: "author", body: "Keep this", createdAt: 0 });
    const db = deps.db as typeof deps.db & { batch: (queries: unknown[]) => Promise<unknown[]> };
    const original = db.batch.bind(db);
    const hook = vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db.update(schema.leads).set({ status: "won" }).where(eq(schema.leads.id, "recover"));
      return original(queries);
    });
    const report = await runMaintenance(deps);
    hook.mockRestore();
    expect(report.leadsRemoved).toBe(0);
    expect(await db.select().from(schema.leadNotes)).toHaveLength(1);
    expect((await db.select().from(schema.leads))[0]?.status).toBe("won");
  });

  it("retries due emails and removes expired sessions and tokens", async () => {
    const { deps, mailer } = await makeTestApp();
    const now = 1_000 * DAY;
    deps.now = () => now;
    await deps.db.insert(schema.users).values({ id: "u", email: "u@x.dev", status: "active", createdAt: 1 });
    await deps.db.insert(schema.sessions).values([
      { id: "old", userId: "u", expiresAt: now - 1, absoluteExpiresAt: now + DAY, createdAt: 1 },
      { id: "live", userId: "u", expiresAt: now + DAY, absoluteExpiresAt: now + DAY, createdAt: 1 },
    ]);
    await deps.db.insert(schema.authTokens).values([
      { id: "t-old", email: "u@x.dev", purpose: "login", expiresAt: now - 2 * DAY, createdAt: 1 },
      { id: "t-new", email: "u@x.dev", purpose: "login", expiresAt: now + 1, createdAt: 1 },
    ]);
    await emailJob(deps.db, now - 10, { to: "a@x.dev", subject: "Retry me", text: "x" });

    const report = await runMaintenance(deps);
    expect(report).toMatchObject({ emailsSent: 1, sessionsRemoved: 1, tokensRemoved: 1 });
    expect(mailer.sent).toHaveLength(1);
    expect((await deps.db.select().from(schema.sessions)).map((s) => s.id)).toEqual(["live"]);
  });

  it("applies lead retention and keeps recent or active leads", async () => {
    const { deps } = await makeTestApp();
    const now = 1_000 * DAY;
    deps.now = () => now;
    const base = { email: "a@x.dev", message: "m", messageHash: "h", serviceInterest: [], consentAt: 1, updatedAt: 1 };
    await deps.db.insert(schema.users).values({ id: "u", email: "u@x.dev", status: "active", createdAt: 1 });
    await deps.db.insert(schema.leads).values([
      { ...base, messageHash: "a", id: "old-spam", name: "a", status: "spam", createdAt: now - RETENTION.spamLeadsMs - 1 },
      { ...base, messageHash: "b", id: "new-spam", name: "b", status: "spam", createdAt: now - DAY },
      { ...base, messageHash: "c", id: "old-lost", name: "c", status: "lost", createdAt: 1, updatedAt: now - RETENTION.lostLeadsMs - 1 },
      { ...base, messageHash: "d", id: "old-won", name: "d", status: "won", createdAt: 1, updatedAt: 1 },
    ]);
    await deps.db.insert(schema.leadNotes).values({ id: "n", leadId: "old-spam", authorId: "u", body: "x", createdAt: 1 });

    const report = await runMaintenance(deps);
    expect(report.leadsRemoved).toBe(2);
    const left = (await deps.db.select().from(schema.leads)).map((l) => l.id).sort();
    expect(left).toEqual(["new-spam", "old-won"]);
    expect(await deps.db.select().from(schema.leadNotes)).toHaveLength(0);
  });
});
