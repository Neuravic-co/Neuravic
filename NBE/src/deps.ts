import type { Config } from "./config";
import type { Logger } from "./lib/logger";

/** Everything the application needs from the outside world. Built once per request. */
export interface Deps {
  config: Config;
  log: Logger;
  now: () => number;
  /** Run work after the response (waitUntil in Workers, awaited inline in tests). */
  runInBackground: (task: () => Promise<unknown>) => Promise<void> | void;
}
