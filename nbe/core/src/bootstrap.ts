import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolve } from "node:path";
import { createApp, type AppEnv, type MountRoutes } from "./app";
import { loadConfig } from "./config";
import { createMysqlDatabase } from "./db";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { jsonLogger } from "./lib/logger";
import { DbRateLimiter } from "./lib/rate-limit";
import { FsBlobStore } from "./modules/files/blob-store";
import { DevMalwareScanner } from "./modules/files/dev-scanner";
import { ServiceMalwareScanner } from "./modules/files/scanner";
import { ConsoleMailer, DevMailer, ResendMailer } from "./modules/notifications/mailer";
import { createJwtSigner } from "./modules/sso/jwt";
import { devRoutes } from "./modules/dev/routes";

export interface ServiceOptions {
  /** Short name used in logs and in the `<NAME>_PORT` setting, for example "auth". */
  name: string;
  defaultPort: number;
  /** The routes this service owns. */
  mount: MountRoutes;
  /** Only the worker sends email. */
  deliversMail?: boolean;
  /** Only the file host stores and scans files. */
  hostsFiles?: boolean;
  /** Repeating background work, run with the service's own dependencies. */
  timers?: { everyMs: number; run: (deps: Deps) => Promise<unknown> }[];
}

/** Builds the dependencies one service needs from the process environment. */
export function buildDeps(options: ServiceOptions) {
  const env = process.env as unknown as Env;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See docs/02-Getting-Started.md");

  const config = loadConfig(env);
  const { db, pool } = createMysqlDatabase(url);
  const development = config.environment === "development";
  // Development has no mail provider by default: keep messages in memory so sign-in links can be read from the dev mailbox.
  const devMailer = options.deliversMail && development && !config.resendApiKey ? new DevMailer() : null;
  const scannerUrl = process.env.MALWARE_SCANNER_URL;

  const deps: Deps = {
    config,
    db,
    log: jsonLogger,
    http: fetch,
    sso: config.ssoPrivateJwk ? createJwtSigner(config.ssoPrivateJwk, config.ssoKeyId, config.ssoPublicJwks) : null,
    blobs: options.hostsFiles ? new FsBlobStore(resolve(process.env.UPLOAD_DIR ?? "uploads")) : null,
    scanner: !options.hostsFiles
      ? null
      : scannerUrl
        ? new ServiceMalwareScanner({ fetch: (_input, init) => fetch(scannerUrl, init) })
        : development ? new DevMalwareScanner() : null,
    mailer: config.resendApiKey ? new ResendMailer(config.resendApiKey, config.emailFrom) : devMailer ?? new ConsoleMailer(jsonLogger),
    rateLimiter: new DbRateLimiter(db),
    deliversMail: options.deliversMail === true,
    now: () => Date.now(),
    runInBackground: (task) => {
      void task().catch(() => jsonLogger.error("background_task_failed"));
    },
  };
  return { deps, pool, devMailer };
}

/** Starts one backend service: builds its dependencies, mounts its routes, listens, and runs its timers. */
export function startService(options: ServiceOptions) {
  const { deps, pool, devMailer } = buildDeps(options);
  const app = createApp(() => deps, options.mount);
  const root = new Hono<AppEnv>();
  if (devMailer) root.route("/api/v1/dev", devRoutes(devMailer) as unknown as Hono<AppEnv>);
  root.route("/", app);

  const port = Number(process.env[`${options.name.toUpperCase()}_PORT`] ?? options.defaultPort);
  const hostname = process.env.HOST ?? "127.0.0.1";
  const server = serve({ fetch: root.fetch, port, hostname }, (info) => {
    jsonLogger.info("service_started", { service: options.name, url: `http://${info.address}:${info.port}`, environment: deps.config.environment });
    if (devMailer) jsonLogger.info("dev_mailbox", { url: `http://${info.address}:${info.port}/api/v1/dev/mailbox` });
  });

  const timers = (options.timers ?? []).map(({ everyMs, run }) =>
    setInterval(() => {
      run(deps).catch(() => jsonLogger.error("timer_failed", { service: options.name }));
    }, everyMs),
  );

  async function shutdown() {
    timers.forEach(clearInterval);
    server.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return { deps, server };
}
