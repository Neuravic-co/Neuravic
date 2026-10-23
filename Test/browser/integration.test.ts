import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { spawn, spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { it, expect } from "vitest";
import { randomToken } from "../../NBE/src/lib/crypto";
import { makeTestApp } from "../backend/helpers";

const root = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);
const redact = (text: string) => text.replace(/token=[A-Za-z0-9_%+-]+/g, "token=[redacted]");
const listen = (server: Server) => new Promise<number>((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port));
});
const close = (server: Server) => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });

it("runs the real contact, portal and accessibility suites against an isolated API and mailbox", async () => {
  // This fixture never ships with the Worker. No production credentials, network mail or log scraping.
  const ctx = await makeTestApp();
  const mailboxSecret = randomToken();
  ctx.deps.config.bootstrapAdminEmail = "founder@test.dev";
  ctx.deps.config.proxySecret = randomToken();
  const api = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url!, "http://127.0.0.1");
      if (url.pathname === "/_test/mailbox") {
        if (incoming.headers.authorization !== `Bearer ${mailboxSecret}`) { outgoing.writeHead(403).end(); return; }
        outgoing.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        outgoing.end(JSON.stringify({ messages: ctx.mailer.sent }));
        return;
      }
      const request = new Request(url, {
        method: incoming.method, headers: incoming.headers,
        ...(!["GET", "HEAD"].includes(incoming.method!) ? { body: Readable.toWeb(incoming), duplex: "half" } : {}),
      } as unknown as RequestInit);
      const response = await ctx.app.fetch(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => { if (name !== "set-cookie") outgoing.setHeader(name, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500).end(); }
  });
  const apiPort = await listen(api);
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const reservation = createServer();
  const frontendPort = await listen(reservation);
  await close(reservation);
  const site = `http://127.0.0.1:${frontendPort}`;
  ctx.deps.config.appUrl = site;
  ctx.deps.config.allowedOrigins = [site];
  const frontend = spawn(process.execPath, [resolve(root, "NFE/node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(frontendPort)], {
    cwd: resolve(root, "NFE"), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development", API_ORIGIN: apiOrigin,
      API_PROXY_SECRET: ctx.deps.config.proxySecret, NEXT_PUBLIC_PORTAL_OPEN: "true", NEXT_PUBLIC_API_BASE_URL: "/api/v1" },
  });
  let startup = "";
  frontend.stdout.on("data", (chunk) => { startup = (startup + chunk).slice(-8000); });
  frontend.stderr.on("data", (chunk) => { startup = (startup + chunk).slice(-8000); });
  try {
    let ready = false;
    const startupDeadline = Date.now() + 60_000;
    while (Date.now() < startupDeadline) {
      if (frontend.exitCode !== null) break;
      try { ready = (await fetch(site, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Starting. */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!ready) { process.stderr.write(redact(startup)); throw new Error("Local frontend did not become ready"); }
    try {
      const { stdout, stderr } = await run(process.execPath, [resolve(root, "Test/e2e/run-all.mjs")], {
        cwd: resolve(root, "Test"), timeout: 180_000, maxBuffer: 512 * 1024, windowsHide: true,
        env: { ...process.env, E2E_BASE_URL: site, E2E_API_URL: `${apiOrigin}/api/v1`,
          E2E_MAILBOX_URL: `${apiOrigin}/_test/mailbox`, E2E_MAILBOX_SECRET: mailboxSecret },
      });
      process.stdout.write(redact(stdout));
      process.stderr.write(redact(stderr));
    } catch (error) {
      const output = error as { stdout?: string; stderr?: string };
      process.stderr.write(redact(`${output.stdout ?? ""}\n${output.stderr ?? ""}`));
      throw new Error("Browser integration suite failed; see redacted diagnostics above");
    }
    expect(ctx.mailer.sent.length).toBeGreaterThan(0);
    ctx.deps.config.staffMfaRequired = true;
    ctx.deps.config.mfaEncryptionKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    try {
      const { stdout, stderr } = await run(process.execPath, [resolve(root, "Test/e2e/mfa.e2e.mjs")], {
        cwd: resolve(root, "Test"), timeout: 90_000, maxBuffer: 256 * 1024, windowsHide: true,
        env: { ...process.env, E2E_BASE_URL: site, E2E_API_URL: `${apiOrigin}/api/v1`, E2E_MAILBOX_URL: `${apiOrigin}/_test/mailbox`, E2E_MAILBOX_SECRET: mailboxSecret },
      });
      process.stdout.write(redact(stdout)); process.stderr.write(redact(stderr));
    } catch (error) {
      // Test helpers never print setup keys or recovery values.
      const output = error as { stdout?: string; stderr?: string };
      process.stderr.write(redact(`${output.stdout ?? ""}\n${output.stderr ?? ""}`));
      throw new Error("Staff MFA browser suite failed");
    }
  } finally {
    if (process.platform === "win32" && frontend.pid) spawnSync("taskkill", ["/pid", String(frontend.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    else frontend.kill("SIGTERM");
    await close(api);
  }
});
