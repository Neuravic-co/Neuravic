import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { schema, type Db } from "../db";
import { tooManyRequests } from "./errors";
import { clientIp } from "./request";
import { hashIdentifier } from "../modules/audit/audit";

export interface RateLimiter {
  /** Records a hit and returns false once `limit` is exceeded inside the window. */
  hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean>;
}

/**
 * Fixed-window limiter stored in the database. The upsert is a single atomic statement,
 * so the count is exact and shared by every server instance (unlike KV or in-memory counters).
 */
export class DbRateLimiter implements RateLimiter {
  constructor(private readonly db: Db) {}

  async hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean> {
    const bucket = Math.floor(now / 1000 / windowSeconds);
    const expiresAt = (bucket + 1) * windowSeconds * 1000;
    const [row] = await this.db
      .insert(schema.rateLimits)
      .values({ key: `${key}:${bucket}`, count: 1, expiresAt })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: sql`${schema.rateLimits.count} + 1` } })
      .returning({ count: schema.rateLimits.count });
    return (row?.count ?? 1) <= limit;
  }
}

/** Per-isolate limiter, for unit tests that do not need a database. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  async hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean> {
    const bucket = Math.floor(now / 1000 / windowSeconds);
    const storageKey = `${key}:${bucket}`;
    const count = (this.counts.get(storageKey) ?? 0) + 1;
    this.counts.set(storageKey, count);
    if (this.counts.size > 10_000) this.counts.clear();
    return count <= limit;
  }
}

interface RateLimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
  /** Defaults to the client IP. */
  key?: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string | Promise<string>;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const deps = c.get("deps");
    const identity = options.key ? await options.key(c) : clientIp(c);
    const identifier = await hashIdentifier(identity, deps.config.privacyHashSecret, `rate:${options.name}`);
    const allowed = await deps.rateLimiter.hit(
      `${options.name}:${identifier}`,
      options.limit,
      options.windowSeconds,
      deps.now(),
    );
    if (!allowed) {
      c.header("retry-after", String(options.windowSeconds - Math.floor(deps.now() / 1000) % options.windowSeconds));
      throw tooManyRequests();
    }
    await next();
  };
}
