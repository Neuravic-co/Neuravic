import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { tooManyRequests } from "./errors";
import { clientIp } from "./request";

export interface RateLimiter {
  /** Records a hit and returns false once `limit` is exceeded inside the window. */
  hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean>;
}

/** Fixed-window limiter on Workers KV. Approximate by design (KV is eventually consistent). */
export class KvRateLimiter implements RateLimiter {
  constructor(private readonly kv: KVNamespace) {}

  async hit(key: string, limit: number, windowSeconds: number, now: number): Promise<boolean> {
    const bucket = Math.floor(now / 1000 / windowSeconds);
    const storageKey = `rl:${key}:${bucket}`;
    const count = Number((await this.kv.get(storageKey)) ?? 0) + 1;
    await this.kv.put(storageKey, String(count), { expirationTtl: Math.max(windowSeconds, 60) });
    return count <= limit;
  }
}

/** Per-isolate limiter. Used when no KV namespace is bound (local dev, tests). */
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
    const allowed = await deps.rateLimiter.hit(
      `${options.name}:${identity}`,
      options.limit,
      options.windowSeconds,
      deps.now(),
    );
    if (!allowed) throw tooManyRequests();
    await next();
  };
}
