import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dirname;
const repo = join(root, "..", "..", "..");
const output = join(root, ".vercel", "output");
const func = join(output, "functions", "index.func");
const cronSchedule = process.env.CRON_SCHEDULE || "* * * * *";

if (process.env.VERCEL_ENV === "production" && (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)) {
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
  external: ["pg-native"],
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
    crons: [{ path: "/internal/cron", schedule: cronSchedule }],
  }),
);
console.log("Built .vercel/output");
