import { describe, expect, it } from "vitest";
import { body, json, makeTestApp, ORIGIN } from "./helpers";

describe("request hardening", () => {
  it("replaces a malformed caller-supplied request id", async () => {
    const { request } = await makeTestApp();
    const bad = await request("/api/v1/health", { headers: { "x-request-id": "x".repeat(200) } });
    expect(bad.headers.get("x-request-id")).not.toContain("xxxxxxxx");
    expect(bad.headers.get("x-request-id")?.length).toBeLessThanOrEqual(64);
    const good = await request("/api/v1/health", { headers: { "x-request-id": "trace-abc-12345" } });
    expect(good.headers.get("x-request-id")).toBe("trace-abc-12345");
  });

  it("rejects oversized JSON bodies but still allows file uploads of normal size", async () => {
    const { request } = await makeTestApp();
    const huge = JSON.stringify({ name: "x", email: "a@b.co", message: "y".repeat(300_000), consent: true });
    const res = await request("/api/v1/leads", { method: "POST", headers: { "content-type": "application/json" }, body: huge });
    expect(res.status).toBe(413);
    expect((await body(res)).code).toBe("payload_too_large");
  });

  it("refuses a sign-in post that comes from another website (login CSRF)", async () => {
    const { request } = await makeTestApp();
    const evil = { origin: "https://evil.example" };
    expect((await request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }, evil))).status).toBe(403);
    expect((await request("/api/v1/auth/verify", json("POST", { token: "x" }, evil))).status).toBe(403);
    // A foreign Referer counts too when there is no Origin.
    const viaReferer = { referer: "https://evil.example/page" };
    expect((await request("/api/v1/auth/verify", json("POST", { token: "x" }, viaReferer))).status).toBe(403);
  });

  it("still lets the real site and non-browser callers sign in", async () => {
    const { request } = await makeTestApp();
    expect((await request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }, { origin: ORIGIN }))).status).toBe(202);
    expect((await request("/api/v1/auth/magic-link", json("POST", { email: "a@test.dev" }))).status).toBe(202);
  });

  it("only accepts request bodies declared as JSON", async () => {
    const { request } = await makeTestApp();
    const asText = (type: string) => ({ method: "POST", headers: { "content-type": type }, body: JSON.stringify({ email: "a@test.dev" }) });
    // These are the types a cross-site HTML form can send without a preflight.
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      expect((await request("/api/v1/auth/magic-link", asText(type))).status).toBe(415);
    }
    expect((await request("/api/v1/auth/magic-link", asText("application/json; charset=utf-8"))).status).toBe(202);
    expect((await request("/api/v1/auth/magic-link", { method: "POST", body: JSON.stringify({ email: "a@test.dev" }) })).status).toBe(415);
  });
});
