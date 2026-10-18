import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Any file inside this package resolves bare imports from here, even test files kept in ../Test. */
const packageJson = fileURLToPath(new URL("./package.json", import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "resolve-packages-from-nbe",
      enforce: "pre",
      async resolveId(source, importer, options) {
        const isBare = !source.startsWith(".") && !source.startsWith("/") && !source.startsWith("node:");
        if (!isBare || !importer?.includes("/Test/")) return null;
        return this.resolve(source, packageJson, { ...options, skipSelf: true });
      },
    },
  ],
  test: {
    // The tests live in the repository's Test folder, next to the end-to-end tests.
    dir: "../Test/backend",
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
