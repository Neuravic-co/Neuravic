import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";
import { createMysqlDatabase, schema } from "../../nbe/core/src/db";
import { loadConfig } from "../../nbe/core/src/config";
import { createApp } from "../../nbe/core/src/app";
import type { Deps } from "../../nbe/core/src/deps";
import { silentLogger } from "../../nbe/core/src/lib/logger";
import { MemoryRateLimiter } from "../../nbe/core/src/lib/rate-limit";
import { ResendMailer } from "../../nbe/core/src/modules/notifications/mailer";
import { leadsRoutes } from "../../nbe/core/src/modules/leads/routes";

/** Destructive fixtures are allowed ONLY in this explicitly named, loopback-only disposable database. */
export async function emailHarness() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("MySQL verification blocked: set TEST_DATABASE_URL to a disposable local neuravic_contact_test database. Never use production.");
  const url = new URL(raw);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname === "/neuravic_contact_test" && url.protocol === "mysql:", "Only the disposable local neuravic_contact_test database is permitted");
  const connection = await createConnection(raw);
  try {
    await connection.query("CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(200) PRIMARY KEY, applied_at bigint NOT NULL)");
    const [rows] = await connection.query("SELECT name FROM schema_migrations");
    const applied = new Set((rows as { name: string }[]).map(r => r.name));
    const dir = fileURLToPath(new URL("../../database/migrations/", import.meta.url));
    for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      for (const statement of readFileSync(`${dir}/${file}`, "utf8").split(/^-- @@\s*$/m).map(s => s.trim()).filter(Boolean)) await connection.query(statement);
      await connection.query("INSERT INTO schema_migrations VALUES (?, ?)", [file, Date.now()]);
    }
  } finally { await connection.end(); }
  const { db, pool } = createMysqlDatabase(raw);
  let clock = Date.now();
  const logs: unknown[] = [];
  const requests: { key: string; body: any }[] = [];
  const http: typeof fetch = async (_url, init) => {
    const key = new Headers(init?.headers).get("idempotency-key")!;
    requests.push({ key, body: JSON.parse(String(init?.body)) });
    return Response.json({ id: `00000000-0000-4000-8000-${requests.length.toString().padStart(12, "0")}` });
  };
  const deps: Deps = {
    config: loadConfig({ APP_URL: "http://localhost:5174", ALLOWED_ORIGINS: "http://localhost:5174", EMAIL_FROM: "Neuravic <contact@example.com>", NOTIFY_TO: "team@example.com" }),
    db, log: { ...silentLogger, warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    mailer: new ResendMailer("automated-test-only", "Neuravic <contact@example.com>", http),
    http: async () => { throw new Error("Unexpected external request; automated tests never send real mail"); },
    sso: null, blobs: null, rateLimiter: new MemoryRateLimiter(), now: () => clock,
    deliversMail: true, runInBackground: async () => { throw new Error("Intake must not deliver inline"); },
  };
  const app = createApp(() => deps, api => api.route("/leads", leadsRoutes));
  return {
    deps, db, pool, logs, requests, app,
    advance: (ms: number) => { clock += ms; },
    post: (input: unknown) => app.request("/api/v1/leads", { method: "POST", headers: { origin: deps.config.appUrl, "content-type": "application/json" }, body: JSON.stringify(input) }),
    async reset() {
      // This database must be disposable. Refusal checks above run before any write.
      for (const table of [schema.outbox, schema.auditLog, schema.leadNotes, schema.leads, schema.leadIntakeLocks]) await db.delete(table);
      logs.length = 0; requests.length = 0; deps.rateLimiter = new MemoryRateLimiter();
      deps.config.maintenanceMode = false; deps.deliversMail = true;
      deps.mailer = new ResendMailer("automated-test-only", deps.config.emailFrom, http);
    },
  };
}
