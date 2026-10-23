import { execFileSync } from "node:child_process";
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
  let handler: { fetch(request: Request): Response | Promise<Response> };

  beforeAll(async () => {
    process.env.APP_ENV = "development";
    process.env.APP_URL = "http://localhost:5173";
    process.env.ALLOWED_ORIGINS = "http://localhost:5173";
    process.env.EMAIL_FROM = "Neuravic <no-reply@example.com>";
    process.env.NOTIFY_TO = "owner@example.com";
    process.env.TURSO_DATABASE_URL = databaseUrl;
    process.env.CRON_SECRET = "cron-secret-for-tests";
    execFileSync("node", ["scripts/migrate-libsql.mjs"], { cwd: backend, env: process.env, stdio: "pipe" });
    handler = (await import("../../NBE/api/index")).default;
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("applies every migration and is safe to run twice", () => {
    const output = execFileSync("node", ["scripts/migrate-libsql.mjs"], { cwd: backend, env: process.env }).toString();
    expect(output).toContain("database is up to date");
    expect(output).not.toContain("applied ");
  });

  it("serves the API against the database", async () => {
    const response = await handler.fetch(new Request("http://localhost/api/v1/health"));
    expect(response.status).toBe(200);
  });

  it("stores a contact enquiry", async () => {
    const response = await handler.fetch(
      new Request("http://localhost/api/v1/leads", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:5173" },
        body: JSON.stringify({ name: "Test Person", email: "person@example.com", message: "Hello, this is a test enquiry.", consent: true }),
      }),
    );
    expect(response.status).toBe(202);
  });

  it("keeps the maintenance endpoint private", async () => {
    expect((await handler.fetch(new Request("http://localhost/internal/maintenance"))).status).toBe(401);
    const ok = await handler.fetch(new Request("http://localhost/internal/maintenance", { headers: { authorization: "Bearer cron-secret-for-tests" } }));
    expect(ok.status).toBe(200);
  });
});
