import type { Db } from "../../nbe/src/db/client";
import { createContainer, type ContainerOptions } from "../../nbe/src/container";
import { silentLogger } from "../../nbe/src/core/logger";
import { MemoryRateLimiter } from "../../nbe/src/modules/rate-limit/limiter";

export const secret = (seed: string) => seed.repeat(40).slice(0, 40);

export const developmentEnv = {
  APP_URL: "http://localhost:5173",
  ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:3000",
  DATABASE_URL: "postgres://user:password@127.0.0.1:5432/neuravic",
  EMAIL_FROM: "Neuravic <no-reply@example.com>",
  NOTIFY_TO: "team@example.com",
  PRIVACY_HASH_SECRET: secret("h"),
};

export const productionEnv = {
  ...developmentEnv,
  APP_ENV: "production",
  APP_URL: "https://www.example.com",
  ALLOWED_ORIGINS: "https://www.example.com",
  PROXY_SECRET: secret("x"),
  CRON_SECRET: secret("c"),
};

export const forbiddenDb = new Proxy({}, {
  get() {
    throw new Error("The database must not be reached");
  },
}) as unknown as Db;

export function testContainer(env: Record<string, string | undefined>, overrides: ContainerOptions["overrides"] = {}) {
  return createContainer({
    env,
    overrides: { db: forbiddenDb, log: silentLogger, rateLimiter: new MemoryRateLimiter(), now: () => 1_000, ...overrides },
  });
}
