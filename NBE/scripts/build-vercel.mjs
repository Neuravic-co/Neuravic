// Builds the backend into one Vercel function using the Build Output API (.vercel/output).
// Everything is bundled: Vercel does not compile imports across folders, and native modules cannot ship.
// The native libSQL client is swapped for its HTTP client, which talks to Turso over fetch.
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const output = join(root, ".vercel", "output");
const func = join(output, "functions", "index.func");

rmSync(output, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

await build({
  entryPoints: [join(root, "src", "vercel-entry.ts")],
  outfile: join(func, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  sourcemap: false,
  alias: { "@libsql/client": "@libsql/client/web" },
  // Some dependencies still use require(); give the ES module one.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "info",
});

writeFileSync(join(func, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(
  join(func, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30 }),
);
writeFileSync(
  join(output, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [{ src: "/(.*)", dest: "/index" }],
    crons: [{ path: "/internal/maintenance", schedule: "0 4 * * *" }],
  }),
);
console.log("Built .vercel/output");
