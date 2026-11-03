import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseSsl } from "../../nbe/core/src/db/ssl";

/** Applies migrations/*.sql in order, once each. Forward only: add a new numbered file for every schema change. */
const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see docs/02-Getting-Started.md)");

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: databaseSsl() });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(200) NOT NULL PRIMARY KEY, applied_at bigint NOT NULL)",
  );
  for (const file of files) {
    const statements = readFileSync(join(dir, file), "utf8")
      .split(/^-- @@\s*$/m)
      .map((statement) => statement.trim())
      .filter(Boolean);
    // Postgres can roll back schema changes, so a failed file leaves nothing half-applied.
    await client.query("BEGIN");
    try {
      // Two people running the migration at once would otherwise race; the second waits here, then sees the first's work.
      // A transaction-level lock also works through a connection pooler, unlike a session-level one.
      await client.query("SELECT pg_advisory_xact_lock(7263418)");
      const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (done.rowCount) {
        await client.query("ROLLBACK");
        continue;
      }
      for (const statement of statements) await client.query(statement);
      await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [file, Date.now()]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    console.log(`applied ${file} (${statements.length} statements)`);
  }
  console.log("database is up to date");
} finally {
  await client.end();
}
