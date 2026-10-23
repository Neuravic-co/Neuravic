import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The Vercel entry builds its own dependencies from process.env and a libSQL database, so exercise it end to end
// against a real database file created by the same migration script used for production.
const dir = mkdtempSync(join(tmpdir(), "neuravic-vercel-"));
const databaseUrl = `file:${join(dir, "test.db")}`;
const backend = join(import.meta.dirname, "..", "..", "NBE");

describe("Vercel entry", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    process.env.APP_ENV = "development";
    process.env.APP_URL = "http://localhost:5173";
    process.env.ALLOWED_ORIGINS = "http://localhost:5173";
    process.env.EMAIL_FROM = "Neuravic <no-reply@example.com>";
    process.env.NOTIFY_TO = "owner@example.com";
    process.env.TURSO_DATABASE_URL = databaseUrl;
    process.env.CRON_SECRET = "cron-secret-for-tests";
    execFileSync("node", ["scripts/migrate-libsql.mjs"], { cwd: backend, env: process.env, stdio: "pipe" });
    // The real Vercel entry: a Node request listener, served here on a local port.
    const entry = (await import("../../NBE/src/vercel-entry")).default;
    server = createServer(entry);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies every migration and is safe to run twice", () => {
    const output = execFileSync("node", ["scripts/migrate-libsql.mjs"], { cwd: backend, env: process.env }).toString();
    expect(output).toContain("database is up to date");
    expect(output).not.toContain("applied ");
  });

  it("serves the API against the database", async () => {
    const response = await fetch(`${base}/api/v1/health`);
    expect(response.status).toBe(200);
  });

  it("stores a contact enquiry", async () => {
    const response = await fetch(`${base}/api/v1/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ name: "Test Person", email: "person@example.com", message: "Hello, this is a test enquiry.", consent: true }),
    });
    expect(response.status).toBe(202);
  });

  it("keeps the maintenance endpoint private", async () => {
    expect((await fetch(`${base}/internal/maintenance`)).status).toBe(401);
    const ok = await fetch(`${base}/internal/maintenance`, { headers: { authorization: "Bearer cron-secret-for-tests" } });
    expect(ok.status).toBe(200);
  });
});
