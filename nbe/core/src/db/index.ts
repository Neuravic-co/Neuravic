import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { databaseSsl } from "./ssl";
import * as schema from "./schema";

export { schema };

export type Db = NodePgDatabase<typeof schema>;

/** The pool and the query builder that sits on it. Keep both: batches need a dedicated connection. */
export interface Database {
  db: Db;
  pool: pg.Pool;
}

// Timestamps are epoch milliseconds in BIGINT columns (and counts are bigint too): hand them back as numbers, not strings.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createDatabase(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    connectionTimeoutMillis: 10_000,
    // Serverless hosts freeze idle functions; do not keep connections open for long.
    idleTimeoutMillis: 20_000,
    ssl: databaseSsl(),
  });
  // A managed database may close an idle connection. Without a listener that would crash the process.
  pool.on("error", () => undefined);
  const db = drizzle(pool, { schema });
  poolOf.set(db, pool);
  return { db, pool };
}

const poolOf = new WeakMap<object, pg.Pool>();

/** Rows touched by an INSERT, UPDATE or DELETE, from either a direct await or a batch result. */
export function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const value = (header as { rowCount?: unknown; affectedRows?: unknown } | null | undefined);
  const count = value?.rowCount ?? value?.affectedRows;
  return typeof count === "number" ? count : 0;
}

/**
 * Runs several write queries atomically on one connection. The queries are built (not run) from `db`;
 * their SQL is replayed inside a transaction, so either every statement lands or none does.
 *
 * A statement may contain `row_count()` (a function created by migration 004): it reports how many rows the
 * statement just before it touched, which is how an audit row is written only when the change really happened.
 */
export async function runBatch(db: Db, queries: unknown[]): Promise<{ affectedRows: number }[]> {
  const pool = poolOf.get(db);
  if (!pool) throw new Error("This database cannot run atomic batches");
  const client = await pool.connect();
  const results: { affectedRows: number }[] = [];
  let previous = 0;
  try {
    await client.query("BEGIN");
    for (const query of queries) {
      const { sql, params } = (query as { toSQL(): { sql: string; params: unknown[] } }).toSQL();
      if (sql.includes("row_count()")) await client.query("SELECT set_config('app.row_count', $1, true)", [String(previous)]);
      const result = await client.query(sql, params);
      previous = result.rowCount ?? 0;
      results.push({ affectedRows: previous });
    }
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
