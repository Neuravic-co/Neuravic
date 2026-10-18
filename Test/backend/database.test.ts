import { describe, expect, it } from "vitest";
import { schema } from "../src/db";
import { runBatch } from "../src/db";
import { recentAudit, writeAudit } from "../src/modules/audit/audit";
import { createTestDb } from "./helpers";

describe("database", () => {
  it("applies migrations and enforces unique emails", async () => {
    const db = await createTestDb();
    const row = { id: "u1", email: "a@test.dev", status: "active" as const, createdAt: 1 };
    await db.insert(schema.users).values(row);
    await expect(db.insert(schema.users).values({ ...row, id: "u2" })).rejects.toThrow();
  });

  it("batch is atomic: a failing statement rolls back the others", async () => {
    const db = await createTestDb();
    const org = { id: "o1", name: "Acme", slug: "acme", createdAt: 1 };
    await expect(
      runBatch(db, [
        db.insert(schema.orgs).values(org),
        db.insert(schema.orgs).values({ ...org, id: "o2" }), // duplicate slug
      ]),
    ).rejects.toThrow();
    expect(await db.select().from(schema.orgs)).toHaveLength(0);
  });

  it("writes audit entries with hashed ip", async () => {
    const db = await createTestDb();
    await writeAudit(db, { action: "test.event", ip: "203.0.113.7" }, 10);
    const [entry] = await recentAudit(db);
    expect(entry?.action).toBe("test.event");
    expect(entry?.ipHash).toHaveLength(32);
    expect(entry?.ipHash).not.toContain("203");
  });
});
