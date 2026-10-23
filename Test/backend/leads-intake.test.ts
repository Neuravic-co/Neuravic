import { describe, expect, it } from "vitest";
import { schema } from "../../NBE/src/db";
import { body, json, makeTestApp } from "./helpers";

const valid = {
  name: "Sara Ali",
  email: "Sara@Example.com",
  company: "Acme",
  message: "We need to automate our access approval workflow.",
  serviceInterest: ["ai", "software"],
  consent: true,
};

describe("POST /leads", () => {
  it("stores the lead and sends team + acknowledgement emails", async () => {
    const { request, deps, mailer } = await makeTestApp();
    const res = await request("/api/v1/leads", json("POST", valid));
    expect(res.status).toBe(202);
    const { id } = await body(res);

    const [lead] = await deps.db.select().from(schema.leads);
    expect(lead?.id).toBe(id);
    expect(lead?.email).toBe("sara@example.com");
    expect(lead?.status).toBe("new");
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(["sara@example.com", "team@test.dev"]);
  });

  it("rejects missing consent and invalid email with field errors", async () => {
    const { request } = await makeTestApp();
    const res = await request("/api/v1/leads", json("POST", { ...valid, consent: false, email: "nope" }));
    expect(res.status).toBe(400);
    const problem = await body(res);
    expect(problem.code).toBe("validation_failed");
    expect(problem.errors.map((e: { path: string }) => e.path).sort()).toEqual(["consent", "email"]);
  });

  it("silently drops honeypot submissions", async () => {
    const { request, deps, mailer } = await makeTestApp();
    const res = await request("/api/v1/leads", json("POST", { ...valid, website: "http://bot.test" }));
    expect(res.status).toBe(202);
    expect(await deps.db.select().from(schema.leads)).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("is idempotent for the same email and message", async () => {
    const { request, deps, mailer } = await makeTestApp();
    const first = await body(await request("/api/v1/leads", json("POST", valid)));
    const second = await body(await request("/api/v1/leads", json("POST", valid)));
    expect(second.id).toBe(first.id);
    expect(await deps.db.select().from(schema.leads)).toHaveLength(1);
    expect(mailer.sent).toHaveLength(2);
  });

  it("quarantines spam without notifying anyone", async () => {
    const { request, deps, mailer } = await makeTestApp();
    const spam = { ...valid, message: "Buy backlinks http://a.test http://b.test http://c.test now" };
    expect((await request("/api/v1/leads", json("POST", spam))).status).toBe(202);
    const [lead] = await deps.db.select().from(schema.leads);
    expect(lead?.status).toBe("spam");
    expect(mailer.sent).toHaveLength(0);
  });

  it("rate limits to 5 submissions per hour per client", async () => {
    const { request } = await makeTestApp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request(
        "/api/v1/leads",
        json("POST", { ...valid, message: `Enquiry number ${i} about our workflow` }, { "cf-connecting-ip": "198.51.100.9" }),
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it("requires a valid Turnstile token when a secret is configured", async () => {
    const { request, deps } = await makeTestApp();
    deps.config.turnstileSecret = "secret";
    deps.http = (async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch;
    const res = await request("/api/v1/leads", json("POST", { ...valid, turnstileToken: "bad" }));
    expect(res.status).toBe(422);

    deps.http = (async () => new Response(JSON.stringify({ success: true, hostname: "app.test" }), { status: 200 })) as typeof fetch;
    const ok = await request("/api/v1/leads", json("POST", { ...valid, turnstileToken: "good" }));
    expect(ok.status).toBe(202);
  });

  it.each(["staging", "production"] as const)("does not accept contact submissions without bot verification configured in %s", async (environment) => {
    const { request, deps, mailer } = await makeTestApp();
    deps.config.environment = environment;
    const response = await request("/api/v1/leads", json("POST", valid));
    expect(response.status).toBe(503);
    expect((await body(response)).code).toBe("bot_check_unavailable");
    expect(await deps.db.select().from(schema.leads)).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it.each([undefined, "evil.test", "app.test.evil.test", "https://app.test", 42])("rejects a successful provider verdict for an invalid hostname %s", async (hostname) => {
    const { request, deps, mailer } = await makeTestApp();
    deps.config.turnstileSecret = "test-only-secret";
    deps.http = (async () => Response.json({ success: true, hostname })) as typeof fetch;
    const response = await request("/api/v1/leads", json("POST", { ...valid, turnstileToken: "foreign-token" }));
    expect(response.status).toBe(422);
    expect(await deps.db.select().from(schema.leads)).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("accepts an explicitly configured additional website hostname", async () => {
    const { request, deps } = await makeTestApp();
    deps.config.allowedOrigins.push("https://www.app.test");
    deps.config.turnstileSecret = "test-only-secret";
    deps.http = (async () => Response.json({ success: true, hostname: "WWW.APP.TEST" })) as typeof fetch;
    expect((await request("/api/v1/leads", json("POST", { ...valid, turnstileToken: "valid-token" }))).status).toBe(202);
  });

  it.each(["unreachable", "invalid-json", "http-error"])("fails closed without storing or notifying when Turnstile is %s", async (failure) => {
    const { request, deps, mailer } = await makeTestApp();
    deps.config.turnstileSecret = "test-only-secret";
    deps.http = (async () => {
      if (failure === "unreachable") throw new Error("private-provider-error");
      if (failure === "invalid-json") return new Response("invalid");
      return Response.json({ success: true, hostname: "app.test" }, { status: 503 });
    }) as typeof fetch;
    const response = await request("/api/v1/leads", json("POST", { ...valid, turnstileToken: "token" }));
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("private-provider");
    expect(await deps.db.select().from(schema.leads)).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });
});
