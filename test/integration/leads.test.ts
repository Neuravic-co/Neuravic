import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { call, clearRateLimits, email, requireBackend, waitForMail } from "./support";

requireBackend();

describe("running backend", () => {
  beforeEach(clearRateLimits);

  const enquiry = (overrides: Record<string, unknown> = {}) => ({
    name: "Sara Ali",
    email: email("sara"),
    company: "Acme",
    message: `We would like to automate access approvals. ${Math.random()}`,
    serviceInterest: ["ai", "software"],
    consent: true,
    website: "",
    ...overrides,
  });

  it("reports health and version", async () => {
    assert.deepEqual((await call("GET", "/health")).data, { status: "ok" });
    assert.equal(typeof (await call("GET", "/version")).data.version, "string");
  });

  it("accepts a good enquiry and emails an acknowledgement", async () => {
    const body = enquiry();
    const res = await call("POST", "/leads", body);
    assert.equal(res.status, 202);
    assert.ok(res.data.id);
    assert.ok(await waitForMail(body.email, "received your message"));
  });

  it("returns the original when the same enquiry is sent twice", async () => {
    const body = enquiry({ message: `Exactly the same message, sent twice, for the duplicate check ${Date.now()}.` });
    const first = await call("POST", "/leads", body);
    const second = await call("POST", "/leads", body);
    assert.equal(first.status, 202);
    assert.equal(second.data.id, first.data.id);
  });

  it("refuses missing consent, a bad email and an empty message", async () => {
    assert.equal((await call("POST", "/leads", enquiry({ consent: false }))).status, 400);
    assert.equal((await call("POST", "/leads", enquiry({ email: "nope" }))).status, 400);
    assert.equal((await call("POST", "/leads", enquiry({ message: "" }))).status, 400);
  });

  it("quietly sets aside a bot that fills the hidden field", async () => {
    assert.equal((await call("POST", "/leads", enquiry({ website: "http://spam.example" }))).status, 202);
  });

  it("refuses a foreign origin", async () => {
    assert.equal((await call("POST", "/leads", enquiry(), { origin: "https://evil.example" })).status, 403);
  });

  it("limits a visitor to five enquiries an hour", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await call("POST", "/leads", enquiry())).status);
    assert.deepEqual(statuses.slice(0, 5), [202, 202, 202, 202, 202]);
    assert.deepEqual(statuses.slice(5), [429, 429]);
  });

  it("has no account, portal or admin endpoints", async () => {
    for (const path of ["/auth/login", "/auth/register", "/me", "/admin/overview", "/orgs", "/content"]) {
      assert.equal((await call("GET", path)).status, 404, path);
    }
  });
});
