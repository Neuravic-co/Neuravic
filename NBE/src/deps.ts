import type { Config } from "./config";
import type { Db } from "./db";
import type { Logger } from "./lib/logger";
import type { RateLimiter } from "./lib/rate-limit";
import type { Mailer } from "./modules/notifications/mailer";

/** Everything the application needs from the outside world. Built once per request. */
export interface Deps {
  config: Config;
  db: Db;
  log: Logger;
  mailer: Mailer;
  /** Outbound HTTP (injected so tests never hit the network). */
  http: typeof fetch;
  rateLimiter: RateLimiter;
  now: () => number;
  /** Run work after the response (waitUntil in Workers, awaited inline in tests). */
  runInBackground: (task: () => Promise<unknown>) => Promise<void> | void;
}
