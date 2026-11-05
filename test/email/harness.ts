import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createApp } from "../../nbe/src/app";
import { createContainer } from "../../nbe/src/container";
import { createDatabase, schema } from "../../nbe/src/db/client";
import { silentLogger } from "../../nbe/src/core/logger";
import type { BotCheck } from "../../nbe/src/modules/leads/turnstile";
import type { EmailMessage, Mailer } from "../../nbe/src/modules/mail/mailer";
import { ResendMailer } from "../../nbe/src/modules/mail/resend";
import { MemoryRateLimiter, type RateLimiter } from "../../nbe/src/modules/rate-limit/limiter";
import { OutboxRepository } from "../../nbe/src/modules/outbox/repository";

export async function emailHarness(options: { http?: typeof fetch; turnstile?: boolean } = {}) {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Postgres verification blocked: set TEST_DATABASE_URL to a disposable local neuravic_contact_test database. Never use production.");
  const url = new URL(raw);
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname === "/neuravic_contact_test" && ["postgres:", "postgresql:"].includes(url.protocol),
    "Only the disposable local neuravic_contact_test database is permitted",
  );

  const connection = new pg.Client({ connectionString: raw });
  await connection.connect();
  try {
    await connection.query("CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(200) PRIMARY KEY, applied_at bigint NOT NULL)");
    const { rows } = await connection.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.name));
    const dir = fileURLToPath(new URL("../../database/migrations/", import.meta.url));
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      const statements = readFileSync(`${dir}/${file}`, "utf8").split(/^-- @@\s*$/m).map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) await connection.query(statement);
      await connection.query("INSERT INTO schema_migrations VALUES ($1, $2)", [file, Date.now()]);
    }
  } finally {
    await connection.end();
  }

  const { db, close } = createDatabase({ url: raw, poolSize: 5, caCert: null });
  let clock = Date.now();
  const logs: unknown[] = [];
  const requests: { key: string; body: any }[] = [];
  const deferred: Promise<unknown>[] = [];

  const resendHttp: typeof fetch = async (_url, init) => {
    requests.push({ key: new Headers(init?.headers).get("idempotency-key")!, body: JSON.parse(String(init?.body)) });
    return Response.json({ id: `00000000-0000-4000-8000-${requests.length.toString().padStart(12, "0")}` });
  };
  const state: { mailer: Mailer; limiter: RateLimiter } = {
    mailer: new ResendMailer("automated-test-only", resendHttp),
    limiter: new MemoryRateLimiter(),
  };
  const switchable: Mailer = { send: (message, sendOptions) => state.mailer.send(message, sendOptions) };
  const limiter: RateLimiter = { hit: (...args) => state.limiter.hit(...args) };
  const acceptAll: BotCheck = { verify: async () => true };

  const container = createContainer({
    env: {
      APP_URL: "http://localhost:5174",
      ALLOWED_ORIGINS: "http://localhost:5174",
      DATABASE_URL: raw,
      EMAIL_FROM: "Neuravic <contact@example.com>",
      NOTIFY_TO: "team@example.com",
      PRIVACY_HASH_SECRET: "h".repeat(40),
      ...(options.turnstile ? { TURNSTILE_SECRET: "local-verification-secret" } : {}),
    },
    defer: (task) => {
      deferred.push(task);
    },
    overrides: {
      db,
      mailer: switchable,
      rateLimiter: limiter,
      now: () => clock,
      http: options.http ?? (async () => {
        throw new Error("Unexpected external request; automated tests never send real mail");
      }),
      log: { ...silentLogger, warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
      ...(options.turnstile ? {} : { botCheck: acceptAll }),
    },
  });

  const app = createApp(container);
  const outboxRepository = new OutboxRepository(db);
  const message = (overrides: Partial<EmailMessage> = {}): EmailMessage => ({
    to: "visitor@example.com",
    from: container.config.emailFrom,
    subject: "Test enquiry",
    text: "Private text https://example.com/#token=private",
    ...overrides,
  });

  return {
    container,
    config: container.config,
    outbox: container.services.outbox,
    db,
    app,
    logs,
    requests,
    state,
    message,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    enqueue: (at = clock, overrides: Partial<EmailMessage> = {}) => outboxRepository.enqueue(db, [{ topic: "email", message: message(overrides) }], at),
    settle: async () => {
      while (deferred.length) await deferred.shift();
    },
    post: (input: unknown) =>
      app.request("/api/v1/leads", {
        method: "POST",
        headers: { origin: container.config.appUrl, "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    async reset() {
      for (const table of [schema.outbox, schema.leads, schema.rateLimits]) await db.delete(table);
      logs.length = 0;
      requests.length = 0;
      deferred.length = 0;
      state.mailer = new ResendMailer("automated-test-only", resendHttp);
      state.limiter = new MemoryRateLimiter();
      container.config.maintenanceMode = false;
    },
    close,
  };
}
