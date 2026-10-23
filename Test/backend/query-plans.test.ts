import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers";

/**
 * Guards database efficiency. On Cloudflare D1 every row a query reads is billed and adds latency, so the
 * queries behind tables that grow (leads, requests, audit log, sessions, ...) must use an index and return
 * rows already in order. These statements mirror the ones in NBE/src/modules; keep them in sync when a
 * list's filter or ordering changes.
 */
const QUERIES: Record<string, string> = {
  "paged request comments": "select * from comments where request_id = 'r' order by created_at desc, id desc limit 101",
  "paged organisation memberships": "select * from memberships where org_id = 'o' order by created_at desc, user_id desc limit 26",
  "due quarantined files": "select * from files where scan_state = 'pending' and next_scan_at <= 1 order by next_scan_at limit 5",
  "lead inbox filtered by status": "select * from leads where status = 'new' order by created_at desc, id desc limit 26",
  "lead inbox, all statuses": "select * from leads order by created_at desc, id desc limit 26",
  "lead duplicate check": "select id from leads where email = 'a' and message_hash = 'h' and created_at >= 0 limit 1",
  "requests of a project": "select * from requests where project_id = 'p' order by created_at desc, id desc limit 26",
  "approver queue (org, state)": "select * from requests where org_id = 'o' and state = 'open' order by created_at desc, id desc limit 26",
  "all requests of an org": "select * from requests where org_id = 'o' order by created_at desc, id desc limit 26",
  "projects of an org": "select * from projects where org_id = 'o' order by created_at desc, id desc limit 26",
  "organisation activity feed": "select * from audit_log where org_id = 'o' order by at desc, id desc limit 31",
  "admin audit filtered by action": "select * from audit_log where action = 'x' order by at desc, id desc limit 51",
  "admin audit, everything": "select * from audit_log order by at desc, id desc limit 51",
  "comments of a request": "select * from comments where request_id = 'r' order by created_at",
  "files of a request": "select * from files where request_id = 'r' order by created_at",
  "session lookup": "select * from sessions where id = 'x'",
  "memberships of a user": "select * from memberships where user_id = 'u'",
  "cleanup of expired sessions": "delete from sessions where id in (select id from sessions where expires_at < 1 or absolute_expires_at < 1 limit 500)",
  "cleanup of expired login tokens": "delete from auth_tokens where id in (select id from auth_tokens where expires_at < 1 limit 500)",
  "cleanup of old leads": "select id from leads where (status = 'spam' and created_at < 1) or (status = 'lost' and updated_at < 1) limit 500",
  "due outbox jobs": "select * from outbox where state = 'pending' and next_attempt_at <= 1 order by next_attempt_at limit 20",
};

describe("database query plans", () => {
  for (const [name, statement] of Object.entries(QUERIES)) {
    it(`${name} uses an index and needs no extra sort`, async () => {
      const db = await createTestDb();
      const rows = (await db.all(sql.raw(`explain query plan ${statement}`))) as { detail: string }[];
      const plan = rows.map((row) => row.detail);

      // A bare "SCAN table" reads every row. "SCAN table USING INDEX" walks an index in order and stops at LIMIT.
      const fullScans = plan.filter((step) => /^SCAN \S+$/.test(step) || /^SCAN \S+ USING (COVERING )?INDEX sqlite_autoindex/.test(step));
      const sorts = plan.filter((step) => step.includes("TEMP B-TREE"));
      expect(fullScans, `full table scan in: ${plan.join(" | ")}`).toEqual([]);
      // Sorting only the ties inside one index range ("RIGHT PART") is cheap; a full external sort is not.
      expect(
        sorts.filter((step) => !step.includes("RIGHT PART")),
        `extra sort in: ${plan.join(" | ")}`,
      ).toEqual([]);
    });
  }
});
