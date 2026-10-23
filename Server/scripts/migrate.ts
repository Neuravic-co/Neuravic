import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";

/** Applies sql/*.sql in order, once each. Forward only: add a new numbered file for every schema change. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see Server/README.md)");

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "sql");
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

const connection = await createConnection({ uri: url, multipleStatements: false });
try {
  await connection.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(200) NOT NULL PRIMARY KEY, applied_at bigint NOT NULL) ENGINE=InnoDB",
  );
  const [rows] = await connection.query("SELECT name FROM schema_migrations");
  const applied = new Set((rows as { name: string }[]).map((row) => row.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const statements = readFileSync(join(dir, file), "utf8")
      .split(/^-- @@\s*$/m)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await connection.query(statement);
    await connection.query("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [file, Date.now()]);
    console.log(`applied ${file} (${statements.length} statements)`);
  }
  console.log("database is up to date");
} finally {
  await connection.end();
}
