// Starts a private MySQL for local development (port 3307, data in database/.mysql) and prepares it:
//   - creates the "neuravic" database and the two accounts (see create-access.mjs)
//   - writes the .env file at the repository root (only if it does not exist yet)
// It never touches any other MySQL on the machine. Use your own server instead by putting its URL in DATABASE_URL.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";
import { createAccess } from "./create-access.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "..");
const mysqlHome = process.env.MYSQL_HOME ?? "C:/Program Files/MySQL/MySQL Server 9.1";
const mysqld = join(mysqlHome, "bin", process.platform === "win32" ? "mysqld.exe" : "mysqld");
const dataDir = join(root, ".mysql", "data");
const envFile = join(repo, ".env");
const PORT = 3307;

const listening = () =>
  new Promise((done) => {
    const socket = net.connect(PORT, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => done(false));
  });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function run(command, args) {
  await new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("exit", (code) => (code === 0 ? done() : fail(new Error(`${command} exited with ${code}`))));
  });
}

mkdirSync(join(root, ".mysql"), { recursive: true });
if (!existsSync(join(dataDir, "mysql.ibd"))) {
  console.log("Creating the local MySQL data directory...");
  await run(mysqld, ["--no-defaults", "--initialize-insecure", `--basedir=${mysqlHome}`, `--datadir=${dataDir}`]);
}

if (!(await listening())) {
  console.log(`Starting MySQL on 127.0.0.1:${PORT}...`);
  const child = spawn(
    mysqld,
    [
      "--no-defaults", `--basedir=${mysqlHome}`, `--datadir=${dataDir}`, `--port=${PORT}`, "--bind-address=127.0.0.1",
      "--mysqlx=OFF", "--character-set-server=utf8mb4", "--collation-server=utf8mb4_bin", "--skip-log-bin",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let i = 0; i < 60 && !(await listening()); i += 1) await sleep(500);
  if (!(await listening())) throw new Error("MySQL did not start in 30 seconds");
}

let existing = "";
try {
  existing = readFileSync(envFile, "utf8");
} catch {
  // No .env yet: it is created below.
}
const read = (name) => new RegExp(`^${name}=(.+)$`, "m").exec(existing)?.[1]?.trim();
const appPassword = /DATABASE_URL=mysql:\/\/neuravic_app:([^@]+)@/.exec(existing)?.[1] ?? randomBytes(18).toString("hex");
const migratorPassword = /MIGRATE_DATABASE_URL=mysql:\/\/neuravic_migrator:([^@]+)@/.exec(existing)?.[1] ?? randomBytes(18).toString("hex");

const admin = await createConnection({ host: "127.0.0.1", port: PORT, user: "root" });
await createAccess({ connection: admin, hosts: ["127.0.0.1", "localhost"], appPassword, migratorPassword });
await admin.end();

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
      "# The services run as the limited account; migrations run as the migrator.",
      `DATABASE_URL=mysql://neuravic_app:${appPassword}@127.0.0.1:${PORT}/neuravic`,
      `MIGRATE_DATABASE_URL=mysql://neuravic_migrator:${migratorPassword}@127.0.0.1:${PORT}/neuravic`,
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
console.log("Local MySQL is ready.");
