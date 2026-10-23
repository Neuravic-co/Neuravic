import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import type { Db } from "./index";

/** A hosted libSQL (Turso) database: the same SQLite dialect and migrations as Cloudflare D1. */
export function createLibsqlDb(url: string, authToken?: string): Db {
  return drizzle(createClient({ url, authToken }), { schema });
}
