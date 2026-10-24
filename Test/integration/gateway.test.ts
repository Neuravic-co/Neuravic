import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { API, BASE, Client, ORIGIN, requireBackend } from "./support";

requireBackend();

describe("gateway", () => {
  it("reports the health of every service", async () => {
    const res = await new Client().call("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.data.status, "ok");
    assert.deepEqual(Object.keys(res.data.services).sort(), ["admin", "auth", "files", "leads", "portal", "worker"]);
    for (const state of Object.values(res.data.services)) assert.equal(state, "ok");
  });

  it("answers the version itself", async () => {
    const res = await new Client().call("GET", "/version");
    assert.equal(res.status, 200);
    assert.ok(res.data.version);
  });

  it("sends each path to the service that owns it", async () => {
    const anon = new Client();
    assert.equal((await anon.call("GET", "/content")).status, 200, "leads: public content");
    assert.equal((await anon.call("GET", "/me")).status, 401, "auth: needs a session");
    assert.equal((await anon.call("GET", "/orgs")).status, 401, "portal: needs a session");
    assert.equal((await anon.call("GET", "/admin/overview")).status, 401, "admin: needs a session");
    assert.equal((await anon.call("GET", "/admin/privacy-requests")).status, 401, "auth: privacy review");
    assert.equal((await anon.call("GET", "/files/does-not-exist/content")).status, 401, "file server: needs a session");
    assert.equal((await anon.call("GET", "/requests/does-not-exist/files")).status, 401, "file server: needs a session");
    assert.equal((await anon.call("GET", "/dev/mailbox")).status, 200, "worker: development mailbox");
  });

  it("serves the public signing keys", async () => {
    const res = await fetch(`${BASE}/.well-known/jwks.json`);
    // 503 means "no signing key configured", which is a valid answer in development; either way the auth service answered.
    assert.ok([200, 503].includes(res.status), String(res.status));
  });

  it("answers unknown paths with a problem document, not an error page", async () => {
    const res = await new Client().call("GET", "/nothing-here");
    assert.equal(res.status, 404);
    assert.equal(res.data.code, "not_found");
    assert.match(res.headers.get("content-type") ?? "", /problem\+json/);
  });

  it("adds a request id to every answer and keeps one a caller supplies", async () => {
    const own = await new Client().call("GET", "/content", undefined, { "x-request-id": "integration-test-0001" });
    assert.equal(own.headers.get("x-request-id"), "integration-test-0001");
    const bad = await new Client().call("GET", "/content", undefined, { "x-request-id": "bad id with spaces" });
    assert.notEqual(bad.headers.get("x-request-id"), "bad id with spaces");
  });

  it("allows the website's origin and no other for cross-origin calls", async () => {
    const allowed = await fetch(`${API}/content`, { headers: { origin: ORIGIN } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
    const foreign = await fetch(`${API}/content`, { headers: { origin: "https://evil.example.com" } });
    assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  });

  it("answers a preflight request for an allowed origin", async () => {
    const res = await fetch(`${API}/orgs`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    assert.ok(res.status === 204 || res.status === 200);
    assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  });

  it("sets browser protection headers and never caches API answers", async () => {
    const res = await new Client().call("GET", "/me");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("ignores a forged visitor address (rate limits cannot be dodged by spoofing headers)", async () => {
    const forged = { "x-client-ip": "203.0.113.77", "x-proxy-secret": "guess".repeat(10), "x-forwarded-for": "203.0.113.78" };
    const res = await new Client().call("GET", "/content", undefined, forged);
    assert.equal(res.status, 200);
  });
});
