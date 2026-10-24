import type { Config } from "./config";
import type { Db } from "./db";
import type { Logger } from "./lib/logger";
import type { RateLimiter } from "./lib/rate-limit";
import type { BlobStore } from "./modules/files/blob-store";
import type { JwtSigner } from "./modules/sso/jwt";
import type { Mailer } from "./modules/notifications/mailer";

/** Everything the application needs from the outside world. Built once per request. */
export interface Deps {
  config: Config;
  db: Db;
  log: Logger;
  mailer: Mailer;
  /** Null when SSO_PRIVATE_JWK is not set; SSO endpoints then answer 503. */
  sso: JwtSigner | null;
  /** Null when no R2 bucket is bound; file endpoints then answer 503. */
  blobs: BlobStore | null;
  scanner?: import("./modules/files/scanner").MalwareScanner | null;
  /** Outbound HTTP (injected so tests never hit the network). */
  http: typeof fetch;
  rateLimiter: RateLimiter;
  now: () => number;
  /** True only in the worker service: it alone sends queued email, so every other service just queues it. */
  deliversMail: boolean;
  /** Run work after the response (waitUntil in Workers, awaited inline in tests). */
  runInBackground: (task: () => Promise<unknown>) => Promise<void> | void;
}
