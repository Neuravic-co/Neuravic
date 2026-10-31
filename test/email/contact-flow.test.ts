import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { schema } from "../../nbe/core/src/db";
import { DeliveryError } from "../../nbe/core/src/lib/delivery";
import { ConsoleMailer, ResendMailer } from "../../nbe/core/src/modules/notifications/mailer";
import { drainOutbox, emailJob, RETRY_DELAYS_MS } from "../../nbe/core/src/modules/notifications/outbox";
import { runMaintenance } from "../../nbe/core/src/modules/maintenance/service";
import { emailHarness } from "./harness";

let h: Awaited<ReturnType<typeof emailHarness>>;
before(async () => { h = await emailHarness(); });
after(async () => { await h?.pool.end(); });
beforeEach(async () => { await h.reset(); });
const enquiry = { name: "Sara\r\nAli", email: "VISITOR@example.com", company: "Example", message: "<script>private content</script>\nWe need an approval system.", serviceInterest: ["ai", "software"], consent: true };
const mail = { to: "visitor@example.com", subject: "Test enquiry", text: "Private text https://example.com/#token=private" };
const rows = () => h.db.select().from(schema.outbox);
const enqueue = () => emailJob(h.db, h.deps.now(), mail);

describe("contact API, real MySQL and mocked Resend", () => {
  it("saves the enquiry and both pending notifications before returning a received receipt", async () => {
    const response = await h.post(enquiry);
    assert.equal(response.status, 202);
    const receipt = await response.json() as { id: string; status: string };
    assert.equal(receipt.status, "received"); assert.equal("delivered" in receipt, false);
    const [lead] = await h.db.select().from(schema.leads); assert.equal(lead?.id, receipt.id);
    const jobs = (await rows()).filter(r => r.topic === "email");
    assert.equal(jobs.length, 2); assert.ok(jobs.every(j => j.state === "pending" && j.leadId === receipt.id));
    assert.equal(h.requests.length, 0);
    await drainOutbox(h.deps);
    const team = h.requests.find(r => r.body.to[0] === "team@example.com")!;
    const ack = h.requests.find(r => r.body.to[0] === "visitor@example.com")!;
    assert.equal(team.body.subject, "New enquiry: Sara Ali");
    for (const part of [receipt.id, "Example", "visitor@example.com", "ai, software", enquiry.message]) assert.ok(team.body.text.includes(part));
    assert.equal(team.body.html, undefined); assert.match(ack.body.text, /received your message/);
    const sent = (await rows()).filter(r => r.topic === "email");
    assert.ok(sent.every(j => j.state === "sent" && j.provider === "resend" && j.providerMessageId && j.acceptedAt));
    assert.ok(sent.every(j => JSON.stringify(j.payload) === "{}"));
  });
  it("deduplicates sequential submissions without new jobs", async () => {
    const first = await (await h.post(enquiry)).json(); const second = await (await h.post(enquiry)).json();
    assert.deepEqual(second, first); assert.equal((await rows()).filter(r => r.topic === "email").length, 2);
  });
  it("serializes concurrent identical submissions into one lead and two emails", async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => h.post(enquiry)));
    assert.deepEqual(responses.map(r => r.status), [202, 202, 202, 202, 202]);
    const bodies = await Promise.all(responses.map(r => r.json() as Promise<{ id: string }>));
    assert.equal(new Set(bodies.map(r => r.id)).size, 1);
    assert.equal((await rows()).filter(r => r.topic === "email").length, 2);
    assert.equal((await h.db.select().from(schema.leads)).length, 1);
  });
  it("does not send honeypots or spam, and does not leak a delivery claim", async () => {
    assert.equal((await h.post({ ...enquiry, website: "https://bot.example" })).status, 202);
    assert.equal((await rows()).length, 0);
    assert.equal((await h.post({ ...enquiry, message: "casino http://a.example http://b.example http://c.example" })).status, 202);
    assert.equal((await rows()).length, 0);
  });
  it("retains a saved enquiry when both notifications permanently fail", async () => {
    assert.equal((await h.post(enquiry)).status, 202);
    h.deps.mailer = { send: async () => { throw new DeliveryError("resend_http_403", false); } };
    await drainOutbox(h.deps);
    assert.equal((await h.db.select().from(schema.leads)).length, 1);
    assert.equal((await rows()).filter(r => r.state === "dead").length, 2);
  });
});

