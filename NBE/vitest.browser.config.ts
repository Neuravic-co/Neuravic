import { mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, {
  test: { dir: "../Test/browser", include: ["**/*.test.ts"], maxWorkers: 1, testTimeout: 240_000 },
});
