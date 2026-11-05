import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../../nbe/src/app";
import { unavailable } from "../../nbe/src/core/errors";
import type { BotCheck } from "../../nbe/src/modules/leads/turnstile";
import { TurnstileBotCheck } from "../../nbe/src/modules/leads/turnstile";
import { silentLogger } from "../../nbe/src/core/logger";
import { loadConfig } from "../../nbe/src/config";
import { developmentEnv, productionEnv, testContainer } from "./fixtures";

const ORIGIN = "https://www.example.com";
const valid = { name: "Sara", email: "sara@example.com", message: "A valid contact enquiry.", consent: true };
const accepting: BotCheck = { verify: async () => true };

const request = (app: ReturnType<typeof createApp>, path: string, init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {}) =>
  app.request(`/api/v1${path}`, { ...init, headers: { origin: ORIGIN, "content-type": "application/json", ...init.headers } });

const post = (app: ReturnType<typeof createApp>, body: unknown, raw = false) =>
  request(app, "/leads", { method: "POST", body: raw ? String(body) : JSON.stringify(body) });

describe("system endpoints", () => {
  const app = createApp(testContainer(productionEnv));

  it("reports health and version", async () => {
    assert.deepEqual(await (await request(app, "/health")).json(), { status: "ok" });
    assert.deepEqual(await (await request(app, "/version")).json(), { version: "dev" });
  });

  it("answers unknown paths with a problem document and a request id", async () => {
    const response = await request(app, "/nothing");
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-type"), "application/problem+json");
    assert.ok(response.headers.get("x-request-id"));
    assert.equal(((await response.json()) as { code: string }).code, "not_found");
  });

  it("keeps a well-formed caller request id and replaces a malformed one", async () => {
    assert.equal((await request(app, "/health", { headers: { "x-request-id": "abcd-1234-efgh" } })).headers.get("x-request-id"), "abcd-1234-efgh");
    assert.notEqual((await request(app, "/health", { headers: { "x-request-id": "bad id\n" } })).headers.get("x-request-id"), "bad id\n");
  });

  it("never exposes the development mailbox in a deployed environment", async () => {
    assert.equal((await request(app, "/dev/mailbox")).status, 404);
  });

  it("sends security headers and never caches", async () => {
    const response = await request(app, "/health");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });
});

describe("request guards", () => {
  it("refuses state-changing requests from a foreign origin", async () => {
    const app = createApp(testContainer(productionEnv, { botCheck: accepting }));
    const response = await request(app, "/leads", { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify(valid) });
    assert.equal(response.status, 403);
  });

  it("refuses oversized bodies", async () => {
    const app = createApp(testContainer(productionEnv, { botCheck: accepting }));
    const response = await post(app, { ...valid, message: "x".repeat(70_000) });
    assert.equal(response.status, 413);
  });

  it("answers 503 for everything but health while in maintenance", async () => {
    const app = createApp(testContainer({ ...productionEnv, MAINTENANCE_MODE: "true" }, { botCheck: accepting }));
    assert.equal((await post(app, valid)).status, 503);
    assert.equal((await request(app, "/health")).status, 200);
    assert.deepEqual(await (await request(app, "/health")).json(), { status: "maintenance" });
  });

  it("limits enquiries to five per hour per visitor", async () => {
    const app = createApp(testContainer(productionEnv, { botCheck: { verify: async () => false } }));
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await post(app, valid)).status);
    assert.deepEqual(statuses, [422, 422, 422, 422, 422, 429, 429]);
  });
});

describe("cron endpoint", () => {
  const app = createApp(testContainer(productionEnv));
  const call = (authorization?: string) => app.request("/internal/cron", { headers: authorization ? { authorization } : {} });

  it("rejects calls without the right secret", async () => {
    assert.equal((await call()).status, 401);
    assert.equal((await call("Bearer wrong")).status, 401);
  });

  it("is disabled when no secret is configured", async () => {
    const disabled = createApp(testContainer({ ...productionEnv, CRON_SECRET: undefined }));
    assert.equal((await disabled.request("/internal/cron", { headers: { authorization: "Bearer " } })).status, 401);
  });
});

describe("contact intake validation", () => {
  const app = () => createApp(testContainer(productionEnv, { botCheck: accepting }));

  for (const [label, input] of [
    ["empty", {}],
    ["invalid email", { ...valid, email: "invalid" }],
    ["short message", { ...valid, message: "" }],
    ["no consent", { ...valid, consent: false }],
    ["oversized token", { ...valid, turnstileToken: "x".repeat(2049) }],
  ] as const) {
    it(`rejects ${label} before touching the database`, async () => assert.equal((await post(app(), input)).status, 400));
  }

  it("rejects malformed JSON and other content types", async () => {
    assert.equal((await post(app(), "{", true)).status, 400);
    const response = await request(app(), "/leads", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(valid) });
    assert.equal(response.status, 415);
  });

  it("reports field errors", async () => {
    const body = (await (await post(app(), { ...valid, email: "invalid" })).json()) as { errors: { path: string }[] };
    assert.deepEqual(body.errors.map((error) => error.path), ["email"]);
  });

  it("quietly ignores a bot that fills the hidden field, without storing anything", async () => {
    const response = await post(app(), { ...valid, website: "http://spam.example" });
    assert.equal(response.status, 202);
  });
});

describe("bot check", () => {
  const verdict = (response: unknown, env: Record<string, string | undefined> = { ...productionEnv, TURNSTILE_SECRET: "test-secret" }) =>
    new TurnstileBotCheck(loadConfig(env), (async () => Response.json(response)) as typeof fetch, silentLogger);
  const good = { success: true, action: "contact", hostname: "www.example.com" };

  it("fails closed without a secret when deployed", async () => {
    await assert.rejects(verdict(good, productionEnv).verify("token", "unknown"), (error: unknown) => error instanceof Error && "status" in error && error.status === 503);
  });

  it("allows development without a secret", async () => {
    assert.equal(await verdict(good, developmentEnv).verify(undefined, "unknown"), true);
  });

  it("rejects a missing token", async () => {
    assert.equal(await verdict(good).verify(undefined, "unknown"), false);
  });

  for (const bad of [
    { success: false },
    { success: true },
    { success: true, hostname: "www.example.com.evil.test", action: "contact" },
    { success: true, hostname: { value: "www.example.com" }, action: "contact" },
    { success: true, hostname: "www.example.com", action: "login" },
  ]) {
    it(`rejects the untrusted verdict ${JSON.stringify(bad)}`, async () => assert.equal(await verdict(bad).verify("token", "unknown"), false));
  }

  it("accepts exactly the configured hostname and the contact action", async () => {
    assert.equal(await verdict(good).verify("token", "unknown"), true);
  });

  it("fails closed and logs nothing sensitive on an outage", async () => {
    const logs: unknown[] = [];
    const check = new TurnstileBotCheck(
      loadConfig({ ...productionEnv, TURNSTILE_SECRET: "test-secret" }),
      (async () => {
        throw new Error("secret token private data");
      }) as typeof fetch,
      { ...silentLogger, warn: (...args) => logs.push(args) },
    );
    await assert.rejects(check.verify("token", "unknown"), unavailable("bot_check_unavailable", "x").constructor);
    assert.deepEqual(logs, [["turnstile_unavailable"]]);
  });
});
