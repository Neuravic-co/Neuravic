import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentSecurityPolicy } from "../../nfe/lib/csp";
import { emailError, validateContact } from "../../nfe/lib/validation";

describe("website email check", () => {
  for (const good of ["sara@example.com", "first.last+tag@sub.example.co.uk", "  padded@example.com  "]) {
    it(`accepts ${JSON.stringify(good)}`, () => assert.equal(emailError(good), undefined));
  }
  for (const bad of ["", "no-at-sign", "a@b", "a@@example.com", ".dot@example.com", "dou..ble@example.com", "a@example.c", `${"x".repeat(250)}@example.com`]) {
    it(`rejects ${JSON.stringify(bad.slice(0, 30))}`, () => assert.ok(emailError(bad)));
  }
});

describe("contact form check", () => {
  const valid = { firstName: " Sara ", lastName: "Ali", email: "sara@example.com", company: " Acme ", message: "We need to automate approvals.", consent: true };

  it("accepts a good form and trims the values", () => {
    const result = validateContact(valid);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.data.firstName, "Sara");
      assert.equal(result.data.company, "Acme");
    }
  });

  it("lists every problem, in the order of the fields", () => {
    const result = validateContact({ firstName: "", lastName: "", email: "nope", message: "short", consent: false });
    assert.ok(!result.ok);
    if (!result.ok) assert.deepEqual(Object.keys(result.errors), ["firstName", "lastName", "email", "message", "consent"]);
  });

  it("limits the length of the free-text fields", () => {
    const result = validateContact({ ...valid, message: "x".repeat(4001), company: "c".repeat(161) });
    assert.ok(!result.ok);
    if (!result.ok) assert.deepEqual(Object.keys(result.errors), ["company", "message"]);
  });

  it("requires consent", () => {
    const result = validateContact({ ...valid, consent: false });
    assert.ok(!result.ok && result.errors.consent);
  });
});

describe("content security policy", () => {
  const policy = (dev = false, api?: string) => contentSecurityPolicy("NONCE123", dev, api);

  it("ties scripts to the per-request nonce and bans framing, plugins and foreign forms", () => {
    const csp = policy();
    assert.ok(csp.includes("'nonce-NONCE123'"));
    assert.ok(csp.includes("'strict-dynamic'"));
    for (const rule of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-src 'none'", "upgrade-insecure-requests"]) {
      assert.ok(csp.includes(rule), rule);
    }
  });

  it("allows no eval in production and no third-party challenge scripts", () => {
    const csp = policy();
    assert.ok(!csp.includes("unsafe-eval"));
    assert.ok(!csp.includes("cloudflare"));
  });

  it("allows eval and local connections only in development", () => {
    const csp = policy(true);
    assert.ok(csp.includes("'unsafe-eval'"));
    assert.ok(csp.includes("http://localhost:*"));
    assert.ok(!policy().includes("localhost"));
  });

  it("lets the browser reach a public API origin, and refuses plain HTTP for it in production", () => {
    assert.match(policy(false, "https://api.example.com/api/v1"), /(^|[\s;])https:\/\/api\.example\.com(?=[\s;]|$)/);
    assert.throws(() => policy(false, "http://api.example.com/api/v1"), /HTTPS/);
    assert.doesNotThrow(() => policy(true, "http://localhost:8787/api/v1"));
  });
});


it("allows only the Turnstile frame origin when contact verification is enabled", () => {
  const policy = contentSecurityPolicy("NONCE", false, undefined, true);
  assert.ok(policy.includes("frame-src https://challenges.cloudflare.com"));
  assert.ok(policy.includes("'strict-dynamic'"));
  assert.ok(!policy.includes("'unsafe-inline' 'unsafe-eval'"));
});
