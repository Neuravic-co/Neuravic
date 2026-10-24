import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { clientIp } from "../../nbe/core/src/lib/request";
import { resolveService } from "../../nbe/services/gateway/src/routes";
import { SPAM_THRESHOLD, spamScore } from "../../nbe/core/src/modules/leads/spam";

const SECRET = "p".repeat(40);

function ipOf(headers: Record<string, string>, remote = "198.51.100.7", secret: string | null = SECRET) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("deps" as never, { config: { proxySecret: secret } } as never);
    await next();
  });
  app.get("/", (c) => c.text(clientIp(c as never)));
  return Promise.resolve(app.request("/", { headers }, { incoming: { socket: { remoteAddress: remote } } })).then((r) => r.text());
}

describe("visitor address", () => {
  it("uses the connection address by default", async () => {
    assert.equal(await ipOf({}), "198.51.100.7");
    assert.equal(await ipOf({}, "::ffff:198.51.100.8"), "198.51.100.8");
  });

  it("trusts the forwarded address only when the shared secret matches", async () => {
    assert.equal(await ipOf({ "x-client-ip": "203.0.113.50", "x-proxy-secret": SECRET }), "203.0.113.50");
    assert.equal(await ipOf({ "x-client-ip": "203.0.113.50", "x-proxy-secret": "wrong".repeat(10) }), "198.51.100.7");
    assert.equal(await ipOf({ "x-client-ip": "203.0.113.50" }), "198.51.100.7");
  });

  it("ignores a forwarded address when no secret is configured", async () => {
    assert.equal(await ipOf({ "x-client-ip": "203.0.113.50", "x-proxy-secret": SECRET }, "198.51.100.7", null), "198.51.100.7");
  });

  it("ignores X-Forwarded-For and malformed addresses", async () => {
    assert.equal(await ipOf({ "x-forwarded-for": "203.0.113.99" }), "198.51.100.7");
    assert.equal(await ipOf({ "x-client-ip": "<script>", "x-proxy-secret": SECRET }), "198.51.100.7");
  });
});

describe("gateway routing", () => {
  const cases: [string, string | undefined][] = [
    ["/api/v1/auth/login", "auth"],
    ["/api/v1/auth/mfa/setup", "auth"],
    ["/api/v1/me", "auth"],
    ["/api/v1/me/privacy/export", "auth"],
    ["/api/v1/token/exchange", "auth"],
    ["/.well-known/jwks.json", "auth"],
    ["/api/v1/admin/privacy-requests", "auth"],
    ["/api/v1/admin/overview", "admin"],
    ["/api/v1/admin/content/services", "admin"],
    ["/api/v1/leads", "leads"],
    ["/api/v1/content/services", "leads"],
    ["/api/v1/orgs", "portal"],
    ["/api/v1/orgs/abc/projects", "portal"],
    ["/api/v1/projects/abc/requests", "portal"],
    ["/api/v1/requests/abc", "portal"],
    ["/api/v1/requests/abc/approvals", "portal"],
    ["/api/v1/requests/abc/files", "files"],
    ["/api/v1/files/abc/content", "files"],
    ["/api/v1/dev/mailbox", "worker"],
    ["/api/v1/unknown", undefined],
    ["/", undefined],
    ["/api/v1/authx", undefined],
    ["/api/v1/administrator", undefined],
  ];
  for (const [path, service] of cases) {
    it(`${path} goes to ${service ?? "nobody"}`, () => assert.equal(resolveService(path), service));
  }
});

describe("spam score", () => {
  it("leaves an ordinary enquiry alone", () => {
    assert.equal(spamScore({ name: "Sara Ali", message: "We would like to automate our access approvals. Can we talk next week?" }), 0);
  });

  it("scores link-heavy, shouting, repetitive and stock-phrase messages", () => {
    assert.ok(spamScore({ name: "A", message: "see http://a.example http://b.example http://c.example" }) >= 3);
    assert.ok(spamScore({ name: "A", message: "BUY CHEAP WATCHES NOW BEST PRICE GUARANTEED TODAY ONLY" }) >= 2);
    assert.ok(spamScore({ name: "A", message: "aaaaaaaaaaaa hello" }) >= 2);
    assert.ok(spamScore({ name: "A", message: "casino loan offer http://a.example http://b.example http://c.example" }) >= SPAM_THRESHOLD);
    assert.ok(spamScore({ name: "A", message: "cheap SEO services http://spam.example" }) >= 4);
  });

  it("treats a link in the name field as suspicious", () => {
    assert.ok(spamScore({ name: "http://spam.example", message: "hello" }) >= 3);
  });
});
