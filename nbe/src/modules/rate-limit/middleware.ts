import type { MiddlewareHandler } from "hono";
import type { Config } from "../../config";
import { hmacHex } from "../../core/crypto";
import { tooManyRequests } from "../../core/errors";
import { clientIp, type AppEnv } from "../../core/http";
import type { RateLimiter } from "./limiter";

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
}

export function rateLimit(
  deps: { config: Config; limiter: RateLimiter; now: () => number },
  policy: RateLimitPolicy,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const now = deps.now();
    const visitor = hmacHex(deps.config.hashSecret, `rate:${policy.name}`, clientIp(c, deps.config.proxySecret)).slice(0, 32);
    if (!(await deps.limiter.hit(`${policy.name}:${visitor}`, policy.limit, policy.windowSeconds, now))) {
      c.header("retry-after", String(policy.windowSeconds - (Math.floor(now / 1000) % policy.windowSeconds)));
      throw tooManyRequests();
    }
    await next();
  };
}
