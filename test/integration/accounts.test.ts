import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { API, Client, ORIGIN, email, newPerson, requireBackend, run, signInByLink, waitForMail } from "./support";

requireBackend();

describe("sign-up and login with a password", () => {
  const address = email("dana");
  const password = `a good password ${run}`;

  it("creates an account and signs the person in", async () => {
    const client = new Client();
    const res = await client.call("POST", "/auth/register", { name: "Dana", email: address, password, consent: true });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.email, address);
    assert.ok(client.cookie, "a session cookie was set");
    const me = await client.call("GET", "/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, address);
    assert.deepEqual(me.data.memberships, []);
    assert.equal(me.data.user.staffRole, null);
  });

  it("sets a protected session cookie and never returns the password or its hash", async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: address, password }),
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//);
    const text = await res.text();
    assert.ok(!text.includes(password) && !/scrypt/.test(text));
  });

  it("refuses a second account with the same email", async () => {
    const res = await new Client().call("POST", "/auth/register", { name: "Dana", email: address, password: "another password 1", consent: true });
    assert.equal(res.status, 409);
  });

  it("refuses short passwords, a missing consent and bad email addresses", async () => {
    const c = new Client();
    assert.equal((await c.call("POST", "/auth/register", { name: "X Y", email: email("short"), password: "short", consent: true })).status, 400);
    assert.equal((await c.call("POST", "/auth/register", { name: "X Y", email: email("noconsent"), password: "long enough pw", consent: false })).status, 400);
    assert.equal((await c.call("POST", "/auth/register", { name: "X Y", email: "not-an-email", password: "long enough pw", consent: true })).status, 400);
  });

  it("logs in with the right password and answers a wrong password and an unknown email identically", async () => {
    const good = await new Client().call("POST", "/auth/login", { email: address, password });
    assert.equal(good.status, 200);
    const wrong = await new Client().call("POST", "/auth/login", { email: address, password: "not the password" });
    const unknown = await new Client().call("POST", "/auth/login", { email: email("nobody"), password: "not the password" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.data.title, unknown.data.title);
    assert.equal(wrong.data.code, unknown.data.code);
  });

  it("logs out and the old session stops working", async () => {
    const person = await newPerson("erin");
    assert.equal((await person.client.call("GET", "/me")).status, 200);
    const stale = person.client.cookie;
    assert.equal((await person.client.call("POST", "/auth/logout")).status, 204);
    const replay = new Client();
    replay.cookie = stale;
    assert.equal((await replay.call("GET", "/me")).status, 401);
  });

  it("refuses sign-in requests that come from another website", async () => {
    const res = await new Client().call("POST", "/auth/login", { email: address, password }, { origin: "https://evil.example.com" });
    assert.equal(res.status, 403);
  });

  it("refuses a login body that is not JSON", async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
      body: `email=${address}&password=${password}`,
    });
    assert.equal(res.status, 415);
  });
});

describe("emailed one-time links", () => {
  it("answers the same way whether or not the account exists", async () => {
    const known = await new Client().call("POST", "/auth/magic-link", { email: email("dana") });
    const unknown = await new Client().call("POST", "/auth/magic-link", { email: email("ghost") });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.data, unknown.data);
  });

  it("signs a person in once and refuses the same link a second time", async () => {
    const person = await newPerson("frank");
    await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
    await new Client().call("POST", "/auth/magic-link", { email: person.email });
    const mail = await waitForMail(person.email, "sign-in");
    assert.ok(mail, "the email arrived in the development mailbox");
    const token = decodeURIComponent(/#token=([^\s]+)/.exec(mail.text)?.[1] ?? "");
    assert.ok(token.length > 20);
    const first = new Client();
    assert.equal((await first.call("POST", "/auth/verify", { token })).status, 200);
    assert.equal((await first.call("GET", "/me")).status, 200);
    assert.equal((await new Client().call("POST", "/auth/verify", { token })).status, 401);
  });

  it("refuses a made-up token", async () => {
    assert.equal((await new Client().call("POST", "/auth/verify", { token: "x".repeat(43) })).status, 401);
  });

  it("creates an account from the link-only sign-up form", async () => {
    const address = email("gina");
    await fetch(`${API}/dev/mailbox`, { method: "DELETE" });
    assert.equal((await new Client().call("POST", "/auth/signup", { name: "Gina Lee", email: address, consent: true })).status, 202);
    assert.ok(await waitForMail(address, "sign-in"));
    const client = new Client();
    await signInByLink(client, address);
    assert.equal((await client.call("GET", "/me")).data.user.email, address);
  });
});

describe("profile", () => {
  it("lets a person change their own name", async () => {
    const person = await newPerson("henry");
    assert.equal((await person.client.call("PATCH", "/me", { name: "Henry Changed" })).status, 200);
    assert.equal((await person.client.call("GET", "/me")).data.user.name, "Henry Changed");
  });
});
