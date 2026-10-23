import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { createPool } from "mysql2/promise";
import * as schema from "./schema";

export { schema };

export type Db = MySql2Database<typeof schema>;

/** The pool and the query builder that sits on it. Keep both: batches need a dedicated connection. */
export interface Database {
  db: Db;
  pool: Pool;
}

export function createMysqlDatabase(url: string): Database {
  const pool = createPool({
    uri: url,
    connectionLimit: 10,
    // Timestamps are epoch milliseconds in BIGINT columns; keep them as numbers, not strings.
    supportBigNumbers: true,
    bigNumberStrings: false,
    // UPDATE reports rows matched, not rows changed. ROW_COUNT() then agrees with the SQLite changes() the app was written for.
    flags: ["+FOUND_ROWS"],
    charset: "utf8mb4",
    timezone: "Z",
  });
  const db = drizzle(pool, { schema, mode: "default" });
  poolOf.set(db, pool);
  return { db, pool };
}

const poolOf = new WeakMap<object, Pool>();

/** Rows touched by an INSERT, UPDATE or DELETE, from either a direct await or a batch result. */
export function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const value = (header as { affectedRows?: unknown } | null | undefined)?.affectedRows;
  return typeof value === "number" ? value : 0;
}

/**
 * Runs several write queries atomically on one connection. The queries are built (not run) from `db`;
 * their SQL is replayed inside a transaction, so either every statement lands or none does, and
 * ROW_COUNT() in a later statement refers to the statement just before it.
 */
export async function runBatch(db: Db, queries: unknown[]): Promise<{ affectedRows: number }[]> {
  const pool = poolOf.get(db);
  if (!pool) throw new Error("This database cannot run atomic batches");
  const connection = await pool.getConnection();
  const results: { affectedRows: number }[] = [];
  try {
    await connection.beginTransaction();
    for (const query of queries) {
      const { sql, params } = (query as { toSQL(): { sql: string; params: unknown[] } }).toSQL();
      const [result] = await connection.query(sql, params);
      results.push({ affectedRows: affectedRows(result) });
    }
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
