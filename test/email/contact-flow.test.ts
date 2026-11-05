import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { schema } from "../../nbe/src/db/client";
import { DeliveryError } from "../../nbe/src/core/errors";
import { silentLogger } from "../../nbe/src/core/logger";
import { UnconfiguredMailer } from "../../nbe/src/modules/mail/local";
import { ResendMailer } from "../../nbe/src/modules/mail/resend";
import { RETRY_DELAYS_MS } from "../../nbe/src/modules/outbox/dispatcher";
import { emailHarness } from "./harness";

let h: Awaited<ReturnType<typeof emailHarness>>;

before(async () => {
  h = await emailHarness();
});
after(async () => {
  await h?.close();
});
beforeEach(async () => {
  await h.reset();
});

const enquiry = {
  name: "Sara\r\nAli",
  email: "VISITOR@example.com",
  company: "Example",
  message: "<script>private content</script>\nWe need an approval system.",
  serviceInterest: ["ai", "software"],
  consent: true,
};
const rows = () => h.db.select().from(schema.outbox);
const emailRows = async () => (await rows()).filter((row) => row.topic === "email");

describe("contact API, real Postgres and mocked Resend", () => {
  it("saves the enquiry, queues the notifications and delivers them right after the response", async () => {
    const response = await h.post(enquiry);
    assert.equal(response.status, 202);
    const receipt = (await response.json()) as { id: string; status: string };
    assert.equal(receipt.status, "received");
    const [lead] = await h.db.select().from(schema.leads);
    assert.equal(lead?.id, receipt.id);
    assert.equal(lead?.email, "visitor@example.com");

    await h.settle();
    const team = h.requests.find((request) => request.body.to[0] === "team@example.com")!;
    const ack = h.requests.find((request) => request.body.to[0] === "visitor@example.com")!;
    assert.equal(team.body.subject, "New enquiry: Sara Ali");
    for (const part of [receipt.id, "Example", "visitor@example.com", "ai, software", enquiry.message]) assert.ok(team.body.text.includes(part));
    assert.equal(team.body.html, undefined);
    assert.match(ack.body.text, /received your message/);

    const sent = await emailRows();
    assert.equal(sent.length, 2);
    assert.ok(sent.every((job) => job.state === "sent" && job.leadId === receipt.id && job.provider === "resend" && job.providerMessageId && job.acceptedAt));
    assert.ok(sent.every((job) => JSON.stringify(job.payload) === "{}"));
  });

  it("deduplicates sequential submissions without new jobs", async () => {
    const first = await (await h.post(enquiry)).json();
    const second = await (await h.post(enquiry)).json();
    assert.deepEqual(second, first);
    assert.equal((await emailRows()).length, 2);
  });

  it("serializes concurrent identical submissions into one lead and two emails", async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => h.post(enquiry)));
    assert.deepEqual(responses.map((response) => response.status), [202, 202, 202, 202, 202]);
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<{ id: string }>));
    assert.equal(new Set(bodies.map((body) => body.id)).size, 1);
    assert.equal((await emailRows()).length, 2);
    assert.equal((await h.db.select().from(schema.leads)).length, 1);
  });

  it("stores a different message from the same sender as a new lead", async () => {
    await h.post(enquiry);
    await h.post({ ...enquiry, message: "A completely different message about another project." });
    assert.equal((await h.db.select().from(schema.leads)).length, 2);
  });

  it("does not send honeypots or spam", async () => {
    assert.equal((await h.post({ ...enquiry, website: "https://bot.example" })).status, 202);
    assert.equal((await h.db.select().from(schema.leads)).length, 0);
    assert.equal((await h.post({ ...enquiry, message: "casino http://a.example http://b.example http://c.example" })).status, 202);
    const [spam] = await h.db.select().from(schema.leads);
    assert.equal(spam?.status, "spam");
    assert.equal((await rows()).length, 0);
  });

  it("retains a saved enquiry when every notification permanently fails", async () => {
    h.state.mailer = {
      send: async () => {
        throw new DeliveryError("resend_http_403", false);
      },
    };
    assert.equal((await h.post(enquiry)).status, 202);
    await h.settle();
    assert.equal((await h.db.select().from(schema.leads)).length, 1);
    assert.equal((await emailRows()).filter((row) => row.state === "dead").length, 2);
  });
});

