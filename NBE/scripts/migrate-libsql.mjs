// Applies migrations/*.sql, in order, to a libSQL (Turso) database. Safe to run again: applied files are recorded.
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-libsql.mjs
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for a hosted database).");
  process.exit(1);
}
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const dir = join(import.meta.dirname, "..", "migrations");

await client.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
const done = new Set((await client.execute("SELECT name FROM _migrations")).rows.map((row) => String(row.name)));

for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const statements = readFileSync(join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((sql) => sql.trim())
    .filter(Boolean);
  await client.batch(
    [...statements.map((sql) => ({ sql, args: [] })), { sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", args: [file, Date.now()] }],
    "write",
  );
  console.log(`applied ${file}`);
}
console.log("database is up to date");
