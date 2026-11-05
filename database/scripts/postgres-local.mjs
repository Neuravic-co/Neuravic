import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { createAccess } from "./create-access.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "..");
const dataDir = join(root, ".postgres", "data");
const envFile = join(repo, ".env");
const PORT = 5433;
const adminPassword = "local-admin-only";

mkdirSync(join(root, ".postgres"), { recursive: true });
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: adminPassword, port: PORT, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => undefined, onError: () => undefined });
if (!existsSync(join(dataDir, "PG_VERSION"))) {
  console.log("Creating the local Postgres data directory...");
  await server.initialise();
}
console.log(`Starting Postgres on 127.0.0.1:${PORT}...`);
await server.start();

let existing = "";
try {
  existing = readFileSync(envFile, "utf8");
} catch {}
const appPassword = /DATABASE_URL=postgres:\/\/neuravic_app:([^@]+)@/.exec(existing)?.[1] ?? randomBytes(18).toString("hex");
const migratorPassword = /DATABASE_URL_UNPOOLED=postgres:\/\/neuravic_migrator:([^@]+)@/.exec(existing)?.[1] ?? randomBytes(18).toString("hex");

await createAccess({
  adminUrl: `postgres://postgres:${adminPassword}@127.0.0.1:${PORT}/postgres`,
  appPassword,
  migratorPassword,
});

if (!existing) {
  writeFileSync(
    envFile,
    [
      "APP_ENV=development",
      "APP_URL=http://localhost:5173",
      "ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000",
      "EMAIL_FROM=Neuravic <no-reply@neuravic.com>",
      "NOTIFY_TO=team@neuravic.com",
      "",
      `DATABASE_URL=postgres://neuravic_app:${appPassword}@127.0.0.1:${PORT}/neuravic`,
      `DATABASE_URL_UNPOOLED=postgres://neuravic_migrator:${migratorPassword}@127.0.0.1:${PORT}/neuravic`,
      "",
      `PRIVACY_HASH_SECRET=${randomBytes(32).toString("hex")}`,
      `PROXY_SECRET=${randomBytes(32).toString("hex")}`,
      `CRON_SECRET=${randomBytes(32).toString("hex")}`,
      "",
    ].join("\n"),
    { flag: "wx" },
  );
  console.log("Wrote .env at the repository root");
}
console.log("Local Postgres is ready. Leave this window open; in another one run: npm run db:migrate && npm start");

const stop = async () => {
  await server.stop().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => undefined, 1 << 30);
