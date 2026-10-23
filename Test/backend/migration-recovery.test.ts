import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

const migrations = resolve(import.meta.dirname, "../../NBE/migrations");
const journal = JSON.parse(readFileSync(resolve(migrations, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
const sqlFor = (tag: string) => readFileSync(resolve(migrations, `${tag}.sql`), "utf8");

describe("isolated migration upgrade and recovery invariants", () => {
  it("upgrades a populated pre-hardening database without dropping data and restores security guards", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      for (const { tag } of journal.entries.slice(0, 3)) await client.executeMultiple(sqlFor(tag));
      await client.executeMultiple(`
        INSERT INTO users(id,email,status,staff_role,created_at) VALUES('legacy-admin','legacy@example.test','active','admin',1);
        INSERT INTO orgs(id,name,slug,created_at) VALUES('legacy-org','Fixture','fixture',1);
        INSERT INTO memberships(user_id,org_id,role,created_at) VALUES('legacy-admin','legacy-org','owner',1);
        INSERT INTO projects(id,org_id,name,status,created_by,created_at) VALUES('legacy-project','legacy-org','Fixture','active','legacy-admin',1);
        INSERT INTO requests(id,project_id,org_id,type,title,body,state,required_approvals,requested_by,created_at,updated_at) VALUES('legacy-request','legacy-project','legacy-org','change','Fixture','Fixture','open',1,'legacy-admin',1,1);
        INSERT INTO files(id,org_id,request_id,storage_key,name,size,mime,sha256,scan_state,uploaded_by,created_at) VALUES('legacy-file','legacy-org','legacy-request','private/fixture','fixture.txt',5,'text/plain','fixture-digest','pending','legacy-admin',1);
        INSERT INTO sessions(id,user_id,expires_at,absolute_expires_at,created_at) VALUES('legacy-session','legacy-admin',9999999999999,9999999999999,1);
        INSERT INTO auth_tokens(id,email,purpose,expires_at,created_at) VALUES('legacy-token','legacy@example.test','login',9999999999999,1);
      `);
      for (const { tag } of journal.entries.slice(3)) await client.executeMultiple(sqlFor(tag));
      expect((await client.execute("SELECT count(*) AS n FROM requests")).rows[0]!.n).toBe(1);
      expect((await client.execute("SELECT mfa_verified_at FROM sessions")).rows[0]!.mfa_verified_at).toBeNull();
      expect((await client.execute("SELECT claimed_session_id FROM auth_tokens")).rows[0]!.claimed_session_id).toBeNull();
      expect((await client.execute("SELECT scan_state,scan_attempts,next_scan_at FROM files")).rows[0]).toMatchObject({ scan_state: "pending", scan_attempts: 0, next_scan_at: 0 });
      // Older readers can still select their columns; rolling back their security behavior is not authorized.
      expect((await client.execute("SELECT id,email,status,staff_role FROM users")).rows[0]!.id).toBe("legacy-admin");
      await expect(client.execute("UPDATE users SET status='disabled' WHERE id='legacy-admin'")).rejects.toThrow("last_staff_admin");
      await expect(client.execute("INSERT INTO approvals(id,request_id,approver_id,decision,decided_at) VALUES('self-approval','legacy-request','legacy-admin','approved',1)")).rejects.toThrow("approver_not_authorized");
      await client.execute("INSERT INTO staff_mfa(user_id,encrypted_secret,enabled_at,created_at) VALUES('legacy-admin','fixture-only',2,1)");
      await client.execute("DELETE FROM staff_mfa WHERE user_id='legacy-admin'");
      expect((await client.execute("SELECT count(*) AS n FROM sessions")).rows[0]!.n).toBe(0);
      expect((await client.execute("SELECT count(*) AS n FROM auth_tokens")).rows[0]!.n).toBe(0);
      expect((await client.execute("PRAGMA integrity_check")).rows[0]!.integrity_check).toBe("ok");
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
    } finally { client.close(); }
  });

  it("keeps only one open privacy request but permits a new request after completion", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      for (const { tag } of journal.entries) await client.executeMultiple(sqlFor(tag));
      await client.execute("INSERT INTO users(id,email,status,created_at) VALUES('u','u@example.test','active',1)");
      await client.execute("INSERT INTO privacy_requests(id,user_id,kind,created_at,updated_at) VALUES('one','u','erasure',1,1)");
      await expect(client.execute("INSERT INTO privacy_requests(id,user_id,kind,created_at,updated_at) VALUES('two','u','erasure',2,2)")).rejects.toThrow();
      await client.execute("UPDATE privacy_requests SET state='fulfilled' WHERE id='one'");
      await client.execute("INSERT INTO privacy_requests(id,user_id,kind,created_at,updated_at) VALUES('two','u','erasure',2,2)");
      expect((await client.execute("SELECT count(*) AS n FROM privacy_requests")).rows[0]!.n).toBe(2);
    } finally { client.close(); }
  });
});
