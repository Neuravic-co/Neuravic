import { describe, expect, it } from "vitest";
import { schema } from "../src/db";
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

    deps.http = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch;
    const ok = await request("/api/v1/leads", json("POST", { ...valid, turnstileToken: "good" }));
    expect(ok.status).toBe(202);
  });
});
