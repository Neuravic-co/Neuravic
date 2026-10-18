import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { Deps } from "../src/deps";
import type { Env } from "../src/env";
import { silentLogger } from "../src/lib/logger";

export const testEnv = {
  APP_ENV: "development",
  APP_URL: "https://app.test",
  ALLOWED_ORIGINS: "https://app.test",
  EMAIL_FROM: "Neuravic <no-reply@test.dev>",
  NOTIFY_TO: "team@test.dev",
  SSO_AUDIENCES: "darkagent,coolaccess_dxb",
} as unknown as Env;

export function makeTestApp() {
  const deps: Deps = {
    config: loadConfig(testEnv),
    log: silentLogger,
    now: () => Date.now(),
    runInBackground: async (task) => {
      await task();
    },
  };
  const app = createApp(() => deps);
  return { app, deps, request: (path: string, init?: RequestInit) => app.request(path, init, testEnv) };
}

/** Parses a JSON response body for assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function body<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
