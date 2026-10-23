import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolve } from "node:path";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createMysqlDatabase } from "./db";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { jsonLogger } from "./lib/logger";
import { DbRateLimiter } from "./lib/rate-limit";
import { FsBlobStore } from "./modules/files/blob-store";
import { DevMalwareScanner } from "./modules/files/dev-scanner";
import { ServiceMalwareScanner } from "./modules/files/scanner";
import { runMaintenance } from "./modules/maintenance/service";
import { DevMailer, ResendMailer } from "./modules/notifications/mailer";
import { createJwtSigner } from "./modules/sso/jwt";
import { ConsoleMailer } from "./modules/notifications/mailer";
import { devRoutes } from "./modules/dev/routes";

/**
 * Node entry point. NBE builds the same Deps for Cloudflare Workers; this builds them once for a long-running
 * process, with MySQL instead of D1, files on disk instead of R2 and a timer instead of a cron trigger.
 */
const env = process.env as unknown as Env;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run `npm run mysql:local` for a local database, or see Server/README.md");

const config = loadConfig(env);
const { db, pool } = createMysqlDatabase(url);

const development = config.environment === "development";
// Development has no mail provider by default: keep the messages in memory so sign-in links can be opened from the dev mailbox.
const devMailer = development && !config.resendApiKey ? new DevMailer() : null;
const scannerUrl = process.env.MALWARE_SCANNER_URL;

const deps: Deps = {
  config,
  db,
  log: jsonLogger,
  http: fetch,
  sso: config.ssoPrivateJwk ? createJwtSigner(config.ssoPrivateJwk, config.ssoKeyId, config.ssoPublicJwks) : null,
  blobs: new FsBlobStore(resolve(process.env.UPLOAD_DIR ?? "uploads")),
  scanner: scannerUrl
    ? new ServiceMalwareScanner({ fetch: (_input, init) => fetch(scannerUrl, init) })
    : development ? new DevMalwareScanner() : null,
  mailer: config.resendApiKey ? new ResendMailer(config.resendApiKey, config.emailFrom) : devMailer ?? new ConsoleMailer(jsonLogger),
  rateLimiter: new DbRateLimiter(db),
  now: () => Date.now(),
  runInBackground: (task) => {
    void task().catch(() => jsonLogger.error("background_task_failed"));
  },
};

const api = createApp(() => deps);
const root = new Hono();
if (devMailer) root.route("/api/v1/dev", devRoutes(devMailer));
root.route("/", api);

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: root.fetch, port, hostname }, (info) => {
  jsonLogger.info("server_started", { url: `http://${info.address}:${info.port}`, environment: config.environment });
  if (devMailer) jsonLogger.info("dev_mailbox", { url: `http://${info.address}:${info.port}/api/v1/dev/mailbox` });
});

// Replaces the Workers cron trigger: outbox retries, cleanup and data retention every 5 minutes.
const timer = setInterval(() => {
  runMaintenance(deps).catch(() => jsonLogger.error("maintenance_failed"));
}, 5 * 60_000);

async function shutdown() {
  clearInterval(timer);
  server.close();
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
