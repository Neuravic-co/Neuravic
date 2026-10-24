import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { Client, clearRateLimits, email, newPerson, requireBackend, staffAdmin } from "./support";

requireBackend();

describe("website enquiries", () => {
  // Enquiries are limited to 5 per hour per visitor, so give every test a fresh allowance.
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

  it("accepts a good enquiry", async () => {
    const res = await new Client().call("POST", "/leads", enquiry());
    assert.equal(res.status, 202);
    assert.ok(res.data.id);
  });

  it("returns the original when the same enquiry is sent twice", async () => {
    const body = enquiry({ message: "Exactly the same message, sent twice, for the duplicate check." });
    const first = await new Client().call("POST", "/leads", body);
    const second = await new Client().call("POST", "/leads", body);
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);
    assert.equal(second.data.id, first.data.id);
  });

  it("refuses missing consent, a bad email and an empty message", async () => {
    const c = new Client();
    assert.equal((await c.call("POST", "/leads", enquiry({ consent: false }))).status, 400);
    assert.equal((await c.call("POST", "/leads", enquiry({ email: "nope" }))).status, 400);
    assert.equal((await c.call("POST", "/leads", enquiry({ message: "" }))).status, 400);
  });

  it("quietly sets aside a bot that fills the hidden field, without telling it so", async () => {
    const res = await new Client().call("POST", "/leads", enquiry({ website: "http://spam.example" }));
    assert.equal(res.status, 202);
  });

  it("is not readable by the public", async () => {
    const anon = new Client();
    assert.equal((await anon.call("GET", "/leads")).status, 401);
    assert.equal((await anon.call("GET", "/leads/export.csv")).status, 401);
  });

  it("is not readable by a client account either", async () => {
    const person = await newPerson("ivy");
    assert.equal((await person.client.call("GET", "/leads")).status, 403);
  });
});

describe("site content", () => {
  it("is public and has all five sections", async () => {
    const res = await new Client().call("GET", "/content");
    assert.equal(res.status, 200);
    for (const section of ["services", "projects", "process", "team", "company"]) assert.ok(section in res.data, section);
  });

  it("serves one section and refuses an unknown one", async () => {
    const c = new Client();
    assert.equal((await c.call("GET", "/content/services")).status, 200);
    assert.equal((await c.call("GET", "/content/not-a-section")).status, 404);
  });
});

describe("staff tools", () => {
  let staff: Client;
  before(async () => {
    staff = await staffAdmin();
  });

  it("lets a staff admin see the overview, the audit log and the security status", async () => {
    assert.equal((await staff.call("GET", "/admin/overview")).status, 200);
    assert.equal((await staff.call("GET", "/admin/audit")).status, 200);
    assert.equal((await staff.call("GET", "/admin/security-status")).status, 200);
    assert.equal((await staff.call("GET", "/leads")).status, 200);
  });

  it("keeps every staff tool away from client accounts and visitors", async () => {
    const person = await newPerson("jack");
    for (const path of ["/admin/overview", "/admin/users", "/admin/audit", "/admin/security-status", "/admin/privacy-requests", "/orgs"]) {
      assert.equal((await person.client.call("GET", path)).status, 403, `client: ${path}`);
      assert.equal((await new Client().call("GET", path)).status, 401, `visitor: ${path}`);
    }
    assert.equal((await person.client.call("POST", "/admin/staff", { email: email("mole"), staffRole: "admin" })).status, 403);
  });

  it("never lists password data", async () => {
    const users = await staff.call("GET", "/admin/users?limit=50");
    assert.equal(users.status, 200);
    assert.ok(!JSON.stringify(users.data).toLowerCase().includes("scrypt"));
    assert.ok(!JSON.stringify(users.data).toLowerCase().includes("password"));
  });

  it("protects the last staff admin from being disabled", async () => {
    const me = await staff.call("GET", "/me");
    const res = await staff.call("PATCH", `/admin/users/${me.data.user.id}`, { status: "disabled" });
    assert.equal(res.status, 409);
  });

  it("cuts off a disabled person's session at once", async () => {
    const person = await newPerson("kara");
    assert.equal((await person.client.call("GET", "/me")).status, 200);
    assert.equal((await staff.call("PATCH", `/admin/users/${person.id}`, { status: "disabled" })).status, 200);
    assert.equal((await person.client.call("GET", "/me")).status, 401);
    assert.equal((await new Client().call("POST", "/auth/login", { email: person.email, password: person.password })).status, 401);
  });

  it("records what staff do in the audit log", async () => {
    const audit = await staff.call("GET", "/admin/audit?limit=50");
    assert.ok(audit.data.items.length > 0);
    assert.ok(audit.data.items.some((row: any) => String(row.action).startsWith("auth.")));
  });
});

describe("privacy", () => {
  it("gives a signed-in person a copy of their own data, and only theirs", async () => {
    const person = await newPerson("lena");
    const copy = await person.client.call("GET", "/me/privacy/export");
    assert.equal(copy.status, 200);
    const text = JSON.stringify(copy.data);
    assert.ok(text.includes(person.email));
    assert.ok(!text.toLowerCase().includes("scrypt"));
  });

  it("files one erasure request and returns the same one when asked again", async () => {
    const person = await newPerson("mona");
    const first = await person.client.call("POST", "/me/privacy/requests", { kind: "erasure" });
    assert.equal(first.status, 202);
    assert.equal(first.data.status, "pending_review");
    const second = await person.client.call("POST", "/me/privacy/requests", { kind: "erasure" });
    assert.equal(second.data.id, first.data.id);
  });
});
