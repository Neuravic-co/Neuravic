import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const MODES = {
  local: "Local Postgres + local API + website (testing)",
  vercel: "Website only, using the API deployed on Vercel",
};

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

async function chooseMode() {
  const arg = process.argv.find((a) => a.startsWith("--mode="))?.slice(7) ?? process.argv[2];
  if (arg && arg in MODES) return arg;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const names = Object.keys(MODES);
  names.forEach((name, i) => console.log(`  ${i + 1}) ${name} - ${MODES[name]}`));
  const answer = (await rl.question("Choose a mode [1]: ")).trim() || "1";
  rl.close();
  return names[Number(answer) - 1] ?? (answer in MODES ? answer : "local");
}

const children = [];

function run(name, command, env = {}) {
  const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  children.push(child);
  const forward = (stream, out) =>
    stream.on("data", (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => out.write(`[${name}] ${line}\n`)));
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  return child;
}

function waitFor(child, text) {
  return new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => String(chunk).includes(text) && resolve());
    child.on("exit", () => reject(new Error(`${text} never appeared`)));
  });
}

function once(command) {
  return new Promise((resolve, reject) => {
    const child = run("setup", command);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`))));
  });
}

function stopAll() {
  for (const child of children) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
    else child.kill();
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

const mode = await chooseMode();
const env = { ...readEnvFile(".env"), ...process.env };

try {
  if (mode === "local") {
    const db = run("db", "npm run db:local");
    await waitFor(db, "Local Postgres is ready");
    await once("npm run db:migrate");
    const fresh = readEnvFile(".env");
    run("api", "npm start");
    run("web", "npm run dev --prefix nfe", { API_ORIGIN: "http://127.0.0.1:8787", API_PROXY_SECRET: fresh.PROXY_SECRET ?? "" });
    console.log("\nWebsite: http://localhost:5173   API: http://127.0.0.1:8787   Ctrl+C stops everything\n");
  } else {
    const origin = env.VERCEL_API_ORIGIN;
    if (!origin) throw new Error("Set VERCEL_API_ORIGIN (the deployed backend URL) in .env or the environment.");
    run("web", "npm run dev --prefix nfe", { API_ORIGIN: origin, API_PROXY_SECRET: env.PROXY_SECRET ?? "" });
    console.log("\nWebsite: http://localhost:5173 (using the deployed API)   Ctrl+C stops it\n");
  }
} catch (error) {
  console.error(error.message);
  stopAll();
  process.exit(1);
}
