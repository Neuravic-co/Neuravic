import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { databaseSsl } from "./ssl";

export { schema };

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export interface Database {
  db: Db;
  close(): Promise<void>;
}

export function createDatabase(options: { url: string; poolSize: number; caCert: string | null }): Database {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.poolSize,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
    ssl: databaseSsl(options.caCert),
  });
  pool.on("error", () => undefined);
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
