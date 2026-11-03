// Starts a private PostgreSQL for local development (port 5433, data in database/.postgres) and prepares it:
//   - creates the "neuravic" database and the two roles (see create-access.mjs)
//   - writes the .env file at the repository root (only if it does not exist yet)
// Nothing to install: the server comes from an npm package. Leave this terminal open while you work; Ctrl+C stops it.
// It never touches any other Postgres on the machine. To use your own server (or Neon) instead, put its URL in DATABASE_URL.
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
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: adminPassword, port: PORT, persistent: true, onLog: () => undefined, onError: () => undefined });
if (!existsSync(join(dataDir, "PG_VERSION"))) {
  console.log("Creating the local Postgres data directory...");
  await server.initialise();
}
console.log(`Starting Postgres on 127.0.0.1:${PORT}...`);
await server.start();

let existing = "";
try {
  existing = readFileSync(envFile, "utf8");
} catch {
  // No .env yet: it is created below.
}
const read = (name) => new RegExp(`^${name}=(.+)$`, "m").exec(existing)?.[1]?.trim();
const appPassword = /DATABASE_URL=postgres:\/\/neuravic_app:([^@]+)@/.exec(existing)?.[1] ?? randomBytes(18).toString("hex");
const migratorPassword = /MIGRATE_DATABASE_URL=postgres:\/\/neuravic_migrator:([^@]+)@/.exec(existing)?.[1] ?? randomBytes(18).toString("hex");

await createAccess({
  adminUrl: `postgres://postgres:${adminPassword}@127.0.0.1:${PORT}/postgres`,
  appPassword,
  migratorPassword,
});

if (!existing) {
  writeFileSync(
    envFile,
    [
      "# Local development settings. Never commit this file.",
      "APP_ENV=development",
      "APP_URL=http://localhost:5173",
      "ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000",
      "EMAIL_FROM=Neuravic <no-reply@neuravic.com>",
      "NOTIFY_TO=team@neuravic.com",
      "# The first sign-up with this email creates the staff admin account (development only).",
      "BOOTSTRAP_ADMIN_EMAIL=admin@neuravic.local",
      "",
      "# The services run as the limited role; migrations run as the migrator.",
      `DATABASE_URL=postgres://neuravic_app:${appPassword}@127.0.0.1:${PORT}/neuravic`,
      `MIGRATE_DATABASE_URL=postgres://neuravic_migrator:${migratorPassword}@127.0.0.1:${PORT}/neuravic`,
      "",
      "# Shared by the gateway and every service so the visitor address can be trusted.",
      `PROXY_SECRET=${read("PROXY_SECRET") ?? randomBytes(24).toString("hex")}`,
      "",
      "# Public gateway port (the website talks to this one).",
      "GATEWAY_PORT=8787",
      "",
      "# Where the file server keeps uploads.",
      "UPLOAD_DIR=.data/files",
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
