import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../../nbe/core/src/app";
import { loadConfig } from "../../nbe/core/src/config";
import type { Deps } from "../../nbe/core/src/deps";
import { AppError } from "../../nbe/core/src/lib/errors";
import { silentLogger } from "../../nbe/core/src/lib/logger";
import { MemoryRateLimiter } from "../../nbe/core/src/lib/rate-limit";
import { leadsRoutes } from "../../nbe/core/src/modules/leads/routes";
import { verifyTurnstile } from "../../nbe/core/src/modules/leads/turnstile";

const config = loadConfig({ APP_URL: "https://www.example.com", ALLOWED_ORIGINS: "https://www.example.com", EMAIL_FROM: "Mail <contact@example.com>", NOTIFY_TO: "team@example.com" });
const deps = (response: unknown = { success: true, action: "contact", hostname: "www.example.com" }) => ({
  config: { ...config, environment: "production", turnstileSecret: "test-secret" }, log: silentLogger,
  http: async () => Response.json(response), now: () => 1000, rateLimiter: new MemoryRateLimiter(),
  db: new Proxy({}, { get() { throw new Error("Must reject before database access"); } }),
}) as unknown as Deps;
const body = { name: "Sara", email: "sara@example.com", message: "A valid contact enquiry.", consent: true };
const post = (d: Deps, input: unknown, raw = false) => createApp(() => d, (api) => api.route("/leads", leadsRoutes)).request("/api/v1/leads", {
  method: "POST", headers: { origin: config.appUrl, "content-type": "application/json" }, body: raw ? String(input) : JSON.stringify(input),
});

describe("contact intake validation", () => {
  for (const [label, input] of [["empty", {}], ["invalid email", { ...body, email: "invalid" }], ["short message", { ...body, message: "" }], ["no consent", { ...body, consent: false }], ["oversized token", { ...body, turnstileToken: "x".repeat(2049) }]] as const) {
    it(`rejects ${label} before database or provider access`, async () => assert.equal((await post(deps(), input)).status, 400));
  }
  it("rejects malformed JSON", async () => assert.equal((await post(deps(), "{", true)).status, 400));
  it("fails closed without a production secret", async () => {
    const d = deps(); d.config.turnstileSecret = null;
    const response = await post(d, body);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, "bot_check_unavailable");
  });
  it("fails closed without a staging secret", async () => {
    const d = deps(); d.config.environment = "staging"; d.config.turnstileSecret = null;
    assert.equal((await post(d, body)).status, 503);
  });
  it("allows provider-free development verification", async () => {
    const d = deps(); d.config.environment = "development"; d.config.turnstileSecret = null;
    assert.equal(await verifyTurnstile(d, undefined, "unknown"), true);
  });
  it("rejects a missing token", async () => assert.equal((await post(deps(), body)).status, 422));
  for (const verdict of [{ success: false }, { success: true }, { success: true, hostname: "www.example.com.evil.test", action: "contact" }, { success: true, hostname: "evil.test", action: "contact" }, { success: true, hostname: { value: "www.example.com" }, action: "contact" }, { success: true, hostname: "www.example.com", action: "login" }]) {
    it(`rejects untrusted verdict ${JSON.stringify(verdict)}`, async () => {
      assert.equal((await post(deps(verdict), { ...body, turnstileToken: "token" })).status, 422);
    });
  }
  it("accepts exactly the configured hostname and contact action", async () => assert.equal(await verifyTurnstile(deps(), "token", "unknown"), true));
  it("fails closed and logs no token, secret or provider error on outage", async () => {
    const d = deps(); const logs: unknown[] = [];
    d.log = { ...silentLogger, warn: (...args) => logs.push(args) };
    d.http = async () => { throw new Error("secret token private data"); };
    await assert.rejects(verifyTurnstile(d, "token", "unknown"), (e: unknown) => e instanceof AppError && e.status === 503);
    assert.deepEqual(logs, [["turnstile_unavailable"]]);
  });
});
