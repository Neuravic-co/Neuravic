import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { clientIp, parseJson } from "../../nbe/src/core/http";
import { SPAM_THRESHOLD, spamScore } from "../../nbe/src/modules/leads/spam";
import { createLeadSchema } from "../../nbe/src/modules/leads/schema";
import { secret } from "./fixtures";

const SECRET = secret("p");

async function ipOf(headers: Record<string, string>, remote = "198.51.100.7", proxySecret: string | null = SECRET) {
  const app = new Hono();
  app.get("/", (c) => c.text(clientIp(c as never, proxySecret)));
  const response = await app.request("/", { headers }, { incoming: { socket: { remoteAddress: remote } } });
  return response.text();
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

  it("ignores X-Forwarded-For, CF-Connecting-IP and malformed addresses", async () => {
    assert.equal(await ipOf({ "x-forwarded-for": "203.0.113.99" }), "198.51.100.7");
    assert.equal(await ipOf({ "cf-connecting-ip": "203.0.113.99" }), "198.51.100.7");
    assert.equal(await ipOf({ "x-client-ip": "<script>", "x-proxy-secret": SECRET }), "198.51.100.7");
  });
});

describe("JSON bodies", () => {
  const app = new Hono();
  app.post("/", async (c) => c.json(await parseJson(c, createLeadSchema)));
  app.onError((error, c) => c.json({ name: error.name }, "status" in error ? (error.status as 415) : 400));
  const valid = { name: "Sara", email: "Sara@Example.com", message: "A valid contact enquiry.", consent: true };
  const post = (body: string, type = "application/json") => app.request("/", { method: "POST", body, headers: { "content-type": type } });

  it("accepts a valid body and normalises the email", async () => {
    const response = await post(JSON.stringify(valid));
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { email: string }).email, "sara@example.com");
  });

  it("refuses non-JSON content types", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      assert.equal((await post(JSON.stringify(valid), type)).status, 415, type);
    }
  });

  it("accepts JSON with a charset and +json types", async () => {
    assert.equal((await post(JSON.stringify(valid), "application/json; charset=utf-8")).status, 200);
    assert.equal((await post(JSON.stringify(valid), "application/vnd.api+json")).status, 200);
  });

  it("rejects broken JSON and invalid values", async () => {
    assert.equal((await post("{nope")).status, 400);
    assert.equal((await post(JSON.stringify({ ...valid, email: "nope" }))).status, 400);
    assert.equal((await post(JSON.stringify({ ...valid, consent: false }))).status, 400);
    assert.equal((await post(JSON.stringify({ ...valid, message: "short" }))).status, 400);
  });
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
  });

  it("treats a link in the name field as suspicious", () => {
    assert.ok(spamScore({ name: "http://spam.example", message: "hello" }) >= 3);
  });
});
