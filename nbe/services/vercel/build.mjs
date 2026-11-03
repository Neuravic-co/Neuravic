// Builds the backend into one Vercel function using the Build Output API (.vercel/output).
// Everything is bundled: Vercel does not compile imports across workspace folders.
// Production builds also apply database migrations, so a deploy never runs against an older schema.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dirname;
const repo = join(root, "..", "..", "..");
const output = join(root, ".vercel", "output");
const func = join(output, "functions", "index.func");

if (process.env.VERCEL_ENV === "production" && (process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL)) {
  console.log("Applying database migrations");
  execFileSync("npx", ["tsx", join(repo, "database", "scripts", "migrate.ts")], { stdio: "inherit", cwd: repo });
}

rmSync(output, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

await build({
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(func, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  sourcemap: false,
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
    // Sends queued email every minute (needs a Vercel plan that allows per-minute crons) and runs maintenance every fifth.
    crons: [{ path: "/internal/cron", schedule: "* * * * *" }],
  }),
);
console.log("Built .vercel/output");
