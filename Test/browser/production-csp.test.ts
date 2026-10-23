import { spawn, spawnSync, execFile } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { it } from "vitest";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");

it.each(["next", "vinext"])("enforces CSP in the %s production build without breaking hydration", async (runtime) => {
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((done) => reservation.close(() => done()));
  const args = runtime === "next"
    ? ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)]
    : ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", "../tmp/csp-worker-state", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0"];
  const server = spawn(process.execPath, args, { cwd: resolve(root, "NFE"), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: resolve(root, "tmp/wrangler") } });
  let diagnostics = "";
  server.stdout.on("data", (data) => { diagnostics = (diagnostics + data).slice(-4000); });
  server.stderr.on("data", (data) => { diagnostics = (diagnostics + data).slice(-4000); });
  const site = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) break;
      try { ready = (await fetch(site, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Local runtime starts. */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!ready) { process.stderr.write(diagnostics); throw new Error("Local production runtime did not start"); }
    try {
      const { stdout } = await run(process.execPath, [resolve(root, "Test/e2e/csp.e2e.mjs")], { cwd: resolve(root, "Test"), timeout: 60_000, windowsHide: true, env: { ...process.env, E2E_BASE_URL: site } });
      process.stdout.write(stdout);
    } catch (error) {
      process.stderr.write((error as { stdout?: string; stderr?: string }).stdout ?? "");
      process.stderr.write((error as { stderr?: string }).stderr ?? "");
      throw new Error("Production CSP browser verification failed");
    }
  } finally {
    if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    else server.kill("SIGTERM");
  }
});