describe("durable outbox", () => {
  it("uses stable idempotency keys and frozen sender through a provider outage", async () => {
    await enqueue(); const requests: RequestInit[] = [];
    h.deps.mailer = new ResendMailer("test", h.deps.config.emailFrom, (async (_url, init) => {
      requests.push(init!); return requests.length === 1 ? new Response("private", { status: 503 }) : Response.json({ id: "00000000-0000-4000-8000-000000000001" });
    }) as typeof fetch);
    assert.deepEqual(await drainOutbox(h.deps), { sent: 0, failed: 1 });
    const [failed] = await rows(); assert.equal(failed?.state, "pending"); assert.equal(failed?.lastError, "resend_http_503");
    assert.ok(failed!.nextAttemptAt >= h.deps.now() + 60_000);
    assert.deepEqual(await drainOutbox(h.deps), { sent: 0, failed: 0 });
    const originalFrom = h.deps.config.emailFrom; h.deps.config.emailFrom = "Changed <changed@example.com>";
    h.advance(failed!.nextAttemptAt - h.deps.now()); await drainOutbox(h.deps); h.deps.config.emailFrom = originalFrom;
    assert.equal(requests.length, 2); assert.equal(requests[0]!.body, requests[1]!.body);
    assert.equal(new Headers(requests[0]!.headers).get("idempotency-key"), new Headers(requests[1]!.headers).get("idempotency-key"));
    assert.equal((await rows())[0]!.state, "sent");
  });
  it("retries each scheduled backoff, then retains a redacted terminal record", async () => {
    await enqueue(); h.deps.mailer = { send: async () => { throw new Error("private text token secret"); } };
    for (const delay of RETRY_DELAYS_MS) {
      await drainOutbox(h.deps); const [job] = await rows();
      assert.equal(job!.state, "pending"); assert.ok(job!.nextAttemptAt >= h.deps.now() + delay);
      assert.ok(job!.nextAttemptAt < h.deps.now() + delay * 1.2);
      h.advance(job!.nextAttemptAt - h.deps.now());
    }
    await drainOutbox(h.deps); const [dead] = await rows();
    assert.equal(dead!.state, "dead"); assert.equal(dead!.attempts, 6); assert.deepEqual(dead!.payload, {});
    assert.equal(dead!.lastError, "delivery_failed");
    assert.ok(!JSON.stringify(h.logs).includes("private"));
    assert.ok(!JSON.stringify(h.logs).includes("visitor@example.com"));
  });
  it("marks permanent rejection dead on the first attempt", async () => {
    await enqueue(); h.deps.mailer = { send: async () => { throw new DeliveryError("resend_http_422", false); } };
    await drainOutbox(h.deps); const [job] = await rows();
    assert.equal(job!.state, "dead"); assert.equal(job!.attempts, 1); assert.deepEqual(job!.payload, {});
    assert.deepEqual(await drainOutbox(h.deps), { sent: 0, failed: 0 });
  });
  it("retains missing mail configuration as a retryable failure", async () => {
    await enqueue(); h.deps.mailer = new ConsoleMailer(h.deps.log); await drainOutbox(h.deps);
    const [job] = await rows(); assert.equal(job!.state, "pending"); assert.equal(job!.lastError, "mail_not_configured");
    assert.equal(job!.acceptedAt, null);
  });
  it("does not let a payload extend the 23-hour provider idempotency deadline", async () => {
    await emailJob(h.db, h.deps.now() - 24 * 3_600_000, mail, h.deps.now() + 3_600_000);
    await drainOutbox(h.deps); assert.equal(h.requests.length, 0);
    assert.equal((await rows())[0]!.lastError, "delivery_expired");
  });
  it("respects payload expiration for authentication links", async () => {
    await emailJob(h.db, h.deps.now(), mail, h.deps.now() - 1); await drainOutbox(h.deps);
    assert.equal(h.requests.length, 0); assert.deepEqual((await rows())[0]!.payload, {});
  });
  it("allows only one of two concurrent drains to send a due job", async () => {
    await enqueue(); await Promise.all([drainOutbox(h.deps), drainOutbox(h.deps)]);
    assert.equal(h.requests.length, 1); assert.equal((await rows())[0]!.state, "sent");
  });
  it("fences a stale worker after another worker recovers its lease", async () => {
    await enqueue(); let release!: () => void; let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
    h.deps.mailer = { send: async () => { calls++; if (calls === 1) { started(); await held; throw new DeliveryError("late_failure"); } return { provider: "memory" }; } };
    const stale = drainOutbox(h.deps); await began; h.advance(120_001);
    await drainOutbox(h.deps); release(); await stale;
    const [job] = await rows(); assert.equal(job!.state, "sent"); assert.equal(job!.lastError, null); assert.deepEqual(job!.payload, {});
  });
  it("recovers a crashed worker's lease with the same job key", async () => {
    await enqueue(); const [job] = await rows();
    await h.db.update(schema.outbox).set({ nextAttemptAt: h.deps.now() + 120_000 }).where(eq(schema.outbox.id, job!.id));
    await drainOutbox(h.deps); assert.equal(h.requests.length, 0); h.advance(120_001);
    await drainOutbox(h.deps); assert.equal(h.requests[0]!.key, `outbox/${job!.id}`);
  });
  it("processes queued retries through scheduled maintenance", async () => {
    await enqueue(); const report = await runMaintenance(h.deps);
    assert.equal(report.emailsSent, 1); assert.equal((await rows())[0]!.state, "sent");
  });
  it("does not deliver from non-worker services or during maintenance", async () => {
    await enqueue(); h.deps.deliversMail = false; await drainOutbox(h.deps);
    h.deps.deliversMail = true; h.deps.config.maintenanceMode = true; await drainOutbox(h.deps);
    assert.equal(h.requests.length, 0); assert.equal((await rows())[0]!.state, "pending");
  });
});
