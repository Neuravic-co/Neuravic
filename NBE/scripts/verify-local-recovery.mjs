import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const backend = fileURLToPath(new URL("../", import.meta.url));
const tmp = path.resolve(backend, "../tmp");
mkdirSync(tmp, { recursive: true });
const fixture = mkdtempSync(path.join(tmp, "phase3-recovery-"));
const source = path.join(fixture, "source", ".wrangler", "state"), restored = path.join(fixture, "restored");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false", WRANGLER_LOG_PATH: path.join(fixture, "logs") };
for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL", "CLOUDFLARE_ACCOUNT_ID"]) delete env[name];
const started = Date.now();
function run(args) {
  assert(args.includes("--local") && !args.includes("--remote"));
  return execFileSync(process.execPath, [path.join(backend, "node_modules/wrangler/bin/wrangler.js"), "d1", ...args], { cwd: backend, env, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}
function query(directory, sql) {
  return JSON.parse(run(["execute", "neuravic-db", "--local", "--persist-to", directory, "--command", sql, "--json"]))[0].results;
}
try {
  run(["migrations", "apply", "neuravic-db", "--local", "--persist-to", source]);
  const seed = path.join(fixture, "seed.sql");
  writeFileSync(seed, `
    INSERT INTO users(id,email,status,staff_role,created_at) VALUES('fixture-user','recovery@example.test','active','admin',1);
    INSERT INTO orgs(id,name,slug,created_at) VALUES('fixture-org','Recovery fixture','recovery-fixture',1);
    INSERT INTO memberships(user_id,org_id,role,created_at) VALUES('fixture-user','fixture-org','owner',1);
    INSERT INTO sessions(id,user_id,expires_at,absolute_expires_at,mfa_verified_at,created_at) VALUES('fixture-session','fixture-user',9999999999999,9999999999999,2,1);
    INSERT INTO auth_tokens(id,email,purpose,expires_at,created_at) VALUES('fixture-token','recovery@example.test','login',9999999999999,1);
    INSERT INTO staff_mfa(user_id,encrypted_secret,enabled_at,created_at,recovery_hashes) VALUES('fixture-user','not-a-real-encrypted-seed',2,1,'["not-a-real-code-hash"]');
    INSERT INTO outbox(id,topic,payload,state,next_attempt_at,created_at) VALUES('fixture-job','email','{}','pending',1,1);
    INSERT INTO privacy_requests(id,user_id,kind,created_at,updated_at) VALUES('fixture-privacy','fixture-user','export',1,1);
  `);
  run(["execute", "neuravic-db", "--local", "--persist-to", source, "--file", seed]);
  const backup = path.join(fixture, "backup.sql");
  // Export only supports the config-relative default .wrangler/state directory.
  const exportConfig = path.resolve(source, "../..", "export.json");
  writeFileSync(exportConfig, JSON.stringify({ name: "isolated-recovery", compatibility_date: "2026-10-01", d1_databases: [{ binding: "DB", database_name: "neuravic-db", database_id: "REPLACE_WITH_D1_DATABASE_ID" }] }));
  // D1 enforces foreign keys: create every referenced table before importing rows.
  // A single alphabetic export interleaves table creation/data and can fail on missing parents.
  const schemaBackup = path.join(fixture, "schema.sql"), dataBackup = path.join(fixture, "data.sql");
  run(["export", "neuravic-db", "--local", "--config", exportConfig, "--no-data", "--output", schemaBackup]);
  run(["export", "neuravic-db", "--local", "--config", exportConfig, "--no-schema", "--output", dataBackup]);
  writeFileSync(backup, readFileSync(schemaBackup, "utf8") + "\n" + readFileSync(dataBackup, "utf8"));
  run(["execute", "neuravic-db", "--local", "--persist-to", restored, "--file", backup]);
  const counts = "SELECT (SELECT count(*) FROM users) AS users,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM privacy_requests) AS requests,(SELECT count(*) FROM d1_migrations) AS migrations";
  assert.deepEqual(query(source, counts), query(restored, counts));
  // D1's authorizer disallows integrity_check. Inspect the closed local SQLite fixture read-only.
  const databaseDir = path.join(restored, "v3", "d1", "miniflare-D1DatabaseObject");
  const databases = readdirSync(databaseDir).filter((name) => /^[a-f0-9]{64}\.sqlite$/.test(name));
  assert.equal(databases.length, 1);
  const database = new DatabaseSync(path.join(databaseDir, databases[0]), { readOnly: true });
  try {
    assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { database.close(); }
  // A restore can resurrect used sessions/links/recovery codes and resend jobs. Rehearse containment locally.
  query(restored, "DELETE FROM sessions; DELETE FROM auth_tokens; UPDATE staff_mfa SET recovery_hashes='[]'; UPDATE outbox SET state='dead',payload='{}',last_error='recovery_review_required' WHERE state='pending'");
  assert.equal(query(restored, "SELECT count(*) AS n FROM sessions")[0].n, 0);
  assert.equal(query(restored, "SELECT count(*) AS n FROM auth_tokens")[0].n, 0);
  assert.equal(query(restored, "SELECT count(*) AS n FROM staff_mfa WHERE recovery_hashes <> '[]'")[0].n, 0);
  assert.equal(query(restored, "SELECT count(*) AS n FROM outbox WHERE state='pending'")[0].n, 0);
  // Recovery guards survive restoration. A newly issued fixture session is revoked by factor removal.
  query(restored, "INSERT INTO sessions(id,user_id,expires_at,absolute_expires_at,created_at) VALUES('restored-test','fixture-user',9999999999999,9999999999999,1); DELETE FROM staff_mfa WHERE user_id='fixture-user'");
  assert.equal(query(restored, "SELECT count(*) AS n FROM sessions")[0].n, 0);
  const result = { status: "passed", scope: "isolated-local-D1-only", restoredCounts: query(restored, counts)[0], integrity: "local-SQLite-read-only-ok", foreignKeys: "ok", credentialContainment: "passed", factorRevocationGuard: "passed", elapsedMs: Date.now() - started };
  writeFileSync(path.join(fixture, "evidence.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch {
  console.error("Local D1 recovery verification failed; inspect the isolated fixture privately. No production operation was requested.");
  process.exitCode = 1;
}
