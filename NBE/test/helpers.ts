import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { schema, type Db } from "../src/db";
import type { Deps } from "../src/deps";
import type { Env } from "../src/env";
import { silentLogger } from "../src/lib/logger";
import { MemoryRateLimiter } from "../src/lib/rate-limit";
import { MemoryBlobStore } from "../src/modules/files/blob-store";
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
    blobs: new MemoryBlobStore(),
    rateLimiter: new MemoryRateLimiter(),
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

/** Builds a JSON request init. */
export function json(method: string, payload: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload) };
}

export const ORIGIN = "https://app.test";
type TestApp = Awaited<ReturnType<typeof makeTestApp>>;

/** Inserts a user directly (bypasses the invite flow). */
export async function seedUser(
  ctx: TestApp,
  email: string,
  extra: Partial<typeof schema.users.$inferInsert> = {},
) {
  const id = `user-${email}`;
  await ctx.deps.db.insert(schema.users).values({ id, email, status: "active", createdAt: Date.now(), ...extra });
  return id;
}

/** Runs the real magic-link flow and returns the session cookie header. */
export async function signIn(ctx: TestApp, email: string): Promise<string> {
  const before = ctx.mailer.sent.length;
  const asked = await ctx.request("/api/v1/auth/magic-link", json("POST", { email }, { origin: ORIGIN }));
  if (asked.status !== 202) throw new Error(`magic-link failed: ${asked.status}`);
  const mail = ctx.mailer.sent.slice(before).find((m) => m.to === email);
  if (!mail) throw new Error("no sign-in email was sent");
  const token = /token=([^\s&]+)/.exec(mail.text)?.[1];
  const verified = await ctx.request("/api/v1/auth/verify", json("POST", { token: decodeURIComponent(token!) }));
  if (verified.status !== 200) throw new Error(`verify failed: ${verified.status}`);
  const cookie = verified.headers.get("set-cookie")!.split(";")[0]!;
  return cookie;
}

/** Request init for a signed-in caller. */
export function as(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { origin: ORIGIN, cookie, ...(init.headers as Record<string, string>) } };
}

export function asJson(cookie: string, method: string, payload: unknown): RequestInit {
  return as(cookie, json(method, payload));
}

/** Creates an org with an owner and optional extra members. Returns the org id. */
export async function seedOrg(
  ctx: TestApp,
  slug: string,
  members: Record<string, "viewer" | "member" | "admin" | "owner">,
) {
  const id = `org-${slug}`;
  await ctx.deps.db.insert(schema.orgs).values({ id, name: slug.toUpperCase(), slug, createdAt: Date.now() });
  for (const [email, role] of Object.entries(members)) {
    const userId = await seedUser(ctx, email);
    await ctx.deps.db.insert(schema.memberships).values({ userId, orgId: id, role, createdAt: Date.now() });
  }
  return id;
}
