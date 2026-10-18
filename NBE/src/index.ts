import { createApp } from "./app";
import { loadConfig } from "./config";
import { createD1Db } from "./db";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { jsonLogger } from "./lib/logger";
import { KvRateLimiter, MemoryRateLimiter } from "./lib/rate-limit";
import { R2BlobStore } from "./modules/files/blob-store";
import { createJwtSigner } from "./modules/sso/jwt";
import { ConsoleMailer, ResendMailer } from "./modules/notifications/mailer";

const sharedMemoryLimiter = new MemoryRateLimiter();

function buildDeps(env: Env, ctx?: ExecutionContext): Deps {
  const config = loadConfig(env);
  return {
    config,
    db: createD1Db(env.DB),
    log: jsonLogger,
    http: fetch,
    sso: config.ssoPrivateJwk ? createJwtSigner(config.ssoPrivateJwk, config.ssoKeyId) : null,
    blobs: env.BUCKET ? new R2BlobStore(env.BUCKET) : null,
    mailer: config.resendApiKey
      ? new ResendMailer(config.resendApiKey, config.emailFrom)
      : new ConsoleMailer(jsonLogger),
    rateLimiter: env.KV ? new KvRateLimiter(env.KV) : sharedMemoryLimiter,
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
} satisfies ExportedHandler<Env>;
