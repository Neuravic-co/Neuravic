import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../../nbe/src/config";
import { developmentEnv, productionEnv, secret } from "./fixtures";

describe("configuration", () => {
  it("accepts a development setup", () => {
    const config = loadConfig(developmentEnv);
    assert.equal(config.environment, "development");
    assert.equal(config.deployed, false);
    assert.equal(config.maintenanceMode, false);
    assert.equal(config.port, 8787);
    assert.deepEqual(config.allowedOrigins, ["http://localhost:5173", "http://localhost:3000"]);
  });

  it("accepts a production setup", () => {
    const config = loadConfig(productionEnv);
    assert.equal(config.deployed, true);
    assert.equal(config.proxySecret, secret("x"));
  });

  it("treats empty values as unset", () => {
    const config = loadConfig({ ...developmentEnv, RESEND_API_KEY: "", SMTP_URL: "", TURNSTILE_SECRET: "" });
    assert.equal(config.resendApiKey, null);
    assert.equal(config.smtpUrl, null);
    assert.equal(config.turnstileSecret, null);
  });

  it("requires the database and the privacy key everywhere", () => {
    assert.throws(() => loadConfig({ ...developmentEnv, DATABASE_URL: undefined }), /DATABASE_URL/);
    assert.throws(() => loadConfig({ ...developmentEnv, PRIVACY_HASH_SECRET: undefined }), /PRIVACY_HASH_SECRET/);
  });

  it("refuses a privacy key that is short or reused", () => {
    assert.throws(() => loadConfig({ ...productionEnv, PRIVACY_HASH_SECRET: "short" }), /PRIVACY_HASH_SECRET/);
    assert.throws(() => loadConfig({ ...productionEnv, PRIVACY_HASH_SECRET: productionEnv.PROXY_SECRET }), /independent/);
    assert.throws(() => loadConfig({ ...productionEnv, PRIVACY_HASH_SECRET: productionEnv.CRON_SECRET }), /independent/);
  });

  it("refuses website origins that are not exact, or not HTTPS in production", () => {
    assert.throws(() => loadConfig({ ...productionEnv, APP_URL: "http://www.example.com", ALLOWED_ORIGINS: "http://www.example.com" }), /HTTPS/);
    assert.throws(() => loadConfig({ ...developmentEnv, ALLOWED_ORIGINS: "http://localhost:3000" }), /ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ ...developmentEnv, ALLOWED_ORIGINS: "http://localhost:5173/path" }), /ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ ...developmentEnv, ALLOWED_ORIGINS: "http://user:pw@localhost:5173" }), /ALLOWED_ORIGINS/);
  });

  it("never leaks a configuration value in its error message", () => {
    assert.throws(() => loadConfig({ ...productionEnv, CRON_SECRET: "leaky-short-value" }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CRON_SECRET/);
      assert.ok(!error.message.includes("leaky-short-value"));
      return true;
    });
  });

  it("only accepts a real Slack webhook", () => {
    assert.throws(() => loadConfig({ ...developmentEnv, SLACK_WEBHOOK_URL: "https://evil.example.com/hook" }), /Slack/);
    assert.doesNotThrow(() => loadConfig({ ...developmentEnv, SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/x" }));
  });
});

describe("email settings", () => {
  for (const value of ["not-an-address", "Name\r\nBcc: other@example.com <sender@example.com>", "one@example.com,two@example.com"]) {
    it("rejects an invalid sender without exposing its value", () => {
      assert.throws(() => loadConfig({ ...developmentEnv, EMAIL_FROM: value }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /EMAIL_FROM/);
        assert.ok(!error.message.includes(value));
        return true;
      });
    });
  }

  it("accepts a plain sender and a named sender", () => {
    assert.equal(loadConfig({ ...developmentEnv, EMAIL_FROM: "sender@example.com" }).emailFrom, "sender@example.com");
    assert.equal(loadConfig(developmentEnv).emailFrom, developmentEnv.EMAIL_FROM);
  });
});
