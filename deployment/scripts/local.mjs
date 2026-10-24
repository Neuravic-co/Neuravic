// Starts the whole backend on this machine with one command: the six services, the file server and the gateway.
// Run `npm run db:local` and `npm run db:migrate` once first. Press Ctrl+C to stop everything.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
if (!existsSync(resolve(root, ".env"))) {
  console.error("No .env file yet. Run `npm run db:local` first.");
  process.exit(1);
}

const apps = [
  ["auth", "nbe/services/auth/src/index.ts"],
  ["portal", "nbe/services/portal/src/index.ts"],
  ["leads", "nbe/services/leads/src/index.ts"],
  ["admin", "nbe/services/admin/src/index.ts"],
  ["worker", "nbe/services/worker/src/index.ts"],
  ["files", "server/src/index.ts"],
  ["gateway", "nbe/services/gateway/src/index.ts"],
];

const children = apps.map(([name, entry]) => {
  const child = spawn(process.execPath, ["--env-file=.env", "--import", "tsx", entry], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `[${name}]`.padEnd(10);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) console.log(`${tag}${line}`);
    });
  }
  child.once("exit", (code) => console.log(`${tag}stopped (${code ?? "signal"})`));
  return child;
});

function stop() {
  for (const child of children) child.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
