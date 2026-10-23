import { waitUntil } from "@vercel/functions";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { Db } from "./db";
import { createLibsqlDb } from "./db/libsql";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { jsonLogger } from "./lib/logger";
import { DbRateLimiter } from "./lib/rate-limit";
import { runMaintenance } from "./modules/maintenance/service";
import { createJwtSigner } from "./modules/sso/jwt";
import { ConsoleMailer, ResendMailer } from "./modules/notifications/mailer";

/**
 * Vercel entry. The Worker (src/index.ts) and this file build the same Deps, so the app code is identical:
 * only the database driver and the places configuration comes from differ.
 * Uploads stay off here (no blob store): the file endpoints answer 503 until a private store is added.
 */
let cachedDb: { key: string; db: Db } | null = null;

function database(): Db {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  const token = process.env.TURSO_AUTH_TOKEN;
  const key = `${url}|${token ?? ""}`;
  if (!cachedDb || cachedDb.key !== key) cachedDb = { key, db: createLibsqlDb(url, token) };
  return cachedDb.db;
}

export function buildDeps(): Deps {
  const env = process.env as unknown as Env;
  const config = loadConfig(env);
  const db = database();
  return {
    config,
    db,
    log: jsonLogger,
    http: fetch,
    sso: config.ssoPrivateJwk ? createJwtSigner(config.ssoPrivateJwk, config.ssoKeyId, config.ssoPublicJwks) : null,
    blobs: null,
    scanner: null,
    mailer: config.resendApiKey ? new ResendMailer(config.resendApiKey, config.emailFrom) : new ConsoleMailer(jsonLogger),
    rateLimiter: new DbRateLimiter(db),
    now: () => Date.now(),
    runInBackground: (task) => {
      waitUntil(task().catch(() => jsonLogger.error("background_task_failed")));
    },
  };
}

export const app = createApp(() => buildDeps());

/** Scheduled maintenance (outbox retries, cleanup, retention). Vercel cron calls it with CRON_SECRET. */
export async function maintenance(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await runMaintenance(buildDeps());
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
