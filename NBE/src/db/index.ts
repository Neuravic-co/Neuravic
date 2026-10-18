import { drizzle } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

export { schema };

/**
 * Driver-agnostic async SQLite database.
 * Production uses Cloudflare D1; tests use an in-memory libSQL database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<"async", any, typeof schema>;

export function createD1Db(binding: D1Database): Db {
  return drizzle(binding, { schema });
}

/**
 * Runs several write queries atomically. D1 and libSQL both expose `batch`,
 * which executes the statements in a single transaction. D1 has no
 * interactive transactions, so use this instead of `db.transaction`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runBatch(db: Db, queries: any[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batchable = db as any;
  if (typeof batchable.batch === "function") {
    await batchable.batch(queries);
    return;
  }
  for (const query of queries) await query;
}
