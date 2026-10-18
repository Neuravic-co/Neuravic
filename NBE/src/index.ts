import { createApp } from "./app";
import { loadConfig } from "./config";
import { createD1Db } from "./db";
import type { Deps } from "./deps";
import type { Env } from "./env";
import { jsonLogger } from "./lib/logger";

function buildDeps(env: Env, ctx?: ExecutionContext): Deps {
  return {
    config: loadConfig(env),
    db: createD1Db(env.DB),
    log: jsonLogger,
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