describe("durable outbox", () => {
  it("uses stable idempotency keys and an identical payload through a provider outage", async () => {
    await h.enqueue();
    const calls: RequestInit[] = [];
    h.state.mailer = new ResendMailer("test", (async (_url, init) => {
      calls.push(init!);
      return calls.length === 1 ? new Response("private", { status: 503 }) : Response.json({ id: "00000000-0000-4000-8000-000000000001" });
    }) as typeof fetch);

    assert.deepEqual(await h.outbox.drain(), { sent: 0, failed: 1 });
    const [failed] = await rows();
    assert.equal(failed?.state, "pending");
    assert.equal(failed?.lastError, "resend_http_503");
    assert.ok(failed!.nextAttemptAt >= h.now() + 60_000);
    assert.deepEqual(await h.outbox.drain(), { sent: 0, failed: 0 });

    h.advance(failed!.nextAttemptAt - h.now());
    await h.outbox.drain();
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.body, calls[1]!.body);
    assert.equal(new Headers(calls[0]!.headers).get("idempotency-key"), new Headers(calls[1]!.headers).get("idempotency-key"));
    assert.equal((await rows())[0]!.state, "sent");
  });

  it("retries each scheduled backoff, then keeps a redacted terminal record", async () => {
    await h.enqueue();
    h.state.mailer = {
      send: async () => {
        throw new Error("private text token secret");
      },
    };
    for (const delay of RETRY_DELAYS_MS) {
      await h.outbox.drain();
      const [job] = await rows();
      assert.equal(job!.state, "pending");
      assert.ok(job!.nextAttemptAt >= h.now() + delay);
      assert.ok(job!.nextAttemptAt < h.now() + delay * 1.2);
      h.advance(job!.nextAttemptAt - h.now());
    }
    await h.outbox.drain();
    const [dead] = await rows();
    assert.equal(dead!.state, "dead");
    assert.equal(dead!.attempts, 6);
    assert.deepEqual(dead!.payload, {});
    assert.equal(dead!.lastError, "delivery_failed");
    assert.ok(!JSON.stringify(h.logs).includes("private"));
    assert.ok(!JSON.stringify(h.logs).includes("visitor@example.com"));
  });

  it("marks a permanent rejection dead on the first attempt", async () => {
    await h.enqueue();
    h.state.mailer = {
      send: async () => {
        throw new DeliveryError("resend_http_422", false);
      },
    };
    await h.outbox.drain();
    const [job] = await rows();
    assert.equal(job!.state, "dead");
    assert.equal(job!.attempts, 1);
    assert.deepEqual(job!.payload, {});
    assert.deepEqual(await h.outbox.drain(), { sent: 0, failed: 0 });
  });

  it("keeps mail for retry while no provider is configured", async () => {
    await h.enqueue();
    h.state.mailer = new UnconfiguredMailer(silentLogger);
    await h.outbox.drain();
    const [job] = await rows();
    assert.equal(job!.state, "pending");
    assert.equal(job!.lastError, "mail_not_configured");
    assert.equal(job!.acceptedAt, null);
  });

  it("stops after the 23-hour provider idempotency window", async () => {
    await h.enqueue(h.now() - 24 * 3_600_000);
    await h.outbox.drain();
    assert.equal(h.requests.length, 0);
    assert.equal((await rows())[0]!.lastError, "delivery_expired");
  });

  it("lets only one of two concurrent drains send a due job", async () => {
    await h.enqueue();
    await Promise.all([h.outbox.drain(), h.outbox.drain()]);
    assert.equal(h.requests.length, 1);
    assert.equal((await rows())[0]!.state, "sent");
  });

  it("fences a stale worker after another worker recovers its lease", async () => {
    await h.enqueue();
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    h.state.mailer = {
      send: async () => {
        calls += 1;
        if (calls === 1) {
          started();
          await held;
          throw new DeliveryError("late_failure");
        }
        return { provider: "memory" };
      },
    };
    const stale = h.outbox.drain();
    await began;
    h.advance(120_001);
    await h.outbox.drain();
    release();
    await stale;
    const [job] = await rows();
    assert.equal(job!.state, "sent");
    assert.equal(job!.lastError, null);
    assert.deepEqual(job!.payload, {});
  });

  it("recovers a crashed worker's lease with the same job key", async () => {
    await h.enqueue();
    const [job] = await rows();
    await h.db.update(schema.outbox).set({ nextAttemptAt: h.now() + 120_000 }).where(eq(schema.outbox.id, job!.id));
    await h.outbox.drain();
    assert.equal(h.requests.length, 0);
    h.advance(120_001);
    await h.outbox.drain();
    assert.equal(h.requests[0]!.key, `outbox/${job!.id}`);
  });

  it("does not deliver during maintenance mode", async () => {
    await h.enqueue();
    h.config.maintenanceMode = true;
    await h.outbox.drain();
    assert.equal(h.requests.length, 0);
    assert.equal((await rows())[0]!.state, "pending");
  });
});

describe("maintenance", () => {
  it("removes old spam, finished outbox rows and expired rate limits, and keeps recent data", async () => {
    const day = 24 * 3_600_000;
    const lead = (id: string, status: "new" | "spam", age: number) => ({
      id, name: "A", email: `${id}@example.com`, message: "A message long enough", messageHash: id, serviceInterest: [], status,
      consentAt: h.now(), dedupeKey: id, createdAt: h.now() - age, updatedAt: h.now() - age,
    });
    await h.db.insert(schema.leads).values([lead("old-spam", "spam", 91 * day), lead("new-spam", "spam", day), lead("old-new", "new", 400 * day)]);
    await h.enqueue(h.now() - 31 * day);
    await h.db.update(schema.outbox).set({ state: "sent" });
    await h.enqueue();
    await h.db.insert(schema.rateLimits).values([
      { key: "expired", count: 1, expiresAt: h.now() - 1 },
      { key: "active", count: 1, expiresAt: h.now() + 60_000 },
    ]);

    const report = await h.container.services.maintenance.run();
    assert.deepEqual(report, { leadsRemoved: 1, outboxRemoved: 1, rateLimitsRemoved: 1 });
    assert.deepEqual((await h.db.select().from(schema.leads)).map((row) => row.id).sort(), ["new-spam", "old-new"]);
    assert.equal((await rows()).length, 1);
    assert.deepEqual((await h.db.select().from(schema.rateLimits)).map((row) => row.key), ["active"]);
  });
});
