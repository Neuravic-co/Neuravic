import { createApp, type BackgroundContext } from "./app";
import { loadConfig } from "./config";
import { createD1Db } from "./db";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { jsonLogger } from "./lib/logger";
import { DbRateLimiter } from "./lib/rate-limit";
import { runMaintenance } from "./modules/maintenance/service";
import { R2BlobStore } from "./modules/files/blob-store";
import { createJwtSigner } from "./modules/sso/jwt";
import { ConsoleMailer, ResendMailer } from "./modules/notifications/mailer";

function buildDeps(env: Env, ctx?: BackgroundContext): Deps {
  const config = loadConfig(env);
  const db = createD1Db(env.DB);
  return {
    config,
    db,
    log: jsonLogger,
    http: fetch,
    sso: config.ssoPrivateJwk ? createJwtSigner(config.ssoPrivateJwk, config.ssoKeyId) : null,
    blobs: env.BUCKET ? new R2BlobStore(env.BUCKET) : null,
    mailer: config.resendApiKey
      ? new ResendMailer(config.resendApiKey, config.emailFrom)
      : new ConsoleMailer(jsonLogger, config.environment === "development"),
    rateLimiter: new DbRateLimiter(db),
    now: () => Date.now(),
    runInBackground: (task) => {
      const promise = task().catch((error) =>
        jsonLogger.error("background_task_failed", { error: String(error) }),
      );
      ctx?.waitUntil(promise);
    },
  };
}

const app = createApp(buildDeps);

export default {
  fetch: app.fetch,
  /** Cron trigger (see wrangler.jsonc): outbox retries, cleanup and data retention. */
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMaintenance(buildDeps(env, ctx)));
  },
} satisfies ExportedHandler<Env>;
