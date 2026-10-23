import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/** Any file inside this package resolves bare imports from here, even test files kept in ../Test. */
const packageJson = resolve(import.meta.dirname, "package.json");
const testDir = resolve(import.meta.dirname, "../Test") + "/";

export default defineConfig({
  plugins: [
    {
      name: "resolve-packages-from-nbe",
      enforce: "pre",
      async resolveId(source, importer, options) {
        const isBare = !source.startsWith(".") && !source.startsWith("/") && !source.startsWith("node:");
        if (!isBare || !importer || !resolve(importer.split("?")[0]!).startsWith(testDir)) return null;
        return this.resolve(source, packageJson, { ...options, skipSelf: true });
      },
    },
  ],
  test: {
    // The tests live in the repository's Test folder, next to the end-to-end tests.
    dir: "../Test/backend",
    include: ["**/*.test.ts"],
    environment: "node",
    // Each worker loads native SQLite. Bound startup contention on developer machines and CI.
    maxWorkers: 2,
  },
});
