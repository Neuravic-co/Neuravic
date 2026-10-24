import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../../nbe/core/src/config";
import type { Env } from "../../nbe/core/src/env";

const dev: Env = {
  APP_URL: "http://localhost:5173",
  ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:3000",
  EMAIL_FROM: "Neuravic <no-reply@example.com>",
  NOTIFY_TO: "team@example.com",
};

const secret = (seed: string) => seed.repeat(40).slice(0, 40);
const production: Env = {
  ...dev,
  APP_ENV: "production",
  APP_URL: "https://www.example.com",
  ALLOWED_ORIGINS: "https://www.example.com",
  PRIVACY_HASH_SECRET: secret("p"),
  MFA_ENCRYPTION_KEY: "ab".repeat(32),
  PROXY_SECRET: secret("x"),
};

describe("configuration", () => {
  it("accepts a development setup and turns development defaults on", () => {
    const config = loadConfig(dev);
    assert.equal(config.environment, "development");
    assert.equal(config.cookieSecure, false);
    assert.equal(config.staffMfaRequired, false);
    assert.equal(config.maintenanceMode, false);
    assert.deepEqual(config.allowedOrigins, ["http://localhost:5173", "http://localhost:3000"]);
  });

  it("accepts a production setup and turns the strict defaults on", () => {
    const config = loadConfig(production);
    assert.equal(config.cookieSecure, true);
    assert.equal(config.staffMfaRequired, true);
  });

  it("refuses production without its own privacy key or MFA key", () => {
    assert.throws(() => loadConfig({ ...production, PRIVACY_HASH_SECRET: undefined }), /PRIVACY_HASH_SECRET/);
    assert.throws(() => loadConfig({ ...production, MFA_ENCRYPTION_KEY: undefined }), /MFA_ENCRYPTION_KEY/);
  });

  it("refuses a privacy key that is short, the development key or reused", () => {
    assert.throws(() => loadConfig({ ...production, PRIVACY_HASH_SECRET: "short" }), /Invalid environment|independent/);
    assert.throws(() => loadConfig({ ...production, PRIVACY_HASH_SECRET: production.PROXY_SECRET }), /independent/);
    assert.throws(() => loadConfig({ ...production, PRIVACY_HASH_SECRET: "neuravic-development-identifiers-only" }), /independent/);
  });

  it("refuses an MFA key that is not exactly 64 hex characters or is reused", () => {
    assert.throws(() => loadConfig({ ...production, MFA_ENCRYPTION_KEY: "zz".repeat(32) }), /Invalid environment/);
    assert.throws(() => loadConfig({ ...production, MFA_ENCRYPTION_KEY: "ab".repeat(16) }), /Invalid environment/);
  });

  it("refuses website origins that are not exact, or not HTTPS in production", () => {
    assert.throws(() => loadConfig({ ...production, APP_URL: "http://www.example.com", ALLOWED_ORIGINS: "http://www.example.com" }), /HTTPS/);
    assert.throws(() => loadConfig({ ...dev, ALLOWED_ORIGINS: "http://localhost:3000" }), /ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ ...dev, ALLOWED_ORIGINS: "http://localhost:5173/path" }), /ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ ...dev, ALLOWED_ORIGINS: "http://user:pw@localhost:5173" }), /ALLOWED_ORIGINS/);
  });

  it("never leaks a configuration value in its error message", () => {
    try {
      loadConfig({ ...production, MFA_ENCRYPTION_KEY: "not-hex-secret-value" });
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(!String((error as Error).message).includes("not-hex-secret-value"));
    }
  });

  it("only accepts a real Slack webhook", () => {
    assert.throws(() => loadConfig({ ...dev, SLACK_WEBHOOK_URL: "https://evil.example.com/hook" }), /Slack/);
    assert.doesNotThrow(() => loadConfig({ ...dev, SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/x" }));
  });
});
