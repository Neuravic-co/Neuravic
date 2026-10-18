import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { schema, type Db } from "../src/db";
import type { Deps } from "../src/deps";
import type { Env } from "../src/env";
import { silentLogger } from "../src/lib/logger";
import { MemoryMailer } from "../src/modules/notifications/mailer";

export const testEnv = {
  APP_ENV: "development",
  APP_URL: "https://app.test",
  ALLOWED_ORIGINS: "https://app.test",
  EMAIL_FROM: "Neuravic <no-reply@test.dev>",
  NOTIFY_TO: "team@test.dev",
  SSO_AUDIENCES: "darkagent,coolaccess_dxb",
} as unknown as Env;

/** Fresh in-memory SQLite database with all migrations applied. */
export async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./migrations" });
  return db as unknown as Db;
}

export async function makeTestApp(overrides: Partial<Deps> = {}) {
  const mailer = new MemoryMailer();
  const outbound: { url: string; body: unknown }[] = [];
  const deps: Deps = {
    config: loadConfig(testEnv),
    db: await createTestDb(),
    log: silentLogger,
    mailer,
    http: (async (url: string | URL | Request, init?: RequestInit) => {
      outbound.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
    now: () => Date.now(),
    runInBackground: async (task) => {
      await task();
    },
    ...overrides,
  };
  const app = createApp(() => deps);
  return { app, deps, mailer, outbound, request: (path: string, init?: RequestInit) => app.request(path, init, testEnv) };
}

/** Parses a JSON response body for assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function body<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
