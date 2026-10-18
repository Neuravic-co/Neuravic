import { describe, expect, it } from "vitest";
import { schema } from "../src/db";
import { emailJob } from "../src/modules/notifications/outbox";
import { RETENTION, runMaintenance } from "../src/modules/maintenance/service";
import { makeTestApp } from "./helpers";

const DAY = 24 * 3_600_000;

describe("maintenance", () => {
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
      { ...base, id: "old-spam", name: "a", status: "spam", createdAt: now - RETENTION.spamLeadsMs - 1 },
      { ...base, id: "new-spam", name: "b", status: "spam", createdAt: now - DAY },
      { ...base, id: "old-lost", name: "c", status: "lost", createdAt: 1, updatedAt: now - RETENTION.lostLeadsMs - 1 },
      { ...base, id: "old-won", name: "d", status: "won", createdAt: 1, updatedAt: 1 },
    ]);
    await deps.db.insert(schema.leadNotes).values({ id: "n", leadId: "old-spam", authorId: "u", body: "x", createdAt: 1 });

    const report = await runMaintenance(deps);
    expect(report.leadsRemoved).toBe(2);
    const left = (await deps.db.select().from(schema.leads)).map((l) => l.id).sort();
    expect(left).toEqual(["new-spam", "old-won"]);
    expect(await deps.db.select().from(schema.leadNotes)).toHaveLength(0);
  });
});
